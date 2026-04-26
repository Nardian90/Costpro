import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { hasRole } from '@/lib/roles';
import { UserRole } from '@/types';

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
 * Wraps a route handler requiring a valid session.
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
    return handler(req, session as AuthenticatedSession);
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
    if (!hasRole(session.user as any, requiredRole)) {
      return NextResponse.json(
        { error: 'Prohibido', message: `Se requiere rol: ${requiredRole}` },
        { status: 403 }
      );
    }
    return handler(req, session as AuthenticatedSession);
  };
}
