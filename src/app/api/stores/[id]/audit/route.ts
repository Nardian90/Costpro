import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { canManageStore } from '@/lib/roles';

/**
 * F6-T03: Endpoint para obtener logs de auditoría de una tienda específica.
 * GET /api/stores/[id]/audit?page=1&limit=20&action=CREATE&userId=xxx
 *
 * FIX-AUDIT-SEC (#2): antes usaba el singleton anónimo (sin JWT del usuario),
 * lo que hacía que RLS bloqueara silenciosamente todos los logs. Ahora usa
 * getSupabaseAdminSafe() que bypassa RLS, y valida membership con
 * canManageStore() antes de la query.
 *
 * FIX-AUDIT-SEC (#6): añadido rate limiting como el resto de endpoints.
 */

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

async function auditHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await context.params;

    // FIX-AUDIT-SEC (#6): rate limiting como el resto de endpoints
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `stores:audit:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 30 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    // FIX-AUDIT-SEC (#2): validar membership antes de la query
    if (!canManageStore(session.user, storeId)) {
      return NextResponse.json({ error: 'Forbidden — sin acceso a esta tienda' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const validated = querySchema.safeParse({
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
      action: searchParams.get('action') || undefined,
      userId: searchParams.get('userId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    const { page, limit, action, userId, from, to } = validated.data;
    const offset = (page - 1) * limit;

    // FIX-AUDIT-SEC (#2): usar admin client (service-role) en vez del singleton anon.
    // canManageStore() ya validó membership, así que es seguro bypassar RLS aquí.
    const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
    const supabase = getSupabaseAdminSafe();
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: logs, count, error } = await query;

    if (error) {
      // FIX-IDEMPOTENCY-LEAK (2026-07-13): no pasar error.message como details
      // al cliente — logger.error ya lo captura server-side con contexto.
      logger.error('AUDIT', 'STORE_AUDIT_QUERY_FAILED', { storeId, error });
      return NextResponse.json(createApiError('AUDIT_QUERY_FAILED'), { status: 500 });
    }

    return NextResponse.json({
      data: logs || [],
      pagination: {
        page, limit, total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
      storeId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

export const GET = withTracing(
  withRole('encargado', auditHandler as Parameters<typeof withRole>[1]) as Parameters<typeof withTracing>[0],
  'GET /api/stores/[id]/audit'
);
