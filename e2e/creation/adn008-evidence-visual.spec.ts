/**
 * EVIDENCIA VISUAL — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008 (proyecto 'creation').
 * ============================================================================
 * Recorrido real por la UI (BD aislada, infraestructura del RUN:
 * provisionRunEnv en global-setup crea admin + pilotos; teardown los elimina
 * → net-zero):
 *   Login UI (admin del run) → OPERACIÓN → Logística → Servicios Recibidos →
 *   Nuevo Servicio → capturas del formulario en ESCRITORIO y MÓVIL:
 *     · Tipo de servicio = combobox con búsqueda.
 *     · Vinculación operativa = acordeón CONTRAÍDO por defecto (y expandido).
 *     · Información del pago: Modo B (pendiente) y Modo A con el ejemplo §5.3
 *       (40 USD + 1.000 CUP) cargado.
 *     · Guardar borrador → filtro «Borradores» + banner sin efectos financieros.
 * ============================================================================
 */
import { test, expect } from '@playwright/test';
import { requireIsolatedCreation, sb } from '../fixtures/session.fixture';
import { readRunContext } from '../fixtures/run-env';

requireIsolatedCreation();

test.use({ timezoneId: 'America/Havana' });

const OUT_DIR = 'audit-evidence/20261120-adn008-services-creation';
const RATE_USD = 400;

// Import tardío para el guard (solo lectura, fail-closed).
async function isolationGuard() {
  const { assertIsolatedDb } = await import('../fixtures/assert-isolated-db');
  await assertIsolatedDb();
}

