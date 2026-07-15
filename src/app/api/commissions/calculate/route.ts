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
    .select('worker_id, payment_cash, payment_transfer, amount_total, sale_date')
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
  // FIX-A5 (2026-07-14): Pro-rateo cuando hay cambio de regla a mitad del periodo
  const calculations = workers.map((worker: any) => {
    const workerRules = (rules || []).filter(r =>
      (r.worker_id === null || r.worker_id === worker.id) &&
      r.valid_from <= date_to &&
      (r.valid_to === null || r.valid_to >= date_from)
    ) as CommissionRule[];

    // Detectar si hubo cambio de regla durante el periodo
    const ruleChangeDates: string[] = [];
    for (const r of workerRules) {
      if (r.valid_from > date_from && r.valid_from <= date_to) {
        ruleChangeDates.push(r.valid_from);
      }
    }

    if (ruleChangeDates.length === 0) {
      // Sin cambios de regla — cálculo simple (comportamiento original)
      const workerSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };
      const rule = selectApplicableRule(workerRules, worker.id, date_to);
      const calc = calculateCommission(worker.id, workerSales, rule, { from: date_from, to: date_to });
      return {
        ...calc,
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        worker_ci: worker.ci,
        worker_status: worker.status,
      };
    }

    // PRO-RATEO: dividir el periodo en sub-periodos por cada cambio de regla
    const cutPoints = [date_from, ...ruleChangeDates.sort(), date_to];
    const subPeriods: Array<{ start: string; end: string }> = [];
    for (let i = 0; i < cutPoints.length - 1; i++) {
      const start = cutPoints[i];
      // El sub-periodo termina el día anterior al siguiente corte (o date_to)
      if (i < cutPoints.length - 2) {
        const end = new Date(new Date(cutPoints[i + 1]).getTime() - 86400000).toISOString().split('T')[0];
        subPeriods.push({ start, end });
      } else {
        subPeriods.push({ start, end: cutPoints[i + 1] });
      }
    }

    // Obtener ventas por sub-periodo para este worker
    let totalCommission = 0;
    const proRatedBreakdown: Array<{
      period: string; rule_type: string; rule_value: string;
      sales_cash: number; sales_transfer: number; sales_total: number; commission: number;
    }> = [];

    for (const sub of subPeriods) {
      // Filtrar ventas del sub-periodo
      const subSales = (sales || []).filter(s =>
        s.worker_id === worker.id &&
        s.sale_date >= sub.start &&
        s.sale_date <= sub.end + 'T23:59:59'
      );
      const cash = subSales.reduce((sum, s) => sum + (Number(s.payment_cash) || 0), 0);
      const transfer = subSales.reduce((sum, s) => sum + (Number(s.payment_transfer) || 0), 0);
      const total = subSales.reduce((sum, s) => sum + (Number(s.amount_total) || 0), 0);

      // Seleccionar regla vigente para el final de este sub-periodo
      const subRule = selectApplicableRule(workerRules, worker.id, sub.end);
      const subCalc = calculateCommission(worker.id, { cash, transfer, total }, subRule, { from: sub.start, to: sub.end });
      totalCommission += subCalc.commission_suggested;

      proRatedBreakdown.push({
        period: `${sub.start} a ${sub.end}`,
        rule_type: subRule?.type || 'sin regla',
        rule_value: subRule?.type === 'percentage_sales'
          ? `${subRule.value_percent}%`
          : subRule?.type === 'fixed_amount'
          ? `$${subRule.fixed_value}`
          : subRule?.type === 'salary_based'
          ? `$${subRule.salary_amount}`
          : subRule?.type === 'hybrid'
          ? `$${subRule.salary_amount} + ${subRule.value_percent}%`
          : 'N/A',
        sales_cash: cash,
        sales_transfer: transfer,
        sales_total: total,
        commission: subCalc.commission_suggested,
      });
    }

    // Usar la regla del último sub-periodo como regla_applied
    const finalRule = selectApplicableRule(workerRules, worker.id, date_to);
    const allSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };

    return {
      worker_id: worker.id,
      worker_name: `${worker.first_name} ${worker.last_name}`,
      worker_ci: worker.ci,
      worker_status: worker.status,
      period: { from: date_from, to: date_to },
      sales: {
        cash: allSales.cash,
        transfer: allSales.transfer,
        total: allSales.total,
        base_used: allSales.total,
      },
      rule_applied: finalRule,
      rule_applied_id: finalRule?.id || null,
      breakdown: {
        percentage_component: totalCommission,
        fixed_component: 0,
        salary_component: 0,
      },
      commission_suggested: totalCommission,
      calculation_explanation: `Comisión calculada por pro-rateo en ${subPeriods.length} sub-periodos debido a cambio(s) de regla. Detalle: ${proRatedBreakdown.map(p => `${p.period}: ${p.rule_value} sobre ${p.sales_total.toFixed(2)} = ${p.commission.toFixed(2)}`).join('; ')}`,
      pro_rated: true,
      pro_rated_breakdown: proRatedBreakdown,
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
