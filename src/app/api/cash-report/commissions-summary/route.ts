import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/cash-report/commissions-summary
 *
 * Devuelve las comisiones pagadas en el periodo, agrupadas por trabajador:
 *   - worker_id, worker_name, ci
 *   - count (cuántos pagos)
 *   - amount_cup (total en CUP)
 *   - cash_paid, transfer_paid, zelle_paid
 *   - period_start, period_end (rango cubierto)
 *
 * Útil para el PDF de Reporte de Caja — detalle de comisiones a trabajadores.
 *
 * Query: start_date, end_date (ISO)
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();

    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase
      .from('profiles').select('active_store_id').eq('id', session.user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    const storeId = userData.active_store_id;

    const { data, error } = await supabase
      .from('commission_payments')
      .select(`
        id,
        final_amount,
        amount_cup,
        payment_method,
        currency,
        exchange_rate,
        paid_at,
        period_start,
        period_end,
        status,
        manual_adjustment_reason,
        calculated_breakdown,
        worker:workers ( id, first_name, last_name, ci )
      `)
      .eq('store_id', storeId)
      .eq('status', 'paid')
      .gte('paid_at', startDate)
      .lte('paid_at', endDate)
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('[cash-report/commissions-summary] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Agrupar por trabajador
    const byWorker: Record<string, {
      worker_id: string;
      worker_name: string;
      ci: string;
      count: number;
      total_amount_cup: number;
      cash_paid: number;
      transfer_paid: number;
      zelle_paid: number;
      periods: string[];
      last_payment_date: string | null;
    }> = {};

    for (const pay of (data || [])) {
      const w = pay.worker as any;
      const wid = w?.id || 'unknown';
      if (!byWorker[wid]) {
        byWorker[wid] = {
          worker_id: wid,
          worker_name: w ? `${w.first_name} ${w.last_name}`.trim() : '—',
          ci: w?.ci || '—',
          count: 0,
          total_amount_cup: 0,
          cash_paid: 0,
          transfer_paid: 0,
          zelle_paid: 0,
          periods: [],
          last_payment_date: null,
        };
      }
      byWorker[wid].count += 1;
      const amtCup = Number(pay.amount_cup) || Number(pay.final_amount) * Number(pay.exchange_rate || 1);
      byWorker[wid].total_amount_cup += amtCup;
      if (pay.payment_method === 'cash') byWorker[wid].cash_paid += amtCup;
      else if (pay.payment_method === 'transfer') byWorker[wid].transfer_paid += amtCup;
      else if (pay.payment_method === 'zelle') byWorker[wid].zelle_paid += amtCup;
      byWorker[wid].periods.push(`${pay.period_start?.slice(0,10)} → ${pay.period_end?.slice(0,10)}`);
      if (!byWorker[wid].last_payment_date || pay.paid_at > byWorker[wid].last_payment_date!) {
        byWorker[wid].last_payment_date = pay.paid_at;
      }
    }

    const result = Object.values(byWorker).sort((a, b) => b.total_amount_cup - a.total_amount_cup);

    return NextResponse.json({
      workers: result,
      total_cup: result.reduce((s, w) => s + w.total_amount_cup, 0),
      total_cash: result.reduce((s, w) => s + w.cash_paid, 0),
      total_transfer: result.reduce((s, w) => s + w.transfer_paid, 0),
      total_zelle: result.reduce((s, w) => s + w.zelle_paid, 0),
      count: result.length,
    });
  } catch (error: any) {
    console.error('[cash-report/commissions-summary] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
