/**
 * PROBE de infraestructura (FASE E2E-80) — verificación de global-setup.
 * Confirma que los tokens/IDs exportados por global-setup llegan a los
 * workers y que la sesión inyectada autentica la SPA de verdad.
 * No forma parte del inventario de escenarios de negocio.
 */
import { test, expect } from '@playwright/test';
import { injectSession, signIn } from './fixtures/session.fixture';

test('global-setup exporta tokens a los workers', () => {
  expect(process.env.E2E_TEST_ADMIN_TOKEN, 'E2E_TEST_ADMIN_TOKEN').toBeTruthy();
  expect(process.env.E2E_TEST_ADMIN_ID, 'E2E_TEST_ADMIN_ID').toBeTruthy();
  expect(process.env.E2E_TEST_USER_TOKEN, 'E2E_TEST_USER_TOKEN').toBeTruthy();
  expect(process.env.E2E_TEST_USER_ID, 'E2E_TEST_USER_ID').toBeTruthy();
  expect(process.env.E2E_TEST_STORE_ID, 'E2E_TEST_STORE_ID').toMatch(/^[0-9a-f-]{36}$/);
});

test('sesión inyectada autentica la SPA (localStorage)', async ({ page }) => {
  const session = {
    token: process.env.E2E_TEST_ADMIN_TOKEN!,
    userId: process.env.E2E_TEST_ADMIN_ID!,
    email: 'admin@costpro.com',
  };
  await injectSession(page, session);
  await page.goto('/');
  // El shell autenticado renderiza el botón de cerrar sesión
  await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 30_000 });
});

test('signIn REST devuelve token funcional (API responde 200)', async ({ request }) => {
  const session = await signIn('admin@costpro.com', 'costpro123');
  const res = await request.get('/api/stores', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(res.status()).toBe(200);
});
