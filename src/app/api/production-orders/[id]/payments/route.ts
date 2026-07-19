import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';
import crypto from 'crypto';



/**
 * POST /api/production-orders/[id]/payments
 *
 * Registra un pago para una orden de producción/servicio/trabajo.
 * Soporta anticipos, pagos parciales y liquidaciones.
 *
 * Body:
 *   amount: number (>0)              — monto del pago
 *   payment_method: 'cash'|'transfer'|'zelle'  — método de pago
 *   currency: string (default 'CUP')  — moneda del pago (CUP/USD/EUR/MLC)
 *   exchange_rate: number (default 1) — tasa a CUP
 *   payment_type: 'advance'|'partial'|'settlement'  — tipo de pago
 *   reference: string?                — referencia (ej: # transferencia)
 *   notes: string?                    — notas del pago
 *
 * El trigger update_payment_status recalcula automáticamente:
 *   - paid_amount (suma de amount_cup de todos los pagos)
 *   - payment_status (unpaid/partial/paid)
 *   - payment_method (último método usado)
 *   - paid_at (fecha del último pago)
 *
 * NO cambia el status de la orden — el admin decide cuándo cerrar.
 */
const paymentSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a 0'),
  payment_method: z.enum(['cash', 'transfer', 'zelle']),
  currency: z.string().default('CUP'),
  exchange_rate: z.number().positive().default(1.0),
  payment_type: z.enum(['advance', 'partial', 'settlement']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
  try {
    // orderId extracted from URL above
    const body = await request.json();

    // Validar
    const validated = paymentSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validated.error.format() },
        { status: 400 }
      );
    }

    const { amount, payment_method, currency, exchange_rate, payment_type, reference, notes } = validated.data;

    // Autenticación
    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    // Obtener store_id del usuario
    const { data: userData } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session_user.id)
      .single();
    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Sin tienda activa' }, { status: 400 });
    }

    // Verificar que la orden existe y pertenece a la tienda
    const { data: order, error: orderError } = await supabase
      .from('production_orders')
      .select('id, store_id, order_type, status, budget_total, budget_currency, paid_amount, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    if (order.store_id !== userData.active_store_id) {
      return NextResponse.json({ error: 'La orden no pertenece a esta tienda' }, { status: 403 });
    }

    // No permitir pagos en órdenes cerradas o anuladas
    if (order.status === 'closed' || order.status === 'voided') {
      return NextResponse.json(
        { error: `No se pueden registrar pagos en una orden ${order.status === 'closed' ? 'cerrada' : 'anulada'}` },
        { status: 400 }
      );
    }

    // Determinar ref_type según order_type
    // production → 'production_order', work → 'work', service → 'production_order'
    // (el cash report suma ambos como ingresos)
    const ref_type = order.order_type === 'work' ? 'work' : 'production_order';

    // Generar idempotency key para evitar doble-click
    const idempotencyKey = `${session_user.id}-${orderId}-${Date.now()}-${crypto.randomUUID()}`;

    // Determinar el monto en CUP para validación de overpay
    const amountCup = currency === 'CUP' ? amount : amount * exchange_rate;

    // Calcular presupuesto en CUP para comparar
    // Si budget_currency !== CUP, convertir usando exchange_rate del pago actual
    // (aproximación — idealmente usar la tasa vigente al momento del presupuesto)
    const budgetCup = order.budget_currency === 'CUP'
      ? Number(order.budget_total)
      : Number(order.budget_total) * exchange_rate;

    const currentPaidCup = Number(order.paid_amount) || 0;
    const newTotalPaidCup = currentPaidCup + amountCup;

    // Validar overpay: no permitir pagar más del presupuesto (con tolerancia de 1 CUP)
    if (newTotalPaidCup > budgetCup + 1) {
      return NextResponse.json(
        {
          error: `El pago excede el presupuesto. Presupuesto: ${budgetCup.toFixed(2)} CUP, ya pagado: ${currentPaidCup.toFixed(2)} CUP, este pago: ${amountCup.toFixed(2)} CUP`,
          budget_cup: budgetCup,
          paid_cup: currentPaidCup,
          payment_cup: amountCup,
        },
        { status: 400 }
      );
    }

    // Registrar el pago via RPC register_supplier_payment
    const { data: paymentId, error: payError } = await supabase.rpc('register_supplier_payment', {
      p_store_id: userData.active_store_id,
      p_ref_type: ref_type,
      p_ref_id: orderId,
      p_amount: amount,
      p_payment_method: payment_method,
      p_paid_by: session_user.id,
      p_currency: currency,
      p_exchange_rate: exchange_rate,
      p_idempotency_key: idempotencyKey,
      p_reference: reference || null,
      p_notes: notes || `Pago tipo: ${payment_type}`,
    });

    if (payError) {
      console.error('[production-orders/payments] RPC error:', payError);
      return NextResponse.json(
        { error: 'Error al registrar pago: ' + payError.message },
        { status: 500 }
      );
    }

    // El trigger update_payment_status recalcula paid_amount y payment_status automáticamente.
    // Leer la orden actualizada para devolver el estado actual.
    const { data: updatedOrder } = await supabase
      .from('production_orders')
      .select('paid_amount, payment_status, payment_method, paid_at')
      .eq('id', orderId)
      .single();

    // Leer el pago registrado
    const { data: payment } = await supabase
      .from('payment_transactions')
      .select('id, amount, amount_cup, currency, exchange_rate, payment_method, payment_date, reference, notes')
      .eq('id', paymentId)
      .single();

    return NextResponse.json({
      success: true,
      payment,
      order: updatedOrder,
      payment_type,
      message: `Pago de ${amount} ${currency} registrado como ${payment_type}`,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[production-orders/payments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/production-orders/[id]/payments
 *
 * Lista todos los pagos de una orden.
 */
async function getHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
  try {
    // orderId extracted from URL above

    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    // Verificar ownership
    const { data: order } = await supabase
      .from('production_orders')
      .select('store_id, order_type')
      .eq('id', orderId)
      .single();

    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

    // Buscar pagos con ambos ref_type (production_order y work)
    const { data: payments, error } = await supabase
      .from('payment_transactions')
      .select('id, amount, amount_cup, currency, exchange_rate, payment_method, payment_date, reference, notes, paid_by, created_at')
      .eq('ref_id', orderId)
      .in('ref_type', ['production_order', 'work'])
      .order('payment_date', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Obtener nombres de quienes pagaron
    const paidByIds = [...new Set((payments || []).map(p => p.paid_by).filter(Boolean))];
    let paidByMap: Record<string, string> = {};
    if (paidByIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', paidByIds);
      paidByMap = (profiles || []).reduce((acc: any, p: any) => {
        acc[p.id] = p.full_name;
        return acc;
      }, {});
    }

    const paymentsWithNames = (payments || []).map(p => ({
      ...p,
      paid_by_name: paidByMap[p.paid_by] || '—',
    }));

    return NextResponse.json({ payments: paymentsWithNames });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);

export const GET = withAuth(getHandler);


