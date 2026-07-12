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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Obtener orden + items
    const { data: order, error } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', params.id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    const { data: items } = await supabase
      .from('production_order_items')
      .select('*, products(id, name, sku, stock_current)')
      .eq('order_id', params.id);

    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('ref_type', 'production_order')
      .eq('ref_id', params.id)
      .order('payment_date', { ascending: false });

    return NextResponse.json({ ...order, items: items || [], payments: payments || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { action, final_amount, final_method, final_currency, exchange_rate, output_product_id, output_quantity, ...updateData } = parsed.data;

    // Si es acción de cerrar orden
    if (action === 'close') {
      // Registrar pago final
      if (final_amount && final_amount > 0 && final_method) {
        await supabase.rpc('register_supplier_payment', {
          p_store_id: userData.active_store_id,
          p_ref_type: 'production_order',
          p_ref_id: params.id,
          p_amount: final_amount,
          p_payment_method: final_method,
          p_paid_by: user.id,
          p_currency: final_currency || 'CUP',
          p_exchange_rate: exchange_rate || 1.0,
        });
      }

      // Si es orden de producción, recibir producto terminado
      if (output_product_id && output_quantity && output_quantity > 0) {
        await supabase.rpc('receive_production_output', {
          p_order_id: params.id,
          p_product_id: output_product_id,
          p_quantity: output_quantity,
          p_store_id: userData.active_store_id,
        });
      }

      (updateData as any).status = 'closed';
      (updateData as any).closed_at = new Date().toISOString();
      (updateData as any).payment_status = 'paid';
    }

    // Si es acción de recibir output (sin cerrar)
    if (action === 'receive_output' && output_product_id && output_quantity) {
      await supabase.rpc('receive_production_output', {
        p_order_id: params.id,
        p_product_id: output_product_id,
        p_quantity: output_quantity,
        p_store_id: userData.active_store_id,
      });
    }

    const { data, error } = await supabase
      .from('production_orders')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
