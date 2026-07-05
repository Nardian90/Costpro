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
 *
 * FIX-AUDIT-AUTH-1 (crítico — bypass de autenticación):
 * Antes, cuando `supabase.auth.getUser(token)` fallaba (token inválido, firma
 * incorrecta, etc.), el código caía a un fallback que decodificaba el JWT
 * manualmente SIN VERIFICAR LA FIRMA. Solo chequeaba que tuviera 3 segmentos,
 * que el JSON parsee y que `exp` no hubiera vencido. Esto permitía a un
 * atacante fabricar un JWT arbitrario con `sub: <uuid-de-otro-usuario>` y
 * ser aceptado como sesión válida — incluido un admin si conocía su UUID.
 * No estaba gateado por NODE_ENV ni flag alguno.
 *
 * Fix: FAIL CLOSED. Si `getUser()` falla, se retorna `null` (no hay sesión).
 * Cualquier token debe pasar por Supabase para validar firma + exp + revocación.
 * No hay atajos de decodificación local sin verificación criptográfica.
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

      // If Supabase is configured, validate the JWT token via Supabase.
      // This is the ONLY accepted path: Supabase validates signature, exp,
      // and revocation status. No local decode-without-verify fallback.
      if (isSupabaseConfigured) {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (!error && user) {
          // FIX-ADMIN-ROLE (2026-07-05): obtener el role de la tabla profiles
          // El JWT de Supabase Auth NO incluye el role — viene de profiles.
          // Sin esto, session.user.role siempre es undefined para usuarios reales
          // y el admin bypass del Asesor IA no funciona.
          try {
            const { supabase: supabaseAdmin } = await import('@/lib/supabaseClient');
            const adminClient = (await import('@supabase/supabase-js')).createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { auth: { persistSession: false, autoRefreshToken: false } }
            );
            const { data: profile } = await adminClient
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();

            return {
              user: {
                ...user,
                role: profile?.role || 'user',
                roles: profile?.role ? [profile.role] : ['user'],
              },
              token,
            };
          } catch {
            // Si no podemos obtener el profile, retornar sin role
            return { user, token };
          }
        }

        // FIX-AUDIT-AUTH-1: FAIL CLOSED on any error.
        // No decodificación manual del JWT sin verificar firma.
        // El anterior fallback era un bypass de autenticación explotable.
        if (error) {
          console.error('[getServerSession] getUser error (fail closed):', error.message);
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
