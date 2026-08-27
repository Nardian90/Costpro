import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { withSecurity } from '@/lib/with-security';
import { canManageStore, canViewStore } from '@/lib/roles';

/**
 * GET /api/received-services?store_id=...&status=...&type=...
 * POST /api/received-services — Crear nuevo servicio (v2: RPC create_received_service_v2)
 * PATCH /api/received-services — Editar/anular servicio (v2: RPC void_received_service_with_reversal / set_received_service_status)
 *
 * v2.25.0 — Feature flag USE_V2_RECEIVED_SERVICES:
 *   true  → usa RPCs transaccionales (create_received_service_v2, void_received_service_with_reversal, set_received_service_status)
 *   false → usa codigo TypeScript viejo (compatibilidad)
 */

const USE_V2 = process.env.USE_V2_RECEIVED_SERVICES === 'true';

/* ────────────────────────────────────────────────────────────────────────
 * FIX F3-P0-02 (auditoría multitienda):
 * Estas rutas usaban el cliente service-role SIN validación de membresía.
 * El store_id que envía el cliente NO es autorización. Ahora:
 *   JWT válido → identidad server-side → gate por tienda → operación
 * privilegiada. DENY por defecto para actores sin membership en la tienda
 * objetivo (admin global pasa por diseño, ver src/lib/roles.ts).
 * ──────────────────────────────────────────────────────────────────────── */
