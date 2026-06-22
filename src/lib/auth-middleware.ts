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
  session: AuthenticatedSession
) => Promise<Response | NextResponse>;

/**
 * Helper to get Supabase Admin client (delegates to centralized module)
 */
const getSupabaseAdmin = getSupabaseAdminSafe;

/**
 * Check if the session is a dev-bypass session (token = 'dev-token-bypass')
 */
function isDevBypassSession(session: { token: string }): boolean {
  return session.token === 'dev-token-bypass';
}

/**
 * Get dev-bypass memberships for all active stores (admin role on every store).
 * This allows dev-bypass users to access any store without needing a DB profile.
 */
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

/**
 * Wraps a route handler requiring a valid session.
 * Enriches the session with database profile data (roles/memberships).
 * Returns 401 if no session exists.
 */
export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await getServerSession(req);

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    // Dev-bypass: use admin role with memberships from all active stores
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
      });
    }

    // RBAC Enrichment: Fetch app-level profile data (profiles.role / roles array)
    const admin = getSupabaseAdmin();
    let enrichedUser: AuthenticatedSession['user'] = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string }).role as UserRole ?? 'clerk',
      memberships: [],
    };

    if (!admin) {
      // FIX-SEC-WITHAUTH-LOG: Warn when admin client is unavailable — memberships won't be enriched
      // This causes fail-closed behavior (empty memberships = no store access for non-admins)
      console.warn('[withAuth] SUPABASE_SERVICE_ROLE_KEY not configured — session will lack memberships. Store-dependent routes will deny access to non-admins.');
    }

    if (admin) {
      try {
        // Use separate queries instead of embed (embed fails when multiple FK
        // relationships exist between profiles and user_store_memberships)
        const [profileResult, membershipsResult] = await Promise.all([
          admin.from('profiles').select('role, roles').eq('id', session.user.id).single(),
          admin.from('user_store_memberships').select('user_id,store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
        ]);

        if (profileResult.error || !profileResult.data) {
          // Fallback: use user's JWT token when admin client fails
          console.warn('[withAuth] Admin client query failed, falling back to user-token query:', profileResult.error?.message);
          try {
            const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');
            const userClient = getSupabaseAuthClient(session.token);
            const [fbProfile, fbMemberships] = await Promise.all([
              userClient.from('profiles').select('role, roles').eq('id', session.user.id).single(),
              userClient.from('user_store_memberships').select('user_id,store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
            ]);
            if (fbProfile.data) {
              enrichedUser.role = fbProfile.data.role;
              enrichedUser.roles = fbProfile.data.roles;
              enrichedUser.memberships = fbMemberships.data || [];
            }
          } catch (fbErr) {
            console.error('[withAuth] Fallback query also failed:', fbErr);
          }
        } else {
          enrichedUser.role = profileResult.data.role;
          enrichedUser.roles = profileResult.data.roles;
          enrichedUser.memberships = membershipsResult.data || [];
        }
      } catch (err) {
        console.error('[withAuth] RBAC Enrichment Error:', err);
      }
    }

    return handler(req, { ...session, user: enrichedUser });
  };
}

type RoleCheck = UserRole | { role: UserRole; storeId?: string };

/**
 * Wraps a route handler requiring a valid session AND a specific role.
 * Accepts either a plain UserRole or an object { role, storeId? }.
 * When storeId is provided, the user passes if their global role matches
 * OR they hold the required role in the specific store membership.
 * Returns 401 if no session, 403 if insufficient role.
 */
export function withRole(requiredRoleOrCheck: RoleCheck, handler: AuthHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    // Dev-bypass: admin has all roles
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
      });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Error de configuración', message: 'Servicio de autenticación no disponible' },
        { status: 500 }
      );
    }

    // Use separate queries instead of embed (embed fails when multiple FK
    // relationships exist between profiles and user_store_memberships)
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

    const requiredRole = typeof requiredRoleOrCheck === 'string'
      ? requiredRoleOrCheck
      : requiredRoleOrCheck.role;
    const storeId = typeof requiredRoleOrCheck === 'object'
      ? requiredRoleOrCheck.storeId
      : undefined;

    // Check global role
    const hasGlobalRole = hasRole({ ...profile!, memberships }, requiredRole);

    // If store-specific check is requested, also check membership role
    let hasStoreRole = false;
    if (storeId) {
      const storeMembership = memberships.find(
        m => m.store_id === storeId && m.status === 'active'
      );
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

    return handler(req, enrichedSession);
  };
}

/**
 * Wraps a route handler requiring the user to have access to a specific store.
 * Extracts storeId from query params (?storeId=) or request body ({ store_id }).
 * Admins bypass this check — they have access to all stores.
 * Returns 401 if no session, 403 if no store access, 400 if no storeId provided.
 */
export function withStoreAccess(handler: AuthHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await getServerSession(req);

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    // Dev-bypass: admin has access to all stores
    if (isDevBypassSession(session)) {
      const devMemberships = await getDevBypassMemberships();
      return handler(req, {
        ...session,
        user: {
          ...session.user,
          role: 'admin',
          memberships: devMemberships,
        },
      });
    }

    // Extract storeId from query params or request body
    const url = new URL(req.url);
    let storeId = url.searchParams.get('storeId') || url.searchParams.get('store_id');

    if (!storeId && req.method !== 'GET') {
      try {
        const body = await req.clone().json();
        storeId = body?.store_id || body?.storeId;
      } catch {
        // Body may not be JSON or may be empty
      }
    }

    if (!storeId) {
      return NextResponse.json(
        { error: 'Solicitud inválida', message: 'Se requiere storeId' },
        { status: 400 }
      );
    }

    // RBAC Enrichment & Store Access Check
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Error de configuración', message: 'Servicio de autenticación no disponible' },
        { status: 500 }
      );
    }

    // Use separate queries instead of embed (embed fails when multiple FK
    // relationships exist between profiles and user_store_memberships)
    let userRole: string | undefined;
    let activeMemberships: Array<{ store_id: string; role: string; status: string }> = [];

    try {
      const [profileResult, membershipsResult] = await Promise.all([
        admin.from('profiles').select('role').eq('id', session.user.id).single(),
        admin.from('user_store_memberships').select('store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
      ]);

      if (profileResult.data) {
        userRole = profileResult.data.role;
      }
      if (membershipsResult.data) {
        activeMemberships = membershipsResult.data as Array<{ store_id: string; role: string; status: string }>;
      }
    } catch (err) {
      console.warn('[withStoreAccess] Admin client query failed, falling back to user-token query:', err);
      try {
        const { getSupabaseAuthClient } = await import('@/lib/supabaseClient');
        const userClient = getSupabaseAuthClient(session.token);
        const [fbProfile, fbMemberships] = await Promise.all([
          userClient.from('profiles').select('role').eq('id', session.user.id).single(),
          userClient.from('user_store_memberships').select('store_id,role,status').eq('user_id', session.user.id).eq('status', 'active'),
        ]);
        if (fbProfile.data) userRole = fbProfile.data.role;
        if (fbMemberships.data) activeMemberships = fbMemberships.data as Array<{ store_id: string; role: string; status: string }>;
      } catch (fbErr) {
        console.error('[withStoreAccess] Fallback query also failed:', fbErr);
      }
    }

    // Admins bypass store access check
    if (userRole === 'admin') {
      const enrichedSession: AuthenticatedSession = {
        ...session,
        user: {
          ...session.user,
          role: userRole as UserRole,
          memberships: activeMemberships as UserStoreMembership[]
        }
      };
      return handler(req, enrichedSession);
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

    return handler(req, enrichedSession);
  };
}
