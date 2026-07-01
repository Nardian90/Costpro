/**
 * getSupabaseForSession — Helper que devuelve el cliente Supabase apropiado.
 *
 * - Sesión dev-bypass (token='dev-token-bypass') → getSupabaseAdminSafe() (bypass RLS)
 * - Sesión real → getSupabaseAuthClient(token) (respeta RLS con el JWT del usuario)
 *
 * Esto evita el bug "Expected 3 parts in JWT" cuando se usa dev-token-bypass
 * con getSupabaseAuthClient (que envía el token a Supabase como JWT real).
 */
import { getSupabaseAuthClient } from '@/lib/supabaseClient';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedSession } from '@/lib/auth-middleware';

const DEV_BYPASS_TOKEN = 'dev-token-bypass';

export function getSupabaseForSession(session: AuthenticatedSession): SupabaseClient {
  // Dev bypass: usar admin client (bypass RLS) — solo en development
  if (session.token === DEV_BYPASS_TOKEN) {
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured for dev-bypass');
    }
    return admin;
  }

  // Sesión real: usar auth client con el JWT del usuario (respeta RLS)
  return getSupabaseAuthClient(session.token);
}
