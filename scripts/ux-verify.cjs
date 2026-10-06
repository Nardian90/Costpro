/**
 * Verificación visual UX — Inventario (modo tarjeta) + Catálogo/Vitrina
 * PR: feat/ux-inventario-vitrina · usa el flujo REAL de login (/?login=1)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@costpro.com';
const PASS = process.env.ADMIN_PASS || 'costpro123';
const OUT = path.join(__dirname, '..', 'e2e-artifacts', 'ux-check');
const EXE = '/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

async function login(page) {
  await page.goto(BASE + '/?login=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASS);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.locator('[aria-label="Cerrar sesión"]').first().waitFor({ state: 'visible', timeout: 30000 });
  // Descartar banner de cookies si intercepta
  const banner = page.locator('[aria-label="Consentimiento de cookies"]');
  if (await banner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.locator('[aria-label="Rechazar cookies opcionales"]').click().catch(() => {});
    await banner.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('1) Login real...');
  await login(page);
  console.log('   OK url:', page.url());

  console.log('2) Inventario modo tarjeta...');
  await page.goto(BASE + '/?view=inventory', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, '01-inventario.png') });
  // Forzar modo tarjeta (grid) si la vista arranca en tabla
  const gridBtn = page.locator('button[aria-label="Vista de cuadrícula"]').first();
  if (await gridBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gridBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(OUT, '02-inventario-tarjetas.png') });

  console.log('3) Menú contextual ⋮ ...');
  const kebab = page.locator('button[aria-label^="Más acciones de"]').first();
  if (await kebab.isVisible({ timeout: 6000 }).catch(() => false)) {
    await kebab.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '03-menu-contextual.png') });
    // Toggle "Precio visible" desde el menú para verificar feedback en vivo
    const priceItem = page.getByRole('menuitemcheckbox', { name: 'Precio visible' }).first();
    if (await priceItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await priceItem.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, '03b-menu-toggle-precio.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, '03c-chip-tras-toggle.png') });
    }
  } else {
    console.log('   ⚠️ ⋮ no visible — ¿la vista arrancó en tabla?');
  }

  console.log('4) Gestión de Tiendas → Catálogo...');
  await page.goto(BASE + '/?view=management-hub', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, '04-hub-tiendas.png') });
  const catalogTab = page.getByRole('tab', { name: 'Catálogo' }).first();
  if (await catalogTab.isVisible({ timeout: 6000 }).catch(() => false)) {
    await catalogTab.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, '05-catalogo.png') });
    const configBtn = page.locator('button[aria-label^="Configurar publicación de"]').first();
    if (await configBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await configBtn.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, '06-catalogo-configurar.png') });
      // Activar promoción desde Configurar → verificar toast + estado
      const promoItem = page.getByRole('menuitemcheckbox', { name: 'En promoción' }).first();
      if (await promoItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await promoItem.click();
        await page.waitForTimeout(1800);
        await page.screenshot({ path: path.join(OUT, '06b-catalogo-promo-on.png') });
        // Revertir para dejar el dato como estaba
        await promoItem.click().catch(() => {});
        await page.waitForTimeout(1500);
        await page.keyboard.press('Escape');
      } else {
        await page.keyboard.press('Escape');
      }
    }
    const previewBtn = page.locator('button:has-text("Vista previa")').first();
    if (await previewBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await previewBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '07-vista-previa.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
    // Selección múltiple → barra masiva
    const selectFirst = page.locator('button[aria-label^="Seleccionar"]').first();
    if (await selectFirst.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectFirst.click();
      const selectSecond = page.locator('button[aria-label^="Seleccionar"]').nth(1);
      if (await selectSecond.isVisible().catch(() => false)) { await selectSecond.click().catch(() => {}); }
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, '07b-seleccion-masiva.png') });
    }
  } else {
    console.log('   ⚠️ tab Catálogo no visible');
  }

  await browser.close();

  console.log('5) Móvil (390×844)...');
  const b2 = await chromium.launch({ executablePath: EXE });
  const m = await b2.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(m);
  await m.goto(BASE + '/?view=inventory', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForTimeout(7000);
  const gridBtnM = m.locator('button[aria-label="Vista de cuadrícula"]').first();
  if (await gridBtnM.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gridBtnM.click().catch(() => {});
    await m.waitForTimeout(2000);
  }
  await m.screenshot({ path: path.join(OUT, '08-movil-inventario.png') });
  const kebabM = m.locator('button[aria-label^="Más acciones de"]').first();
  if (await kebabM.isVisible({ timeout: 4000 }).catch(() => false)) {
    await kebabM.click();
    await m.waitForTimeout(900);
    await m.screenshot({ path: path.join(OUT, '09-movil-menu.png') });
    await m.keyboard.press('Escape');
  }
  await m.goto(BASE + '/?view=management-hub', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForTimeout(5000);
  const catalogTabM = m.getByRole('tab', { name: 'Catálogo' }).first();
  if (await catalogTabM.isVisible({ timeout: 5000 }).catch(() => false)) {
    await catalogTabM.click();
    await m.waitForTimeout(4000);
    await m.screenshot({ path: path.join(OUT, '10-movil-catalogo.png') });
  }
  await b2.close();

  console.log('OK — capturas en', OUT);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
