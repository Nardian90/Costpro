/**
 * E2E P0 — AUTENTICACIÓN Y SESIÓN (flujo real de usuario)
 * ============================================================================
 * Escenarios cubiertos (ver e2e/SCENARIO-INVENTORY.md):
 *   E2E-AUTH-001 (P0) login válido → shell autenticado
 *   E2E-AUTH-002 (P1) login contraseña incorrecta → error visible, sin sesión
 *   E2E-AUTH-003 (P1) login usuario inexistente → error visible
 *   E2E-AUTH-004 (P0) logout → sesión terminada, vuelve a la pantalla de login
 *   E2E-AUTH-005 (P0) sesión persiste tras recarga (localStorage Supabase)
 *   E2E-AUTH-006 (P2) rate limit de login: 3 fallos → cooldown "Demasiados intentos"
 *
 * Flujo real: Browser → formulario UI → Supabase Auth → profile → shell SPA.
 * Sin mocks ni interceptores.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASS, signIn, injectSession, dismissCookieConsent } from '../fixtures/session.fixture';

test.describe('Auth y sesión — flujo real de usuario', () => {
  test('E2E-AUTH-001 (P0) login válido autentica y muestra el shell de la aplicación', async ({ page }) => {
    await page.goto('/?login=1');

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASS);
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();

    // Resultado observable: shell autenticado con opción de cerrar sesión
    await expect(
      page.locator('[aria-label="Cerrar sesión"]').first(),
      'el shell autenticado debe renderizar el botón Cerrar sesión',
    ).toBeVisible({ timeout: 45_000 });

    // La sesión queda persistida en localStorage (supabase-js)
    const hasSession = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      return keys.some((k) => k.endsWith('-auth-token'));
    });
    expect(hasSession, 'debe existir la clave sb-*-auth-token en localStorage').toBe(true);
  });

  test('E2E-AUTH-002 (P1) login con contraseña incorrecta muestra error y NO autentica', async ({ page }) => {
    await page.goto('/?login=1');

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill('contraseña-incorrecta-123');
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();

    // Resultado observable: mensaje de credenciales inválidas
    // (aparece en toast + en el formulario → .first() para strict mode)
    await expect(page.getByText('Credenciales inválidas').first()).toBeVisible({ timeout: 20_000 });
    // Y el usuario sigue sin sesión (formulario sigue presente)
    await expect(page.locator('#email')).toBeVisible();

    const hasSession = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.endsWith('-auth-token')),
    );
    expect(hasSession, 'no debe crearse sesión con credenciales inválidas').toBe(false);
  });

  test('E2E-AUTH-003 (P1) login con usuario inexistente muestra error', async ({ page }) => {
    await page.goto('/?login=1');

    await page.locator('#email').fill('no-existe-e2e@costpro.test');
    await page.locator('#password').fill('cualquier-contrasena');
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();

    await expect(page.getByText('Credenciales inválidas').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('E2E-AUTH-004 (P0) logout cierra la sesión y devuelve al login', async ({ page }) => {
    // Precondición: sesión activa (login real)
    await page.goto('/?login=1');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASS);
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // El banner de cookies (fixed z-50) intercepta el click del sidebar → descartarlo
    await dismissCookieConsent(page);

    // Acción: cerrar sesión
    await page.locator('[aria-label="Cerrar sesión"]').first().click();

    // Resultado observable: sesión destruida → vuelve al landing público
    await expect(
      page.locator('[aria-label*="Entrar a COSTPRO"]').first(),
      'tras logout debe mostrarse el CTA de login del landing',
    ).toBeVisible({ timeout: 30_000 });
    const hasSession = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => k.endsWith('-auth-token')),
    );
    expect(hasSession, 'logout debe eliminar la sesión de localStorage').toBe(false);
  });

  test('E2E-AUTH-005 (P0) la sesión persiste tras recargar la página', async ({ page }) => {
    // Precondición: sesión real inyectada (token del global-setup / signIn)
    const session = await signIn(ADMIN_EMAIL, ADMIN_PASS);
    await injectSession(page, { ...session, email: ADMIN_EMAIL });

    await page.goto('/');
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });

    // Acción: recargar
    await page.reload();

    // Resultado: sigue autenticado sin volver a loguearse
    await expect(page.locator('[aria-label="Cerrar sesión"]').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#email'), 'no debe mostrarse el login con sesión activa').toHaveCount(0);
  });

  test('E2E-AUTH-006 (P2) rate limit de login: 3 intentos fallidos → cooldown', async ({ page }) => {
    await page.goto('/?login=1');

    // 2 intentos fallidos (sin cooldown aún)
    for (let i = 0; i < 2; i++) {
      await page.locator('#email').fill('rate-limit-e2e@costpro.test');
      await page.locator('#password').fill('mal-' + i);
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await expect(page.getByText('Credenciales inválidas').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(300);
    }

    // 3.er fallo dispara el cooldown (failedAttempts >= 3)
    await page.locator('#email').fill('rate-limit-e2e@costpro.test');
    await page.locator('#password').fill('mal-3');
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();

    await expect(page.getByText('Demasiados intentos').first()).toBeVisible({ timeout: 15_000 });
  });
});