function forbidden() {
  return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    if (!storeId) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    // FIX F3-P0-02: lectura cross-store prohibida sin membership activa
    if (!canViewStore(session.user, storeId)) return forbidden();

    const status = searchParams.get('status');

    let query = admin.from('received_services').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR', error.message), { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const rl = await rateLimit(`services:post:${session.user.id}`, { windowMs: 60_000, maxRequests: 20 });
    if (!rl.allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

    const body = await req.json();
    const storeId = body.store_id;
    if (!storeId) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    // FIX F3-P0-02: creación requiere rol de gestión en la tienda objetivo
    if (!canManageStore(session.user, storeId)) return forbidden();

    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    if (USE_V2) {
      // ─── v2.25.0: RPC transaccional ───
      const { createClient } = await import('@supabase/supabase-js');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
      const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

      const { data: rpcResult, error: rpcErr } = await admin.rpc('create_received_service_v2', {
        p_store_id: storeId,
        p_supplier: body.supplier,
        p_total_amount: body.total_amount,
        p_service_type_id: body.service_type_id || null,
        p_service_type_name: body.service_type_name || 'Otro',
        p_service_date: body.service_date || null,
        p_currency: body.currency || 'CUP',
        p_exchange_rate: body.exchange_rate || 1.0,
        p_payment_terms_days: body.payment_terms_days || 30,
        p_distribution_method: body.distribution_method || 'amount',
        p_reference_doc: body.reference_doc || null,
        p_observations: body.observations || null,
        p_receipt_ids: body.receipt_ids || [],
        p_created_by: userId,
      });

      if (rpcErr) {
        const msg = rpcErr.message;
        if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        if (msg.includes('ERR_SUPPLIER_REQUIRED')) return NextResponse.json({ error: 'Supplier requerido' }, { status: 400 });
        if (msg.includes('ERR_INVALID_AMOUNT')) return NextResponse.json({ error: 'total_amount debe ser > 0' }, { status: 400 });
        if (msg.includes('ERR_INVALID_EXCHANGE_RATE')) return NextResponse.json({ error: 'exchange_rate fuera de rango [0.01, 10000]' }, { status: 400 });
        if (msg.includes('ERR_INVALID_PAYMENT_TERMS')) return NextResponse.json({ error: 'payment_terms_days fuera de rango [1, 365]' }, { status: 400 });
        if (msg.includes('ERR_SERVICE_TYPE_NOT_FOUND')) return NextResponse.json({ error: 'Service type no encontrado' }, { status: 400 });
        if (msg.includes('ERR_RECEIPT_INVALID')) return NextResponse.json({ error: 'Receipt invalido (cross-store o no activo)' }, { status: 400 });
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      return NextResponse.json({ data: { id: rpcResult.service_id, service_number: rpcResult.service_number } }, { status: 201 });
    }

    // ─── v2.24.x: codigo TypeScript viejo (compatibilidad) ───
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { count } = await admin.from('received_services').select('*', { count: 'exact', head: true }).eq('store_id', storeId);
    const serviceNumber = `SRV-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await admin.from('received_services').insert({
      store_id: storeId,
      service_number: serviceNumber,
      service_date: body.service_date || new Date().toISOString().split('T')[0],
      service_type_id: body.service_type_id || null,
      service_type_name: body.service_type_name || 'Otro',
      supplier: body.supplier || null,
      reference_doc: body.reference_doc || null,
      currency: body.currency || 'CUP',
      exchange_rate: body.exchange_rate || 1,
      total_amount: body.total_amount,
      observations: body.observations || null,
      status: 'active',
      distribution_method: body.distribution_method || 'amount',
      created_by: session.user.id,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from('service_audit_log').insert({
      service_id: data.id, user_id: session.user.id,
      action: 'created', details: { service_number: serviceNumber, total_amount: body.total_amount }
    });

    if (body.receipt_ids && Array.isArray(body.receipt_ids) && body.receipt_ids.length > 0) {
      const totalReceipts = body.receipt_ids.length;
      const allocatedPerReceipt = body.total_amount / totalReceipts;
      const links = body.receipt_ids.map((rid: string) => ({
        service_id: data.id, receipt_id: rid,
        allocation_percentage: 100 / totalReceipts,
        allocated_amount: allocatedPerReceipt,
      }));
      await admin.from('service_reception_links').insert(links);
      await admin.from('service_audit_log').insert({
        service_id: data.id, user_id: session.user.id,
        action: 'linked', details: { receipt_ids: body.receipt_ids }
      });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json();
    const { service_id, ...updates } = body;
    if (!service_id || typeof service_id !== 'string') {
      return NextResponse.json({ error: 'service_id es requerido' }, { status: 400 });
    }
    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    const { createClient: createClientEarly } = await import('@supabase/supabase-js');
    const urlE = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const keyE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!urlE || !keyE) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const adminEarly = createClientEarly(urlE, keyE, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX F3-P0-02: resolver la tienda REAL del servicio server-side y validar
    // gestión ANTES de ejecutar cualquier RPC/UPDATE privilegiado.
    const { data: svcRow, error: svcErr } = await adminEarly
      .from('received_services')
      .select('id,store_id')
      .eq('id', service_id)
      .single();
    if (svcErr || !svcRow?.store_id) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }
    if (!canManageStore(session.user, svcRow.store_id)) return forbidden();

    if (USE_V2) {
      // ─── v2.25.0: RPCs transaccionales ───
      if (body.action === 'void') {
        const { data: rpcResult, error: rpcErr } = await admin.rpc('void_received_service_with_reversal', {
          p_service_id: service_id,
          p_user_id: userId,
          p_reason: body.reason || 'Anulacion via API',
        });
        if (rpcErr) {
          const msg = rpcErr.message;
          if (msg.includes('ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE')) return NextResponse.json({ error: 'Servicio no encontrado o no activo' }, { status: 404 });
          if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          return NextResponse.json({ error: msg }, { status: 500 });
        }
        return NextResponse.json({ success: true, data: rpcResult });
      }

      // Edit = status change via RPC
      if (body.status) {
        const { data: rpcResult, error: rpcErr } = await admin.rpc('set_received_service_status', {
          p_service_id: service_id,
          p_new_status: body.status,
          p_user_id: userId,
          p_reason: body.reason || null,
        });
        if (rpcErr) {
          const msg = rpcErr.message;
          if (msg.includes('ERR_SERVICE_NOT_FOUND')) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
          if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          if (msg.includes('ERR_INVALID_TRANSITION')) return NextResponse.json({ error: msg.replace(/^.*ERR_INVALID_TRANSITION:\s*/, '') }, { status: 400 });
          return NextResponse.json({ error: msg }, { status: 500 });
        }
        return NextResponse.json({ success: true, data: rpcResult });
      }

      return NextResponse.json({ error: 'PATCH requiere action=void o status=...' }, { status: 400 });
    }

    // ─── v2.24.x: codigo TypeScript viejo ───
    if (body.action === 'void') {
      const { error } = await admin.from('received_services').update({ status: 'voided', updated_at: new Date().toISOString() }).eq('id', service_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await admin.from('service_cost_distributions').delete().eq('service_id', service_id);
      await admin.from('service_audit_log').insert({ service_id, user_id: session.user.id, action: 'voided', details: {} });
      return NextResponse.json({ success: true });
    }

    const { data, error } = await admin.from('received_services').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', service_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from('service_audit_log').insert({ service_id, user_id: session.user.id, action: 'edited', details: updates });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// * PATCH ya no confía en el cliente: resuelve service→store_id y aplica
// * canManageStore antes de cualquier operación privilegiada.
export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, { rateLimitKey: 'received-services:post', maxRequests: 10 }));
export const PATCH = withAuth(patchHandler);
