import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Obtener orden + items
    const { data: order, error } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', user.id).single();
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

    // Si es acción de cerrar orden
    if (action === 'close') {
      // C5: Si es orden de production, output product es obligatorio
      if (order.order_type === 'production' && (!output_product_id || !output_quantity)) {
        return NextResponse.json({ error: 'Las órdenes de producción requieren un producto terminado y cantidad' }, { status: 400 });
      }

      // C6: Registrar pago final con inspección de errores
      if (final_amount && final_amount > 0 && final_method) {
        const { error: payError } = await supabase.rpc('register_supplier_payment', {
          p_store_id: userData.active_store_id,
          p_ref_type: 'production_order',
          p_ref_id: orderId,
          p_amount: final_amount,
          p_payment_method: final_method,
          p_paid_by: user.id,
          p_currency: final_currency || 'CUP',
          p_exchange_rate: exchange_rate || 1.0,
        });
        if (payError) {
          console.error('[production-orders/close] Payment error:', payError);
          return NextResponse.json({ error: 'Error al registrar pago: ' + payError.message }, { status: 500 });
        }
      }

      // C5: Si es orden de producción, recibir producto terminado
      if (order.order_type === 'production' && output_product_id && output_quantity) {
        const { error: recvError } = await supabase.rpc('receive_production_output', {
          p_order_id: orderId,
          p_product_id: output_product_id,
          p_quantity: output_quantity,
          p_store_id: userData.active_store_id,
        });
        if (recvError) {
          console.error('[production-orders/close] Receive output error:', recvError);
          return NextResponse.json({ error: 'Error al recibir producto: ' + recvError.message }, { status: 500 });
        }
      }

      // C5: Si es orden de servicio, crear venta en transactions
      if (order.order_type === 'service') {
        const { error: saleError } = await supabase.rpc('close_service_order_as_sale', {
          p_order_id: orderId,
          p_store_id: userData.active_store_id,
          p_seller_id: user.id,
          p_payment_method: final_method || 'cash',
          p_currency: final_currency || 'CUP',
          p_exchange_rate: exchange_rate || 1.0,
        });
        if (saleError) {
          console.error('[production-orders/close] Sale creation error:', saleError);
          return NextResponse.json({ error: 'Error al crear venta: ' + saleError.message }, { status: 500 });
        }
      }

      (updateData as any).status = 'closed';
      (updateData as any).closed_at = new Date().toISOString();
      (updateData as any).payment_status = 'paid';
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
