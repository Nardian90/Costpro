import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { withSecurity } from '@/lib/with-security';
import { canManageStore, canViewStore } from '@/lib/roles';
// MISIÓN POLÍTICA TEMPORAL (2026-10-18): política temporal del documento —
// default HOY (día de negocio America/Havana) y tope HOY (nunca futura).
// El RPC create_received_service_v2 ya valida el rango (gate BD de 6 meses);
// la ruta revalida el tope estricto y corrige el default CURRENT_DATE (UTC del
// servidor Postgres), que tras las 20:00 Habana fechaba el servicio «mañana».
import { checkNotFutureOperationDate } from '@/lib/pos/operation-date';
import { todayBusinessDay } from '@/lib/cash-report/period-attribution';
// CP-SEC-019: validador UUID permisivo canónico (prohibido el validador uuid estricto en api).
import { uuidLoose } from '@/validation/api-schemas';

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

/* ──────────────────────────────────────────────────────────────────────────
 * ADN-009 (§6): resolución de la IDENTIDAD del proveedor desde la FUENTE
 * AUTORIZADA. Los IDs que envía el cliente NO son confianza: el snapshot
 * (code/tax_id/phone/address) y el nombre canónico salen de las filas de la
 * BD (suppliers de la tienda / master_parties del tenant activo). Rechaza
 * fail-closed: proveedor de otra tienda, tercero de otro tenant, maestro
 * inactivo o identidad local↔maestro incoherente. La compatibilidad con
 * proveedores históricos sin identidad estructurada se conserva (sin IDs →
 * solo texto libre + meta de visualización).
 * ────────────────────────────────────────────────────────────────────────── */
type ResolvedSupplierIdentity = {
  supplierId: string | null;
  masterPartyId: string | null;
  snapshot: { code: string | null; tax_id: string | null; phone: string | null; address: string | null } | null;
  name: string | null;
};

type IdentityResolverResult =
  | { ok: true; identity: ResolvedSupplierIdentity }
  | { ok: false; status: number; error: string; code: string };

