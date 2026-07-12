import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// ── GET: Reporte de caja para entrega de dinero ──
// Query params: ?start_date=ISO&end_date=ISO
// Devuelve: ventas por método+moneda, pagos por método+moneda, balance, y desglose de billetes sugerido
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Obtener store_id
    const { data: userData } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', user.id)
      .single();

    if (!userData?.active_store_id) {
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
    // FIX-COMMISSION (2026-07-12): incluir comisiones pagadas en efectivo CUP como egresos
    const cashCupCommissions = (reportData?.commissions || []).filter(
      (c: any) => c.payment_method === 'cash' && c.currency === 'CUP'
    );
    const totalCashCommissionsCup = cashCupCommissions.reduce((sum: number, c: any) => sum + Number(c.total), 0);
    const cashBalanceCup = (cashCupSales?.total || 0) - totalCashPaymentsCup - totalCashCommissionsCup;

    // Desglose óptimo (greedy) del balance de efectivo CUP
    let remaining = Math.max(0, cashBalanceCup);
    const breakdown = denominations.map(denom => {
      const count = Math.floor(remaining / denom);
      remaining = Math.round((remaining - count * denom) * 100) / 100;
      return { denomination: denom, count, subtotal: count * denom };
    }).filter(b => b.count > 0);

    return NextResponse.json({
      ...reportData,
      cash_breakdown_cup: {
        total: cashBalanceCup,
        denominations: breakdown,
      },
    });
  } catch (error: any) {
    console.error('[cash-report] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
