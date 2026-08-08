import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withSecurity } from '@/lib/with-security';
import { getSupabaseForSession } from '@/lib/supabase-session';

/**
 * GET /api/purchase-orders?store_id=...&status=...
 * POST /api/purchase-orders  — crear OC con items atómicamente
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const status = searchParams.get('status');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('purchase_orders')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [], count: data?.length || 0 });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (session.user.role !== 'admin' && session.user.role !== 'manager' && session.user.role !== 'encargado') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin, manager o encargado' }, { status: 403 });
  }

  const body = await req.json();
  const { store_id, supplier_name, supplier_id, po_number, notes, expected_date, items } = body;

  if (!store_id || !supplier_name || !items || items.length === 0) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, supplier_name, items (mínimo 1)' },
      { status: 400 },
    );
  }

  // Validar acceso a la tienda
  const hasStoreAccess = session.user.role === 'admin' ||
    session.user.memberships?.some((m: any) => m.store_id === store_id && m.status === 'active');
  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Forbidden — sin acceso a esta tienda' }, { status: 403 });
  }

  // v2.24.0 — Validar items: product_id required + unit_cost > 0 (parity con register_reception B4)
  for (const item of items) {
    if (!item.product_name) {
      return NextResponse.json({ error: `Item inválido: product_name requerido` }, { status: 400 });
    }
    if (!item.product_id) {
      return NextResponse.json(
        { error: `Item inválido: product_id requerido (item "${item.product_name}")` },
        { status: 400 },
      );
    }
    if (item.quantity_ordered <= 0) {
      return NextResponse.json({ error: `Item inválido: quantity_ordered debe ser > 0` }, { status: 400 });
    }
    if (item.unit_cost <= 0) {
      return NextResponse.json(
        { error: `Item inválido: unit_cost debe ser > 0 (B4 parity con register_reception)` },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  // v2.24.0 — RPC transaccional: OC + items + auditoría en una transacción de Postgres.
  // El RPC crea con estado 'draft' por defecto (no es necesario sobreescribirlo).
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('create_purchase_order', {
    p_store_id: store_id,
    p_supplier_name: supplier_name,
    p_supplier_id: supplier_id || null,
    p_po_number: po_number || null,
    p_notes: notes || null,
    p_expected_date: expected_date || null,
    p_created_by: userId,
    p_items: items,
  });

  if (rpcErr) {
    const msg = rpcErr.message;
    // Mapear errores del RPC a códigos HTTP
    if (msg.includes('ERR_UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Forbidden — sin acceso a esta tienda' }, { status: 403 });
    }
    if (msg.includes('ERR_SUPPLIER_REQUIRED')) {
      return NextResponse.json({ error: 'Supplier requerido' }, { status: 400 });
    }
    if (msg.includes('ERR_SUPPLIER_NOT_FOUND')) {
      return NextResponse.json({ error: 'Supplier no encontrado o inactivo en esta tienda' }, { status: 400 });
    }
    if (msg.includes('ERR_EMPTY_ITEMS')) {
      return NextResponse.json({ error: 'Items vacío — al menos 1 item requerido' }, { status: 400 });
    }
    if (msg.includes('ERR_PRODUCT_ID_REQUIRED')) {
      return NextResponse.json({ error: 'product_id requerido en todos los items' }, { status: 400 });
    }
    if (msg.includes('ERR_ITEM_PRODUCT_NAME_REQUIRED')) {
      return NextResponse.json({ error: 'product_name requerido en todos los items' }, { status: 400 });
    }
    if (msg.includes('ERR_ITEM_QTY_INVALID')) {
      return NextResponse.json({ error: 'quantity_ordered debe ser > 0' }, { status: 400 });
    }
    if (msg.includes('ERR_ITEM_UNIT_COST_INVALID')) {
      return NextResponse.json({ error: 'unit_cost debe ser > 0 (B4 parity)' }, { status: 400 });
    }
    if (msg.includes('ERR_PRODUCT_NOT_IN_STORE')) {
      return NextResponse.json({ error: 'Producto no existe en esta tienda' }, { status: 400 });
    }
    if (msg.includes('ERR_PO_NUMBER_DUPLICATE')) {
      return NextResponse.json({ error: 'po_number ya existe en esta tienda' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // v2.24.0 — El RPC retorna po_id + po_number + total_amount.
  // No se hace UPDATE posterior (el RPC crea en 'draft' por defecto).
  return NextResponse.json({
    order_id: rpcResult.po_id,
    po_number: rpcResult.po_number,
    total_amount: rpcResult.total_amount,
  }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, {
  rateLimitKey: 'purchase-orders:post',
  maxRequests: 10,
}));
