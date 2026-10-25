/**
 * /api/organizations — Administración de empresas (organizaciones/tenants).
 *
 * MISIÓN ORGANIZACIONES (2026-10-26), FASE 1.
 *
 * La entidad canónica es `tenants` (NO se crea una tabla duplicada); la
 * etiqueta de interfaz es «Organizaciones».
 *
 * GET  — listado con recuentos REALES:
 *        · SuperAdmin: todas las organizaciones.
 *        · admin ordinario: SOLO la suya (misión FASE 3: un administrador
 *          ordinario administra únicamente su empresa).
 *        · otros roles: 403.
 *        Filtros: search (nombre), status, has_stores. Ordenación server-side
 *        por nombre. Paginación real.
 *        Respuesta incluye summary (alcance explicado: organizaciones activas,
 *        tiendas activas en alcance, usuarios asignados, usuarios sin asignar
 *        [solo SuperAdmin]).
 *
 * POST — crear organización. SOLO SuperAdmin (crear empresas es una acción de
 *        plataforma: un admin ordinario administra SU empresa, no fabrica
 *        nuevas). CSRF: validateOrigin. Nombre normalizado + duplicado exacto.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  has_stores: z.enum(['true', 'false']).optional(),
});

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200, 'Máximo 200 caracteres'),
  is_active: z.boolean().default(true),
});

/**
 * CP-ORG-001: sanea el nombre para el chequeo de duplicados por ilike.
 * Sin escapar, un nombre con '%' o '_' (p. ej. «100%») coincide con CUALQUIER
 * organización que comparta prefijo → falsos positivos de duplicado que
 * bloqueaban creaciones legítimas. Los comodines se eliminan: la detección
 * de duplicados es LITERAL.
 */
