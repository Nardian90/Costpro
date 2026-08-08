import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';



// POST: Dar salida a un item (descontar del inventario)
// v2.26.0 G9: usa withdraw_production_item con p_user_id + p_idempotency_key
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
  try {
    const body = await request.json();
    const { item_id, qty, unit_cost, idempotency_key } = body;

    if (!item_id || !qty || qty <= 0) {
      return NextResponse.json({ error: 'item_id y qty son requeridos' }, { status: 400 });
    }

    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', session_user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { data: result, error } = await supabase.rpc('withdraw_production_item', {
      p_item_id: item_id,
      p_qty: qty,
      p_unit_cost: unit_cost || 0,
      p_store_id: userData.active_store_id,
      p_user_id: session_user.id,
      p_idempotency_key: idempotency_key || null,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      if (msg.includes('ERR_ITEM_NOT_FOUND')) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
      if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return NextResponse.json({ error: msg.replace(/^.*ERR_ORDER_NOT_EDITABLE:\s*/, '') }, { status: 400 });
      if (msg.includes('ERR_INVALID_QUANTITY')) return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
      if (msg.includes('ERR_IDEMPOTENCY_KEY_REUSE')) return NextResponse.json({ error: 'Idempotency key reutilizada' }, { status: 409 });
      if (msg.includes('ERR_INSUFFICIENT_STOCK')) return NextResponse.json({ error: 'Stock insuficiente' }, { status: 400 });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ success: true, orderId, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'po-withdraw:post',
  maxRequests: 10,
}));



