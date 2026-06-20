import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { hasRole } from '@/lib/roles';
import { UserRole, UserStoreMembership } from '@/types';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSupabaseAuthClient } from '@/lib/supabaseClient';

/**
 * Enhanced session including enriched RBAC information from the database.
 */
export type AuthenticatedSession = {
  user: {
    id: string;
    email?: string;
    role: UserRole;
    roles?: UserRole[];
    memberships?: UserStoreMembership[];
  };
  token: string;
};

/**
 * Generic handler for authenticated routes.
 */
export type AuthHandler = (
  req: NextRequest,
  session: AuthenticatedSession,
  context?: any
) => Promise<Response>;

/**
 * Utility for development bypass memberships.
 */
async function getDevBypassMemberships(): Promise<UserStoreMembership[]> {
  const admin = getSupabaseAdminSafe();
  if (!admin) return [];

  try {
    const { data } = await admin
      .from('stores')
      .select('id')
      .eq('is_active', true);
    return (data || []).map(s => ({
      id: `dev-mem-${s.id}`,
      user_id: 'dev-admin-001',
      store_id: s.id,
      role: 'admin' as UserRole,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * wraps a route handler with authentication and RBAC enrichment.
 */
export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest, context?: any): Promise<Response> => {
    const session = await getServerSession(req);

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    if (session.token === 'dev-token-bypass') {
      const devMemberships = await getDevBypassMemberships();
      return handler(req, {
        ...session,
        user: {
          id: session.user.id,
          email: session.user.email,
          role: 'admin',
          roles: ['admin'],
          memberships: devMemberships,
        },
      }, context);
    }

    const admin = getSupabaseAdminSafe();
    let enrichedUser: AuthenticatedSession['user'] = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as any).role as UserRole ?? 'clerk',
      memberships: [],
    };

    try {
      if (admin) {
        const [profileResult, membershipsResult] = await Promise.all([
          admin.from('profiles').select('role, roles').eq('id', session.user.id).maybeSingle(),
          admin.from('user_store_memberships').select('*').eq('user_id', session.user.id).eq('status', 'active'),
        ]);

        if (profileResult.data) {
          enrichedUser.role = profileResult.data.role as UserRole;
          enrichedUser.roles = profileResult.data.roles as UserRole[];
          enrichedUser.memberships = membershipsResult.data as UserStoreMembership[] || [];
          return handler(req, { ...session, user: enrichedUser }, context);
        }
      }

      // Fallback: Use User-Token client (honors RLS)
      const userClient = getSupabaseAuthClient(session.token);
      const [pResult, mResult] = await Promise.all([
        userClient.from('profiles').select('role, roles').maybeSingle(),
        userClient.from('user_store_memberships').select('*').eq('user_id', session.user.id).eq('status', 'active')
      ]);

      if (pResult.data) {
        enrichedUser.role = (pResult.data as any).role as UserRole;
        enrichedUser.roles = (pResult.data as any).roles as UserRole[];
      }
      if (mResult.data) {
        enrichedUser.memberships = mResult.data as UserStoreMembership[];
      }
    } catch (err) {
      console.error('[withAuth] RBAC Enrichment Error:', err);
    }

    return handler(req, { ...session, user: enrichedUser }, context);
  };
}

type RoleCheck = UserRole | { role: UserRole; storeId?: string };

export function withRole(requiredRoleOrCheck: RoleCheck, handler: AuthHandler) {
  return withAuth(async (req, session, context) => {
    const requiredRole = typeof requiredRoleOrCheck === 'string' ? requiredRoleOrCheck : requiredRoleOrCheck.role;
    const storeId = typeof requiredRoleOrCheck === 'object' ? requiredRoleOrCheck.storeId : undefined;

    const hasGlobalAccess = hasRole(session.user, requiredRole);
    let hasStoreAccess = false;
    if (storeId && session.user.memberships) {
      const storeMembership = session.user.memberships.find(m => m.store_id === storeId && m.status === 'active');
      if (storeMembership) {
        hasStoreAccess = hasRole({ ...session.user, role: storeMembership.role as UserRole }, requiredRole);
      }
    }

    if (!hasGlobalAccess && !hasStoreAccess) {
      return NextResponse.json(
        { error: 'Prohibido', message: `Se requiere rol: ${requiredRole}` },
        { status: 403 }
      );
    }

    return handler(req, session, context);
  });
}

export function withStoreAccess(handler: AuthHandler) {
  return withAuth(async (req, session, context) => {
    const url = new URL(req.url);
    let storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');

    if (!storeId && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      try {
        const body = await req.clone().json();
        storeId = body?.store_id || body?.storeId;
      } catch {}
    }

    if (!storeId) {
      return NextResponse.json(
        { error: 'Solicitud inválida', message: 'Se requiere storeId' },
        { status: 400 }
      );
    }

    if (session.user.role === 'admin') {
      return handler(req, session, context);
    }

    const hasAccess = session.user.memberships?.some(m => m.store_id === storeId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes acceso a esta tienda' },
        { status: 403 }
      );
    }

    return handler(req, session, context);
  });
}
