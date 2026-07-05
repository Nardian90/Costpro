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

    // FIX-ADMIN-VIEW (2026-07-06): si el usuario es admin, puede pasar ?userId=X
    // para ver la billetera de otro usuario. Por defecto carga la suya propia.
    // Los no-admin NO pueden usar este parámetro — se ignora y siempre se usa
    // su propio user_id (defensa en profundidad).
    const requestedUserId = req.nextUrl.searchParams.get('userId');
    const isAdmin = (session.user as any).role === 'admin' ||
                    ((session.user as any).roles || []).includes('admin');
    const targetUserId = (isAdmin && requestedUserId) ? requestedUserId : session.user.id;
    if (isAdmin && requestedUserId && requestedUserId !== session.user.id) {
      logger.info('WALLET', `Admin ${session.user.id} viewing wallet of ${requestedUserId}`);
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cuentas
    // FIX-SECURITY (2026-07-06): no exponer account_full (número de cuenta completo
    // descifrado) al cliente. Solo el dueño debería verlo, y de cualquier forma
    // el frontend solo usa account_number (mascarado ****1234).
    const { data: accounts, error: accErr } = await admin
      .from('wallet_accounts')
      .select('id,user_id,source,bank,account_number,description,movil,tipo_cuenta,current_balance,last_balance_date,currency,created_at,updated_at')
      .eq('user_id', targetUserId)
      .order('bank', { ascending: true });

    if (accErr) {
      logger.error('WALLET', `Error fetching accounts: ${accErr.message}`);
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    // Transacciones
    const { data: transactions, error: txErr } = await admin
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', targetUserId)
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
    // FIX-SALDOS-SOURCE (2026-07-06): calcular current_balance por banco
    // directamente desde las transacciones (income - expenses), NO desde
    // wallet_accounts.current_balance (que suele estar en 0 porque el 98%
    // de las transacciones del .trm no tienen campo "cuenta" y no se pueden
    // asociar a una cuenta individual).
    let totalRealBalance = 0;
    for (const b of Object.keys(banks)) {
      // Saldo neto por banco = ingresos - gastos
      banks[b].current_balance = banks[b].income - banks[b].expenses;
      totalRealBalance += banks[b].current_balance;
    }

    // Para mostrar el card de cada cuenta, usar el saldo del banco al que pertenece
    for (const acc of accounts || []) {
      const bankName = acc.bank || 'DESCONOCIDO';
      if (banks[bankName]) {
        banks[bankName].card = acc.account_number;
        banks[bankName].last_balance_date = acc.last_balance_date;
      } else {
        // Cuenta sin transacciones — crear entrada con saldo 0
        banks[bankName] = {
          income: 0,
          expenses: 0,
          current_balance: 0,
          transaction_count: 0,
          card: acc.account_number,
          last_balance_date: acc.last_balance_date,
        };
      }
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
      // FIX-ADMIN-VIEW: metadatos para que el frontend sepa qué usuario está viendo
      viewer: {
        is_admin: isAdmin,
        self_id: session.user.id,
        target_id: targetUserId,
        is_own: targetUserId === session.user.id,
      },
    });
  } catch (error: unknown) {
    logger.error('WALLET', `Data fetch error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export const GET = getHandler;
