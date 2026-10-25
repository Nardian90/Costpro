/**
 * POST /api/stores/bootstrap — CP-ORG-003 Fase 2: bootstrap seguro de la
 * primera tienda del propio tenant (rol tenant_admin).
 *
 * Expediente CP-ORG-003 (D4): el trigger de signup crea tenant + perfil
 * tenant_admin SIN tienda ni membresía, y el RPC create_store_with_membership
 * fue diseñado (Iteración 13) exactamente para ese bootstrap — pero su único
 * caller (POST /api/stores) exige withRole('admin') → 403 para el
 * tenant_admin puro, que queda varado sin poder materializar su organización.
 *
 * Esta ruta NO es una excepción general a withRole('admin'): es una
 * autorización ESPECÍFICA de bootstrap, de operación y contexto acotados:
 *
 *   1. Identidad del creador: session.user.id, validada por withAuth (JWT).
 *   2. Rol: se relee del PROFILE en el servidor (fuente canónica) — la ruta
 *      es EXCLUSIVA para role = 'tenant_admin'. admin/superadmin conservan
 *      su vía normal (POST /api/stores); roles operativos → 403.
 *   3. tenant_id de destino: resuelto server-side del profile. El body NO
 *      acepta tenant_id ni max_stores (Zod strip) — la operación queda
 *      vinculada exclusivamente a la organización del usuario.
 *   4. Cuota: pre-check per-tenant (count explícito por tenant_id — el
 *      tenant-limiter global no es aplicable server-side) + re-verificación
 *      ATÓMICA dentro del RPC (fuente unificada free=1/pro=3/enterprise=10).
 *   5. Atomicidad: tienda + membresía admin inicial en UNA transacción RPC.
 *      Sin fallback de inserción directa — si el RPC falla, no queda estado
 *      parcial.
 *   6. La migración 20261026210000 endurece además el path authenticated del
 *      RPC (tenant del caller SIEMPRE, gate de rol interno, límite por plan
 *      del tenant) — defensa en profundidad aunque un control de API fallara.
 *
 * Membresía resultante: 'admin' de LA TIENDA creada (dentro de SU tenant) —
 * alcance operativo de tienda, no de plataforma. tenant_admin NO se equipara
 * a admin/superadmin globales.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { createStoreSchema } from '@/validation/api-schemas';
import { PLAN_STORE_LIMITS } from '@/config/app';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

async function bootstrapHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 5 bootstraps por minuto (operación infrecuente por diseño).
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:bootstrap:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 5 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // CSRF: misma política que el resto de mutaciones de stores.
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = createStoreSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    // ── Autorización específica de bootstrap (server-side, fuente canónica) ──
    // El rol y el tenant se releen del PROFILE: la sesión enriquecida no
    // amplía esta puerta (defensa: incluso si session.user.role se corrompiera,
    // manda profiles.role).
    const profileResult = await admin
      .from('profiles')
      .select('plan, tenant_id, role')
      .eq('id', session.user.id)
      .single();
    const profile = profileResult.data as
      | { plan: string; tenant_id?: string | null; role?: string | null }
      | null;

    if (!profile) {
      return NextResponse.json(
        { error: 'Perfil no encontrado', message: 'No existe perfil para la sesión actual.' },
        { status: 403 },
      );
    }

    if (profile.role !== 'tenant_admin') {
      // Ruta EXCLUSIVA del bootstrap: admin/superadmin usan POST /api/stores;
      // roles operativos no crean tiendas.
      return NextResponse.json(
        {
          error: 'BOOTSTRAP_ONLY_TENANT_ADMIN',
          message: 'Este endpoint es exclusivo del bootstrap de la primera tienda del tenant_admin.',
        },
        { status: 403 },
      );
    }

    if (!profile.tenant_id) {
      return NextResponse.json(
        {
          error: 'TENANT_REQUIRED',
          message: 'El perfil no pertenece a ninguna organización. Solicita la asignación a tu administrador de plataforma.',
        },
        { status: 409 },
      );
    }

    if (!profile.plan) {
      // FIX-QC-2 (paridad con POST /api/stores): sin fallback 'basico'.
      return NextResponse.json(createApiError('STORE_PLAN_REQUIRED'), { status: 400 });
    }

    const tenantId = profile.tenant_id; // resuelto server-side — nunca del body
    const maxStores = PLAN_STORE_LIMITS[profile.plan] ?? 1;

    // ── Pre-check de cuota PER-TENANT (explícito, con admin client) ──
    // El tenant-limiter (checkStoreQuota) cuenta con un cliente sin sesión y
    // sin filtro de tenant — inapropiado server-side. El conteo autoritativo
    // y atómico vive DENTRO del RPC; este pre-check da un 403 claro con
    // headers antes de abrir la transacción.
    const { count: tenantActiveStores, error: countError } = await admin
      .from('stores')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (countError) {
      logger.error('DATABASE', 'BOOTSTRAP_QUOTA_CHECK_FAILED', { userId: session.user.id, tenantId, error: countError });
      return NextResponse.json(createApiError('STORE_FETCH_FAILED'), { status: 500 });
    }

    const currentStores = tenantActiveStores ?? 0;
    if (currentStores >= maxStores) {
      return NextResponse.json(
        {
          ...createApiError('STORE_LIMIT_REACHED'),
          message: `Tu organización ya tiene ${currentStores} tienda(s) activa(s); el plan ${profile.plan} permite ${maxStores}.`,
        },
        {
          status: 403,
          headers: {
            'X-RateLimit-Limit': String(maxStores),
            'X-RateLimit-Remaining': String(Math.max(0, maxStores - currentStores)),
          },
        },
      );
    }

    // ── Creación atómica vía RPC (migración 20261026210000) ──
    // p_tenant_id/p_created_by/p_max_stores resueltos server-side; el path
    // service_role del RPC conserva la semántica de Iteración 13.
    const { data: rpcData, error: rpcError } = await admin
      .rpc('create_store_with_membership', {
        p_name: validated.data.name,
        p_address: validated.data.address ?? '',
        p_created_by: session.user.id,
        p_max_stores: maxStores,
        p_logo_url: validated.data.logo_url ?? null,
        p_reeup: validated.data.reeup ?? null,
        p_nit: validated.data.nit ?? null,
        p_bank_account: validated.data.bank_account ?? null,
        p_phone: validated.data.phone ?? null,
        p_email: validated.data.email ?? null,
        p_slug: validated.data.slug ?? null,
        p_plantilla: validated.data.plantilla ?? 'construccion',
        p_signature_url: validated.data.signature_url ?? null,
        p_stamp_url: validated.data.stamp_url ?? null,
        p_latitude: validated.data.latitude ?? null,
        p_longitude: validated.data.longitude ?? null,
        p_tenant_id: tenantId,
      });

    if (rpcError) {
      const errMsg = rpcError.message || 'Error desconocido en RPC';
      logger.error('DATABASE', 'BOOTSTRAP_STORE_RPC_FAILED', { userId: session.user.id, tenantId, error: rpcError });

      if (errMsg.includes('ERR_STORE_LIMIT_REACHED') || errMsg.includes('límite') || errMsg.includes('limit')) {
        return NextResponse.json(
          { ...createApiError('STORE_LIMIT_REACHED'), message: errMsg, details: errMsg },
          { status: 403 },
        );
      }

      const isDuplicateKey = errMsg.includes('23505') || errMsg.includes('duplicate key')
        || errMsg.includes('ya existe') || errMsg.includes('unique');
      if (isDuplicateKey) {
        return NextResponse.json(
          { error: 'Clave duplicada', message: 'Ya existe una tienda con ese nombre, slug, REEUP o NIT. Prueba con valores diferentes.', details: errMsg },
          { status: 409 },
        );
      }

      // Sin fuga de mensajes internos para errores no clasificados.
      return NextResponse.json(
        { error: 'Error al crear la tienda', message: 'No se pudo crear la tienda. Intenta de nuevo.' },
        { status: 500 },
      );
    }

    logger.info('DATABASE', 'BOOTSTRAP_STORE_CREATED', {
      userId: session.user.id,
      tenantId,
      storeId: (rpcData as { store_id?: string } | null)?.store_id ?? null,
    });

    return NextResponse.json({ data: rpcData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json(
      { ...createApiError('UNKNOWN_ERROR'), error: message },
      { status: 500 },
    );
  }
}

export const POST = withTracing(
  withAuth(bootstrapHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bootstrap',
);
