import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * F4-T02: Endpoint bulk para asignar un usuario a múltiples tiendas.
 *
 * FIX-DEUDA: usa el RPC `bulk_assign_memberships` (transaccional atómico).
 * Cada asignación hace upsert (ON CONFLICT). Si una asignación falla por FK
 * violation, se cuenta como failed pero la transacción continúa.
 *
 * FIX v2.17.0 (bug de asignación masiva — ERR_UNAUTHORIZED crónico):
 *   La RPC exige un actor real (auth.uid() IS NOT NULL) para autorizar por
 *   tienda y escribir el audit log. Invocarla con el cliente service_role
 *   plano dejaba auth.uid() = NULL → fallaba el 100% de las veces.
 *   La RPC resuelve ahora el actor con la doctrina create_sale_v2
 *   (20261004130000 §3.1): bajo service_role llega EXPLÍCITO por p_actor_id,
 *   derivado aquí de la SESIÓN VERIFICADA — nunca del body del cliente
 *   (H0-R §4/§10, mismo patrón que p_seller_id en el checkout). La RPC
 *   re-valida igualmente los roles del actor en cada tienda objetivo
 *   (has_store_role_as), por lo que el actor explícito no amplía privilegios.
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

    // Cliente admin centralizado (factory única — doctrina lib/supabase-admin)
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    // FIX v2.17.0: invocar RPC transaccional con el actor de la sesión
    // verificada (la RPC re-valida sus roles por tienda — defensa en profundidad)
    const { data: rpcResult, error: rpcError } = await admin.rpc('bulk_assign_memberships', {
      p_user_id: userId,
      p_assignments: validated.data.assignments,
      p_actor_id: session.user.id,
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
