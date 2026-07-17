import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';
import {
  selectApplicableRule,
  calculateCommission,
  calculateCommissionWithProducts,
  buildBreakdownSnapshot,
  deriveLineTotals,
  type CommissionRule,
  type ProductLineItem,
} from '@/lib/commission-engine';

/**
 * POST /api/commissions/calculate
 *
 * Body: {
 *   store_id: string,
 *   worker_ids: string[] (si vacío, calcula para todos los workers activos),
 *   date_from: string (YYYY-MM-DD),
 *   date_to: string (YYYY-MM-DD),
 *   mode?: 'rules' | 'manual'  (default: 'rules')
 * }
 *
 * Devuelve cálculo de comisión sugerida por worker, listo para mostrar en UI.
 *
 * v2 (2026-07-15): si mode='manual', el cálculo se basa en comisiones editadas
 * por producto enviadas por el cliente. Si mode='rules' (default), se aplica el
 * motor avanzado que soporta reglas product_specific y scale_percentage además
 * de las 4 originales.
 *
 * Backend-driven: todo el cálculo se hace aquí, el frontend solo muestra.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();
  const { store_id, worker_ids, date_from, date_to, manual_commissions } = body;

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

  // 2b. Cargar product_ids + commission_amount + commission_mode asociados a reglas product_specific
  // v2 (2026-07-15): product_ids
  // v3 (2026-07-17): commission_amount y commission_mode por producto individual (join table)
  const productSpecificRules = (rules || []).filter((r: any) => r.type === 'product_specific');
  let ruleProductsMap: Record<string, string[]> = {};
  let ruleProductConfigsMap: Record<string, Record<string, { amount: number | null; mode: 'per_sale' | 'per_unit' }>> = {};
  if (productSpecificRules.length > 0) {
    const { data: rpData } = await supabase
      .from('commission_rule_products')
      .select('rule_id, product_id, commission_amount, commission_mode')
      .in('rule_id', productSpecificRules.map((r: any) => r.id));
    ruleProductsMap = (rpData || []).reduce((acc: Record<string, string[]>, rp: any) => {
      if (!acc[rp.rule_id]) acc[rp.rule_id] = [];
      acc[rp.rule_id].push(rp.product_id);
      return acc;
    }, {});
    // Construir map de configs por producto
    ruleProductConfigsMap = (rpData || []).reduce((acc: Record<string, Record<string, any>>, rp: any) => {
      if (!acc[rp.rule_id]) acc[rp.rule_id] = {};
      if (rp.commission_amount != null || rp.commission_mode != null) {
        acc[rp.rule_id][rp.product_id] = {
          amount: rp.commission_amount != null ? Number(rp.commission_amount) : null,
          mode: (rp.commission_mode as 'per_sale' | 'per_unit') || 'per_sale',
        };
      }
      return acc;
    }, {});
  }
  // Hidratar reglas con product_ids y product_configs (v3)
  const rulesWithProducts: CommissionRule[] = (rules || []).map((r: any) => ({
    ...r,
    product_ids: ruleProductsMap[r.id] || [],
    product_configs: ruleProductConfigsMap[r.id] || {},
    // Modo default de la regla: si la regla tiene product_commission_mode en DB, usarlo; sino 'per_sale'
    product_commission_mode: (r as any).product_commission_mode || 'per_sale',
  }));

  // 3. Obtener ventas por worker en el rango (totales agregados — sales_transactions)
  const { data: sales, error: sErr } = await supabase
    .from('sales_transactions')
    .select('worker_id, payment_cash, payment_transfer, amount_total, sale_date, transaction_id')
    .eq('store_id', store_id)
    // FIX C7: incluir ventas del último día (sale_date es DATE, no TIMESTAMP, pero
    // usamos date_to + 1 día exclusive para evitar edge cases de timezone)
    // FIX (2026-07-15): usar construcción local (no UTC) para evitar día anterior
    .gte('sale_date', date_from)
    .lt('sale_date', (() => {
      const [y, m, d] = date_to.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString().split('T')[0];
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

  // 4b. v2 (2026-07-15): Cargar line items por producto desde transaction_items
  // Solo si hay transactions vinculadas a sales_transactions
  const transactionIds = (sales || [])
    .map((s: any) => s.transaction_id)
    .filter((id: any) => id !== null && id !== undefined);

  let lineItemsByWorker: Record<string, ProductLineItem[]> = {};
  if (transactionIds.length > 0) {
    const { data: lineItems } = await supabase
      .from('transaction_items')
      .select(`
        transaction_id,
        product_id,
        quantity,
        price_at_sale,
        price_at_sale_cup,
        cost_at_sale,
        cash_paid,
        transfer_paid,
        price_currency,
        products:product_id (name),
        transactions:transaction_id (created_at)
      `)
      .in('transaction_id', transactionIds);

    // Mapear transaction_id → worker_id
    const txToWorker: Record<string, string> = {};
    for (const s of (sales || [])) {
      if (s.transaction_id) {
        txToWorker[s.transaction_id] = s.worker_id;
      }
    }

    for (const li of (lineItems || [])) {
      const wId = txToWorker[li.transaction_id];
      if (!wId) continue;
      if (!lineItemsByWorker[wId]) lineItemsByWorker[wId] = [];
      // v3 (2026-07-17): usar helper DRY deriveLineTotals (P3)
      // BUG CRÍTICO (2026-07-17): price_at_sale_cup en la BD ya es price × qty × rate
      // (es decir, line_total_cup, NO unit_price_cup). El helper maneja esto correctamente.
      const { unitPrice, lineTotal } = deriveLineTotals(li);
      const qty = Number(li.quantity) || 0;
      lineItemsByWorker[wId].push({
        product_id: li.product_id,
        product_name: (li.products as any)?.name || 'Producto',
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        cash_paid: Number(li.cash_paid) || 0,
        transfer_paid: Number(li.transfer_paid) || 0,
        sale_date: (li.transactions as any)?.created_at
          ? new Date((li.transactions as any).created_at).toISOString().split('T')[0]
          : date_from,
        transaction_id: li.transaction_id,
      });
    }
  }

  // 5. Calcular comisión por worker usando el motor
  // FIX-A5 (2026-07-14): Pro-rateo cuando hay cambio de regla a mitad del periodo
  // v2 (2026-07-15): Si hay line items Y reglas avanzadas (product_specific / scale_percentage),
  // usar calculateCommissionWithProducts. Si no, comportamiento original.
  const calculations = workers.map((worker: any) => {
    const workerRules = rulesWithProducts.filter(r =>
      (r.worker_id === null || r.worker_id === worker.id) &&
      r.valid_from <= date_to &&
      (r.valid_to === null || r.valid_to >= date_from)
    );

    // v2: Si el cliente envió manual_commissions, construir cálculo manual
    if (manual_commissions && manual_commissions[worker.id]) {
      const workerLineItems = lineItemsByWorker[worker.id] || [];
      const commissions = manual_commissions[worker.id] as number[];
      const workerSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };
      // Import dinámico para evitar circularidad
      const { buildManualCommissionCalculation } = require('@/lib/commission-engine');
      const calc = buildManualCommissionCalculation(
        worker.id, workerSales, workerLineItems, commissions,
        { from: date_from, to: date_to }
      );
      return {
        ...calc,
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        worker_ci: worker.ci,
        worker_status: worker.status,
      };
    }

    // v2: Detectar si hay reglas avanzadas activas
    const hasAdvancedRules = workerRules.some(r =>
      r.type === 'product_specific' || r.type === 'scale_percentage'
    );
    const workerLineItems = lineItemsByWorker[worker.id] || [];

    // Detectar si hubo cambio de regla durante el periodo (excluyendo reglas avanzadas que se procesan por producto)
    const standardRules = workerRules.filter(r =>
      r.type !== 'product_specific' && r.type !== 'scale_percentage'
    );
    const ruleChangeDates: string[] = [];
    for (const r of standardRules) {
      if (r.valid_from > date_from && r.valid_from <= date_to) {
        ruleChangeDates.push(r.valid_from);
      }
    }

    // v2: Si hay line items Y reglas avanzadas, usar motor avanzado (sin pro-rateo por ahora)
    if (hasAdvancedRules && workerLineItems.length > 0 && ruleChangeDates.length === 0) {
      const workerSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };
      const calc = calculateCommissionWithProducts(
        worker.id, workerSales, workerLineItems, workerRules,
        { from: date_from, to: date_to }
      );
      return {
        ...calc,
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        worker_ci: worker.ci,
        worker_status: worker.status,
      };
    }

    // v2: Si hay line items pero no reglas avanzadas, igual usar motor avanzado para devolver breakdown
    if (workerLineItems.length > 0 && ruleChangeDates.length === 0) {
      const workerSales = salesByWorker[worker.id] || { cash: 0, transfer: 0, total: 0 };
      const calc = calculateCommissionWithProducts(
        worker.id, workerSales, workerLineItems, workerRules,
        { from: date_from, to: date_to }
      );
      return {
        ...calc,
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        worker_ci: worker.ci,
        worker_status: worker.status,
      };
    }

    // Comportamiento original: pro-rateo si hay cambios de regla, cálculo simple si no
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
      // FIX (2026-07-15): usar construcción local (no UTC) para evitar día anterior erróneo
      if (i < cutPoints.length - 2) {
        const [y, m, d] = cutPoints[i + 1].split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - 1);
        const end = dt.toISOString().split('T')[0];
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
