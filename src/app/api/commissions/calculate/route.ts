import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';
import {
  selectApplicableRule,
  calculateCommission,
  buildBreakdownSnapshot,
  type CommissionRule,
} from '@/lib/commission-engine';

/**
 * POST /api/commissions/calculate
 *
 * Body: {
 *   store_id: string,
 *   worker_ids: string[] (si vacío, calcula para todos los workers activos),
 *   date_from: string (YYYY-MM-DD),
 *   date_to: string (YYYY-MM-DD)
 * }
 *
 * Devuelve cálculo de comisión sugerida por worker, listo para mostrar en UI.
 *
 * Backend-driven: todo el cálculo se hace aquí, el frontend solo muestra.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();
  const { store_id, worker_ids, date_from, date_to } = body;

  if (!store_id || !date_from || !date_to) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, date_from, date_to' },
      { status: 400 },
    );
  }

  if (date_from > date_to) {
    return NextResponse.json(
      { error: 'date_from no puede ser posterior a date_to' },
      { status: 400 },
    );
  }

  // 1. Obtener workers (específicos o todos los activos)
  const supabase = getSupabaseForSession(session);
  let workersQuery = supabase
    .from('workers')
    .select('id, first_name, last_name, ci, status')
    .eq('store_id', store_id);

  if (worker_ids && worker_ids.length > 0) {
    workersQuery = workersQuery.in('id', worker_ids);
  } else {
    workersQuery = workersQuery.eq('status', 'active');
  }

  const { data: workers, error: wErr } = await workersQuery.order('first_name');
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  if (!workers || workers.length === 0) {
    return NextResponse.json({ calculations: [], message: 'Sin workers en la tienda' });
  }

  // 2. Obtener reglas de comisión aplicables
  const { data: rules, error: rErr } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('store_id', store_id)
    .or(`worker_id.in.(${workers.map(w => w.id).join(',')}),worker_id.is.null`)
    .lte('valid_from', date_to)
    .or(`valid_to.is.null,valid_to.gte.${date_from}`);

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  // 3. Obtener ventas por worker en el rango
  const { data: sales, error: sErr } = await supabase
    .from('sales_transactions')
    .select('worker_id, payment_cash, payment_transfer, amount_total')
    .eq('store_id', store_id)
    // FIX C7: incluir ventas del último día (sale_date es DATE, no TIMESTAMP, pero
    // usamos date_to + 1 día exclusive para evitar edge cases de timezone)
    .gte('sale_date', date_from)
    .lt('sale_date', (() => {
      const d = new Date(date_to);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })());

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // 4. Agregar ventas por worker
  const salesByWorker: Record<string, { cash: number; transfer: number; total: number }> = {};
  for (const s of sales || []) {
    if (!salesByWorker[s.worker_id]) {
      salesByWorker[s.worker_id] = { cash: 0, transfer: 0, total: 0 };
    }
    salesByWorker[s.worker_id].cash += Number(s.payment_cash) || 0;
    salesByWorker[s.worker_id].transfer += Number(s.payment_transfer) || 0;
    salesByWorker[s.worker_id].total += Number(s.amount_total) || 0;
  }

  // 5. Calcular comisión por worker usando el motor
  const calculations = workers.map((worker: any) => {
    const workerSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };
    const rule = selectApplicableRule(
      (rules || []) as CommissionRule[],
      worker.id,
      date_to,
    );
    const calc = calculateCommission(
      worker.id,
      workerSales,
      rule,
      { from: date_from, to: date_to },
    );

    return {
      ...calc,
      worker_id: worker.id,
      worker_name: `${worker.first_name} ${worker.last_name}`,
      worker_ci: worker.ci,
      worker_status: worker.status,
    };
  });

  return NextResponse.json({
    store_id,
    period: { from: date_from, to: date_to },
    calculations,
    generated_at: new Date().toISOString(),
  });
}

export const POST = withAuth(postHandler);
