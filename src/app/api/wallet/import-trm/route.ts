import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { processTrmBackup, getAllAccounts, getAllTransactions } from '@/lib/transfermovil/transfermovil';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { content } = body;
    if (!content || typeof content !== 'string') return NextResponse.json({ error: 'Contenido .trm requerido' }, { status: 400 });

    logger.info('WALLET', `TRM import by ${session.user.id}, size: ${content.length}`);

    const result = processTrmBackup(content);
    if (!result.ok || !result.data) return NextResponse.json({ error: `Descifrado fallido: ${result.error}` }, { status: 400 });

    const backup = result.data;
    const accounts = getAllAccounts(backup);
    const transactions = getAllTransactions(backup);

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1. Guardar cuentas en wallet_accounts (upsert)
    // FIX-PHASE3 (2026-07-06): inferir banco de las transacciones, no del source
    // Primero procesar transacciones para saber qué banco usa cada cuenta
    const accountBankMap: Record<string, string> = {}; // accountNumber → bank
    for (const tx of transactions) {
      const bankName = extractBankFromService(tx.serviceType);
      const accNum = tx.raw.cuenta || '';
      if (bankName !== 'DESCONOCIDO' && accNum) {
        accountBankMap[accNum] = bankName;
      }
    }

    let accountsSaved = 0;
    for (const acc of accounts) {
      // FIX-PHASE3: inferir banco desde las transacciones asociadas a esta cuenta
      const bankFromTx = accountBankMap[acc.accountNumber] || extractBankFromService(
        // Buscar el tipo_servicio más común entre las transacciones de esta cuenta
        transactions.find(t => t.raw.cuenta === acc.accountNumber)?.serviceType || ''
      );
      const maskedNum = maskAccount(acc.accountNumber);
      const { error } = await admin.from('wallet_accounts').upsert({
        user_id: session.user.id,
        source: acc.source,
        bank: bankFromTx,
        account_number: maskedNum,
        account_full: acc.accountNumber,
        description: acc.description || null,
        movil: acc.movil || null,
        tipo_cuenta: acc.tipo_cuenta || null,
        currency: 'CUP',
      }, { onConflict: 'user_id,source,account_number' });
      if (!error) accountsSaved++;
    }

    // 2. Guardar transacciones en wallet_transactions (upsert)
    let txSaved = 0;
    let txSkipped = 0;
    for (const tx of transactions) {
      const bankName = extractBankFromService(tx.serviceType);
      const maskedCard = maskAccount(tx.raw.cuenta);
      const category = categorize(tx.service, tx.serviceType);
      const dateStr = tx.date.toISOString().split('T')[0];
      const amount = Math.abs(tx.amount);
      // FIX-PHASE1 (2026-07-06): determinar CR/DB por tipo de servicio, no por signo del monto.
      // Transfermovil SIEMPRE guarda montos positivos. La dirección se infiere del servicio:
      // - Recarga, Pago, Compra, Impuesto → DB (gasto)
      // - Transferencia: si tipo_servicio incluye "Recibida" → CR, si no → DB (enviada por defecto)
      // - Cualquier servicio con "Recibida" o "entrada" → CR
      const operation = determineOperation(tx.service, tx.serviceType);

      const { error } = await admin.from('wallet_transactions').upsert({
        user_id: session.user.id,
        trm_transaction_id: tx.transactionId,
        date: dateStr,
        bank: bankName,
        card: maskedCard,
        operation,
        amount,
        currency: tx.currency || 'CUP',
        service: tx.service,
        service_type: tx.serviceType,
        category,
        counterparty: tx.raw.cuenta || null,
        note: tx.serviceType,
        is_statement: false,
      }, { onConflict: 'user_id,trm_transaction_id' });
      if (!error) txSaved++;
      else txSkipped++;
    }

    // 3. FIX-PHASE2 (2026-07-06): Calcular saldos por banco desde transacciones.
    // El .trm NO incluye el texto del SMS con "Saldo Disponible".
    // Calculamos: saldo = Σ(CR) - Σ(DB) por banco.
    const bankBalances: Record<string, { balance: number; lastDate: string }> = {};
    for (const tx of transactions) {
      const bankName = extractBankFromService(tx.serviceType);
      const amount = Math.abs(tx.amount);
      const dateStr = tx.date.toISOString().split('T')[0];
      const op = determineOperation(tx.service, tx.serviceType);

      if (!bankBalances[bankName]) bankBalances[bankName] = { balance: 0, lastDate: '' };
      if (op === 'CR') bankBalances[bankName].balance += amount;
      else bankBalances[bankName].balance -= amount;
      if (dateStr > bankBalances[bankName].lastDate) bankBalances[bankName].lastDate = dateStr;
    }

    // Actualizar saldos en wallet_accounts
    for (const [bankName, bal] of Object.entries(bankBalances)) {
      await admin.from('wallet_accounts')
        .update({
          current_balance: bal.balance,
          last_balance_date: bal.lastDate,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', session.user.id)
        .eq('bank', bankName);
    }

    logger.info('WALLET', `TRM saved: ${accountsSaved} accounts, ${txSaved} transactions (${txSkipped} skipped)`);

    return NextResponse.json({
      success: true,
      accounts: accountsSaved,
      transactions: txSaved,
      skipped: txSkipped,
      fecha_exp: backup.fecha_exp,
      version_apk: backup.version_apk,
    });
  } catch (error: unknown) {
    logger.error('WALLET', `TRM import error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: `Error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

function determineOperation(service: string, serviceType: string): 'CR' | 'DB' {
  const low = (service + ' ' + serviceType).toLowerCase();
  // Gastos siempre (DB)
  if (low.includes('recarga')) return 'DB';
  if (low.includes('pago') || low.includes('factura')) return 'DB';
  if (low.includes('compra')) return 'DB';
  if (low.includes('impuesto') || low.includes('sello') || low.includes('timbre')) return 'DB';
  // Ingresos siempre (CR)
  if (low.includes('recibida') || low.includes('entrada') || low.includes('deposito')) return 'CR';
  // Transferencia: ambigua. En Transfermovil, las transferencias enviadas son más comunes.
  // Si el tipo_servicio incluye "Recibida" → CR, sino → DB
  if (low.includes('transferencia')) {
    if (low.includes('recibida')) return 'CR';
    return 'DB'; // enviada por defecto
  }
  // Default: si no sabemos, es gasto (conservador)
  return 'DB';
}

function extractBank(source: string, account: string): string {
  const low = (source + ' ' + account).toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular')) return 'BPA';
  if (low.includes('metro')) return 'METRO';
  return 'DESCONOCIDO';
}

function extractBankFromService(serviceType: string): string {
  const low = (serviceType || '').toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular')) return 'BPA';
  if (low.includes('metro')) return 'METRO';
  return 'DESCONOCIDO';
}

function maskAccount(account: string): string | null {
  if (!account || account.length < 4) return null;
  const digits = account.replace(/\D/g, '');
  if (digits.length >= 4) return `****${digits.slice(-4)}`;
  return null;
}

function categorize(service: string, serviceType: string): string {
  const low = (service + ' ' + serviceType).toLowerCase();
  if (low.includes('transferencia') || low.includes('transfer')) return 'Transferencia';
  if (low.includes('recarga')) return 'Telecom';
  if (low.includes('electric') || low.includes('energía') || low.includes('energia')) return 'Electricidad';
  if (low.includes('agua') || low.includes('acueducto')) return 'Agua';
  if (low.includes('gas')) return 'Gas';
  if (low.includes('internet') || low.includes('nauta') || low.includes('datos')) return 'Internet';
  if (low.includes('impuesto') || low.includes('sello') || low.includes('timbre')) return 'Impuestos';
  if (low.includes('pago') || low.includes('factura')) return 'Servicios';
  return 'Otros';
}

export const POST = postHandler;
