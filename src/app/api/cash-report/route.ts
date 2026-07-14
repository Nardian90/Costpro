import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/cash-report?start_date=ISO&end_date=ISO
 *
 * Reporte de caja para entrega de dinero.
 * Devuelve: ventas por método+moneda, pagos por método+moneda, balance,
 * y desglose de billetes sugerido.
 *
 * FIX (2026-07-14): reescrito con withAuth + getSupabaseForSession.
 * Antes usaba supabase.auth.getUser() sin sesión SSR → 401 siempre.
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    const supabase = getSupabaseForSession(session);

    // Obtener store_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    // Llamar al RPC get_cash_report
    const { data: reportData, error: reportError } = await supabase.rpc('get_cash_report', {
      p_store_id: userData.active_store_id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (reportError) {
      console.error('[cash-report] Error RPC:', reportError);
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    // ── Calcular desglose de billetes sugerido para efectivo CUP ──
    const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
    const cashCupSales = (reportData?.sales || []).find(
      (s: any) => s.payment_method === 'cash' && s.currency === 'CUP'
    );
    const cashCupPayments = (reportData?.payments || []).filter(
      (p: any) => p.payment_method === 'cash' && p.currency === 'CUP'
    );
    const totalCashPaymentsCup = cashCupPayments.reduce((sum: number, p: any) => sum + Number(p.total), 0);
    const cashCupCommissions = (reportData?.commissions || []).filter(
      (c: any) => c.payment_method === 'cash' && c.currency === 'CUP'
    );
    const totalCashCommissionsCup = cashCupCommissions.reduce((sum: number, c: any) => sum + Number(c.total), 0);
    const cashBalanceCup = (cashCupSales?.total || 0) - totalCashPaymentsCup - totalCashCommissionsCup;

    // Desglose óptimo (greedy) del balance de efectivo CUP
    let remaining = Math.max(0, cashBalanceCup);
    const breakdown = denominations.map(denom => {
      const count = Math.floor(remaining / denom);
      remaining -= count * denom;
      return { denom, count, total: count * denom };
    }).filter(b => b.count > 0);

    return NextResponse.json({
      ...reportData,
      cash_breakdown: breakdown,
      cash_balance_cup: cashBalanceCup,
      period: { start: startDate, end: endDate },
    });
  } catch (error: any) {
    console.error('[cash-report] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
