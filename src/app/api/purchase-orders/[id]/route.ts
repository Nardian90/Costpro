import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { withSecurity } from '@/lib/with-security';

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
  const { status: newStatus, reason } = body;

  if (!newStatus) {
    return NextResponse.json({ error: 'status requerido en el body' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  // v2.24.0 — Usar RPC set_purchase_order_status (state machine server-side + auditoría)
  // Validaciones (state machine): draft→{sent,cancelled}, sent→{cancelled}, partial→{cancelled}
  // received/cancelled son terminales. partial/received solo vía receive_against_po.
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('set_purchase_order_status', {
    p_po_id: id,
    p_new_status: newStatus,
    p_user_id: userId,
    p_reason: reason || null,
  });

  if (rpcErr) {
    const msg = rpcErr.message;
    if (msg.includes('ERR_PO_NOT_FOUND')) {
      return NextResponse.json({ error: 'OC no encontrada' }, { status: 404 });
    }
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (msg.includes('ERR_INVALID_TRANSITION')) {
      return NextResponse.json({ error: msg.replace(/^.*ERR_INVALID_TRANSITION:\s*/, '') }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status: rpcResult.po_status,
    previous_status: rpcResult.previous_status,
  });
}

/**
 * POST /api/purchase-orders/[id] — Recibir contra OC
 * Body: { receivedItems: [{ poItemId, quantityReceived }], receptionDate?, invoiceNumber? }
 *
 * v2.24.0 — RPC transaccional atómico:
 *   - Cast enum correcto (sin 42804)
 *   - Llama a register_reception (8 validaciones B+C del v2.23.0)
 *   - Actualiza inventario + WAC automáticamente
 *   - Crea receipt vinculado con po_id
 *   - Marca receipt con payment_status='unpaid' para CxP
 *   - Items ordenados por po_item_id ASC (anti-deadlock)
 *   - reference_doc NULL si no viene invoice_number (evita UNIQUE collision en partial receives)
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const id = extractIdFromUrl(req);
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado' && session.user.role !== 'warehouse') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { receivedItems, receptionDate, invoiceNumber } = body;

  if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
    return NextResponse.json({ error: 'receivedItems requerido (array)' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  const rpcItems = receivedItems.map((item: { poItemId: string; quantityReceived: number }) => ({
    po_item_id: item.poItemId,
    quantity_received: item.quantityReceived,
  }));

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('receive_against_po', {
    p_po_id: id,
    p_received_items: rpcItems,
    p_user_id: userId,
    p_reception_date: receptionDate || new Date().toISOString(),
    p_invoice_number: invoiceNumber || null,
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
    if (msg.includes('ERR_PO_NOT_RECEIVABLE')) {
      return NextResponse.json({ error: 'OC en estado terminal, no se puede recibir' }, { status: 400 });
    }
    if (msg.includes('ERR_EMPTY_ITEMS')) {
      return NextResponse.json({ error: 'Items vacío' }, { status: 400 });
    }
    if (msg.includes('ERR_ITEM_ID_REQUIRED')) {
      return NextResponse.json({ error: 'po_item_id requerido en todos los items' }, { status: 400 });
    }
    if (msg.includes('ERR_NEGATIVE_QTY')) {
      return NextResponse.json({ error: 'quantity_received debe ser > 0' }, { status: 400 });
    }
    if (msg.includes('ERR_ITEM_NOT_FOUND')) {
      return NextResponse.json({ error: 'Item no encontrado en esta OC' }, { status: 404 });
    }
    if (msg.includes('ERR_OVER_RECEIVE')) {
      return NextResponse.json({ error: msg.replace(/^.*ERR_OVER_RECEIVE:\s*/, '') }, { status: 409 });
    }
    if (msg.includes('ERR_PRODUCT_ID_REQUIRED')) {
      return NextResponse.json({ error: 'Item de OC sin product_id — no se puede recibir' }, { status: 400 });
    }
    if (msg.includes('ERR_PRODUCT_NOT_IN_STORE')) {
      return NextResponse.json({ error: 'Producto no existe en la tienda' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status: rpcResult.po_status,
    receipt_id: rpcResult.receipt_id,
    items_received: rpcResult.items_received,
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(withSecurity(patchHandler, {
  rateLimitKey: 'purchase-orders:patch',
  maxRequests: 20,
}));
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'purchase-orders:post',
  maxRequests: 10,
}));
