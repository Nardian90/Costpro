/**
 * /api/organizations/[id] — Detalle, edición y eliminación de una empresa.
 *
 * MISIÓN ORGANIZACIONES (2026-10-26), FASE 1 §§4-5.
 *
 * GET    — detalle real: identidad + tiendas + usuarios + owner.
 *          SuperAdmin: cualquiera. Admin: SOLO la suya (404 si no).
 * PATCH  — editar nombre / estado. SuperAdmin: cualquiera. Admin: la suya.
 * DELETE — SOLO SuperAdmin, y SOLO si no tiene dependencias (tiendas o
 *          usuarios). Nunca cascada: si hay dependencias se devuelve 409 con
 *          el resumen real para que el operador las resuelva primero.
 *          (Las eliminaciones masivas de producción quedan delimitadas a la
 *          fase de limpieza autorizada — no a esta acción genérica.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';

const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'Máximo 200 caracteres').optional(),
  is_active: z.boolean().optional(),
});

function extractId(req: NextRequest): string | null {
  const pathParts = req.nextUrl.pathname.split('/').filter(Boolean);
  const id = pathParts[pathParts.length - 1];
  return uuidLoose.safeParse(id).success ? id : null;
}

/**
 * Resuelve el alcance: devuelve { ok, response?, tenantId? }.
 * - 404 si la organización no existe.
 * - 403/404 si un admin ordinario intenta tocar otra empresa.
 */
async function authorizeTarget(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: AuthenticatedSession,
  orgId: string
): Promise<{ ok: boolean; response?: NextResponse; isSuperAdmin: boolean }> {
  const isSuperAdmin = session.user.role === 'superadmin';

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  const { data: org } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', orgId)
    .single();

  if (!org) {
    return { ok: false, response: NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 }), isSuperAdmin };
  }

  if (!isSuperAdmin) {
    if (session.user.role !== 'admin') {
      return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }), isSuperAdmin };
    }
    if (callerProfile?.tenant_id !== orgId) {
      // Alcance de admin ordinario: su empresa. No revelar existencia ajena.
      return { ok: false, response: NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 }), isSuperAdmin };
    }
  }

  return { ok: true, isSuperAdmin };
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`organizations:get:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const orgId = extractId(req);
  if (!orgId) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 });
  }

  const authz = await authorizeTarget(admin, session, orgId);
  if (!authz.ok) return authz.response!;

  const orgRes = await admin
    .from('tenants')
    .select('id, name, owner_id, plan, subscription_status, is_active, custom_domain, created_at, updated_at')
    .eq('id', orgId)
    .single();

  if (orgRes.error || !orgRes.data) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
  }

  const [storesRes, usersRes, ownerRes] = await Promise.all([
    admin.from('stores')
      .select('id, name, slug, is_active, is_archived, created_at')
      .eq('tenant_id', orgId)
      .order('name'),
    admin.from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('tenant_id', orgId)
      .is('deleted_at', null)
      .order('full_name'),
    orgRes.data.owner_id
      ? admin.from('profiles').select('id, full_name, email').eq('id', orgRes.data.owner_id).single()
      : Promise.resolve({ data: null as { id: string; full_name: string; email: string } | null }),
  ]);

  return NextResponse.json({
    organization: {
      ...orgRes.data,
      owner_name: ownerRes.data?.full_name || null,
    },
    stores: storesRes.data || [],
    users: usersRes.data || [],
  });
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`organizations:update:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const orgId = extractId(req);
  if (!orgId) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 });
  }

  const authz = await authorizeTarget(admin, session, orgId);
  if (!authz.ok) return authz.response!;

  const body = await req.json().catch(() => null);
  const parsed = updateOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.replace(/\s+/g, ' ').trim();
    updates.name = name;
    // Duplicado exacto excluyendo la propia organización.
    const { data: dup } = await admin
      .from('tenants')
      .select('id')
      .ilike('name', name)
      .neq('id', orgId)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: 'Ya existe una organización con ese nombre' }, { status: 409 });
    }
  }
  if (parsed.data.is_active !== undefined) {
    updates.is_active = parsed.data.is_active;
  }

  const { error } = await admin.from('tenants').update(updates).eq('id', orgId);
  if (error) {
    logger.error('DATABASE', 'UPDATE_ORGANIZATION_FAILED', { error: error.message, orgId });
    return NextResponse.json({ error: 'No se pudo actualizar la organización' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function deleteHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`organizations:delete:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Eliminación de empresas: SOLO SuperAdmin.
  if (session.user.role !== 'superadmin') {
    return NextResponse.json(
      { error: 'Solo el SuperAdmin puede eliminar organizaciones' },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const orgId = extractId(req);
  if (!orgId) {
    return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 });
  }

  const { data: org } = await admin.from('tenants')
    .select('id, name')
    .eq('id', orgId)
    .single();
  if (!org) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });
  }

  // Resumen REAL de dependencias: la eliminación genérica queda BLOQUEADA si
  // la empresa tiene tiendas o usuarios (misión FASE 1 §5). Nada de cascadas.
  const [storesRes, usersRes] = await Promise.all([
    admin.from('stores').select('id', { count: 'exact', head: true }).eq('tenant_id', orgId),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', orgId).is('deleted_at', null),
  ]);

  const storesCount = storesRes.count ?? 0;
  const usersCount = usersRes.count ?? 0;

  if (storesCount > 0 || usersCount > 0) {
    return NextResponse.json(
      {
        error: 'La organización tiene dependencias activas y no puede eliminarse',
        dependencies: {
          stores: storesCount,
          users: usersCount,
        },
        hint: 'Reasigna o elimina primero sus tiendas y usuarios. Las eliminaciones masivas de producción están delimitadas a la fase de limpieza autorizada.',
      },
      { status: 409 }
    );
  }

  const { error } = await admin.from('tenants').delete().eq('id', orgId);
  if (error) {
    logger.error('DATABASE', 'DELETE_ORGANIZATION_FAILED', { error: error.message, orgId });
    return NextResponse.json({ error: 'No se pudo eliminar la organización' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/organizations/[id]'
);

export const PATCH = withTracing(
  withRole(
    'admin',
    async (req: NextRequest, session: AuthenticatedSession) => {
      const csrfOk = await validateOrigin(req);
      if (!csrfOk) {
        return NextResponse.json({ error: 'Origen no permitido (CSRF)' }, { status: 403 });
      }
      return patchHandler(req, session);
    }
  ) as Parameters<typeof withTracing>[0],
  'PATCH /api/organizations/[id]'
);

export const DELETE = withTracing(
  withRole(
    'superadmin',
    async (req: NextRequest, session: AuthenticatedSession) => {
      const csrfOk = await validateOrigin(req);
      if (!csrfOk) {
        return NextResponse.json({ error: 'Origen no permitido (CSRF)' }, { status: 403 });
      }
      return deleteHandler(req, session);
    }
  ) as Parameters<typeof withTracing>[0],
  'DELETE /api/organizations/[id]'
);
