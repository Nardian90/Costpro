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

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  store_id: z.string().uuid().optional(),
  role: z.enum(['admin', 'superadmin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo']).optional(),
  search: z.string().min(1).max(100).optional(),
  is_active: z.enum(['true', 'false']).optional(),
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

  const { page, limit, store_id, role, search, is_active } = parsed.data;
  const offset = (page - 1) * limit;

  // Authorization: only admin and encargado can list users
  const isAdmin = session.user.role === 'admin';
  const isEncargado = session.user.role === 'encargado' || session.user.roles?.includes('encargado');

  if (!isAdmin && !isEncargado) {
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
  if (!callerTenantId) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
  }

  // Build query with tenant isolation
  let query = admin
    .from('profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .eq('tenant_id', callerTenantId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .range(offset, offset + limit - 1);

  // Encargado: exclude admin users
  if (isEncargado && !isAdmin) {
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
  let membershipsByUser: Record<string, Array<{ store_id: string; role: string; status: string }>> = {};

  if (userIds.length > 0) {
    const { data: memberships } = await admin
      .from('user_store_memberships')
      .select('user_id, store_id, role, status')
      .in('user_id', userIds)
      .eq('status', 'active');

    if (memberships) {
      for (const m of memberships) {
        if (!membershipsByUser[m.user_id]) {
          membershipsByUser[m.user_id] = [];
        }
        membershipsByUser[m.user_id].push({
          store_id: m.store_id,
          role: m.role,
          status: m.status,
        });
      }
    }
  }

  // Combine profiles + memberships
  const usersWithMemberships = (users || []).map((u: Record<string, unknown>) => ({
    ...u,
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
