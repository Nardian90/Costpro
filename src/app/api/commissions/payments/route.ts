import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/commissions/payments?store_id=...&worker_id=...&status=...
 * POST /api/commissions/payments
 *   Body: { store_id, worker_id, period_start, period_end, calculated_amount, final_amount, rule_applied_id?, calculated_breakdown?, manual_adjustment_reason?, status? }
 *
 * Validaciones:
 *   - No solapamiento de periodos por worker (DB UNIQUE partial index)
 *   - Si final_amount != calculated_amount → manual_adjustment_reason obligatorio
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const workerId = searchParams.get('worker_id');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('commission_payments')
    .select('*, worker:workers(id, first_name, last_name, ci)')
    .eq('store_id', storeId)
    .order('period_start', { ascending: false })
    .limit(limit);

  if (workerId) query = query.eq('worker_id', workerId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ payments: data || [], count: data?.length || 0 });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();
  const {
    store_id, worker_id, period_start, period_end,
    calculated_amount, final_amount, rule_applied_id,
    calculated_breakdown, manual_adjustment_reason, status,
  } = body;

  // Validaciones
  if (!store_id || !worker_id || !period_start || !period_end) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, worker_id, period_start, period_end' },
      { status: 400 },
    );
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);

  // FIX-A2 (2026-07-14): validar que worker pertenece a store
  const { data: workerCheck, error: workerErr } = await supabase
    .from('workers')
    .select('store_id')
    .eq('id', worker_id)
    .single();
  if (workerErr || !workerCheck) {
    return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 });
  }
  if (workerCheck.store_id !== store_id) {
    return NextResponse.json({ error: 'El trabajador no pertenece a esta tienda' }, { status: 400 });
  }

  if (period_start > period_end) {
    return NextResponse.json({ error: 'period_start > period_end' }, { status: 400 });
  }

  // FIX C5: recalcular calculated_amount server-side para evitar manipulación del cliente.
  // Si el cliente envía calculated_amount=0 pero la comisión real es 500,
  // un manager malicioso podría saltarse la justificación del ajuste.
  // Recalculamos usando commission-engine con las ventas reales del periodo.
  //
  // FIX (2026-07-15): EXCEPCIÓN — si el cliente envía calculated_breakdown.calculation_mode='manual',
  // significa que el cálculo fue manual (comisiones editadas por producto por el admin).
  // En ese caso respetamos el calculated_amount del cliente, porque el motor server-side
  // no tiene forma de reproducir las decisiones manuales del admin.
  //
  // FIX (2026-07-18): EXCEPCIÓN ADICIONAL — si el cliente envía calculated_breakdown con
  // product_breakdown que tiene rule_type !== 'none' y !== 'manual' (es decir, modo reglas
  // con motor avanzado), el cálculo fue hecho por /api/commissions/calculate que SÍ usa
  // line items y fallback a transactions POS. El endpoint POST /payments usa el motor
  // simple (calculateCommission) que NO carga line items ni hace fallback, por lo que
  // serverCalculated sería 0 aunque el cálculo real sea 1900. Respetamos el del cliente.
  const { selectApplicableRule, calculateCommission } = await import('@/lib/commission-engine');

  const isManualMode = calculated_breakdown?.calculation_mode === 'manual'
    || (calculated_breakdown?.product_breakdown?.some((pb: any) => pb.rule_type === 'manual'));

  // FIX (2026-07-18): detectar modo reglas con motor avanzado (product_breakdown con rule_type real)
  const hasAdvancedRules = calculated_breakdown?.product_breakdown?.some(
    (pb: any) => pb.rule_type && pb.rule_type !== 'none' && pb.rule_type !== 'manual'
  );

  // Si es modo manual O modo reglas avanzado, respetar el calculated_amount del cliente
  const trustClientCalculation = isManualMode || hasAdvancedRules;

  // Cargar reglas aplicables
  const { data: rules } = await supabase
    .from('commission_rules')
    .select('*')
    .eq('store_id', store_id)
    .or(`worker_id.eq.${worker_id},worker_id.is.null`)
    .lte('valid_from', period_end)
    .or(`valid_to.is.null,valid_to.gte.${period_start}`);

  // Cargar ventas del periodo (mismo filtro que calculate/route.ts)
  const endDateExclusive = (() => {
    const [y, m, d] = period_end.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().split('T')[0];
  })();

  const { data: sales, error: salesErr } = await supabase
    .from('sales_transactions')
    .select('payment_cash, payment_transfer, amount_total')
    .eq('store_id', store_id)
    .eq('worker_id', worker_id)
    .gte('sale_date', period_start)
    .lt('sale_date', endDateExclusive);

  // FIX F1-residual: verificar error en query de ventas
  if (salesErr) {
    return NextResponse.json(
      { error: `Error cargando ventas para recálculo: ${salesErr.message}` },
      { status: 500 },
    );
  }

  // Agregar ventas
  const workerSales = { cash: 0, transfer: 0, total: 0 };
  for (const s of sales || []) {
    workerSales.cash += Number(s.payment_cash) || 0;
    workerSales.transfer += Number(s.payment_transfer) || 0;
    workerSales.total += Number(s.amount_total) || 0;
  }

  const rule = selectApplicableRule((rules || []) as any, worker_id, period_end);
  const calc = calculateCommission(worker_id, workerSales, rule as any, { from: period_start, to: period_end });
  let serverCalculated = calc.commission_suggested;

  // Si es modo manual o reglas avanzadas, usar el calculated_amount del cliente
  // (respetar el cálculo hecho por /api/commissions/calculate que usa motor avanzado)
  if (trustClientCalculation) {
    serverCalculated = Number(calculated_amount) || 0;
    // Reemplazar el breakdown del server con el del cliente (que tiene product_breakdown)
    if (calculated_breakdown) {
      calc.commission_suggested = serverCalculated;
      calc.calculation_explanation = calculated_breakdown.calculation_explanation || calc.calculation_explanation;
      (calc as any).product_breakdown = calculated_breakdown.product_breakdown;
      (calc as any).calculation_mode = calculated_breakdown.calculation_mode || (isManualMode ? 'manual' : 'rules');
      (calc as any).excluded_sales_total = calculated_breakdown.excluded_sales_total;
    }
  }

  const clientCalculated = Number(calculated_amount) || 0;
  const final_ = Number(final_amount) || 0;

  // Si el cliente envió calculated_amount que difiere del server → usar el del server
  // y si final difiere del server-calculated, exigir reason
  // (excepto cuando confiamos en el cálculo del cliente: modo manual o reglas avanzadas)
  if (!trustClientCalculation && Math.abs(clientCalculated - serverCalculated) > 0.01) {
    // Log warning pero no bloquear — usar serverCalculated como autoritativo
    console.warn(`[payments] calculated_amount mismatch: client=${clientCalculated} server=${serverCalculated}`);
  }

  // Si el monto final difiere del calculado (server) → justificar
  // (cuando confiamos en el cliente, serverCalculated = clientCalculated = final_ normalmente)
  if (Math.abs(final_ - serverCalculated) > 0.01 && !manual_adjustment_reason) {
    return NextResponse.json(
      { error: `manual_adjustment_reason es obligatorio cuando final_amount (${final_}) difiere de calculated_amount (${serverCalculated})` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('commission_payments')
    .insert({
      store_id,
      worker_id,
      period_start,
      period_end,
      calculated_amount: serverCalculated, // FIX C5: usar valor recalculado server-side
      final_amount: final_,
      manual_adjustment_reason: manual_adjustment_reason || null,
      calculated_breakdown: calc, // FIX C5: usar breakdown recalculado, no del cliente
      rule_applied_id: calc.rule_applied_id,
      status: status || 'draft',
      created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un pago para este worker en este periodo (no cancelled)' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payment: data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
