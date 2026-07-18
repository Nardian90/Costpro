import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';



// POST: Dar salida a un item (descontar del inventario)
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
  try {
    // orderId extracted from URL above
    const body = await request.json();
    const { item_id, qty, unit_cost } = body;

    if (!item_id || !qty || qty <= 0) {
      return NextResponse.json({ error: 'item_id y qty son requeridos' }, { status: 400 });
    }

    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', session_user.id).single();
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

export const POST = withAuth(postHandler);



