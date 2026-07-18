import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';

/**
 * POST /api/production-orders/[id]/items
 *   Añade un material a una orden existente (solo si status !== 'closed' && status !== 'voided')
 *
 * DELETE /api/production-orders/[id]/items?item_id=...
 *   Elimina un material de una orden (solo si no tiene actual_qty > 0, es decir, no se ha dado salida)
 */

const addItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  budgeted_qty: z.number().positive('La cantidad debe ser mayor a 0'),
  budgeted_unit_cost: z.number().min(0).default(0),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();
    const validated = addItemSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validated.error.format() }, { status: 400 });
    }

    const { product_id, variant_id, budgeted_qty, budgeted_unit_cost } = validated.data;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Verificar que la orden existe, pertenece a la tienda y no está cerrada/anulada
    const { data: order } = await supabase
      .from('production_orders')
      .select('store_id, status')
      .eq('id', orderId)
      .single();

    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    if (order.status === 'closed' || order.status === 'voided') {
      return NextResponse.json({ error: 'No se pueden modificar items de una orden cerrada o anulada' }, { status: 400 });
    }

    // Verificar que el producto pertenece a la misma tienda
    const { data: product } = await supabase
      .from('products')
      .select('id, name, price, stock_current')
      .eq('id', product_id)
      .eq('store_id', order.store_id)
      .single();

    if (!product) return NextResponse.json({ error: 'Producto no encontrado en esta tienda' }, { status: 404 });

    // Insertar item
    const { data: item, error } = await supabase
      .from('production_order_items')
      .insert({
        order_id: orderId,
        product_id,
        variant_id: variant_id || null,
        budgeted_qty,
        budgeted_unit_cost: budgeted_unit_cost || product.price || 0,
        status: 'pending',
      })
      .select('id, product_id, budgeted_qty, budgeted_unit_cost, status')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ item, product_name: product.name }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    if (!itemId) return NextResponse.json({ error: 'item_id es requerido' }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Verificar orden
    const { data: order } = await supabase
      .from('production_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    if (order.status === 'closed' || order.status === 'voided') {
      return NextResponse.json({ error: 'No se pueden eliminar items de una orden cerrada o anulada' }, { status: 400 });
    }

    // Verificar que el item no tenga salida real (actual_qty > 0)
    const { data: item } = await supabase
      .from('production_order_items')
      .select('actual_qty')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (!item) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
    if (Number(item.actual_qty) > 0) {
      return NextResponse.json({ error: 'No se puede eliminar un item que ya tiene salida de inventario' }, { status: 400 });
    }

    const { error } = await supabase
      .from('production_order_items')
      .delete()
      .eq('id', itemId)
      .eq('order_id', orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
