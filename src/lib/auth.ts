import { type NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const isSupabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// FIX-AUDIT-3: Dev bypass solo funciona cuando está explícitamente habilitado
// Y cuando no estamos en producción (doble seguro).
// next start fuerza NODE_ENV=production, lo que bloquea el dev-bypass automáticamente.
// En Vercel, NODE_ENV=production siempre, así que el dev-bypass nunca se activa en producción.
const isDevBypassEnabled = process.env.ENABLE_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

/**
 * Helper to get the user session in API Route Handlers.
 */
export async function getServerSession(request: NextRequest) {
  try {
    // 1. Try to get token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // DEV BYPASS: Accept dev-token-bypass when explicitly enabled via ENABLE_DEV_BYPASS=true
      // This allows development/testing even when Supabase is configured
      if (isDevBypassEnabled && token === 'dev-token-bypass') {
        return {
          user: {
            id: 'dev-admin-001',
            email: 'admin@demo.com',
            role: 'admin' as const,
            roles: ['admin' as const],
          },
          token,
        };
      }

      // If Supabase is configured, validate the JWT token
      if (isSupabaseConfigured) {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (!error && user) {
          return { user, token };
        }

        if (error) {
          console.error('[getServerSession] getUser error:', error.message);
        }
      }
    }

    // FIX-SEC-024: getSession() fallback removed — only Bearer token auth is allowed
    console.warn('[getServerSession] getSession fallback removed for security (SEC-024)');
  } catch (err: any) {
    console.error('[getServerSession] Critical error:', err.message);
  }

  return null;
}
