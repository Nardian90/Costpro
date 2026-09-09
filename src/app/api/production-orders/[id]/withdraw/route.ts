import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';



// POST: Dar salida a un item (descontar del inventario)
// REM-F4-03: usa withdraw_production_item_v3 (SECURITY DEFINER, doctrina DF-05).
// EL COSTO ES 100% SERVER-SIDE: v3 deriva el unit_cost de products.cost_average
// bajo FOR UPDATE (sin fallback a 0) y registra cost_authority='server_side_wac_v3'
// en audit_logs. El cliente NO determina unit_cost/WAC/COGS: cualquier campo
// unit_cost recibido en el body se IGNORA por diseño (compatibilidad de contrato
// con la UI existente; nunca se reenvía a la RPC).
// Idempotencia: idempotency_key se delega al registry de v3 (check/register).
async function postHandler(request: NextRequest, session: AuthenticatedSession) {
  const orderId = request.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
  try {
    const body = await request.json();
    // unit_cost intencionalmente NO se lee del body (REM-F4-03 §cost authority):
    // si el cliente lo envía, se descarta silenciosamente.
    const { item_id, qty, idempotency_key } = body;

    if (!item_id || !qty || qty <= 0) {
      return NextResponse.json({ error: 'item_id y qty son requeridos' }, { status: 400 });
    }

    const session_user = session.user;
    const supabase = getSupabaseForSession(session);

    const { data: userData } = await supabase.from('profiles').select('active_store_id').eq('id', session_user.id).single();
    if (!userData?.active_store_id) return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });

    const { data: result, error } = await supabase.rpc('withdraw_production_item_v3', {
      p_item_id: item_id,
      p_qty: qty,
      p_store_id: userData.active_store_id,
      p_user_id: session_user.id,
      p_idempotency_key: idempotency_key || null,
      p_reference_id: null,
      p_reference_doc: null,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      if (msg.includes('ERR_UNAUTHENTICATED')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      if (msg.includes('ERR_ITEM_NOT_FOUND')) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 });
      if (msg.includes('ERR_ORDER_NOT_FOUND')) return NextResponse.json({ error: 'Orden de producción no encontrada' }, { status: 404 });
      if (msg.includes('ERR_ORDER_NOT_EDITABLE')) return NextResponse.json({ error: msg.replace(/^.*ERR_ORDER_NOT_EDITABLE:\s*/, '') }, { status: 400 });
      if (msg.includes('ERR_INVALID_QUANTITY')) return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
      if (msg.includes('ERR_OVERCONSUMPTION')) return NextResponse.json({ error: 'Cantidad excede lo presupuestado del item' }, { status: 400 });
      if (msg.includes('ERR_PRODUCT_NOT_FOUND')) return NextResponse.json({ error: 'Producto no encontrado en la tienda de la orden' }, { status: 404 });
      if (msg.includes('ERR_PRODUCT_COST_UNAVAILABLE')) return NextResponse.json({ error: 'Costo del material no disponible (server-side)' }, { status: 409 });
      if (msg.includes('ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED')) return NextResponse.json({ error: 'WAC del material es 0 sin aprobación documentada' }, { status: 409 });
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



