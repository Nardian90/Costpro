/**
 * POST /api/users/[id]/assign-organization — Asignar la empresa de un usuario.
 *
 * MISIÓN ORGANIZACIONES (2026-10-26), FASE 2 §3.
 *
 * Ejecuta la RPC atómica `assign_user_organization` (misma transacción para
 * mover empresa + retirar membresías de la empresa anterior + auditoría).
 *
 * Autorización:
 *   · SuperAdmin: cualquier usuario → cualquier organización (o sin asignar).
 *   · admin ordinario: solo usuarios de SU empresa → SU empresa.
 *   · Nunca sobre cuentas superadmin (rol de plataforma, sin empresa).
 *
 * Confirmación de consecuencias (misión FASE 2 §2): si la reasignación
 * retirará membresías de tiendas de otra empresa, la primera llamada SIN
 * confirmación devuelve 200 + requires_confirmation con el detalle REAL
 * (tiendas afectadas); el operador confirma y la segunda llamada aplica.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';

const assignOrganizationSchema = z.object({
  organization_id: uuidLoose.nullable(),
  confirm_removals: z.boolean().default(false),
});

function extractUserId(req: NextRequest): string | null {
  const pathParts = req.nextUrl.pathname.split('/').filter(Boolean);
  // /api/users/[id]/assign-organization → el id está en la posición -2
  const id = pathParts[pathParts.length - 2];
  return uuidLoose.safeParse(id).success ? id : null;
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`users:assign-org:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const userId = extractUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Identificador de usuario inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assignOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.format() },
      { status: 400 }
    );
  }
  const { organization_id, confirm_removals } = parsed.data;

  // Vista previa REAL de las consecuencias para el operador: qué tiendas de
  // otra empresa perdería el usuario. Se calcula con los mismos criterios
  // que la RPC (tiendas con tenant distinto del destino).
  const { data: foreignMemberships } = await admin
    .from('user_store_memberships')
    .select('store_id, role, store:stores(id, name)')
    .eq('user_id', userId)
    .eq('status', 'active');

  const preview: Array<{ store_id: string; store_name: string; role: string }> = [];
  const activeMemberships = (foreignMemberships || []) as Array<{
    store_id: string;
    role: string;
    store: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;

  if (activeMemberships.length > 0) {
    const storeIds = activeMemberships.map(m => m.store_id);
    const { data: storeRows } = await admin
      .from('stores')
      .select('id, name, tenant_id')
      .in('id', storeIds);
    const storeByTenant = new Map(
      ((storeRows || []) as Array<{ id: string; name: string; tenant_id: string | null }>).map(s => [s.id, s])
    );
    for (const m of activeMemberships) {
      const store = Array.isArray(m.store) ? m.store[0] : m.store;
      const storeRow = storeByTenant.get(m.store_id);
      // Tiendas con tenant asignado distinto del destino se retirarán.
      if (store && storeRow?.tenant_id && storeRow.tenant_id !== organization_id) {
        preview.push({ store_id: store.id, store_name: store.name, role: m.role });
      }
    }
  }

  // La RPC valida todo de nuevo server-side (actor, objetivo, org activa,
  // no-superadmin) y ejecuta atómicamente. El cliente no es autorización.
  const { data: rpcResult, error: rpcError } = await admin.rpc('assign_user_organization', {
    p_actor_id: session.user.id,
    p_user_id: userId,
    p_tenant_id: organization_id,
    p_confirm_removals: confirm_removals,
  });

  if (rpcError) {
    logger.error('DATABASE', 'ASSIGN_ORGANIZATION_RPC_FAILED', {
      error: rpcError.message,
      userId: session.user.id,
    });
    // Sanitización: el mensaje interno del proveedor NO viaja al cliente.
    return NextResponse.json(
      { error: 'No se pudo asignar la organización' },
      { status: 500 }
    );
  }

  const result = (rpcResult as Array<{ applied: boolean; requires_confirmation: boolean; removed_memberships: number; reason: string | null }>)?.[0];

  if (!result) {
    return NextResponse.json({ error: 'Respuesta inesperada de la asignación' }, { status: 500 });
  }

  if (!result.applied) {
    if (result.requires_confirmation) {
      // No es un error: el operador debe ver y confirmar las consecuencias.
      return NextResponse.json({
        success: false,
        requires_confirmation: true,
        reason: result.reason,
        memberships_to_remove: preview,
        removed_memberships: result.removed_memberships,
      });
    }
    // Rechazo de regla de negocio (actor sin permiso, org inactiva, etc.)
    return NextResponse.json({ success: false, error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    applied: true,
    removed_memberships: result.removed_memberships,
  });
}

export const POST = withTracing(
  withRole(
    'admin',
    async (req: NextRequest, session: AuthenticatedSession) => {
      const csrfOk = await validateOrigin(req);
      if (!csrfOk) {
        return NextResponse.json({ error: 'Origen no permitido (CSRF)' }, { status: 403 });
      }
      return postHandler(req, session);
    }
  ) as Parameters<typeof withTracing>[0],
  'POST /api/users/[id]/assign-organization'
);
