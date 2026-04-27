import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { hasRole } from '@/lib/roles';
import { UserRole } from '@/types';
import { createClient } from '@supabase/supabase-js';

export type AuthenticatedSession = {
  user: {
    id: string;
    email?: string;
    role: UserRole;
    roles?: UserRole[];
    memberships?: any[];
  };
  token: string;
};

type AuthHandler = (
  req: NextRequest,
  session: AuthenticatedSession
) => Promise<Response | NextResponse>;

/**
 * Helper to get Supabase Admin client
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

    // RBAC Enrichment: Fetch app-level profile data (profiles.role / roles array)
    const admin = getSupabaseAdmin();
    let enrichedUser = { ...session.user } as any;

    if (admin) {
      try {
        const { data: profile } = await admin
          .from('profiles')
          .select('role, roles, memberships:user_store_memberships(*)')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          enrichedUser.role = profile.role;
          enrichedUser.roles = profile.roles;
          enrichedUser.memberships = profile.memberships;
        }
      } catch (err) {
        console.error('[withAuth] RBAC Enrichment Error:', err);
      }
    }

    return handler(req, { ...session, user: enrichedUser });
  };
}

/**
 * Wraps a route handler requiring a valid session AND a specific role.
 * Returns 401 if no session, 403 if insufficient role.
 */
export function withRole(requiredRole: UserRole, handler: AuthHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Se requiere sesión activa' },
        { status: 401 }
      );
    }

    // RBAC Check: Fetch app-level profile data for authorization
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Error de configuración', message: 'Servicio de autenticación no disponible' },
        { status: 500 }
      );
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role, roles, memberships:user_store_memberships(*)')
      .eq('id', session.user.id)
      .single();

    if (!profile || !hasRole(profile as any, requiredRole)) {
      return NextResponse.json(
        { error: 'Prohibido', message: `Se requiere rol: ${requiredRole}` },
        { status: 403 }
      );
    }

    const enrichedSession: AuthenticatedSession = {
      ...session,
      user: {
        ...session.user,
        role: profile.role,
        roles: profile.roles,
        memberships: profile.memberships
      } as any
    };

    return handler(req, enrichedSession);
  };
}
