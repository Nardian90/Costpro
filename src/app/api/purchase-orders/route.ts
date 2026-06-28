import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
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

  // Validar items
  for (const item of items) {
    if (!item.product_name || item.quantity_ordered <= 0 || item.unit_cost < 0) {
      return NextResponse.json(
        { error: `Item inválido: ${JSON.stringify(item)}` },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseForSession(session);
  const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

  // FIX: RPC transaccional — OC + items + auditoría en una transacción de Postgres
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
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  // Forzar estado 'draft' — la OC se crea en edición para que el usuario decida
  // si confirmarla (enviar), editarla o anularla. El RPC puede crearla como 'sent'
  // por defecto, así que la sobreescribimos aquí.
  const { error: statusErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'draft' })
    .eq('id', rpcResult.po_id);

  if (statusErr) {
    // No es crítico — la OC ya fue creada, solo el estado no se actualizó
    console.warn('No se pudo actualizar estado a draft:', statusErr.message);
  }

  return NextResponse.json({ order_id: rpcResult.po_id, total_amount: rpcResult.total_amount }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
