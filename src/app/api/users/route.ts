/**
 * GET /api/users — Listar usuarios con paginación, filtros y aislamiento por tenant.
 *
 * Iteración v2.21.8: Nuevo endpoint para consistencia arquitectónica.
 * Antes el frontend hacía queries directas a Supabase (supabase.from('profiles').select(...)).
 * Ahora pasa por esta API route que centraliza:
 * - Rate limiting (30 req/min)
 * - Validación server-side (Zod)
 * - Aislamiento por tenant (RLS-aware)
 * - Audit logging automático (via withAuth → withAutoTracking)
 * - Filtrado: store_id, role, search, is_active
 * - Paginación: page, limit (max 100)
 *
 * Autorización:
 * - admin: ve todos los users de su tenant
 * - encargado: ve users de stores donde tiene membership (excluye admins)
 * - otros roles: 403
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

import { uuidLoose } from '@/validation/api-schemas';
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  store_id: uuidLoose.optional(),
  role: z.enum(['admin', 'superadmin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo']).optional(),
  search: z.string().min(1).max(100).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  // MISIÓN ORGANIZACIONES (2026-10-26): filtro por empresa + «sin asignar».
  tenant_id: uuidLoose.optional(),
  unassigned: z.enum(['true']).optional(),
});

const PROFILE_COLUMNS = 'id, full_name, email, role, role_id, active_store_id, logo_url, is_active, store_id, created_at, plan, tenant_id, deleted_at';

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`users:list:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const url = new URL(req.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());
  const parsed = listUsersQuerySchema.safeParse(queryParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query params', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { page, limit, store_id, role, search, is_active, tenant_id, unassigned } = parsed.data;
  const offset = (page - 1) * limit;

  // Authorization: only admin, superadmin and encargado can list users
  // MISIÓN ORGANIZACIONES (2026-10-26): superadmin = alcance global de
  // plataforma; admin ordinario = su empresa; encargado = sus tiendas.
  const isSuperAdmin = session.user.role === 'superadmin';
  const isAdmin = session.user.role === 'admin';
  const isEncargado = session.user.role === 'encargado' || session.user.roles?.includes('encargado');

  if (!isAdmin && !isSuperAdmin && !isEncargado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Get caller's tenant_id for isolation
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', session.user.id)
    .single();

  const callerTenantId = callerProfile?.tenant_id;
  if (!callerTenantId && !isSuperAdmin) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  // Build query with tenant isolation:
  // - superadmin: TODAS las empresas (alcance global de plataforma) con
  //   filtro opcional por tenant_id; puede listar «sin asignar».
  // - admin/encargado: únicamente SU empresa.
  let query = admin
    .from('profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (isSuperAdmin) {
    if (tenant_id) {
      query = query.eq('tenant_id', tenant_id);
    } else if (unassigned === 'true') {
      query = query.is('tenant_id', null);
    }
  } else {
    query = query.eq('tenant_id', callerTenantId);
  }

  // Encargado: exclude admin users
  if (isEncargado && !isAdmin && !isSuperAdmin) {
    query = query.neq('role', 'admin');
  }

  // Filters
  if (store_id) {
    query = query.eq('active_store_id', store_id);
  }
  if (role) {
    query = query.eq('role', role);
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (is_active === 'true') {
    query = query.eq('is_active', true);
  } else if (is_active === 'false') {
    query = query.eq('is_active', false);
  }

  const { data: users, error, count } = await query;

  if (error) {
    logger.error('DATABASE', 'LIST_USERS_FAILED', { error: error.message, userId: session.user.id });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch memberships for each user (separate query to avoid column cache issues)
  const userIds = (users || []).map((u: { id: string }) => u.id);
  let membershipsByUser: Record<string, Array<{ store_id: string; role: string; status: string; store?: { id: string; name: string; is_active: boolean } }>> = {};

  if (userIds.length > 0) {
    const { data: memberships } = await admin
      .from('user_store_memberships')
      .select('user_id, store_id, role, status, store:stores(id, name, is_active)')
      .in('user_id', userIds)
      .eq('status', 'active');

    if (memberships) {
      for (const m of memberships) {
        if (!membershipsByUser[m.user_id]) {
          membershipsByUser[m.user_id] = [];
        }
        const store = Array.isArray(m.store) ? m.store[0] : m.store;
        membershipsByUser[m.user_id].push({
          store_id: m.store_id,
          role: m.role,
          status: m.status,
          store: store ? { id: store.id, name: store.name, is_active: store.is_active } : undefined,
        });
      }
    }
  }

  // MISIÓN ORGANIZACIONES (2026-10-26): nombre de la empresa de cada
  // usuario (columna Empresa/Organización de SISTEMA → Usuarios).
  const tenantIds = [...new Set((users || []).map((u: { tenant_id?: string | null }) => u.tenant_id).filter(Boolean))] as string[];
  const tenantNameById = new Map<string, string>();
  if (tenantIds.length > 0) {
    const { data: tenantsRows } = await admin
      .from('tenants')
      .select('id, name')
      .in('id', tenantIds);
    for (const t of (tenantsRows || []) as Array<{ id: string; name: string }>) {
      tenantNameById.set(t.id, t.name);
    }
  }

  // Combine profiles + memberships + tenant_name
  const usersWithMemberships = (users || []).map((u: Record<string, unknown>) => ({
    ...u,
    tenant_name: u.tenant_id ? tenantNameById.get(u.tenant_id as string) || null : null,
    memberships: membershipsByUser[u.id as string] || [],
  }));

  return NextResponse.json({
    data: usersWithMemberships,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

export const GET = withTracing(
  withAuth(getHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/users'
);
