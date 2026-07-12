import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// POST: Dar salida a un item (descontar del inventario)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();
    const { item_id, qty, unit_cost } = body;

    if (!item_id || !qty || qty <= 0) {
      return NextResponse.json({ error: 'item_id y qty son requeridos' }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { error } = await supabase.rpc('withdraw_production_item', {
      p_item_id: item_id,
      p_qty: qty,
      p_unit_cost: unit_cost || 0,
      p_store_id: userData.active_store_id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, orderId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
