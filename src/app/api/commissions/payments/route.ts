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

  if (period_start > period_end) {
    return NextResponse.json({ error: 'period_start > period_end' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);

  // FIX C5: recalcular calculated_amount server-side para evitar manipulación del cliente.
  // Si el cliente envía calculated_amount=0 pero la comisión real es 500,
  // un manager malicioso podría saltarse la justificación del ajuste.
  // Recalculamos usando commission-engine con las ventas reales del periodo.
  const { selectApplicableRule, calculateCommission } = await import('@/lib/commission-engine');

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
    const d = new Date(period_end);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
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
  const serverCalculated = calc.commission_suggested;

  const clientCalculated = Number(calculated_amount) || 0;
  const final_ = Number(final_amount) || 0;

  // Si el cliente envió calculated_amount que difiere del server → usar el del server
  // y si final difiere del server-calculated, exigir reason
  if (Math.abs(clientCalculated - serverCalculated) > 0.01) {
    // Log warning pero no bloquear — usar serverCalculated como autoritativo
    console.warn(`[payments] calculated_amount mismatch: client=${clientCalculated} server=${serverCalculated}`);
  }

  // Si el monto final difiere del calculado (server) → justificar
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
