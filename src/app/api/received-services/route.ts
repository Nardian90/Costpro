import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { withSecurity } from '@/lib/with-security';
import { canManageStore, canViewStore } from '@/lib/roles';

/**
 * GET /api/received-services?store_id=...&status=...&type=...
 * POST /api/received-services — Crear nuevo servicio (v2.18.0: SIEMPRE RPC create_received_service_v2)
 * PATCH /api/received-services — Editar/anular servicio
 *   USE_V2=true  → RPCs transaccionales (void_received_service_with_reversal / set_received_service_status)
 *   USE_V2=false → codigo TypeScript viejo (compatibilidad; solo void y updates de columnas)
 *
 * v2.18.0 — FIX-SERVICIOS-ARQUEO-REPORTES:
 *   · POST ya no depende del flag: siempre RPC transaccional actor-explícito
 *     (corrige «No tienes acceso autorizado» — auth.uid() NULL bajo service_role)
 *     y soporta vinculación operativa (p_receipt_ids + p_production_order_ids).
 *   · PATCH legacy extrae action/reason antes del update (eran enviados como
 *     columnas → PGRST204 500).
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

    // REM-COSTPRO4-CI: contrato del body con Zod (servicio recibido; campos
    // opcionales — la requeridad de store_id la aplica el check de abajo y el
    // RPC valida el resto).
    const ReceivedServiceSchema = z.object({
      store_id: z.string().optional(),
      supplier: z.string().nullable().optional(),
      total_amount: z.union([z.number(), z.string()]).nullable().optional(),
      service_type_id: z.string().nullable().optional(),
      service_type_name: z.string().nullable().optional(),
      service_date: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      exchange_rate: z.union([z.number(), z.string()]).nullable().optional(),
      payment_terms_days: z.union([z.number(), z.string()]).nullable().optional(),
      distribution_method: z.string().nullable().optional(),
      reference_doc: z.string().nullable().optional(),
      observations: z.string().nullable().optional(),
      receipt_ids: z.array(z.unknown()).nullable().optional(),
      // v2.18.0: vinculación documental con Órdenes de Trabajo/Producción
      production_order_ids: z.array(z.unknown()).nullable().optional(),
    }).passthrough();
    const parsedBody = ReceivedServiceSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedBody.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
    }

    const storeId = body.store_id;
    if (!storeId) {
      return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
    }

    // FIX F3-P0-02: creación requiere rol de gestión en la tienda objetivo
    if (!canManageStore(session.user, storeId)) return forbidden();

    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    // ─── v2.18.0: POST SIEMPRE usa el RPC transaccional ───
    // Antes el POST dependía del feature flag USE_V2_RECEIVED_SERVICES. Con el
    // flag desactivado (estado de Vercel verificado el 10-oct-2026) el path
    // legacy omitía la validación del ACTOR dentro del RPC y no soportaba la
    // vinculación operativa (OT). El RPC create_received_service_v2 v2.18.0 es
    // actor-explícito (patrón create_sale_v2), transaccional y ya está aplicado
    // y probado en LIVE → el POST no vuelve a depender del flag.
    {
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
        p_production_order_ids: body.production_order_ids || [],
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
        if (msg.includes('ERR_PRODUCTION_ORDER_INVALID')) return NextResponse.json({ error: 'Orden de trabajo invalida (cross-store, anulada o cerrada)' }, { status: 400 });
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      return NextResponse.json({ data: { id: rpcResult.service_id, service_number: rpcResult.service_number, production_order_link_count: rpcResult.production_order_link_count || 0 } }, { status: 201 });
    }
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
    const { service_id, ...rest } = body;
    if (!service_id || typeof service_id !== 'string') {
      return NextResponse.json({ error: 'service_id es requerido' }, { status: 400 });
    }
    // v2.18.0: 'action' y 'reason' son parámetros de control del endpoint, NO
    // columnas de received_services. Enviarlos al update legacy provocaba
    // PGRST204 500 («Could not find the 'reason' column»). Se extraen antes.
    const { action, reason, ...updates } = rest;
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

    // ─── v2.24.x: codigo TypeScript viejo (compatibilidad) ───
    if (body.action === 'void') {
      const { error } = await admin.from('received_services').update({ status: 'voided', updated_at: new Date().toISOString() }).eq('id', service_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // v2.18.0: paridad con void_received_service_with_reversal — la anulación
      // limpia TAMBIÉN los vínculos documentales de OT (tabla nueva).
      await admin.from('service_production_order_links').delete().eq('service_id', service_id);
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
