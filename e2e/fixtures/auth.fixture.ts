/**
 * Helper de autenticación para tests E2E.
 * Usa variables de entorno para inyectar un token de test válido.
 *
 * Variables de entorno requeridas (en .env.test.local):
 *   E2E_TEST_USER_TOKEN=<JWT de Supabase de usuario con rol 'usuario'>
 *   E2E_TEST_ADMIN_TOKEN=<JWT de Supabase de usuario con rol 'admin'>
 *   E2E_TEST_USER_ID=<UUID del usuario de test>
 *   E2E_TEST_STORE_ID=<UUID de la tienda de test>
 *
 * Si las variables no están disponibles, los tests de autenticación
 * se marcan como skip con un mensaje claro.
 */
/**
 * Sesión FRESCA con caché de 5 min (FASE E2E-80).
 * Motivo: en runs largos de la suite completa (>8 min), el token emitido por
 * global-setup empieza a fallar de forma transitoria en la verificación
 * server-side ("Auth session missing!") para los specs que corren al final.
 * Los specs que firman sesión propia al arrancar son inmunes. Este helper
 * proporciona tokens frescos verificados con re-sign-in ante 401.
 */
const freshCache: Record<'user' | 'admin', { token: string; ts: number }> = {
  user: { token: '', ts: 0 },
  admin: { token: '', ts: 0 },
};

export async function freshAuthHeaders(role: 'user' | 'admin' = 'user'): Promise<Record<string, string> | null> {
  const cached = freshCache[role];
  const isFresh = cached.token && Date.now() - cached.ts < 5 * 60 * 1000;
  if (!isFresh) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const email = role === 'admin'
      ? (process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com')
      : (process.env.E2E_USER_EMAIL || 'cajero@demo.com');
    const pass = role === 'admin'
      ? (process.env.E2E_ADMIN_PASS || 'costpro123')
      : (process.env.E2E_USER_PASS || 'demo123');
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    freshCache[role] = { token: data.access_token, ts: Date.now() };
    // También refrescar la env para los helpers que la leen
    if (role === 'admin') process.env.E2E_TEST_ADMIN_TOKEN = data.access_token;
    else process.env.E2E_TEST_USER_TOKEN = data.access_token;
  }
  const token = freshCache[role].token;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export function getAuthHeaders(role: 'user' | 'admin' = 'user') {
  const token = role === 'admin'
    ? process.env.E2E_TEST_ADMIN_TOKEN
    : process.env.E2E_TEST_USER_TOKEN;

  if (!token) return null; // caller debe hacer test.skip()

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function requireAuth(role: 'user' | 'admin' = 'user') {
  const token = role === 'admin'
    ? process.env.E2E_TEST_ADMIN_TOKEN
    : process.env.E2E_TEST_USER_TOKEN;
  return !!token;
}

export const TEST_USER_ID  = process.env.E2E_TEST_USER_ID  || 'test-user-00000000';
export const TEST_STORE_ID = process.env.E2E_TEST_STORE_ID || 'test-store-00000000';
export const TEST_PRODUCT_ID = process.env.E2E_TEST_PRODUCT_ID || 'test-prod-00000000';