function escapeIlikeLiteral(raw: string): string {
  return raw.replace(/[\\%_*]/g, '');
}

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function countUnassigned(admin: SupabaseAdmin): Promise<number> {
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .is('tenant_id', null)
    .is('deleted_at', null)
    .neq('role', 'superadmin');
  if (error) {
    logger.warn('DATABASE', 'COUNT_UNASSIGNED_USERS_FAILED', { error: error.message });
    return 0;
  }
  return count ?? 0;
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`organizations:list:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const isSuperAdmin = session.user.role === 'superadmin';

  // SISTEMA → Organizaciones es una vista administrativa.
  if (session.user.role !== 'admin' && !isSuperAdmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Empresa del llamador: define el alcance de un admin ordinario.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  const callerTenantId = callerProfile?.tenant_id ?? null;
  if (!isSuperAdmin && !callerTenantId) {
    // Un admin sin empresa no tiene alcance de organizaciones que listar.
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      summary: {
        organizations: 0,
        active_organizations: 0,
        stores: 0,
        assigned_users: 0,
        unassigned_users: 0,
        scope: 'own',
      },
    });
  }

  const url = new URL(req.url);
  const parsed = listOrganizationsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query params', details: parsed.error.format() },
      { status: 400 }
    );
  }
  const { page, limit, search, status, has_stores } = parsed.data;
  const offset = (page - 1) * limit;

  // Alcance: SuperAdmin = todas; admin = solo la suya.
  const scopeTenantId = isSuperAdmin ? null : callerTenantId;

  // CP-ORG-001: el filtro has_stores se resuelve ANTES de paginar — antes
  // se filtraba la PÁGINA en memoria y pagination.total quedaba con el total
  // SIN filtrar (contador incoherente con las filas mostradas).
  let orgIdsWithStores: string[] | null = null;
  if (has_stores) {
    const { data: storeTenantRows } = await admin
      .from('stores')
      .select('tenant_id')
      .not('tenant_id', 'is', null);
    const withStores = new Set(
      ((storeTenantRows || []) as Array<{ tenant_id: string | null }>)
        .map(s => s.tenant_id)
        .filter((t): t is string => !!t)
    );
    if (scopeTenantId) {
      orgIdsWithStores = withStores.has(scopeTenantId) ? [scopeTenantId] : [];
    } else {
      orgIdsWithStores = [...withStores];
    }
    if (has_stores === 'true' && orgIdsWithStores.length === 0) {
      // Ninguna organización del alcance tiene tiendas: resultado vacío
      // honesto con paginación coherente.
      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        summary: {
          organizations: 0,
          active_organizations: 0,
          stores: 0,
          assigned_users: 0,
          unassigned_users: 0,
          scope: isSuperAdmin ? 'all' : 'own',
        },
      });
    }
    if (has_stores === 'false' && orgIdsWithStores.length === 0) {
      // Ninguna organización tiene tiendas → «sin tiendas» = todas: no se
      // necesita filtro (evita un `not.in` con lista vacía, sintaxis frágil).
      orgIdsWithStores = null;
    }
  }

  let query = admin
    .from('tenants')
    .select('id, name, owner_id, plan, is_active, created_at, updated_at', { count: 'exact' })
    .order('name', { ascending: true });

  if (scopeTenantId) {
    query = query.eq('id', scopeTenantId);
  }
  if (orgIdsWithStores) {
    // has_stores=false → organizaciones SIN tiendas (exclusión del conjunto
    // con tiendas, resuelta en servidor con la lista acotada del alcance).
    if (has_stores === 'true') {
      query = query.in('id', orgIdsWithStores);
    } else {
      query = query.not('id', 'in', `(${orgIdsWithStores.map(id => `"${id}"`).join(',')})`);
    }
  }
  if (search) {
    query = query.ilike('name', `%${escapeIlikeLiteral(search)}%`);
  }
  if (status === 'active') {
    query = query.eq('is_active', true);
  } else if (status === 'inactive') {
    query = query.eq('is_active', false);
  }

  const pageRes = await query.range(offset, offset + limit - 1);
  if (pageRes.error) {
    logger.error('DATABASE', 'LIST_ORGANIZATIONS_FAILED', {
      error: pageRes.error.message,
      userId: session.user.id,
    });
    return NextResponse.json({ error: 'No se pudieron cargar las organizaciones' }, { status: 500 });
  }

  const orgs = (pageRes.data || []) as Array<Record<string, unknown>>;
  const count = pageRes.count ?? 0;
  const orgIds = orgs.map(o => o.id as string);

  // CP-ORG-001: recuentos del ALCANCE COMPLETO (todas las organizaciones del
  // alcance, no solo la página) — antes los indicadores eran la suma de las
  // filas de la página actual y cambiaban al navegar (cifra engañosa). Las
  // filas toman sus recuentos por-organización de estos mismos datos.
  const scopeStoresQuery = scopeTenantId
    ? admin.from('stores').select('tenant_id, is_active').eq('tenant_id', scopeTenantId)
    : admin.from('stores').select('tenant_id, is_active').not('tenant_id', 'is', null);
  const scopeUsersQuery = scopeTenantId
    ? admin.from('profiles').select('tenant_id').eq('tenant_id', scopeTenantId).is('deleted_at', null)
    : admin.from('profiles').select('tenant_id').not('tenant_id', 'is', null).is('deleted_at', null);
  const scopeOrgsQuery = admin
    .from('tenants')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (scopeTenantId) {
    void scopeOrgsQuery.eq('id', scopeTenantId);
  }

  const [scopeStoresRes, scopeUsersRes, scopeOrgsRes, ownerRes] = await Promise.all([
    scopeStoresQuery,
    scopeUsersQuery,
    scopeOrgsQuery,
    orgIds.length
      ? admin
          .from('profiles')
          .select('id, full_name')
          .in('id', orgs.map(o => o.owner_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);

  const storeCountByOrg = new Map<string, { total: number; active: number }>();
  let scopeActiveStores = 0;
  for (const s of (scopeStoresRes.data || []) as Array<{ tenant_id: string | null; is_active: boolean }>) {
    if (!s.tenant_id) continue;
    const entry = storeCountByOrg.get(s.tenant_id) || { total: 0, active: 0 };
    entry.total += 1;
    if (s.is_active) {
      entry.active += 1;
      scopeActiveStores += 1;
    }
    storeCountByOrg.set(s.tenant_id, entry);
  }

  const userCountByOrg = new Map<string, number>();
  let scopeAssignedUsers = 0;
  for (const u of (scopeUsersRes.data || []) as Array<{ tenant_id: string | null }>) {
    if (!u.tenant_id) continue;
    userCountByOrg.set(u.tenant_id, (userCountByOrg.get(u.tenant_id) || 0) + 1);
    scopeAssignedUsers += 1;
  }

  const ownerNameById = new Map<string, string>();
  for (const o of (ownerRes.data || []) as Array<{ id: string; full_name: string }>) {
    ownerNameById.set(o.id, o.full_name);
  }

  const rows = orgs.map(o => ({
    id: o.id as string,
    name: o.name as string,
    owner_id: (o.owner_id as string) || null,
    owner_name: o.owner_id ? ownerNameById.get(o.owner_id as string) || null : null,
    plan: o.plan as string,
    is_active: o.is_active as boolean,
    created_at: o.created_at as string,
    updated_at: o.updated_at as string,
    stores_total: storeCountByOrg.get(o.id as string)?.total || 0,
    stores_active: storeCountByOrg.get(o.id as string)?.active || 0,
    users: userCountByOrg.get(o.id as string) || 0,
  }));

  // Indicadores de resumen con alcance explícito (misión FASE 1 §2): cifras
  // del ALCANCE completo (independientes de búsqueda/paginación), solo
  // recuentos de consultas reales, sin doble contabilización.
  const summary: Record<string, string | number> = {
    // Organizaciones ACTIVAS en el alcance (recuento directo, no derivado).
    active_organizations: scopeOrgsRes.count ?? 0,
    // Tiendas ACTIVAS en el alcance.
    stores: scopeActiveStores,
    // Usuarios asignados a alguna organización del alcance.
    assigned_users: scopeAssignedUsers,
    // Usuarios sin empresa es una cifra GLOBAL de plataforma: solo el
    // SuperAdmin la recibe (un admin ordinario no debe conocerla).
    scope: isSuperAdmin ? 'all' : 'own',
  };
  // Total de organizaciones del alcance (sin filtros de búsqueda/estado):
  // describe el ALCANCE; el total de la tabla paginada (con filtros) es
  // `count` y viaja en pagination.total.
  if (scopeTenantId) {
    summary.organizations = 1;
  } else {
    const { count: totalOrgs } = await admin
      .from('tenants')
      .select('id', { count: 'exact', head: true });
    summary.organizations = totalOrgs ?? count;
  }
  summary.unassigned_users = isSuperAdmin ? await countUnassigned(admin) : 0;

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    summary,
  });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`organizations:create:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Crear empresas es una acción de PLATAFORMA: solo SuperAdmin.
  if (session.user.role !== 'superadmin') {
    return NextResponse.json(
      { error: 'Solo el SuperAdmin puede crear organizaciones' },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const name = parsed.data.name.replace(/\s+/g, ' ').trim();

  // Duplicado exacto (case-insensitive, LITERAL) conforme a las
  // restricciones reales. CP-ORG-001: nombre saneado de comodines ilike.
  const { data: dup } = await admin
    .from('tenants')
    .select('id, name')
    .ilike('name', escapeIlikeLiteral(name))
    .limit(1);
  if (dup && dup.length > 0) {
    return NextResponse.json(
      { error: 'Ya existe una organización con ese nombre' },
      { status: 409 }
    );
  }

  const { data: created, error } = await admin
    .from('tenants')
    .insert({
      name,
      is_active: parsed.data.is_active,
      subscription_status: 'trial',
    })
    .select('id, name, is_active, created_at')
    .single();

  if (error || !created) {
    logger.error('DATABASE', 'CREATE_ORGANIZATION_FAILED', {
      error: error?.message,
      userId: session.user.id,
    });
    return NextResponse.json({ error: 'No se pudo crear la organización' }, { status: 500 });
  }

  return NextResponse.json({ success: true, organization: created }, { status: 201 });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/organizations'
);

export const POST = withTracing(
  withRole(
    'superadmin',
    async (req: NextRequest, session: AuthenticatedSession) => {
      const csrfOk = await validateOrigin(req);
      if (!csrfOk) {
        return NextResponse.json({ error: 'Origen no permitido (CSRF)' }, { status: 403 });
      }
      return postHandler(req, session);
    }
  ) as Parameters<typeof withTracing>[0],
  'POST /api/organizations'
);
