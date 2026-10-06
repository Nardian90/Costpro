#!/usr/bin/env node
/**
 * landing-captures-mobile.mjs — Capturas MÓVIL de CostPro (390x844 @2x).
 * FASE 10: versión mobile específica de cada pantalla para que el landing
 * móvil no muestre una captura de desktop ilegible. Estado demo controlado.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ctx = JSON.parse(fs.readFileSync(new URL('../.e2e-run-contexts/landing-demo-context.json', import.meta.url), 'utf8'));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = process.env.CAPTURES_OUT || 'test-results/landing-captures-mobile-png';
const EMAIL = ctx.email;
const PASS = ctx.password;

const CAPTURES = [
  { name: 'dashboard', view: 'dashboard' },
  { name: 'selector-tiendas', view: 'dashboard', action: 'store-switcher' },
  { name: 'pos-terminal', view: 'pos' },
  { name: 'inventario-stock', view: 'inventory' },
  { name: 'estructura-costo', view: 'estructura-costo' },
  { name: 'reportes', view: 'reports' },
  { name: 'tienda-publica', action: 'storefront' },
];

function consentInitScript() {
  return (v) => window.localStorage.setItem('costpro_cookie_consent', v);
}
const CONSENT_JSON = JSON.stringify({
  essential: true, analytics: false, functional: true, marketing: false,
  timestamp: new Date().toISOString(), version: '1.0',
});

async function login(page) {
  await page.goto(`${BASE_URL}/?login=1`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASS);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await page.locator('[aria-label="Cerrar sesión"]').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function capture(page, cap) {
  if (cap.action === 'storefront') {
    await page.goto(`${BASE_URL}/tienda/demo-habana`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(3000);
  } else {
    await page.goto(`${BASE_URL}/?view=${cap.view}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await page.waitForTimeout(4500);

    if (cap.action === 'store-switcher') {
      const point = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const t = btns.find(
          b => (b.offsetWidth || b.offsetHeight) && (b.textContent || '').includes('Sucursal Habana')
        );
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (point) {
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(1800);
        const search = page.getByPlaceholder(/Buscar sucursal/i).first();
        if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
          await search.fill('Sucursal');
          await page.waitForTimeout(1200);
        }
      } else {
        throw new Error('Pill de tienda no encontrado');
      }
    }
    if (cap.name === 'pos-terminal') {
      for (const prod of ['Arroz', 'Aceite', 'Café']) {
        const card = page.locator(`[aria-label^="Agregar ${prod}"]`).first();
        if (await card.isVisible({ timeout: 1500 }).catch(() => false)) {
          await card.click().catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      await page.waitForTimeout(1200);
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${cap.name}.png`) });
  console.log(`  ✓ ${cap.name}.png`);
}

async function main() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targets = only.length ? CAPTURES.filter(c => only.includes(c.name)) : CAPTURES;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  const authCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    timezoneId: 'America/Havana',
  });
  await authCtx.addInitScript(consentInitScript(), CONSENT_JSON);
  const page = await authCtx.newPage();
  console.log('▸ login demo (mobile)');
  await login(page);
  for (const cap of targets) {
    console.log(`▸ ${cap.name}`);
    try { await capture(page, cap); } catch (e) { console.error(`  ✗ ${cap.name}: ${e.message}`); }
  }
  await browser.close();
  console.log('\n=== CAPTURAS MÓVIL COMPLETAS ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
