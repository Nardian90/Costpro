/**
 * PROBE de infraestructura (FASE E2E-80) — verificación de global-setup.
 * Confirma que los tokens/IDs exportados por global-setup llegan a los
 * workers y que la sesión inyectada autentica la SPA de verdad.
 * No forma parte del inventario de escenarios de negocio.
 */
import { test, expect } from '@playwright/test';
import { injectSession, signIn, ADMIN_EMAIL, ADMIN_PASS } from './fixtures/session.fixture';

test('global-setup exporta tokens a los workers', () => {
  expect(process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN').toBeTruthy();
  expect(process.env.E2E_TEST_ADMIN_ID, 'E2E_TEST_ADMIN_ID').toBeTruthy();
  expect(process.env.E2E_TEST_USER_TOKEN, 'E2E_TEST_USER_TOKEN').toBeTruthy();
  expect(process.env.E2E_TEST_USER_ID, 'E2E_TEST_USER_ID').toBeTruthy();
  expect(process.env.E2E_TEST_STORE_ID, 'E2E_TEST_STORE_ID').toMatch(/^[0-9a-f-]{36}$/);
});

test('sesión inyectada autentica la SPA (localStorage)', async ({ page }) => {
  // SEC-TS-10: sesión FRESCA en lugar del token del global-setup. El token
  // compartido muere a mitad de corrida completa cuando un spec UI dispara
  // el signOut global de useSessionManager (revoca TODAS las sesiones del
  // usuario). El refresh_token REAL permite auto-sanar en el browser.
  const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  await injectSession(page, session);
  await page.goto('/');
  // El shell autenticado renderiza el botón de cerrar sesión.
  // NOTA: useSessionManager fuerza estado no-autenticado si la restauración
  // supera 5 s — bajo carga del dev server puede ocurrir en el primer load;
  // un reload con el servidor caliente completa la restauración.
  const logout = page.locator('[aria-label="Cerrar sesión"]').first();
  try {
    await expect(logout).toBeVisible({ timeout: 60_000 });
  } catch {
    await page.reload();
    await expect(logout).toBeVisible({ timeout: 60_000 });
  }
});

test('signIn REST devuelve token funcional (API responde 200)', async ({ request }) => {
  const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  const res = await request.get('/api/stores', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(res.status()).toBe(200);
});
