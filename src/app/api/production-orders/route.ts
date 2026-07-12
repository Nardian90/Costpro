import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';

const createOrderSchema = z.object({
  order_type: z.enum(['production', 'service']).default('service'),
  customer_name: z.string().optional(),
  customer_ci: z.string().optional(),
  customer_phone: z.string().optional(),
  customer_address: z.string().optional(),
  budget_total: z.number().positive().default(0),
  budget_currency: z.string().default('CUP'),
  advance_amount: z.number().default(0),
  advance_method: z.enum(['cash', 'transfer', 'zelle']).optional(),
  advance_currency: z.string().default('CUP'),
  description: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional().nullable(),
    budgeted_qty: z.number().positive(),
    budgeted_unit_cost: z.number().positive(),
  })).default([]),
});

// POST: Crear orden
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { items, ...orderData } = parsed.data;

    // Crear orden
    const { data: order, error: orderError } = await supabase.from('production_orders').insert({
      ...orderData,
      store_id: userData.active_store_id,
      created_by: user.id,
      status: 'draft',
      paid_amount: parsed.data.advance_amount || 0,
      payment_status: (parsed.data.advance_amount || 0) > 0 ? 'partial' : 'unpaid',
    }).select().single();

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

    // Crear items del presupuesto
    if (items.length > 0) {
      const itemsData = items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        budgeted_qty: item.budgeted_qty,
        budgeted_unit_cost: item.budgeted_unit_cost,
        status: 'pending',
      }));
      const { error: itemsError } = await supabase.from('production_order_items').insert(itemsData);
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Registrar anticipo como pago
    if (parsed.data.advance_amount > 0 && parsed.data.advance_method) {
      await supabase.rpc('register_supplier_payment', {
        p_store_id: userData.active_store_id,
        p_ref_type: 'production_order',
        p_ref_id: order.id,
        p_amount: parsed.data.advance_amount,
        p_payment_method: parsed.data.advance_method,
        p_paid_by: user.id,
        p_currency: parsed.data.advance_currency,
      });
    }

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Listar órdenes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const order_type = searchParams.get('order_type');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    let query = supabase.from('production_orders')
      .select('*')
      .eq('store_id', userData.active_store_id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (order_type) query = query.eq('order_type', order_type);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
