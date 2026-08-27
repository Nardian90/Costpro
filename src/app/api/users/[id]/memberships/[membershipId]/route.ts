/**
 * PATCH /api/users/[id]/memberships/[membershipId] — Update a single membership
 * DELETE /api/users/[id]/memberships/[membershipId] — Revoke a membership
 *
 * Iteración 12: Endpoints para gestión individual de memberships.
 * Iteración v2.21.7: Fix folder typo (embershipId] → [membershipId]).
 *
 * FIX F3-P1-04 (GATE-REVIEW-619ccb64 · H2, ratificado por el dueño):
 *  1) CRASH context.params (misma clase que P1-02): el wrapper withAuth solo
 *     entrega (req, session); el contexto real de Next 16 ahora se captura en
 *     la export y se inyecta por cláusura. Los mocks antiguos que entregan el
 *     contexto como 3er argumento siguen soportados como fallback.
 *  2) Cadena de autorización COMPLETA antes de la operación privilegiada:
 *        identidad server-side (withAuth)
 *          ↓ resolución server-side de la membership por PK
 *          ↓ verificación membership.user_id === [id] de la URL (404 si no)
 *          ↓ determinación del store DESDE LA FILA RESUELTA EN BD
 *            (el cliente no decide la tienda; se ignora cualquier store_id)
 *          ↓ canManageStore(session.user, store_resuelto) → 403 si no
 *          ↓ RPC privilegiada managed_update/revoke_membership
 *     Capa DB adicional (defensa en profundidad): update exige rol de tienda
 *     admin/manager; revoke exige admin de tienda (has_store_role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';

const updateMembershipSchema = z.object({
  role: z.enum(['admin', 'manager', 'encargado', 'clerk', 'warehouse', 'usuario', 'costo']).optional(),
  status: z.enum(['active', 'inactive', 'revoked']).optional(),
});

type RouteContext = { params: Promise<{ id: string; membershipId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePrivilegedContext(
  session: AuthenticatedSession,
  routeContext: RouteContext,
  membershipId: string
): Promise<{ ok: true; resolved: { id: string; store_id: string; user_id: string; status: string } } | { ok: false; res: NextResponse }> {
  const params = await routeContext.params;
  if (!membershipId || !UUID_RE.test(membershipId)) {
    return { ok: false, res: NextResponse.json({ error: 'Invalid membershipId' }, { status: 400 }) };
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return { ok: false, res: NextResponse.json({ error: 'Server config error' }, { status: 500 }) };

  // F3-P1-04: resolución SERVER-SIDE de la membership objetivo.
  // El identificador llegue o no del cliente, la tienda válida es SOLO la que
  // contiene esta fila; ningún dato del cliente puede sustituirla.
  const { data: membRow, error } = await admin
    .from('user_store_memberships')
    .select('id,user_id,store_id,status')
    .eq('id', membershipId)
    .single();

  if (error || !membRow) {
    return { ok: false, res: NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 }) };
  }

  // La URL declara a qué usuario pertenece esta ruta; si no coincide con la
  // fila real es un cruce de entidades ⇒ 404 (sin revelar existencia ajena).
  if (params.id && membRow.user_id !== params.id) {
    return { ok: false, res: NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 }) };
  }

  // Gate JS con el modelo canónico: gestión activa sobre ESA tienda.
  // Revoked/none/rol-global-sin-membresía quedan fuera aquí mismo.
  if (!canManageStore(session.user, membRow.store_id)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'No autorizado para gestionar esta tienda' }, { status: 403 }),
    };
  }

  return { ok: true, resolved: membRow as never };
}

async function patchHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  routeContext?: RouteContext
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!routeContext) {
    return NextResponse.json({ error: 'Route context missing' }, { status: 500 });
  }

  const { allowed } = await rateLimit(`membership-update:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const ctxParams = await routeContext.params;
  const gate = await resolvePrivilegedContext(session, routeContext, ctxParams.membershipId);
  if (!gate.ok) return gate.res;
  void gate.resolved; // ya autorizado; el store lo re-resuelve la RPC atómicamente

  const body = await req.json();
  const parsed = updateMembershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await admin.rpc('managed_update_membership', {
    p_membership_id: ctxParams.membershipId,
    p_role: parsed.data.role ?? null,
    p_status: parsed.data.status ?? null,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_NOT_FOUND') || msg.includes('ERR_MEMBERSHIP_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

async function deleteHandler(
  req: NextRequest,
  session: AuthenticatedSession,
  routeContext?: RouteContext
) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!routeContext) {
    return NextResponse.json({ error: 'Route context missing' }, { status: 500 });
  }

  const { allowed } = await rateLimit(`membership-revoke:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const ctxParams = await routeContext.params;
  const gate = await resolvePrivilegedContext(session, routeContext, ctxParams.membershipId);
  if (!gate.ok) return gate.res;

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Nota de modelado: el DELETE exige a nivel BD rol de TIENDA 'admin'
  // (más estricto que PATCH). El gate JS usa canManageStore para denegar
  // temprano revoked/none/cross-store; la capa SQL mantiene su regla más estricta.
  const { data, error } = await admin.rpc('managed_revoke_membership', {
    p_membership_id: ctxParams.membershipId,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_NOT_FOUND')) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

// ── FIX F3-P1-04 · captura del contexto real de Next 16 ─────────────────────
// El wrapper withAuth propaga SOLO (req, session). Antes, el handler recibía
// context=undefined y "await context.params" reventaba (500). Ahora la export
// captura el contexto real ANTES del wrapper; mocks que pasen contexto como
// tercer argumento se respetan como fallback (contrato legacy de tests).
function wrapWithRouteContext(
  handler: (req: NextRequest, session: AuthenticatedSession, ctx?: RouteContext) => Promise<Response>
) {
  return async function postRoute(req: NextRequest, routeContext?: RouteContext): Promise<Response> {
    const wrapped = withAuth(((rq: NextRequest, session: AuthenticatedSession, ctxFromCaller?: RouteContext) =>
      handler(rq, session, routeContext ?? ctxFromCaller)) as Parameters<typeof withAuth>[0]);
    return wrapped(req);
  };
}

export const PATCH = withTracing(
  wrapWithRouteContext(patchHandler) as Parameters<typeof withTracing>[0],
  'PATCH /api/users/[id]/memberships/[membershipId]'
);

export const DELETE = withTracing(
  wrapWithRouteContext(deleteHandler) as Parameters<typeof withTracing>[0],
  'DELETE /api/users/[id]/memberships/[membershipId]'
);