async function resolveSupplierIdentity(
  admin: SupabaseClient,
  storeId: string,
  input: {
    supplier_id?: string | null;
    supplier_master_party_id?: string | null;
    supplier_meta?: { code?: string | null; tax_id?: string | null; phone?: string | null; address?: string | null } | null;
    supplier?: string | null;
  },
): Promise<IdentityResolverResult> {
  const clientMeta = input.supplier_meta
    ? { code: input.supplier_meta.code ?? null, tax_id: input.supplier_meta.tax_id ?? null, phone: input.supplier_meta.phone ?? null, address: input.supplier_meta.address ?? null }
    : null;
  const sentSupplierId = input.supplier_id || null;
  const sentMasterId = input.supplier_master_party_id || null;

  // Sin identidad estructurada → histórico de texto libre: se conservan el
  // nombre y la meta de visualización tal cual (sin IDs que validar).
  if (!sentSupplierId && !sentMasterId) {
    return { ok: true, identity: { supplierId: null, masterPartyId: null, snapshot: clientMeta, name: input.supplier ?? null } };
  }

  // 1) Proveedor LOCAL: debe pertenecer a la tienda del documento.
  let supplierRow: { id: string; name: string; tax_id: string | null; phone: string | null; address: string | null; master_party_id: string | null } | null = null;
  if (sentSupplierId) {
    // NOTA (ADN-009): `suppliers` NO tiene columna `code` (el código es un
    // concepto del Clasificador Maestro) — el snapshot de code sale del
    // maestro o queda NULL para proveedores locales.
    const { data, error } = await admin
      .from('suppliers')
      .select('id, name, tax_id, phone, address, master_party_id')
      .eq('id', sentSupplierId)
      .eq('store_id', storeId)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, status: 400, error: 'El proveedor seleccionado no pertenece a la tienda activa', code: 'ERR_SUPPLIER_INVALID' };
    }
    supplierRow = data;
  }

  // 2) Coherencia local↔maestro cuando llegan ambas identidades (§6).
  let effectiveMaster = sentMasterId;
  if (supplierRow?.master_party_id && sentMasterId && supplierRow.master_party_id !== sentMasterId) {
    return { ok: false, status: 400, error: 'La identidad del proveedor local y el tercero maestro no coinciden', code: 'ERR_SUPPLIER_IDENTITY_MISMATCH' };
  }
  if (!effectiveMaster && supplierRow?.master_party_id) {
    effectiveMaster = supplierRow.master_party_id;
  }

  // 3) Tercero maestro: tenant de la tienda + estado activo.
  let masterRow: { id: string; name: string; code: string | null; tax_id: string | null; phone: string | null; address: string | null } | null = null;
  if (effectiveMaster) {
    const { data, error } = await admin
      .from('master_parties')
      .select('id, name, code, tax_id, phone, address, status, tenant_id')
      .eq('id', effectiveMaster)
      .maybeSingle();
    if (error || !data || data.status !== 'active') {
      return { ok: false, status: 400, error: 'El tercero maestro no pertenece al tenant de la tienda o no está activo', code: 'ERR_SUPPLIER_MASTER_INVALID' };
    }
    const { data: storeRow, error: storeErr } = await admin
      .from('stores')
      .select('tenant_id')
      .eq('id', storeId)
      .maybeSingle();
    if (storeErr || !storeRow?.tenant_id || storeRow.tenant_id !== data.tenant_id) {
      return { ok: false, status: 400, error: 'El tercero maestro no pertenece al tenant de la tienda o no está activo', code: 'ERR_SUPPLIER_MASTER_INVALID' };
    }
    masterRow = { id: data.id, name: data.name, code: data.code, tax_id: data.tax_id, phone: data.phone, address: data.address };
  }

  // 4) Snapshot + nombre desde la fuente autorizada (nunca del cliente).
  const snapshot = supplierRow
    ? { code: null, tax_id: supplierRow.tax_id, phone: supplierRow.phone, address: supplierRow.address }
    : masterRow
      ? { code: masterRow.code, tax_id: masterRow.tax_id, phone: masterRow.phone, address: masterRow.address }
      : clientMeta;
  const name = supplierRow?.name ?? masterRow?.name ?? input.supplier ?? null;

  return {
    ok: true,
    identity: {
      supplierId: sentSupplierId,
      masterPartyId: effectiveMaster,
      snapshot,
      name,
    },
  };
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
      // ─── ADN-008 ───
      // Identidad del proveedor (SupplierSelector): id local de la tienda y/o
      // tercero del Clasificador Maestro + snapshot de identificación.
      supplier_id: uuidLoose.nullable().optional(),
      supplier_master_party_id: uuidLoose.nullable().optional(),
      supplier_meta: z.object({
        code: z.string().nullable().optional(),
        tax_id: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
      }).nullable().optional(),
      // Guardar como BORRADOR (misión 008 §3): sin activación, sin pagos y
      // sin efectos financieros. Proveedor opcional en este modo.
      save_as_draft: z.boolean().optional(),
      // Idempotencia de creación (anti doble-clic / reintento).
      creation_key: z.string().min(8).max(120).optional(),
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

    // ─── MISIÓN POLÍTICA TEMPORAL (2026-10-18): fecha del servicio ───
    // Con fecha del cliente → revalidar tope HOY (422 accionable).
    // Sin fecha → estampar el día de NEGOCIO Habana explícito (no confiar
    // en CURRENT_DATE del Postgres, que corre en UTC y salta de día a las
    // 20:00 Habana, creando documentos futuros silenciosos).
    let serviceDate: string | null;
    if (typeof body.service_date === 'string' && body.service_date.trim()) {
      const dateCheck = checkNotFutureOperationDate(body.service_date);
      if (!dateCheck.ok) {
        return NextResponse.json({ error: 'Fecha del servicio no admisible', message: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' }, { status: 422 });
      }
      serviceDate = body.service_date;
    } else {
      serviceDate = todayBusinessDay(); // 'YYYY-MM-DD' — columna DATE
    }

    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    // ADN-008: snapshot de identidad del proveedor (SupplierSelector).
    const supplierMeta = body.supplier_meta && typeof body.supplier_meta === 'object'
      ? {
          code: body.supplier_meta.code ?? null,
          tax_id: body.supplier_meta.tax_id ?? null,
          phone: body.supplier_meta.phone ?? null,
          address: body.supplier_meta.address ?? null,
        }
      : null;

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

      // ─── ADN-008 §3: GUARDAR BORRADOR ───
      // create_received_service_draft: proveedor OPCIONAL (sin inventar datos),
      // inserta SIEMPRE status='draft' (el trigger fin_trg_received_services no
      // contabiliza borradores), NO activa y NO registra pagos. Idempotente por
      // creation_key. La confirmación posterior exige proveedor + importe > 0
      // (gate en set_received_service_status).
      // ADN-009 (§6/§7): identidad resuelta desde la fuente autorizada y
      // ownership re-validado dentro del RPC (gate de gestión con
      // can_manage_store_as; re-consulta de creation_key tras el advisory lock).
      if (body.save_as_draft === true) {
        const identity = await resolveSupplierIdentity(admin, storeId, {
          supplier_id: body.supplier_id || null,
          supplier_master_party_id: body.supplier_master_party_id || null,
          supplier_meta: supplierMeta,
          supplier: body.supplier ?? null,
        });
        if (!identity.ok) {
          return NextResponse.json({ error: identity.error, code: identity.code }, { status: identity.status });
        }
        const { data: rpcResult, error: rpcErr } = await admin.rpc('create_received_service_draft', {
          p_store_id: storeId,
          p_supplier: identity.identity.name ?? body.supplier ?? null,
          p_total_amount: body.total_amount,
          p_service_type_id: body.service_type_id || null,
          p_service_type_name: body.service_type_name || 'Otro',
          p_service_date: serviceDate,
          p_currency: body.currency || 'CUP',
          p_exchange_rate: body.exchange_rate || 1.0,
          p_payment_terms_days: body.payment_terms_days || 30,
          p_distribution_method: body.distribution_method || 'amount',
          p_reference_doc: body.reference_doc || null,
          p_observations: body.observations || null,
          p_receipt_ids: body.receipt_ids || [],
          p_production_order_ids: body.production_order_ids || [],
          p_created_by: userId,
          p_supplier_id: identity.identity.supplierId,
          p_supplier_master_party_id: identity.identity.masterPartyId,
          p_supplier_meta: identity.identity.snapshot,
          p_creation_key: body.creation_key || null,
        });

        if (rpcErr) {
          return mapCreateServiceRpcError(rpcErr.message);
        }

        return NextResponse.json({
          data: {
            id: rpcResult.service_id,
            service_number: rpcResult.service_number,
            production_order_link_count: rpcResult.production_order_link_count || 0,
            status: 'draft',
            duplicate: rpcResult.duplicate === true,
          },
        }, { status: 201 });
      }

      // CP-OPS-ENERVIDA §4: la identidad del proveedor se resuelve ANTES de
      // crear el servicio — el orden anterior (crear → resolver) dejaba un
      // draft huérfano por cada reintento cuando la identidad no validaba,
      // y el camino de confirmación no portaba creation_key. Ahora:
      //   1) identidad resuelta y validada contra la fuente autorizada;
      //   2) create_received_service_v2 con p_creation_key (idempotente);
      //   3) enriquecimiento por PK (ya no debería fallar, y si falla el
      //      servicio existe y el reintento NO lo duplica).
      let identityWarning: string | null = null;
      let resolvedIdentity: Awaited<ReturnType<typeof resolveSupplierIdentity>> | null = null;
      if (body.supplier_id || body.supplier_master_party_id) {
        const identity = await resolveSupplierIdentity(admin, storeId, {
          supplier_id: body.supplier_id || null,
          supplier_master_party_id: body.supplier_master_party_id || null,
          supplier_meta: supplierMeta,
          supplier: body.supplier ?? null,
        });
        if (!identity.ok) {
          return NextResponse.json({ error: identity.error, code: identity.code }, { status: identity.status });
        }
        resolvedIdentity = identity;
      }

      const { data: rpcResult, error: rpcErr } = await admin.rpc('create_received_service_v2', {
        p_store_id: storeId,
        p_supplier: resolvedIdentity?.identity.name ?? body.supplier,
        p_total_amount: body.total_amount,
        p_service_type_id: body.service_type_id || null,
        p_service_type_name: body.service_type_name || 'Otro',
        // MISIÓN POLÍTICA TEMPORAL: fecha validada/estampada arriba (Habana).
        p_service_date: serviceDate,
        p_currency: body.currency || 'CUP',
        p_exchange_rate: body.exchange_rate || 1.0,
        p_payment_terms_days: body.payment_terms_days || 30,
        p_distribution_method: body.distribution_method || 'amount',
        p_reference_doc: body.reference_doc || null,
        p_observations: body.observations || null,
        p_receipt_ids: body.receipt_ids || [],
        p_created_by: userId,
        p_production_order_ids: body.production_order_ids || [],
        p_creation_key: body.creation_key || null,
      });

      if (rpcErr) {
        return mapCreateServiceRpcError(rpcErr.message);
      }

      // ADN-008 §4.3 + ADN-009 §6: identidad ya resuelta (pre-creación) →
      // el enriquecimiento por PK congela id local / maestro + snapshot.
      if (resolvedIdentity) {
        const { error: idErr } = await admin
          .from('received_services')
          .update({
            supplier_id: resolvedIdentity.identity.supplierId,
            supplier_master_party_id: resolvedIdentity.identity.masterPartyId,
            supplier_code: resolvedIdentity.identity.snapshot?.code ?? null,
            supplier_tax_id: resolvedIdentity.identity.snapshot?.tax_id ?? null,
            supplier_phone: resolvedIdentity.identity.snapshot?.phone ?? null,
            supplier_address: resolvedIdentity.identity.snapshot?.address ?? null,
          })
          .eq('id', rpcResult.service_id);
        if (idErr) {
          identityWarning = 'El servicio se creó, pero no se pudo guardar la identidad del proveedor (id/snapshot).';
          console.error('[received-services] identity update failed:', idErr.message);
        }
      }

      return NextResponse.json({
        data: {
          id: rpcResult.service_id,
          service_number: rpcResult.service_number,
          production_order_link_count: rpcResult.production_order_link_count || 0,
          duplicate: rpcResult.status === 'idempotent',
          identity_warning: identityWarning,
        },
      }, { status: 201 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** ADN-008: mapeo único de rechazos de creación/activación a respuestas accionables. */
function mapCreateServiceRpcError(msg: string) {
  if (msg.includes('ERR_FUTURE_DATED_DOCUMENT')) return NextResponse.json({ error: 'Fecha del servicio no admisible', message: msg, code: 'ERR_FUTURE_DATED_DOCUMENT' }, { status: 422 });
  if (msg.includes('ERR_BACKDATED_DOCUMENT')) return NextResponse.json({ error: 'Fecha del servicio no admisible', message: msg, code: 'ERR_BACKDATED_DOCUMENT' }, { status: 422 });
  if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (msg.includes('ERR_SUPPLIER_REQUIRED')) return NextResponse.json({ error: 'Proveedor requerido para confirmar el servicio' }, { status: 400 });
  if (msg.includes('ERR_SUPPLIER_INVALID') || msg.includes('ERR_SUPPLIER_MASTER_INVALID')) return NextResponse.json({ error: 'El proveedor seleccionado no pertenece a la tienda activa' }, { status: 400 });
  if (msg.includes('ERR_INVALID_AMOUNT')) return NextResponse.json({ error: 'total_amount debe ser > 0' }, { status: 400 });
  if (msg.includes('ERR_INVALID_EXCHANGE_RATE')) return NextResponse.json({ error: 'exchange_rate fuera de rango [0.01, 10000]' }, { status: 400 });
  if (msg.includes('ERR_INVALID_PAYMENT_TERMS')) return NextResponse.json({ error: 'payment_terms_days fuera de rango [1, 365]' }, { status: 400 });
  if (msg.includes('ERR_SERVICE_TYPE_NOT_FOUND')) return NextResponse.json({ error: 'Service type no encontrado' }, { status: 400 });
  if (msg.includes('ERR_RECEIPT_INVALID')) return NextResponse.json({ error: 'Receipt invalido (cross-store o no activo)' }, { status: 400 });
  if (msg.includes('ERR_PRODUCTION_ORDER_INVALID')) return NextResponse.json({ error: 'Orden de trabajo invalida (cross-store, anulada o cerrada)' }, { status: 400 });
  return NextResponse.json({ error: msg }, { status: 500 });
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

    // ─── ADN-008 §3.3: editar BORRADOR (campos + vínculos + identidad) ───
    // Siempre vía RPC de dominio (independiente del flag USE_V2): el RPC es
    // fail-closed (solo status='draft', sin pagos ni distribuciones) y audita
    // en service_audit_log.
    // ADN-009 (§9): CONTRATO PATCH TRI-STATE — el cuerpo se convierte en un
    // objeto p_patch que SOLO contiene las claves que el cliente envió:
    //   clave ausente        → conservar el valor anterior;
    //   clave con null / ''  → limpiar (NULL persistido);
    //   service_date: null   → restablecer al día operativo actual;
    //   clave con valor      → aplicar (validado).
    // La firma /15 con COALESCE se retiró (sin overloads ambiguos de
    // PostgREST). La identidad es un bloque atómico resuelto server-side.
    if (action === 'update-draft') {
      const DraftSchema = z.object({
        supplier: z.string().nullable().optional(),
        supplier_id: uuidLoose.nullable().optional(),
        supplier_master_party_id: uuidLoose.nullable().optional(),
        supplier_meta: z.object({
          code: z.string().nullable().optional(),
          tax_id: z.string().nullable().optional(),
          phone: z.string().nullable().optional(),
          address: z.string().nullable().optional(),
        }).nullable().optional(),
        service_type_id: uuidLoose.nullable().optional(),
        service_type_name: z.string().nullable().optional(),
        total_amount: z.union([z.number(), z.string()]).nullable().optional(),
        service_date: z.string().nullable().optional(),
        reference_doc: z.string().nullable().optional(),
        observations: z.string().nullable().optional(),
        distribution_method: z.string().nullable().optional(),
        receipt_ids: z.array(z.unknown()).nullable().optional(),
        production_order_ids: z.array(z.unknown()).nullable().optional(),
      });
      const parsedDraft = DraftSchema.safeParse(body);
      if (!parsedDraft.success) {
        return NextResponse.json({ error: 'Cuerpo de solicitud inválido', details: parsedDraft.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
      }
      const d = parsedDraft.data;
      const patch: Record<string, unknown> = {};

      // Identidad: bloque atómico (cualquier clave presente = reemplazo).
      // Resolución server-side (§6): IDs validados + snapshot desde la BD.
      if ('supplier_id' in d || 'supplier_master_party_id' in d || 'supplier_meta' in d) {
        const identity = await resolveSupplierIdentity(admin, svcRow.store_id, {
          supplier_id: d.supplier_id ?? null,
          supplier_master_party_id: d.supplier_master_party_id ?? null,
          supplier_meta: d.supplier_meta ?? null,
          supplier: d.supplier ?? null,
        });
        if (!identity.ok) {
          return NextResponse.json({ error: identity.error, code: identity.code }, { status: identity.status });
        }
        patch.supplier_id = identity.identity.supplierId;
        patch.supplier_master_party_id = identity.identity.masterPartyId;
        patch.supplier_meta = identity.identity.snapshot ?? null;
      }
      if ('supplier' in d) patch.supplier = d.supplier ?? null;
      if ('total_amount' in d && d.total_amount !== null && d.total_amount !== undefined) {
        patch.total_amount = Number(d.total_amount);
      }
      // Fecha (§9): string válida = aplicar; null/'' = RESTABLECER al día
      // operativo actual (semántica del formulario). Revalidar tope HOY (Habana).
      if ('service_date' in d) {
        if (typeof d.service_date === 'string' && d.service_date.trim()) {
          const dateCheck = checkNotFutureOperationDate(d.service_date);
          if (!dateCheck.ok) {
            return NextResponse.json({ error: 'Fecha del servicio no admisible', message: dateCheck.error, code: 'ERR_FUTURE_OPERATION_DATE' }, { status: 422 });
          }
          patch.service_date = d.service_date;
        } else {
          patch.service_date = null;
        }
      }
      if ('reference_doc' in d) patch.reference_doc = d.reference_doc ?? null;
      if ('observations' in d) patch.observations = d.observations ?? null;
      // Tipo de servicio: bloque atómico (si el cliente envía cualquiera de
      // las dos claves, se reemplaza el par completo).
      if ('service_type_id' in d || 'service_type_name' in d) {
        patch.service_type_id = d.service_type_id ?? null;
        patch.service_type_name = d.service_type_name ?? null;
      }
      if ('distribution_method' in d && d.distribution_method !== null && d.distribution_method !== undefined) {
        patch.distribution_method = d.distribution_method;
      }
      // Vínculos (§9): array = reemplazar el conjunto; null = borrar todos;
      // clave ausente = conservar. El formulario siempre envía los arrays.
      if ('receipt_ids' in d) patch.receipt_ids = d.receipt_ids ?? null;
      if ('production_order_ids' in d) patch.production_order_ids = d.production_order_ids ?? null;

      const { data: rpcResult, error: rpcErr } = await admin.rpc('update_received_service_draft', {
        p_service_id: service_id,
        p_actor_id: userId,
        p_patch: patch,
      });
      if (rpcErr) {
        const msg = rpcErr.message;
        if (msg.includes('ERR_SERVICE_NOT_FOUND')) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
        if (msg.includes('ERR_NOT_DRAFT')) return NextResponse.json({ error: 'Solo los borradores pueden editarse aquí' }, { status: 409 });
        if (msg.includes('ERR_HAS_PAYMENTS') || msg.includes('ERR_HAS_DISTRIBUTIONS')) return NextResponse.json({ error: msg }, { status: 409 });
        if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        if (msg.includes('ERR_SUPPLIER_INVALID') || msg.includes('ERR_SUPPLIER_MASTER_INVALID') || msg.includes('ERR_SUPPLIER_IDENTITY_MISMATCH')) return NextResponse.json({ error: 'El proveedor seleccionado no pertenece a la tienda activa' }, { status: 400 });
        if (msg.includes('ERR_FUTURE_DATED_DOCUMENT') || msg.includes('ERR_BACKDATED_DOCUMENT')) return NextResponse.json({ error: 'Fecha del servicio no admisible', message: msg, code: 'ERR_FUTURE_DATED_DOCUMENT' }, { status: 422 });
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: rpcResult });
    }

    // ─── ADN-008: transición de estado SIEMPRE por RPC ───
    // set_received_service_status aplica los gates de confirmación (draft→active
    // exige proveedor no vacío + importe > 0), la auditoría y el contexto
    // app.is_status_change_rpc del trigger de edición. El path legacy con
    // UPDATE directo de columnas saltaba ese gate — se retira para el cambio
    // de estado (el resto de updates de columnas legacy no cambia).
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
        if (msg.includes('ERR_SUPPLIER_REQUIRED')) return NextResponse.json({ error: 'Completa el proveedor antes de confirmar el servicio' }, { status: 400 });
        if (msg.includes('ERR_INVALID_AMOUNT')) return NextResponse.json({ error: 'El importe del servicio debe ser > 0 para confirmar' }, { status: 400 });
        // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE2/4:
        // guard de pagos vivos en cancelaciones (set_received_service_status).
        if (msg.includes('ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS')) {
          return NextResponse.json({ error: msg, code: 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS' }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: rpcResult });
    }

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
          // CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 §FASE2/4:
          // guard de pagos vivos — 409 accionable con el mensaje estructurado
          // del RPC (pagos_vivos=… importe_vivo=… total_documento=… saldo_actual=…).
          if (msg.includes('ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS')) {
            return NextResponse.json({ error: msg, code: 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS' }, { status: 409 });
          }
          return NextResponse.json({ error: msg }, { status: 500 });
        }
        return NextResponse.json({ success: true, data: rpcResult });
      }

      return NextResponse.json({ error: 'PATCH requiere action=void, action=update-draft o status=...' }, { status: 400 });
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

// ─── ADN-010: ELIMINAR BORRADOR (fail-closed + trazabilidad en la BD) ───────
// Misión integral 2026-11-22 §2.4: los borradores debían poder removerse.
// SIEMPRE vía RPC delete_received_service_draft: revalida en BD que el actor
// puede gestionar la tienda REAL del documento (can_manage_store_as), que el
// estado es 'draft' y que no hay dependencias incompatibles (pagos,
// distribuciones, asientos). Audita el borrado en audit_logs ANTES de
// eliminar (trazabilidad que sobrevive a la operación).
async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // service_id desde query (?service_id=) o cuerpo JSON {service_id, reason}.
    let serviceId = req.nextUrl.searchParams.get('service_id') || '';
    let reason: string | null = null;
    if (!serviceId) {
      const body = await req.json().catch(() => null);
      const candidate = body && typeof body === 'object' ? (body as { service_id?: unknown }).service_id : undefined;
      if (typeof candidate === 'string') {
        serviceId = candidate;
        const rawReason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : undefined;
        if (typeof rawReason === 'string' && rawReason.trim()) reason = rawReason.trim().slice(0, 500);
      }
    }
    if (!uuidLoose.safeParse(serviceId).success) {
      return NextResponse.json({ error: 'service_id (uuid) es requerido' }, { status: 400 });
    }
    const userId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null;

    // FIX F3-P0-02 (mismo patrón del PATCH): resolver la tienda REAL server-side
    // y validar gestión ANTES de invocar el RPC privilegiado.
    const { data: svcRow, error: svcErr } = await admin
      .from('received_services')
      .select('id,store_id,status')
      .eq('id', serviceId)
      .single();
    if (svcErr || !svcRow?.store_id) {
      return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
    }
    if (!canManageStore(session.user, svcRow.store_id)) return forbidden();

    const { data: rpcResult, error: rpcErr } = await admin.rpc('delete_received_service_draft', {
      p_service_id: serviceId,
      p_user_id: userId,
      p_reason: reason,
    });
    if (rpcErr) {
      const msg = rpcErr.message;
      if (msg.includes('ERR_SERVICE_NOT_FOUND')) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
      if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (msg.includes('ERR_NOT_DRAFT')) return NextResponse.json({ error: 'Solo los documentos en Borrador pueden eliminarse' }, { status: 409 });
      if (msg.includes('ERR_HAS_PAYMENTS')) return NextResponse.json({ error: 'El borrador tiene pagos registrados: no puede eliminarse. Cáncelalo en su lugar.' }, { status: 409 });
      if (msg.includes('ERR_HAS_DISTRIBUTIONS')) return NextResponse.json({ error: 'El borrador tiene distribuciones de costo calculadas: no puede eliminarse. Cáncelalo en su lugar.' }, { status: 409 });
      if (msg.includes('ERR_ALREADY_POSTED')) return NextResponse.json({ error: 'El documento tiene asientos contables: no puede eliminarse. Anúlalo en su lugar.' }, { status: 409 });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: rpcResult });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// * PATCH ya no confía en el cliente: resuelve service→store_id y aplica
// * canManageStore antes de cualquier operación privilegiada.
export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, { rateLimitKey: 'received-services:post', maxRequests: 10 }));
export const PATCH = withAuth(patchHandler);
// ADN-010: borrado de borradores con rate-limit (operación destructiva).
export const DELETE = withAuth(withSecurity(deleteHandler, { rateLimitKey: 'received-services:delete', maxRequests: 10 }));
