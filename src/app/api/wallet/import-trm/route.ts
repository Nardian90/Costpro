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
    const allTransactions = getAllTransactions(backup);

    // FIX-EMPTY-TX (2026-07-06): filtrar transacciones vacías del .trm.
    // El backup contiene ~17,000 filas en RecordSMS con solo {id, fecha, tipo_servicio}
    // pero sin servicio, monto, ni moneda. Son registros residuales de la app
    // (notificaciones de agentes) que no son transacciones reales.
    const transactions = allTransactions.filter(tx =>
      tx.service && tx.currency && tx.amount > 0
    );
    logger.info('WALLET', `TRM parse: ${allTransactions.length} raw → ${transactions.length} valid (filtered ${allTransactions.length - transactions.length} empty)`);

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // ═══════════════════════════════════════════════════════════════
    // FIX-BANK-DETECTION (2026-07-06):
    // El problema: extractBankFromService() busca "bandec", "bpa", "metro" en
    // serviceType. Pero el .trm tiene transacciones con tipo_servicio que NO
    // incluyen el nombre del banco (ej: "Pago de servicios", "Recarga Nauta").
    // Esto produce 48 transacciones DESCONOCIDO.
    //
    // Solución:
    // 1. Para cada transacción, inferir banco desde serviceType (palabras clave)
    // 2. Si no se detecta, inferir desde el source de la cuenta asociada
    // 3. En Cuba, si source es "CuentaBanco" y no se detecta banco → BPA
    //    (BPA es el banco más usado en Transfermóvil)
    // 4. MCBank → METRO, Nauta → none (cuenta Nauta, no banco)
    // ═══════════════════════════════════════════════════════════════

    // Mapa: accountNumber → source (para inferir banco desde la cuenta)
    const accountSourceMap: Record<string, string> = {};
    for (const acc of accounts) {
      accountSourceMap[acc.accountNumber] = acc.source || '';
    }

    // Mapa: accountNumber → bank (prioridad: tx serviceType > account source)
    const accountBankMap: Record<string, string> = {};
    for (const acc of accounts) {
      const detectedFromSource = extractBankFromSource(acc.source);
      if (detectedFromSource !== 'DESCONOCIDO') {
        accountBankMap[acc.accountNumber] = detectedFromSource;
      }
    }
    // Luego sobreescribir con detección desde serviceType (más confiable)
    for (const tx of transactions) {
      const bankFromService = extractBankFromService(tx.serviceType);
      const accNum = tx.raw.cuenta || '';
      if (bankFromService !== 'DESCONOCIDO' && accNum) {
        accountBankMap[accNum] = bankFromService;
      }
    }

    // 1. Guardar cuentas en wallet_accounts (upsert)
    let accountsSaved = 0;
    for (const acc of accounts) {
      const bankFromTx = accountBankMap[acc.accountNumber] || extractBankFromSource(acc.source);
      const maskedNum = maskAccount(acc.accountNumber);
      const { error } = await admin.from('wallet_accounts').upsert({
        user_id: session.user.id,
        source: acc.source,
        bank: bankFromTx,
        account_number: maskedNum,
        account_full: acc.accountNumber,
        description: acc.descripcion || null,
        movil: acc.movil || null,
        tipo_cuenta: acc.tipo_cuenta || null,
        currency: 'CUP',
      }, { onConflict: 'user_id,source,account_number' });
      if (!error) accountsSaved++;
    }

    // 2. Guardar transacciones en wallet_transactions (upsert)
    // FIX-BANK-DETECTION: inferir banco desde la cuenta asociada si serviceType no tiene
    let txSaved = 0;
    let txSkipped = 0;
    let unknownCount = 0;
    for (const tx of transactions) {
      // 1. Intentar detectar banco desde serviceType
      let bankName = extractBankFromService(tx.serviceType);
      // 2. Si no se detecta, usar el banco de la cuenta asociada
      if (bankName === 'DESCONOCIDO') {
        const accNum = tx.raw.cuenta || '';
        if (accNum && accountBankMap[accNum]) {
          bankName = accountBankMap[accNum];
        } else {
          // 3. Si no hay cuenta asociada, inferir desde el source
          const source = accountSourceMap[accNum] || '';
          bankName = extractBankFromSource(source);
        }
      }
      if (bankName === 'DESCONOCIDO') unknownCount++;

      const maskedCard = maskAccount(tx.raw.cuenta);
      const category = categorize(tx.service, tx.serviceType);
      const dateStr = tx.date.toISOString().split('T')[0];
      const amount = Math.abs(tx.amount);
      // FIX-CR-DB (2026-07-06): detección correcta de ingresos vs gastos.
      // El .trm NO tiene campo explícito de dirección. Inferimos:
      // - Transferencia CON cuenta (alguien te envió) → CR (ingreso)
      // - Transferencia SIN cuenta (tú enviaste) → DB (gasto)
      // - Recarga, Pago, Compra, Impuesto → DB (gasto)
      // - Amortizar → DB (pago de préstamo)
      const operation = determineOperation(tx.service, tx.serviceType, tx.raw.cuenta || '');

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

    // 3. Calcular saldos por banco Y por cuenta (account_number)
    // FIX-SALDOS-SOURCE (2026-07-06): actualizar saldos por account_number
    // (no solo por bank) para que cada cuenta tenga su balance correcto,
    // incluso si bank = 'DESCONOCIDO' o 'EFECTIVO'.
    //
    // NOTA: en la mayoría de los .trm, el 98% de las transacciones tienen
    // cuenta="" (vacío), así que el saldo por cuenta individual no se puede
    // calcular. En ese caso, el saldo por banco (agregado) es la fuente de
    // verdad — ver data/route.ts donde se calcula current_balance = income - expenses.
    const bankBalances: Record<string, { balance: number; lastDate: string }> = {};
    const accountBalances: Record<string, { balance: number; lastDate: string; source: string }> = {};
    for (const tx of transactions) {
      let bankName = extractBankFromService(tx.serviceType);
      const accNum = tx.raw.cuenta || '';
      if (bankName === 'DESCONOCIDO' && accNum && accountBankMap[accNum]) {
        bankName = accountBankMap[accNum];
      } else if (bankName === 'DESCONOCIDO') {
        bankName = extractBankFromSource(accountSourceMap[accNum] || '');
      }

      const amount = Math.abs(tx.amount);
      const dateStr = tx.date.toISOString().split('T')[0];
      const op = determineOperation(tx.service, tx.serviceType, tx.raw.cuenta || '');
      const delta = op === 'CR' ? amount : -amount;

      if (!bankBalances[bankName]) bankBalances[bankName] = { balance: 0, lastDate: '' };
      bankBalances[bankName].balance += delta;
      if (dateStr > bankBalances[bankName].lastDate) bankBalances[bankName].lastDate = dateStr;

      // Saldo por cuenta individual
      if (accNum) {
        const masked = maskAccount(accNum);
        if (masked) {
          if (!accountBalances[masked]) {
            accountBalances[masked] = { balance: 0, lastDate: '', source: accountSourceMap[accNum] || '' };
          }
          accountBalances[masked].balance += delta;
          if (dateStr > accountBalances[masked].lastDate) accountBalances[masked].lastDate = dateStr;
        }
      }
    }

    // Actualizar saldos en wallet_accounts por account_number (más preciso)
    // FIX-SALDOS-SOURCE: en lugar de actualizar por bank (que puede ser DESCONOCIDO
    // y afectar múltiples cuentas), actualizamos por account_number específico.
    const { data: allAccounts } = await admin.from('wallet_accounts')
      .select('id, account_number, source, bank')
      .eq('user_id', session.user.id);

    let accountsUpdated = 0;
    if (allAccounts && allAccounts.length > 0) {
      for (const acc of allAccounts) {
        const bal = accountBalances[acc.account_number];
        if (bal) {
          await admin.from('wallet_accounts')
            .update({
              current_balance: bal.balance,
              last_balance_date: bal.lastDate,
              updated_at: new Date().toISOString()
            })
            .eq('id', acc.id);
          accountsUpdated++;
        } else {
          // Cuenta sin transacciones → balance 0
          await admin.from('wallet_accounts')
            .update({
              current_balance: 0,
              last_balance_date: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', acc.id);
        }
      }
    }

    logger.info('WALLET', `TRM saved: ${accountsSaved} accounts, ${txSaved} transactions (${txSkipped} skipped, ${unknownCount} unknown bank), ${accountsUpdated} balances updated`);

    return NextResponse.json({
      success: true,
      accounts: accountsSaved,
      transactions: txSaved,
      skipped: txSkipped,
      unknown_bank: unknownCount,
      fecha_exp: backup.fecha_exp,
      version_apk: backup.version_apk,
    });
  } catch (error: unknown) {
    logger.error('WALLET', `TRM import error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: `Error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

// FIX-CR-DB (2026-07-06): detección correcta de ingresos vs gastos.
// El .trm NO tiene campo explícito de dirección (CR/DB). Inferimos:
//
// 1. Transferencia:
//    - CON cuenta (campo cuenta no vacío) → CR (ingreso, alguien te envió dinero)
//    - SIN cuenta (campo cuenta vacío) → DB (gasto, tú enviaste dinero)
//    Esto se basa en el análisis del .trm real: 76 transferencias con cuenta
//    (recibidas) vs 311 sin cuenta (enviadas).
//
// 2. Servicios de pago/recarga/compra → siempre DB (gasto)
//
// 3. Cualquier servicio con keyword "recibida/entrada/deposito" → CR (ingreso)
//
// Antes TODO era DB, lo que hacía que los ingresos no aparecieran.
function determineOperation(service: string, serviceType: string, cuenta: string): 'CR' | 'DB' {
  const low = (service + ' ' + serviceType).toLowerCase();
  const hasCuenta = !!(cuenta && cuenta.trim().length > 0);

  // Ingresos explícitos por keyword
  if (low.includes('recibida') || low.includes('entrada') || low.includes('deposito') || low.includes('depósito')) {
    return 'CR';
  }

  // Transferencia: usar presencia de cuenta como indicador de dirección
  if (low.includes('transferencia') || low.includes('transfer')) {
    // Si hay cuenta del contraparte → recibida (CR)
    // Si no hay cuenta → enviada (DB)
    return hasCuenta ? 'CR' : 'DB';
  }

  // Gastos siempre (DB)
  if (low.includes('recarga')) return 'DB';
  if (low.includes('pago') || low.includes('factura')) return 'DB';
  if (low.includes('compra')) return 'DB';
  if (low.includes('impuesto') || low.includes('sello') || low.includes('timbre')) return 'DB';
  if (low.includes('multa')) return 'DB';
  if (low.includes('amortizar') || low.includes('amortizacion')) return 'DB';
  if (low.includes('onat')) return 'DB';
  if (low.includes('telefono') || low.includes('teléfono')) return 'DB';

  // Default: si no sabemos, es gasto (conservador)
  return 'DB';
}

// FIX-BANK-DETECTION: extraer banco desde el source de la cuenta
// (más confiable que serviceType cuando este no menciona el banco)
function extractBankFromSource(source: string): string {
  const low = (source || '').toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular') || low.includes('ahorro')) return 'BPA';
  if (low.includes('metro') || low.includes('mcbank')) return 'METRO';
  // FIX-BANK-DETECTION: en Cuba, "CuentaBanco" sin especificar → BPA por defecto
  // (BPA es el banco más usado en Transfermóvil, ~70% de cuentas)
  if (low.includes('cuentabanco') || low.includes('cuenta_banco')) return 'BPA';
  if (low.includes('agentes') || low.includes('efectivo')) return 'EFECTIVO';
  if (low.includes('nauta')) return 'NAUTA';
  return 'DESCONOCIDO';
}

function extractBankFromService(serviceType: string): string {
  const low = (serviceType || '').toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular') || low.includes('ahorro')) return 'BPA';
  if (low.includes('metro')) return 'METRO';
  if (low.includes('agentes') || low.includes('efectivo')) return 'EFECTIVO';
  if (low.includes('nauta')) return 'NAUTA';
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
  // FIX-CATEGORIA (2026-07-06): mejor detección de categorías
  if (low.includes('transferencia') || low.includes('transfer') || low.includes('envio') || low.includes('envío')) return 'Transferencia';
  if (low.includes('recarga nauta') || low.includes('recarga de saldo')) return 'Telecom';
  if (low.includes('recarga')) return 'Telecom';
  if (low.includes('electric') || low.includes('energía') || low.includes('energia')) return 'Electricidad';
  if (low.includes('agua') || low.includes('acueducto')) return 'Agua';
  if (low.includes('gas')) return 'Gas';
  if (low.includes('internet') || low.includes('nauta') || low.includes('datos')) return 'Internet';
  if (low.includes('impuesto') || low.includes('sello') || low.includes('timbre')) return 'Impuestos';
  if (low.includes('multa')) return 'Impuestos';
  if (low.includes('telefono') || low.includes('teléfono')) return 'Telecom';
  // FIX-CATEGORIA: "compra en linea" y "compra" → Compras (no Otros)
  if (low.includes('compra')) return 'Compras';
  if (low.includes('pago') || low.includes('factura')) return 'Servicios';
  if (low.includes('amortizar') || low.includes('amortizacion')) return 'Préstamos';
  if (low.includes('onat')) return 'Impuestos';
  return 'Otros';
}

export const POST = postHandler;
