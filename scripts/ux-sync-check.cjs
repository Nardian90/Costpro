/**
 * Prueba dirigida: sincronía Inventario ↔ Catálogo (§20) + barra masiva fija
 * 1) En Catálogo: publicar "Araganes" (visible ON) vía Configurar
 * 2) Navegar a Inventario (modo tarjeta): el chip debe mostrar "Visible"
 * 3) En Catálogo: revertir a oculto
 * 4) Barra masiva: seleccionar 1 producto → barra visible sin scroll
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = 'admin@costpro.com';
const PASS = 'costpro123';
const OUT = path.join(__dirname, '..', 'e2e-artifacts', 'ux-check');
const EXE = '/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Login
  await page.goto(BASE + '/?login=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASS);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.locator('[aria-label="Cerrar sesión"]').first().waitFor({ state: 'visible', timeout: 30000 });
  const banner = page.locator('[aria-label="Consentimiento de cookies"]');
  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.locator('[aria-label="Rechazar cookies opcionales"]').click().catch(() => {});
    await banner.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }

  // ── Catálogo: publicar Araganes ──
  console.log('1) Catálogo: publicar ARAGANES...');
  await page.goto(BASE + '/?view=management-hub', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.waitForTimeout(4000);
  // tarjeta de ARAGANES → Configurar → Visible en tienda
  const card = page.locator('div[role="listitem"]', { hasText: 'ARAGANES' }).first();
  await card.locator('button[aria-label^="Configurar publicación de"]').click();
  await page.waitForTimeout(600);
  await page.getByRole('menuitemcheckbox', { name: 'Visible en tienda' }).click();
  await page.waitForTimeout(2000); // toast + persistencia
  const toast1 = await page.locator('[data-sonner-toast]').first().textContent().catch(() => '(sin toast)');
  console.log('   toast:', toast1);
  await page.keyboard.press('Escape');

  // ── Inventario: verificar chip Visible ──
  console.log('2) Inventario: verificar chip Visible en ARAGANES...');
  await page.goto(BASE + '/?view=inventory', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const gridBtn = page.locator('button[aria-label="Vista de cuadrícula"]').first();
  if (await gridBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await gridBtn.click(); await page.waitForTimeout(2000); }
  const invCard = page.locator('div[role="listitem"]', { hasText: 'ARAGANES' }).first();
  const visibleChip = invCard.locator('span', { hasText: /^Visible$/ }).first();
  const chipVisible = await visibleChip.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('   chip "Visible" en tarjeta:', chipVisible ? 'OK ✓' : 'FALLO ✗');
  await page.screenshot({ path: path.join(OUT, '11-sync-inventario-visible.png') });

  // ── Revertir en Catálogo ──
  console.log('3) Revertir: ocultar ARAGANES desde Catálogo...');
  await page.goto(BASE + '/?view=management-hub', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.getByRole('tab', { name: 'Catálogo' }).click();
  await page.waitForTimeout(4000);
  const card2 = page.locator('div[role="listitem"]', { hasText: 'ARAGANES' }).first();
  await card2.locator('button[aria-label^="Configurar publicación de"]').click();
  await page.waitForTimeout(600);
  await page.getByRole('menuitemcheckbox', { name: 'Visible en tienda' }).click();
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');

  // ── Barra masiva visible sin scroll ──
  console.log('4) Barra masiva visible sin scroll...');
  const sel = page.locator('button[aria-label^="Seleccionar"]').first();
  await sel.click();
  await page.waitForTimeout(900);
  const bulkBar = page.locator('text=/1 seleccionado/').first();
  const bulkVisible = await bulkBar.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('   barra masiva visible:', bulkVisible ? 'OK ✓' : 'FALLO ✗');
  await page.screenshot({ path: path.join(OUT, '12-barra-masiva-fija.png') });

  await browser.close();
  console.log(chipVisible && bulkVisible ? 'RESULTADO: TODO OK' : 'RESULTADO: REVISAR');
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
