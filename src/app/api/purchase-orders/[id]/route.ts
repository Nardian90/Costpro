import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * /api/purchase-orders/[id]
 *
 * GET    — detalle de OC + items
 * PATCH  — actualizar status (con validación de state machine)
 * POST   — recibir contra OC (atómico, sin race conditions)
 */

function extractIdFromUrl(req: NextRequest): string | null {
  const match = req.nextUrl?.pathname?.match(/\/api\/purchase-orders\/([^/]+)/);
  return match?.[1] || null;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const supabase = getSupabaseForSession(session);

  const { data: order, error: orderErr } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 });
  }

  // Verificar acceso a la tienda de la OC
  const hasStoreAccess = session.user.role === 'admin' ||
    session.user.memberships?.some((m: any) => m.store_id === order.store_id && m.status === 'active');
  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from('purchase_order_items')
    .select('*')
    .eq('po_id', id)
    .order('created_at', { ascending: true });

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({ order, items: items || [] });
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { status: newStatus } = body;

  // FIX: State machine — validar transiciones válidas
  const validTransitions: Record<string, string[]> = {
    'sent': ['partial', 'received', 'cancelled'],
    'partial': ['received', 'cancelled'],
    'received': [],
    'cancelled': [],
  };

  const supabase = getSupabaseForSession(session);

  // Cargar OC actual
  const { data: order, error: loadErr } = await supabase
    .from('purchase_orders')
    .select('store_id, status')
    .eq('id', id)
    .single();

  if (loadErr || !order) {
    return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 });
  }

  // Verificar acceso
  const hasStoreAccess = session.user.role === 'admin' ||
    session.user.memberships?.some((m: any) => m.store_id === order.store_id && m.status === 'active');
  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Validar transición
  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Transición inválida: ${order.status} → ${newStatus}. Permitidas: ${allowed.join(', ') || 'ninguna'}` },
      { status: 400 },
    );
  }

  // FIX TOCTOU: solo actualizar si el status no cambió desde que lo leímos
  const { error: updateErr } = await supabase
    .from('purchase_orders')
    .update({
      status: newStatus,
      received_at: newStatus === 'received' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('status', order.status); // condición de optimismo

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true, status: newStatus });
}

/**
 * POST /api/purchase-orders/[id] — Recibir contra OC
 * Body: { receivedItems: [{ poItemId, quantityReceived }] }
 *
 * FIX: Atómico — actualiza todos los items y recalcula status en una operación.
 * Antes: bucle secuencial con race condition.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado' && session.user.role !== 'warehouse') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { receivedItems } = body;

  if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
    return NextResponse.json({ error: 'receivedItems requerido (array)' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  // FIX: RPC transaccional — receive_against_po suma atómicamente quantity_received
  // y recalcula status global. No hay race conditions.
  const rpcItems = receivedItems.map((item: { poItemId: string; quantityReceived: number }) => ({
    po_item_id: item.poItemId,
    quantity_received: item.quantityReceived,
  }));

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('receive_against_po', {
    p_po_id: id,
    p_received_items: rpcItems,
    p_user_id: userId,
  });

  if (rpcErr) {
    const msg = rpcErr.message;
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (msg.includes('ERR_PO_NOT_FOUND')) {
      return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 });
    }
    if (msg.includes('ERR_PO_CANCELLED')) {
      return NextResponse.json({ error: 'OC cancelada, no se puede recibir' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: rpcResult.po_status });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const POST = withAuth(postHandler);
