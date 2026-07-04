import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { createStoreSchema, updateStoreSchema, deleteStoreSchema } from '@/validation/api-schemas';
import { PLAN_STORE_LIMITS } from '@/config/app';
import { checkStoreQuota, rateLimitHeaders, type Plan } from '@/lib/rate-limit/tenant-limiter'; // B1
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 30 store list requests per minute (read-heavy, moderate limit)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:get:${session.user.id}:${clientIp}`;
    const { allowed, remaining, resetAt } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

    // FIX-AUDIT-SEC (#5): usar getSupabaseAdminSafe() en vez de createClient inline
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    // Same column list used in useStores hook for consistency
    // FIX-FC-PERSIST: Include store_cost_templates relation so the UI can show FC status
    // FIX-FC-PERSIST-V2: Also include id, store_id from store_cost_templates —
    //   normalizeCostTemplate needs these fields; without them they default to ''
    //   which breaks template lookups and deactivation detection.
    const storeColumns = 'id, name, address, logo_url, reeup, nit, bank_account, signature_url, stamp_url, latitude, longitude, phone, email, is_active, slug, plantilla, created_at, store_cost_templates(id, store_id, template_id, modalidad, pdf_format, is_active)';

    let stores;
    if (session.user.role === 'admin') {
      // Admin sees all active, non-archived stores
      // FIX-AUDIT-3: Filter is_archived=false — without this, archived stores with
      // is_active=true (e.g. archived via /api/stores/[id]/archive which sets both
      // is_active=false AND is_archived=true, but legacy data may only have is_active)
      // would still appear in the dashboard.
      const { data, error } = await admin
        .from('stores')
        .select(storeColumns)
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('name');
      if (error) return NextResponse.json(createApiError('STORE_FETCH_FAILED', error.message), { status: 500 });
      stores = data;
    } else {
      // Non-admin sees stores where they have active membership
      const memberships = session.user.memberships || [];
      const storeIds = memberships
        .filter((m) => m.status === 'active' && m.store_id)
        .map((m) => m.store_id as string);

      if (storeIds.length === 0) {
        return NextResponse.json({ data: [] });
      }

      const { data, error } = await admin
        .from('stores')
        .select(storeColumns)
        .in('id', storeIds)
        .eq('is_active', true)
        .eq('is_archived', false)
        .order('name');
      if (error) return NextResponse.json(createApiError('STORE_FETCH_FAILED', error.message), { status: 500 });
      stores = data;
    }

    const response = NextResponse.json({ data: stores });
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 5 store creations per minute (infrequent operation)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:post:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 5 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // FIX-AUDIT-12: CSRF validation on store creation
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }
    const body = await req.json();
    const validated = createStoreSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    // FIX-AUDIT-SEC (#5): usar getSupabaseAdminSafe() en vez de createClient inline
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    // Enforce max stores limit — plan limit is also enforced inside the RPC
    // for atomicity, but we need the profile plan to pass the limit parameter.
    // FIX-QC-2: No hardcoded 'basico' fallback — if profile has no plan, reject the request.
    const profileResult = await admin.from('profiles').select('plan').eq('id', session.user.id).single();
    const profile = profileResult.data as { plan: string } | null;
    if (!profile?.plan) {
      return NextResponse.json(createApiError('STORE_PLAN_REQUIRED'), { status: 400 });
    }
    const maxStores = PLAN_STORE_LIMITS[profile.plan] ?? 1;

    // B1: Verificar cuota de tiendas usando tenant-limiter antes de crear.
    // Esto da una respuesta 403 clara con headers X-RateLimit-* antes de llamar al RPC.
    const quotaResult = await checkStoreQuota(session.user.id, profile.plan as Plan);
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { ...createApiError('STORE_LIMIT_REACHED'), message: quotaResult.reason },
        { status: 403, headers: rateLimitHeaders(quotaResult) }
      );
    }

    // P2-TRANSACTION: Atomic store creation with auto-membership via RPC.
    // BUG-FIX: Si el RPC falla por cualquier razón, hacer inserción directa
    // como fallback. El error del RPC se captura y se devuelve al cliente.
    const { data: rpcData, error: rpcError } = await admin
      .rpc('create_store_with_membership', {
        p_name: validated.data.name,
        p_address: validated.data.address ?? '',
        p_created_by: session.user.id,
        p_plan: profile.plan,
        p_max_stores: maxStores,
        p_additional_data: {
          logo_url: validated.data.logo_url,
          reeup: validated.data.reeup,
          nit: validated.data.nit,
          bank_account: validated.data.bank_account,
          phone: validated.data.phone,
          email: validated.data.email,
          slug: validated.data.slug,
          plantilla: validated.data.plantilla,
          signature_url: validated.data.signature_url,
          stamp_url: validated.data.stamp_url,
          latitude: validated.data.latitude,
          longitude: validated.data.longitude,
        },
      });

    if (rpcError) {
      // Handle plan limit exception from the RPC function
      const errMsg = rpcError.message || 'Error desconocido en RPC';
      const isPlanLimit = errMsg.includes('límite') || errMsg.includes('limit');

      if (isPlanLimit) {
        return NextResponse.json(
          { ...createApiError('STORE_LIMIT_REACHED'), message: errMsg, details: errMsg },
          { status: 403 }
        );
      }

      // FIX: Detectar error de clave duplicada (PostgreSQL 23505) y mostrar mensaje claro
      const isDuplicateKey = errMsg.includes('23505') || errMsg.includes('duplicate key') || errMsg.includes('ya existe') || errMsg.includes('unique');
      if (isDuplicateKey) {
        // Determinar qué campo es el duplicado
        let detail = 'Ya existe una tienda con ese ';
        if (errMsg.includes('slug') || errMsg.includes('stores_slug')) {
          detail += 'slug (identificador URL). Prueba con un nombre diferente.';
        } else if (errMsg.includes('reeup') || errMsg.includes('stores_reeup')) {
          detail += 'REEUP. Verifica que no haya otra tienda con el mismo REEUP.';
        } else if (errMsg.includes('nit') || errMsg.includes('stores_nit')) {
          detail += 'NIT. Verifica que no haya otra tienda con el mismo NIT.';
        } else if (errMsg.includes('name') || errMsg.includes('stores_name')) {
          detail += 'nombre. Ya existe una tienda activa con ese nombre exacto.';
        } else {
          detail += 'identificador. Revisa que el nombre, slug, REEUP y NIT sean únicos.';
        }
        return NextResponse.json(
          { error: 'Clave duplicada', message: detail, details: errMsg },
          { status: 409 }
        );
      }

      // Para cualquier otro error del RPC, mostrar el mensaje completo
      return NextResponse.json(
        { error: 'Error al crear tienda', message: errMsg, details: errMsg },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: rpcData }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 10 store updates per minute
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:patch:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // FIX-AUDIT-12: CSRF validation on store update
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }
    const body = await req.json();
    const validated = updateStoreSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { storeId, ...updates } = validated.data;

    // Validate store membership — FIX-AUDIT-SEC (#4): usar canManageStore() (DRY)
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });
    }

    // FIX-AUDIT-SEC (#5): usar getSupabaseAdminSafe() en vez de createClient inline
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    const { data, error } = await admin
      .from('stores')
      .update(updates)
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(createApiError('STORE_UPDATE_FAILED', error.message), { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    // Rate limit: 3 store deletions per minute (very sensitive operation)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:delete:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 3 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // FIX-AUDIT-12: CSRF validation on store deletion
    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }
    const body = await req.json();
    const validated = deleteStoreSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { storeId } = validated.data;

    // FIX-SEC-DELETE-1 + FIX-AUDIT-SEC (#4): usar canManageStore() (DRY)
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json(
        createApiError('STORE_ACCESS_DENIED'),
        { status: 403 }
      );
    }

    // FIX-AUDIT-SEC (#5): usar getSupabaseAdminSafe() en vez de createClient inline
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    // Verify the store actually exists before soft-deleting
    const { data: storeData, error: storeLookupError } = await admin
      .from('stores')
      .select('id, is_active')
      .eq('id', storeId)
      .single();

    if (storeLookupError || !storeData) {
      return NextResponse.json(createApiError('STORE_NOT_FOUND'), { status: 404 });
    }

    if (!storeData.is_active) {
      return NextResponse.json(createApiError('STORE_ALREADY_INACTIVE'), { status: 400 });
    }

    // FIX-DI-1: Atomic soft-delete via RPC — wraps store deactivation,
    // membership revocation, and profile cleanup in a single transaction
    // to prevent the window where store is inactive but memberships remain active.
    const { error } = await admin.rpc('soft_delete_store', {
      p_store_id: storeId,
      p_deleted_by: session.user.id,
    });

    if (error) {
      return NextResponse.json(createApiError('STORE_DELETE_FAILED', error.message), { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const GET = withTracing(withAuth(getHandler) as Parameters<typeof withTracing>[0], 'GET /api/stores');
// FIX-SEC-1: Use 'admin' as minimum role for store creation.
// withRole('manager') would allow encargado users (mapped via hierarchy in hasRole)
// to create stores, which is a privilege escalation vector.
export const POST = withTracing(withRole('admin', postHandler as Parameters<typeof withRole>[1]), 'POST /api/stores');
export const PATCH = withTracing(withRole('encargado', patchHandler as Parameters<typeof withRole>[1]), 'PATCH /api/stores');
export const DELETE = withTracing(withRole('admin', deleteHandler as Parameters<typeof withRole>[1]), 'DELETE /api/stores');
