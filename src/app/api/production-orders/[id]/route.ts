import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';
import { z } from 'zod';
import crypto from 'crypto';


// PATCH: Cambiar estado de la orden
const updateSchema = z.object({
  status: z.enum(['draft', 'approved', 'in_progress', 'paused', 'completed', 'closed', 'voided']).optional(),
  customer_name: z.string().optional(),
  customer_ci: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_address: z.string().optional(),
  budget_total: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  output_product_id: z.string().uuid().optional().nullable(),
  output_quantity: z.number().positive().optional(),
  action: z.enum(['close', 'receive_output']).optional(),
  // Para close: pago final
  final_amount: z.number().optional(),
  final_method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  final_currency: z.string().optional(),
  exchange_rate: z.number().positive().default(1.0).optional(),
});

async function getHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').pop() || '';
  try {
    // orderId extracted from URL above
    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    // V2.12.38: defense-in-depth — verificar active_store_id antes de devolver la orden
    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', session_user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    // Obtener orden + items
    const { data: order, error } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    // V2.12.38: BOLA guard — verificar que la orden pertenece a la tienda activa del usuario
    if (order.store_id !== userData.active_store_id) {
      return NextResponse.json({ error: 'No autorizado para esta OT' }, { status: 403 });
    }

    const { data: items } = await supabase
      .from('production_order_items')
      .select('*, products(id, name, sku, stock_current)')
      .eq('order_id', orderId);

    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('ref_type', 'production_order')
      .eq('ref_id', orderId)
      .order('payment_date', { ascending: false });

    return NextResponse.json({ ...order, items: items || [], payments: payments || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function patchHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').pop() || '';
  try {
    // orderId extracted from URL above
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });

    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', session_user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { action, final_amount, final_method, final_currency, exchange_rate, output_product_id, output_quantity, ...updateData } = parsed.data;

    // Fetch la orden actual para validar tipo y estado
    const { data: order, error: orderFetchError } = await supabase
      .from('production_orders')
      .select('id, order_type, status, store_id')
      .eq('id', orderId)
      .single();

    if (orderFetchError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // V2.12.38: BOLA guard — verificar que la orden pertenece a la tienda activa del usuario
    if (order.store_id !== userData.active_store_id) {
      return NextResponse.json({ error: 'No autorizado para esta OT' }, { status: 403 });
    }

    // Si es acción de cerrar orden
    if (action === 'close') {
      // v2.26.0 G9: Usar RPC transaccional close_production_order_v2 (atómico)
      const closeIdempotencyKey = `close-${orderId}-${crypto.randomUUID()}`;
      const { data: closeResult, error: closeError } = await supabase.rpc('close_production_order_v2', {
        p_order_id: orderId,
        p_store_id: userData.active_store_id,
        p_seller_id: session_user.id,
        p_final_amount: final_amount || 0,
        p_final_method: final_method || null,
        p_final_currency: final_currency || 'CUP',
        p_exchange_rate: exchange_rate || 1.0,
        p_output_product_id: output_product_id || null,
        p_output_quantity: output_quantity || null,
        p_user_id: session_user.id,
        p_idempotency_key: closeIdempotencyKey,
      });

      if (closeError) {
        console.error('[production-orders/close] RPC error:', closeError);
        const msg = closeError.message;
        if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        if (msg.includes('ERR_ORDER_NOT_FOUND')) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
        if (msg.includes('ERR_ORDER_NOT_CLOSABLE')) return NextResponse.json({ error: msg.replace(/^.*ERR_ORDER_NOT_CLOSABLE:\s*/, '') }, { status: 400 });
        if (msg.includes('ERR_PRODUCTION_REQUIRES_OUTPUT')) return NextResponse.json({ error: 'Las órdenes de producción requieren un producto terminado y cantidad' }, { status: 400 });
        if (msg.includes('ERR_ORDER_NOT_IN_PROGRESS')) return NextResponse.json({ error: 'La orden no está en progreso' }, { status: 400 });
        if (msg.includes('ERR_IDEMPOTENCY_KEY_REUSE')) return NextResponse.json({ error: 'Idempotency key reutilizada' }, { status: 409 });
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      return NextResponse.json({ ...closeResult, status: 'closed' });
    }

    // Si es acción de recibir output (sin cerrar)
    if (action === 'receive_output' && output_product_id && output_quantity) {
      await supabase.rpc('receive_production_output', {
        p_order_id: orderId,
        p_product_id: output_product_id,
        p_quantity: output_quantity,
        p_store_id: userData.active_store_id,
      });
    }

    const { data, error } = await supabase
      .from('production_orders')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    // Fase 5: manejar error de transición inválida del trigger
    if (error) {
      if (error.message?.includes('ERR_INVALID_TRANSITION')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.message?.includes('ERR_INVALID_TRANSITION')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


export const GET = withAuth(getHandler);

export const PATCH = withAuth(withSecurity(patchHandler, {
  rateLimitKey: 'po:patch',
  maxRequests: 20,
}));