test.describe.serial('ADN-008 · evidencia visual del formulario', () => {
  let adminEmail = '';
  let adminPassword = '';
  let adminUserId = '';
  let adminToken = '';
  let evidTypeId = '';
  let storeId = '';

  test.beforeAll(async () => {
    await isolationGuard();
    const ctx = readRunContext();
    if (!ctx) throw new Error('sin contexto de run — global-setup debe haber corrido');
    adminEmail = ctx.users.admin.email;
    adminPassword = ctx.users.admin.password;
    adminUserId = ctx.users.admin.id;
    storeId = ctx.pilotStoreA.id;
    // La UI opera sobre el piloto A del run (hard-deleted en el teardown).
    await sb.update('profiles', `id=eq.${adminUserId}`, { active_store_id: storeId });

    // Sesión del admin del run (para llamadas API de setup).
    const login = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (!login.ok) throw new Error(`signIn evidencia falló: ${login.status}`);
    adminToken = (await login.json()).access_token;

    // 3) El catálogo aislado puede llegar SIN tipos activos (estado heredado):
    //    crear uno determinista ACTIVO. Net-zero: se DESACTIVA en afterAll
    //    (el catálogo global jamás se borra físicamente — convención repo).
    const typeRes = await fetch('http://localhost:3000/api/service-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `ADN008 Transporte ${ctx.runId}`, code: 'ADN008TR', description: 'Tipo de evidencia ADN-008 (efímero)', is_active: true }),
    });
    if (!typeRes.ok) throw new Error(`service-type falló: ${typeRes.status} ${await typeRes.text()}`.slice(0, 200));
    evidTypeId = (await typeRes.json()).data.id;
  });

  test.afterAll(async () => {
    // Net-zero: desactivar el tipo de evidencia (sin borrado físico).
    if (evidTypeId && adminToken) {
      await fetch('http://localhost:3000/api/service-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: evidTypeId, is_active: false }),
      }).catch(() => {});
    }
  });

  test('capturas escritorio y móvil + borrador por UI', async ({ page }: { page: import('@playwright/test').Page }) => {
    test.setTimeout(300_000);
    // ── Login UI con el admin del run (contraseña aleatoria del contexto) ──
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT_DIR}/00-landing.png`, fullPage: false });
    const cookies = page.getByRole('button', { name: /aceptar todas/i }).first();
    if (await cookies.isVisible().catch(() => false)) await cookies.click();
    const entrar = page.getByText(/entrar a la plataforma|acceder/i).first();
    if (await entrar.isVisible().catch(() => false)) { await entrar.click(); await page.waitForTimeout(2500); }
    await page.locator('input[type="email"]').first().fill(adminEmail, { timeout: 90_000 });
    await page.locator('input[type="password"]').first().fill(adminPassword);
    await page.locator('input[type="password"]').first().press('Enter');
    await page.waitForTimeout(8000);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // Diagnóstico de red (el catálogo debe cargar en el módulo).
    page.on('requestfailed', (r) => { if (r.url().includes('service-types')) console.log('[NET] FAILED:', r.url(), r.failure()?.errorText); });
    page.on('response', (r) => { if (r.url().includes('service-types')) console.log('[NET]', r.status(), r.url()); });

    // Menú lateral COLAPSADO por defecto: OPERACIÓN → Logística → Servicios
    // Recibidos (acordeón de dos niveles de botones reales).
    await page.getByRole('button', { name: 'OPERACIÓN', exact: true }).click({ timeout: 45_000 });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Logística', exact: true }).click({ timeout: 45_000 });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /servicios recibidos/i }).first().click({ timeout: 45_000 });
    await page.waitForTimeout(1500);

    // ── Escritorio 1440×900 ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT_DIR}/01-escritorio-listado.png`, fullPage: false });

    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.getByText('Tipo de servicio', { exact: false }).first().waitFor({ timeout: 15000 });
    // Esperar el catálogo (combobox) — el fetch a la BD aislada puede tardar.
    await page.waitForSelector('[data-testid="service-type-combobox"] input', { timeout: 90_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT_DIR}/02-escritorio-formulario-completo.png`, fullPage: true });

    // Combobox de tipo de servicio: búsqueda por texto
    await page.locator('[data-testid="service-type-combobox"] input').fill('trans');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_DIR}/03-escritorio-combobox-busqueda.png`, fullPage: true });
    await page.locator('[data-testid="service-type-combobox"] input').fill('');

    // Acordeón de vinculación: contraído por defecto → expandido → contraído
    await page.getByTestId('operational-links-trigger').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/04-escritorio-vinculacion-expandida.png`, fullPage: true });
    await page.getByTestId('operational-links-trigger').click();
    await page.waitForTimeout(400);

    // Modo A: liquidar al confirmar con el ejemplo §5.3 (40 USD + 1.000 CUP)
    await page.getByLabel('Importe total').fill('17000');
    await page.getByTestId('pay-now-toggle').click();
    await page.waitForTimeout(400);
    await page.getByLabel('Importe componente 1').fill('40');
    await page.getByLabel('Moneda componente 1').selectOption('USD');
    await page.getByLabel('Tasa componente 1').fill(String(RATE_USD));
    await page.getByTestId('payment-add-row').click();
    await page.getByLabel('Importe componente 2').fill('1000');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/05-escritorio-multipago-40usd-1000cup.png`, fullPage: true });

    // Vuelta a Modo B para el borrador (texto «Dejar pendiente de pago»)
    await page.getByTestId('pay-now-toggle').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('payment-mode-pending-text')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/06-escritorio-modo-pendiente.png`, fullPage: true });

    // ── Guardar borrador por UI (efecto real en la BD aislada) ──
    page.on('dialog', (d) => d.accept()); // window.confirm del borrador
    await page.getByTestId('save-draft-button').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT_DIR}/07-escritorio-borrador-guardado.png`, fullPage: false });

    // Filtro «Borradores» + banner del borrador (detalle)
    await page.getByRole('button', { name: /borradores/i }).first().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/08-escritorio-filtro-borradores.png`, fullPage: false });
    await page.getByLabel('Ver detalle').first().click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId('draft-banner')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/09-escritorio-banner-borrador.png`, fullPage: false });

    // ── Móvil 390×844: mismo formulario, cómodo y sin desbordes ──
    // Cerrar el modal de detalle con su botón de cierre (Escape no lo cierra).
    await page.getByLabel('Cerrar', { exact: true }).click({ timeout: 45_000 });
    await page.waitForTimeout(900);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /nuevo servicio/i }).first().click();
    await page.waitForSelector('[data-testid="service-type-combobox"] input', { timeout: 90_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT_DIR}/10-movil-formulario.png`, fullPage: true });

    await page.getByTestId('operational-links-trigger').click();
    await page.waitForTimeout(400);
    await page.getByLabel('Importe total').fill('17000');
    await page.getByTestId('pay-now-toggle').click();
    await page.waitForTimeout(400);
    await page.getByLabel('Importe componente 1').fill('40');
    await page.getByLabel('Moneda componente 1').selectOption('USD');
    await page.getByTestId('payment-add-row').click();
    await page.getByLabel('Importe componente 2').fill('1000');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/11-movil-multipago.png`, fullPage: true });

    // Sin desbordes horizontales (misión §8)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
