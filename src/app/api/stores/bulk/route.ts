import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { checkTenantRateLimit, rateLimitHeaders, type Plan } from '@/lib/rate-limit/tenant-limiter'; // B1

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

    // B1: Tenant-aware rate limiting con plan del usuario.
    // Fallback a 'free' si no tenemos plan (el rateLimit genérico ya aplicó arriba).
    const plan = (session.user as any).plan || 'free';
    const tenantRl = await checkTenantRateLimit(session.user.id, plan as Plan, clientIp);
    if (!tenantRl.allowed) {
      return NextResponse.json(
        createApiError('RATE_LIMITED'),
        { status: 429, headers: rateLimitHeaders(tenantRl) }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    logger.info('DATABASE', 'STORE_BULK_ACTION', {
      action, count: storeIds.length, userId: session.user.id,
    });

    if (action === 'activate' || action === 'deactivate') {
      const isActive = action === 'activate';
      // FIX-DEUDA: capturar el count real de filas afectadas (no inflar con storeIds.length).
      // Antes retornábamos affected: storeIds.length sin verificar — si algún storeId
      // no existía o RLS bloqueaba, el conteo se inflaba. Ahora usamos Promise.allSettled
      // por tienda para contar solo las que realmente se actualizaron.
      const results = await Promise.allSettled(
        storeIds.map(async (storeId) => {
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
        action,
      });
    }

    if (action === 'delete') {
      const results = await Promise.allSettled(
        storeIds.map(async (storeId) => {
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
        success: true, affected: succeeded.length, failed: failed.length, action,
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
