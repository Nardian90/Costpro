import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { processTrmBackup, getAllAccounts, getAllTransactions, TransfermovilBackup } from '@/lib/transfermovil/transfermovil';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/wallet/import-trm
 *
 * Recibe el contenido de un archivo .trm de Transfermovil, lo descifra,
 * extrae cuentas y transacciones, y las devuelve en formato unificado
 * para que el frontend las muestre en la Billetera Digital.
 *
 * El descifrado ocurre server-side (no en el navegador) por seguridad:
 * - La constante CV_HARDCODED no se expone al cliente
 * - El JSON descifrado completo no se envía al cliente (solo lo necesario)
 *
 * Body: { content: string } — contenido del .trm como string
 * Response: { accounts, transactions, summary }
 */
async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Contenido del .trm requerido' }, { status: 400 });
    }

    logger.info('WALLET', `TRM import started by ${session.user.id}, size: ${content.length}`);

    // Descifrar
    const result = processTrmBackup(content);

    if (!result.ok || !result.data) {
      logger.error('WALLET', `TRM decryption failed: ${result.error}`);
      return NextResponse.json({ error: `Descifrado fallido: ${result.error}` }, { status: 400 });
    }

    const backup = result.data;

    // Extraer cuentas
    const accounts = getAllAccounts(backup);

    // Extraer transacciones
    const transactions = getAllTransactions(backup);

    // Calcular saldos por cuenta (último saldo reportado en RecordSMS)
    const accountBalances: Record<string, { balance: number; currency: string; lastDate: string }> = {};
    for (const tx of transactions) {
      const accountKey = tx.raw.cuenta || 'unknown';
      // Buscar saldos en el contenido del SMS
      const balanceMatch = tx.raw.content_sms?.match(/(?:Saldo Disponible|Saldo restante|Saldo Restante):\s*(CR|DB)?\s*([\d,.]+)\s*(CUP|USD)?/i);
      if (balanceMatch) {
        const amount = parseFloat(balanceMatch[2].replace(/[,.](?=\d{3})/g, '').replace(',', '.')) || 0;
        const dateStr = tx.date.toISOString().split('T')[0];
        if (!accountBalances[accountKey] || dateStr >= accountBalances[accountKey].lastDate) {
          accountBalances[accountKey] = { balance: amount, currency: balanceMatch[3] || 'CUP', lastDate: dateStr };
        }
      }
    }

    // Mapear transacciones al formato de WalletView
    const mappedTransactions = transactions.map(tx => ({
      id: `trm-${tx.id}`,
      date: tx.date.toISOString().split('T')[0],
      bank: extractBankFromService(tx.serviceType),
      card: maskAccount(tx.raw.cuenta),
      typeOperation: tx.service,
      nature: tx.amount > 0 ? 'CR' : 'DB' as const,
      amount: Math.abs(tx.amount),
      currency: tx.currency,
      counterparty: tx.raw.cuenta || 'N/A',
      category: categorizeTransaction(tx.service, tx.serviceType),
      transactionId: tx.transactionId,
      channel: 'Transfermovil',
      note: tx.serviceType,
      isStatement: false,
    }));

    // Resumen
    const totalIncome = mappedTransactions.filter(t => t.nature === 'CR').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = mappedTransactions.filter(t => t.nature === 'DB').reduce((sum, t) => sum + t.amount, 0);

    // Resumen por banco
    const banks: Record<string, { income: number; expenses: number; current_balance: number; transaction_count: number; card?: string }> = {};
    for (const tx of mappedTransactions) {
      if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0, current_balance: 0, transaction_count: 0 };
      if (tx.nature === 'CR') banks[tx.bank].income += tx.amount;
      else banks[tx.bank].expenses += tx.amount;
      banks[tx.bank].transaction_count++;
      if (tx.card && !banks[tx.bank].card) banks[tx.bank].card = tx.card;
    }

    // Saldos reales por banco desde accountBalances
    for (const [accountKey, bal] of Object.entries(accountBalances)) {
      const bankName = extractBankFromAccount(accountKey);
      if (banks[bankName]) {
        banks[bankName].current_balance = bal.balance;
      }
    }

    const totalRealBalance = Object.values(banks).reduce((sum, b) => sum + b.current_balance, 0);

    logger.info('WALLET', `TRM import success: ${accounts.length} accounts, ${transactions.length} transactions`);

    return NextResponse.json({
      success: true,
      accounts: accounts.map(a => ({
        ...a,
        accountNumber: maskAccount(a.accountNumber),
      })),
      transactions: mappedTransactions,
      summary: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        balance: totalIncome - totalExpenses,
        total_real_balance: totalRealBalance,
      },
      banks,
      count: {
        accounts: accounts.length,
        transactions: transactions.length,
        tables: backup.cantidad_tablas,
      },
      fecha_exp: backup.fecha_exp,
      version_apk: backup.version_apk,
    });
  } catch (error: unknown) {
    logger.error('WALLET', `TRM import error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

function extractBankFromService(serviceType: string): string {
  const low = (serviceType || '').toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular')) return 'BPA';
  if (low.includes('metro') || low.includes('metropolitano')) return 'METRO';
  return 'DESCONOCIDO';
}

function extractBankFromAccount(account: string): string {
  const low = (account || '').toLowerCase();
  if (low.includes('bandec')) return 'BANDEC';
  if (low.includes('bpa') || low.includes('popular')) return 'BPA';
  if (low.includes('metro')) return 'METRO';
  return 'DESCONOCIDO';
}

function maskAccount(account: string): string | undefined {
  if (!account || account.length < 4) return undefined;
  const digits = account.replace(/\D/g, '');
  if (digits.length >= 4) return `****${digits.slice(-4)}`;
  return `****${account.slice(-4)}`;
}

function categorizeTransaction(service: string, serviceType: string): string {
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
