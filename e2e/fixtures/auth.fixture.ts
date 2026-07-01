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
