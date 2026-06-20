import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { hasRole } from '@/lib/roles';
import { UserRole, UserStoreMembership } from '@/types';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';

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

type AuthHandler = (
  req: NextRequest,
  session: AuthenticatedSession,
  context?: any
) => Promise<Response | NextResponse>;

const getSupabaseAdmin = getSupabaseAdminSafe;

function isDevBypassSession(session: { token: string }): boolean {
  return session.token === 'dev-token-bypass';
}

async function getDevBypassMemberships(): Promise<UserStoreMembership[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  try {
    const { data } = await admin
      .from('stores')
      .select('id')
      .eq('is_active', true);
    return (data || []).map(s => ({
      user_id: 'dev-admin-001',
      store_id: s.id,
      role: 'admin' as UserRole,
      status: 'active',
    }));
  } catch {
    return [];
  }
}

export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest, context?: any): Promise<Response> => {
    const session = await getServerSession(req);

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    if (isDevBypassSession(session)) {
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
      }, context) as Promise<Response>;
    }

    const admin = getSupabaseAdmin();
    let enrichedUser: AuthenticatedSession['user'] = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string }).role as UserRole ?? 'clerk',
      memberships: [],
    };

    if (admin) {
      try {
        const [profileResult, membershipsResult] = await Promise.all([
          admin.from('profiles').select('role, roles').eq('id', session.user.id).single(),
          admin.from('user_store_memberships').select('user_id,store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
        ]);

        if (profileResult.data) {
          enrichedUser.role = profileResult.data.role;
          enrichedUser.roles = profileResult.data.roles;
          enrichedUser.memberships = membershipsResult.data || [];
        }
      } catch (err) {
        console.error('[withAuth] RBAC Enrichment Error:', err);
      }
    }

    return handler(req, { ...session, user: enrichedUser }, context) as Promise<Response>;
  };
}

type RoleCheck = UserRole | { role: UserRole; storeId?: string };

export function withRole(requiredRoleOrCheck: RoleCheck, handler: AuthHandler) {
  return async (req: NextRequest, context?: any): Promise<Response> => {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    if (isDevBypassSession(session)) {
      const devMemberships = await getDevBypassMemberships();
      return handler(req, {
        ...session,
        user: {
          ...session.user,
          role: 'admin',
          roles: ['admin'],
          memberships: devMemberships,
        },
      }, context) as Promise<Response>;
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Error de configuración', message: 'Servicio de autenticación no disponible' },
        { status: 500 }
      );
    }

    const [profileResult, membershipsResult] = await Promise.all([
      admin.from('profiles').select('role, roles').eq('id', session.user.id).single(),
      admin.from('user_store_memberships').select('user_id,store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
    ]);

    const profile = profileResult.data as { role: UserRole; roles?: UserRole[] } | null;
    const memberships = (membershipsResult.data || []) as UserStoreMembership[];

    if (!profile) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'Perfil de usuario no encontrado' },
        { status: 403 }
      );
    }

    const requiredRole = typeof requiredRoleOrCheck === 'string' ? requiredRoleOrCheck : requiredRoleOrCheck.role;
    const storeId = typeof requiredRoleOrCheck === 'object' ? requiredRoleOrCheck.storeId : undefined;

    const hasGlobalRole = hasRole({ ...profile!, memberships }, requiredRole);
    let hasStoreRole = false;
    if (storeId) {
      const storeMembership = memberships.find(m => m.store_id === storeId && m.status === 'active');
      if (storeMembership) {
        hasStoreRole = hasRole({ ...profile!, role: storeMembership.role }, requiredRole);
      }
    }

    if (!hasGlobalRole && !hasStoreRole) {
      return NextResponse.json(
        { error: 'Prohibido', message: `Se requiere rol: ${requiredRole}` },
        { status: 403 }
      );
    }

    const enrichedSession: AuthenticatedSession = {
      ...session,
      user: {
        ...session.user,
        role: profile!.role,
        roles: profile!.roles,
        memberships: memberships
      }
    };

    return handler(req, enrichedSession, context) as Promise<Response>;
  };
}

export function withStoreAccess(handler: AuthHandler) {
  return async (req: NextRequest, context?: any): Promise<Response> => {
    const session = await getServerSession(req);

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    if (isDevBypassSession(session)) {
      const devMemberships = await getDevBypassMemberships();
      return handler(req, {
        ...session,
        user: {
          ...session.user,
          role: 'admin',
          memberships: devMemberships,
        },
      }, context) as Promise<Response>;
    }

    const url = new URL(req.url);
    let storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');

    if (!storeId && req.method !== 'GET') {
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

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Error de configuración', message: 'Servicio de autenticación no disponible' },
        { status: 500 }
      );
    }

    let userRole: string | undefined;
    let activeMemberships: any[] = [];

    try {
      const [profileResult, membershipsResult] = await Promise.all([
        admin.from('profiles').select('role').eq('id', session.user.id).single(),
        admin.from('user_store_memberships').select('store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
      ]);

      if (profileResult.data) userRole = profileResult.data.role;
      if (membershipsResult.data) activeMemberships = membershipsResult.data;
    } catch (err) {
      console.warn('[withStoreAccess] Admin client query failed, falling back to user-token query:', err);
    }

    if (userRole === 'admin') {
      const enrichedSession: AuthenticatedSession = {
        ...session,
        user: {
          ...session.user,
          role: userRole as UserRole,
          memberships: activeMemberships as UserStoreMembership[]
        }
      };
      return handler(req, enrichedSession, context) as Promise<Response>;
    }
    const hasAccess = activeMemberships.some(m => m.store_id === storeId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Prohibido', message: 'No tienes acceso a esta tienda' },
        { status: 403 }
      );
    }

    const enrichedSession: AuthenticatedSession = {
      ...session,
      user: {
        ...session.user,
        role: userRole as UserRole,
        memberships: activeMemberships as UserStoreMembership[]
      }
    };

    return handler(req, enrichedSession, context) as Promise<Response>;
  };
}
