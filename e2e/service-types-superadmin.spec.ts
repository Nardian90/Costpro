/**
 * MISIÓN SUPER ADMIN 2026-10-17 — E2E de UI: tipos de servicio gestionables.
 *
 * Defecto reproducido y corregido (FIX SUPERADMIN-TIPOS): el módulo usaba
 * fetch() crudo sin Authorization → getServerSession (SEC-024 fail-closed,
 * solo Bearer) devolvía 401 «Se requiere sesión activa» en TODO el módulo
 * (catálogo vacío en UI + 401 al crear) pese a que el usuario fuera admin
 * global. El fix envía Authorization: Bearer <token> (patrón canónico).
 *
 * Recorrido real (cuenta demo autorizada, credenciales por env con fallback
 * demo documentado en auth.fixture.ts — nunca en logs ni informes):
 *   Login UI → OPERACIÓN → Logística → Servicios Recibidos → Nuevo Servicio →
 *   Gestionar tipos → catálogo cargado (NO vacío) → crear tipo de prueba con
 *   nombre determinista → toast + lista → persiste tras recarga →
 *   desactivación (procedimiento permitido; sin borrado físico) → badge Inactivo.
 *
 * NET-ZERO sobre el catálogo global: el tipo de prueba queda DESACTIVADO al
 * final (no aparece en el selector de nuevos servicios). Re-runnable: si el
 * tipo ya existe de un run anterior, no se crea de nuevo.
 */
import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'America/Havana' });

const DEMO_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL || 'admin@demo.com';
const DEMO_PASS = process.env.E2E_DEMO_ADMIN_PASS || 'demo123';
const TIPO_PRUEBA = 'QA Prueba SuperAdmin E2E';
const OUT_DIR = 'audit-evidence/20261017-superadmin-tipos-servicio';

test.describe('Super Admin — Gestionar tipos de servicio (Servicios Recibidos)', () => {
  test.skip(!process.env.E2E_DEMO_ADMIN_PASS && !process.env.CI, 'credenciales demo no disponibles (definir E2E_DEMO_ADMIN_PASS)');

  async function loginAndNavigate(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForTimeout(2500);
    const cookies = page.getByRole('button', { name: /aceptar todas/i }).first();
    if (await cookies.isVisible().catch(() => false)) await cookies.click();
    const entrar = page.getByText(/entrar a costpro/i).first();
    if (await entrar.isVisible().catch(() => false)) { await entrar.click(); await page.waitForTimeout(1800); }
    await page.locator('input[type="email"]').first().fill(DEMO_EMAIL);
    await page.locator('input[type="password"]').first().fill(DEMO_PASS);
    await page.locator('input[type="password"]').first().press('Enter');
    await page.waitForTimeout(5000);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    await page.getByText('OPERACIÓN', { exact: false }).first().click();
    await page.waitForTimeout(1200);
    // MISIÓN ARQUITECTURA UX (2026-10-23): el módulo vive ahora en Logística.
    await page.getByText('Logística', { exact: false }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText('Servicios Recibidos', { exact: false }).first().click();
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Gestionar tipos de servicio' }).first().click();
    await page.waitForTimeout(2500);
  }

  async function abrirModalGestion(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Gestionar tipos de servicio' }).first().click();
    await page.waitForTimeout(2500);
  }

  function filaTipo(page: import('@playwright/test').Page, nombre: string) {
    return page.locator('[data-testid="service-types-list"] li').filter({ hasText: nombre }).first();
  }

  test('catálogo cargado + crear tipo de prueba + persistencia + desactivación (net-zero)', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAndNavigate(page);

    // FIX SUPERADMIN-TIPOS: el catálogo YA NO aparece vacío para un admin autenticado
    const agregar = page.getByRole('button', { name: /agregar nuevo tipo/i }).first();
    await expect(agregar).toBeVisible();
    const lista = page.locator('[data-testid="service-types-list"]');
    await expect(lista.locator('li')).toHaveCount(await lista.locator('li').count().then((n) => n), { timeout: 5000 });
    const filas = await lista.locator('li').count();
    expect(filas, 'el catálogo debe tener los 9 tipos semilla + posible QA previo').toBeGreaterThanOrEqual(9);
    await page.screenshot({ path: `${OUT_DIR}/e2e-catalogo-cargado.png`, fullPage: true });

    const yaExiste = await filaTipo(page, TIPO_PRUEBA).count();

    if (yaExiste === 0) {
      // ── Crear el tipo de prueba (flujo real de la interfaz) ──────────
      await agregar.click();
      await page.locator('#service-type-name').fill(TIPO_PRUEBA);
      await page.locator('#service-type-desc').fill('Tipo de prueba E2E misión superadmin 2026-10-17');
      await page.getByRole('button', { name: /crear tipo/i }).first().click();
      await expect(page.getByText('creado correctamente')).toBeVisible({ timeout: 10_000 });
      await expect(lista.getByText(TIPO_PRUEBA)).toBeVisible();
      await page.screenshot({ path: `${OUT_DIR}/e2e-tipo-creado.png`, fullPage: true });

      // ── Persistencia: recarga completa y re-navegación ──────────────
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      await page.getByText('OPERACIÓN', { exact: false }).first().click();
      await page.waitForTimeout(1200);
      // MISIÓN ARQUITECTURA UX (2026-10-23): el módulo vive ahora en Logística.
      await page.getByText('Logística', { exact: false }).first().click();
      await page.waitForTimeout(1200);
      await page.getByText('Servicios Recibidos', { exact: false }).first().click();
      await page.waitForTimeout(2200);
      await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
      await page.waitForTimeout(1500);
      await abrirModalGestion(page);
      await expect(filaTipo(page, TIPO_PRUEBA)).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: `${OUT_DIR}/e2e-persistencia.png`, fullPage: true });
    } else {
      test.info().annotations.push({ type: 'note', description: 'El tipo de prueba ya existía de un run anterior — no se crea de nuevo' });
    }

    // ── Desactivación (procedimiento permitido; net-zero en el selector) ──
    const fila = filaTipo(page, TIPO_PRUEBA);
    if (await fila.getByText('Inactivo').count() === 0) {
      page.once('dialog', (d) => d.accept());
      await fila.getByRole('button', { name: `Desactivar tipo ${TIPO_PRUEBA}` }).click();
      await expect(page.getByText('Tipo desactivado')).toBeVisible({ timeout: 10_000 });
    }
    await expect(filaTipo(page, TIPO_PRUEBA).getByText('Inactivo')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${OUT_DIR}/e2e-tipo-desactivado.png`, fullPage: true });

    // El selector del formulario solo ofrece activos → el QA no debe estar
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await expect(page.getByRole('radio', { name: TIPO_PRUEBA })).toHaveCount(0);
  });
});
