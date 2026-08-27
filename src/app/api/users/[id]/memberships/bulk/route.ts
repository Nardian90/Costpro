import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * F4-T02: Endpoint bulk para asignar un usuario a múltiples tiendas.
 *
 * FIX-DEUDA: ahora usa el RPC `bulk_assign_memberships` (transaccional atómico)
 * en vez de Promise.allSettled. Cada asignación hace upsert (ON CONFLICT).
 * Si una asignación falla por FK violation, se cuenta como failed pero la
 * transacción continúa — no rollback total, pero consistente.
 *
 * Rate limit: 10 bulk ops por minuto. CSRF: validateOrigin.
 */

const bulkMembershipsSchema = z.object({
  assignments: z.array(z.object({
    store_id: z.string().uuid(),
    role: z.enum(['admin', 'encargado', 'manager', 'clerk', 'warehouse', 'usuario', 'costo']),
    status: z.enum(['active', 'revoked']).optional().default('active'),
  })).min(1).max(50),
});

async function bulkMembershipsHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await context.params;

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = `memberships:bulk:${session.user.id}:${clientIp}`;
    const { allowed } = await rateLimit(rlKey, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) {
      return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });
    }

    if (!validateOrigin(req)) {
      return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
    }

    const body = await req.json();
    const validated = bulkMembershipsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), details: validated.error.format() },
        { status: 400 }
      );
    }

    // FIX F3-P1-02: autorización por tienda, no por mero rol global.
    //   admin global → puede asignar (by design, roles.ts).
    //   Cualquier otro rol global (incl. manager) → necesita membership activa
    //   con rol de gestión EN CADA tienda objetivo de los assignments.
    if (session.user.role !== 'admin') {
      const targets = validated.data.assignments.map(a => a.store_id);
      const allAuthorized = targets.every(sid => canManageStore(session.user, sid));
      if (!allAuthorized) {
        logger.warn('AUTH', 'MEMBERSHIPS_BULK_DENIED_BY_STORE', {
          userId,
          actorId: session.user.id,
          actorRole: session.user.role,
          requestedStores: targets,
          membershipsHeld: session.user.memberships?.map(m => ({ store_id: m.store_id, role: m.role })) ?? [],
        });
        return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
      }
    }

    // Usar service role para invocar el RPC transaccional
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    // FIX-DEUDA: invocar RPC transaccional en vez de Promise.allSettled
    const { data: rpcResult, error: rpcError } = await admin.rpc('bulk_assign_memberships', {
      p_user_id: userId,
      p_assignments: validated.data.assignments,
    });

    if (rpcError) {
      logger.error('DATABASE', 'MEMBERSHIPS_BULK_RPC_FAILED', {
        userId, error: rpcError.message,
      });
      return NextResponse.json(
        createApiError('MEMBERSHIP_BULK_FAILED', rpcError.message),
        { status: 500 }
      );
    }

    const affected = (rpcResult as { affected?: number })?.affected ?? 0;
    const failed = (rpcResult as { failed?: number })?.failed ?? 0;

    logger.info('DATABASE', 'MEMBERSHIPS_BULK_RPC_SUCCESS', {
      userId, requested: validated.data.assignments.length,
      affected, failed, assignedBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      affected,
      failed,
      userId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : createApiError('UNKNOWN_ERROR').error;
    return NextResponse.json({ ...createApiError('UNKNOWN_ERROR'), error: message }, { status: 500 });
  }
}

// FIX F3-P1-02 (crash runtime): el wrapper conAuth del middleware propaga
// SOLO (req, session) y descarta el contexto de ruta de Next 16. Antes, el
// handler recibía context=undefined y "await context.params" reventaba.
// Ahora la export captura el contexto real de Next cuando existe; si un mock
// de test inyecta el contexto como tercer argumento, se respeta como fallback.
type RouteContext = { params: Promise<{ id: string }> };
async function postRoute(req: NextRequest, routeContext?: RouteContext): Promise<Response> {
  // Cast deliberado: el contrato real interno soporta 3 args (req, session, ctx)
  // aunque el tipo público AuthHandler declare 2. El tercer argumento llega en
  // mocks de tests; en runtime Next lo entrega vía el segundo parámetro de
  // postRoute (routeContext), que tiene prioridad.
  const wrapped = withAuth(((rq: NextRequest, session: AuthenticatedSession, ctxFromCaller?: RouteContext) =>
    bulkMembershipsHandler(
      rq,
      session,
      routeContext ?? ctxFromCaller ?? ({ params: Promise.resolve({ id: '' }) } as RouteContext)
    )) as Parameters<typeof withAuth>[0]);
  return wrapped(req);
}
export const POST = withTracing(
  postRoute as Parameters<typeof withTracing>[0],
  'POST /api/users/[id]/memberships/bulk'
);
