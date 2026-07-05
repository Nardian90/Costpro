import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/data
 *
 * Lee cuentas y transacciones de Supabase para el usuario autenticado.
 * Usa service role key (bypass RLS) para garantizar acceso.
 *
 * Response: { accounts, transactions, summary }
 */
async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cuentas
    const { data: accounts, error: accErr } = await admin
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('bank', { ascending: true });

    if (accErr) {
      logger.error('WALLET', `Error fetching accounts: ${accErr.message}`);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    // Transacciones
    const { data: transactions, error: txErr } = await admin
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(500);

    if (txErr) {
      logger.error('WALLET', `Error fetching transactions: ${txErr.message}`);
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // Calcular summary
    let totalIncome = 0, totalExpenses = 0;
    const banks: Record<string, any> = {};
    const categories: Record<string, number> = {};
    const monthly: Record<string, { income: number; expenses: number }> = {};

    for (const tx of transactions || []) {
      const cat = tx.manual_category || tx.category;
      const amount = parseFloat(tx.amount) || 0;

      if (tx.operation === 'CR') totalIncome += amount;
      else totalExpenses += amount;

      if (!banks[tx.bank]) banks[tx.bank] = { income: 0, expenses: 0, current_balance: 0, transaction_count: 0, card: tx.card };
      if (tx.operation === 'CR') banks[tx.bank].income += amount;
      else banks[tx.bank].expenses += amount;
      banks[tx.bank].transaction_count++;

      categories[cat] = (categories[cat] || 0) + amount;

      const month = tx.date.substring(0, 7);
      if (!monthly[month]) monthly[month] = { income: 0, expenses: 0 };
      if (tx.operation === 'CR') monthly[month].income += amount;
      else monthly[month].expenses += amount;
    }

    // Saldos reales desde wallet_accounts
    let totalRealBalance = 0;
    for (const acc of accounts || []) {
      if (banks[acc.bank]) {
        banks[acc.bank].current_balance = parseFloat(acc.current_balance) || 0;
        banks[acc.bank].last_balance_date = acc.last_balance_date;
        banks[acc.bank].card = acc.account_number;
      }
      totalRealBalance += parseFloat(acc.current_balance) || 0;
    }

    return NextResponse.json({
      accounts: accounts || [],
      transactions: transactions || [],
      summary: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        balance: totalIncome - totalExpenses,
        total_real_balance: totalRealBalance,
      },
      banks,
      categories,
      monthly,
    });
  } catch (error: unknown) {
    logger.error('WALLET', `Data fetch error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = getHandler;
