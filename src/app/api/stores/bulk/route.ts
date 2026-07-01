import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { checkTenantRateLimit, rateLimitHeaders, type Plan } from '@/lib/rate-limit/tenant-limiter'; // B1
import { canManageStore } from '@/lib/roles';

/**
 * F4-T01: API route para operaciones bulk en tiendas.
 *
 * POST /api/stores/bulk
 * Body: {
 *   storeIds: string[],
 *   action: 'activate' | 'deactivate' | 'delete',
 * }
 *
 * Permite activar/desactivar/eliminar múltiples tiendas en una sola operación.
 * Rate limit: 5 bulk ops por minuto. Auth: solo admin. CSRF: validateOrigin.
 *
 * AUTORIZACIÓN (FIX-AUDIT-R5):
 *   Además del chequeo global `withRole('admin')`, se filtra cada storeId del
 *   array con `canManageStore(session.user, storeId)`. Para admin global esto
 *   es siempre true (por diseño), pero el filtro defensivo asegura que si en
 *   el futuro se relaja el rol a manager, los storeIds de tiendas sin
 *   membership se rechacen individualmente en vez de operar sobre todos.
 *   Los storeIds no autorizados se reportan en `denied` sin abortar la op.
 */

const bulkActionSchema = z.object({
  storeIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['activate', 'deactivate', 'delete']),
});

async function bulkHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:bulk:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 5 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = bulkActionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { storeIds, action } = validated.data;

    if (session.user.role !== 'admin') {
      return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
    }

    // FIX-AUDIT-R5: Filtrar storeIds por membership (defensivo, consistente con archive/restore).
    // Para admin global canManageStore siempre retorna true, pero esto protege si el rol
    // se relaja a manager en el futuro y mantiene consistencia con el resto del módulo.
    const allowedIds = storeIds.filter(id => canManageStore(session.user, id));
    const deniedIds = storeIds.filter(id => !canManageStore(session.user, id));

    if (deniedIds.length > 0) {
      logger.warn('DATABASE', 'STORE_BULK_DENIED_IDS', {
        action, deniedCount: deniedIds.length, userId: session.user.id,
      });
    }

    if (allowedIds.length === 0) {
      return NextResponse.json({
        ...createApiError('FORBIDDEN'),
        message: 'Ninguno de los storeIds pertenece a tiendas que el usuario puede gestionar',
        denied: deniedIds.length,
      }, { status: 403 });
    }

    // FIX-AUDIT-RESIDUE: 'plan' no se enriquece en auth-middleware.
    // ANTES: const plan = (session.user as any).plan || 'free' — siempre 'free',
    //        usuarios Pro quedaban throttleados como free en operaciones bulk.
    // DESPUÉS: query a profiles para obtener el plan real (mismo patrón que
    //          route.ts:123 en el handler de create store).
    const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
    const adminClient = getSupabaseAdminSafe();
    if (!adminClient) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    const { data: profileData } = await adminClient
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .single();
    const plan = (profileData as { plan?: string } | null)?.plan || 'free';

    // B1: Tenant-aware rate limiting con plan REAL del usuario.
    const tenantRl = await checkTenantRateLimit(session.user.id, plan as Plan, clientIp);
    if (!tenantRl.allowed) {
      return NextResponse.json(
        createApiError('RATE_LIMITED'),
        { status: 429, headers: rateLimitHeaders(tenantRl) }
      );
    }

    const admin = adminClient;

    logger.info('DATABASE', 'STORE_BULK_ACTION', {
      action, count: allowedIds.length, denied: deniedIds.length, userId: session.user.id,
    });

    if (action === 'activate' || action === 'deactivate') {
      const isActive = action === 'activate';
      // FIX-DEUDA: capturar el count real de filas afectadas (no inflar con storeIds.length).
      // Antes retornábamos affected: storeIds.length sin verificar — si algún storeId
      // no existía o RLS bloqueaba, el conteo se inflaba. Ahora usamos Promise.allSettled
      // por tienda para contar solo las que realmente se actualizaron.
      const results = await Promise.allSettled(
        allowedIds.map(async (storeId) => {
          const { error } = await admin
            .from('stores')
            .update({ is_active: isActive })
            .eq('id', storeId);
          if (error) throw error;
          return 1; // 1 store actualizada
        })
      );

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
        .reduce((sum, r) => sum + r.value, 0);
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        logger.warn('DATABASE', 'STORE_BULK_TOGGLE_PARTIAL', {
          action, succeeded, failed,
        });
      }

      return NextResponse.json({
        success: true,
        affected: succeeded,
        failed,
        denied: deniedIds.length,
        action,
      });
    }

    if (action === 'delete') {
      const results = await Promise.allSettled(
        allowedIds.map(async (storeId) => {
          const { error } = await admin.rpc('soft_delete_store', {
            p_store_id: storeId,
            p_deleted_by: session.user.id,
          });
          if (error) throw error;
          return storeId;
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<string>).value);
      const failed = results.filter(r => r.status === 'rejected');

      if (failed.length > 0) {
        logger.warn('DATABASE', 'STORE_BULK_DELETE_PARTIAL', {
          succeeded: succeeded.length, failed: failed.length,
        });
      }

      return NextResponse.json({
        success: true, affected: succeeded.length, failed: failed.length, denied: deniedIds.length, action,
      });
    }

    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const POST = withTracing(
  withRole('admin', bulkHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'POST /api/stores/bulk'
);
