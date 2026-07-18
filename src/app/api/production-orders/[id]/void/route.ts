import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

/**
 * POST /api/production-orders/[id]/void
 *
 * Anula una orden de producción/servicio/trabajo.
 *
 * Efectos:
 * 1. Marca status='voided' en production_orders
 * 2. Si hubo materiales dados de salida (actual_qty > 0), los devuelve al inventario
 *    creando stock_movements tipo 'adjustment' con reference_id = order_id
 * 3. Si la orden de servicio generó transaction_id, marca esa transacción como 'voided'
 * 4. NO elimina los pagos registrados (quedan como histórico)
 * 5. NO cambia payment_status (queda como estaba — el admin decide qué hacer con el dinero)
 *
 * No se puede anular una orden ya cerrada o anulada.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Anulación manual';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Obtener store_id
    const { data: userData } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', user.id)
      .single();
    if (!userData?.active_store_id) {
      return NextResponse.json({ error: 'Sin tienda activa' }, { status: 400 });
    }

    // Verificar orden
    const { data: order, error: orderError } = await supabase
      .from('production_orders')
      .select('id, store_id, status, order_type, transaction_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    if (order.store_id !== userData.active_store_id) {
      return NextResponse.json({ error: 'La orden no pertenece a esta tienda' }, { status: 403 });
    }

    if (order.status === 'closed') {
      return NextResponse.json({ error: 'No se puede anular una orden cerrada' }, { status: 400 });
    }

    if (order.status === 'voided') {
      return NextResponse.json({ error: 'La orden ya está anulada' }, { status: 400 });
    }

    // 1. Devolver materiales al inventario si hubo withdraws
    const { data: items } = await supabase
      .from('production_order_items')
      .select('id, product_id, variant_id, actual_qty, budgeted_unit_cost')
      .eq('order_id', orderId)
      .gt('actual_qty', 0);

    if (items && items.length > 0) {
      for (const item of items) {
        const qty = Number(item.actual_qty);
        if (qty <= 0) continue;

        // Devolver al inventario
        const { error: stockError } = await supabase.rpc('register_stock_movement', {
          p_product_id: item.product_id,
          p_store_id: userData.active_store_id,
          p_user_id: user.id,
          p_quantity: qty, // positivo = entrada
          p_movement_type: 'adjustment',
          p_reason: `Devolución por anulación de orden ${orderId.substring(0, 8)}`,
          p_unit_cost: Number(item.budgeted_unit_cost) || 0,
        });

        if (stockError) {
          console.error('[void] Error devolviendo stock:', stockError.message);
          // Continuar — no bloquear la anulación por un item problemático
        }
      }
    }

    // 2. Si la orden de servicio generó transaction_id, anular esa transacción
    if (order.transaction_id) {
      const { error: txVoidError } = await supabase
        .from('transactions')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', order.transaction_id)
        .eq('store_id', userData.active_store_id);

      if (txVoidError) {
        console.error('[void] Error anulando transacción:', txVoidError.message);
        // Continuar — no bloquear
      }
    }

    // 3. Si es orden de producción y recibió output, revertir el stock del producto terminado
    if (order.order_type === 'production') {
      const { data: prodOrder } = await supabase
        .from('production_orders')
        .select('output_product_id, output_quantity')
        .eq('id', orderId)
        .single();

      if (prodOrder?.output_product_id && Number(prodOrder.output_quantity) > 0) {
        const { error: outputRevertError } = await supabase.rpc('register_stock_movement', {
          p_product_id: prodOrder.output_product_id,
          p_store_id: userData.active_store_id,
          p_user_id: user.id,
          p_quantity: -Number(prodOrder.output_quantity), // negativo = salida (revertir entrada)
          p_movement_type: 'adjustment',
          p_reason: `Reversión de producto terminado por anulación de orden ${orderId.substring(0, 8)}`,
          p_unit_cost: 0,
        });

        if (outputRevertError) {
          console.error('[void] Error revirtiendo output:', outputRevertError.message);
        }
      }
    }

    // 4. Marcar orden como voided
    const { data: updated, error: updateError } = await supabase
      .from('production_orders')
      .update({
        status: 'voided',
        notes: `ANULADA: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      order: updated,
      message: `Orden anulada. ${items?.length || 0} material(es) devuelto(s) al inventario.`,
    });
  } catch (error: any) {
    console.error('[void] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
