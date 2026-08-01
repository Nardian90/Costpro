/**
 * POST /api/production-orders/[id]/void
 *
 * Anula una OT cerrada (closed → voided).
 * V2.12.37: Implementa el flujo de reversión que faltaba.
 *
 * Acciones:
 *   1. Si la OT tiene transaction_id (venta creada por close), marcarla como voided
 *   2. Reabastecer insumos (items con actual_qty > 0) al inventario
 *   3. Descontar output product (si es production order con output)
 *   4. Marcar OT como voided con reversed_at, reversed_by, reversal_reason
 *
 * Body:
 *   reason: string (motivo de anulación, default 'Anulación')
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { z } from 'zod';

const voidSchema = z.object({
  reason: z.string().max(500).default('Anulación'),
});

async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  try {
    const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID requerido' }, { status: 400 });
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* body opcional */ }
    const validated = voidSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validated.error.format() }, { status: 400 });
    }

    const supabase = getSupabaseForSession(session);

    // Verificar ownership
    const { data: order } = await supabase
      .from('production_orders')
      .select('id, store_id, status, order_number')
      .eq('id', orderId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // Verificar acceso a la store
    const { data: membership } = await supabase
      .from('user_store_memberships')
      .select('id')
      .eq('store_id', order.store_id)
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle();

    const isAdmin = session.user.role === 'admin';
    if (!membership && !isAdmin) {
      return NextResponse.json({ error: 'No autorizado para esta OT' }, { status: 403 });
    }

    // Solo permitir anular OTs cerradas
    if (order.status !== 'closed') {
      return NextResponse.json(
        { error: `Solo se pueden anular OTs cerradas. Estado actual: ${order.status}` },
        { status: 400 }
      );
    }

    // Llamar al RPC void_closed_production_order
    const { data: result, error: voidError } = await supabase.rpc('void_closed_production_order', {
      p_order_id: orderId,
      p_reason: validated.data.reason,
      p_user_id: session.user.id,
    });

    if (voidError) {
      console.error('[production-orders/void] RPC error:', voidError);
      return NextResponse.json(
        { error: 'Error al anular OT: ' + voidError.message },
        { status: 500 }
      );
    }

    if (!result) {
      return NextResponse.json({ error: 'No se pudo anular la OT' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `OT ${order.order_number} anulada correctamente. Stock reabastecido y venta voided.`,
    });
  } catch (error: any) {
    console.error('[production-orders/void] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);
