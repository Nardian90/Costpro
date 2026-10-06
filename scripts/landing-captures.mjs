#!/usr/bin/env node
/**
 * landing-captures.mjs — Capturas REALES de CostPro con estado demo controlado.
 * Patrón: scripts/help-captures.mjs (repo). Datos: landing.demo@costpro-e2e.com
 * (tiendas/productos/ventas ficticios — sin PII, FASE 2/16).
 * Salida PNG retina → conversión WebP aparte.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ctx = JSON.parse(fs.readFileSync(new URL('../.e2e-run-contexts/landing-demo-context.json', import.meta.url), 'utf8'));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = process.env.CAPTURES_OUT || 'test-results/landing-captures-png';
const EMAIL = ctx.email;
const PASS = ctx.password;
const STOREFRONT_SLUG = 'demo-habana';

const CAPTURES = [
  { name: 'dashboard', view: 'dashboard' },
  { name: 'selector-tiendas', view: 'dashboard', action: 'store-switcher' },
  { name: 'pos-terminal', view: 'pos', pre: 'open-shift' },
  { name: 'inventario-stock', view: 'inventory' },
  { name: 'caja-arqueo', view: 'cash', pre: 'open-shift' },
  { name: 'fichas-costo', view: 'cost-sheets' },
  { name: 'estructura-costo', view: 'estructura-costo' },
  { name: 'reportes', view: 'reports' },
  { name: 'historial-ventas', view: 'sales', action: 'month-filter' },
  { name: 'clientes-demo', view: 'customers' },
];

const PUBLIC_CAPTURES = [
  { name: 'tienda-publica', action: 'storefront' },
  { name: 'tienda-publica-productos', action: 'storefront-products' },
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

let shiftOpened = false;

async function openShift(page) {
  if (shiftOpened) return;
  try {
    await page.goto(`${BASE_URL}/?view=cash`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(4000);
    const openBtn = page.locator('button', { hasText: 'Abrir Turno' }).first();
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(1200);
      const confirmBtn = page.locator('button', { hasText: 'Sí, Abrir Turno' }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(3500);
        shiftOpened = true;
        console.log('  ✓ turno abierto');
      }
    } else {
      console.log('  • turno ya abierto o botón no visible');
      shiftOpened = true;
    }
  } catch (e) {
    console.log(`  ⚠ openShift: ${e.message}`);
  }
}

async function capture(page, cap) {
  if (cap.pre === 'open-shift') await openShift(page);
  await page.goto(`${BASE_URL}/?view=${cap.view}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await page.waitForTimeout(5000); // settle: skeletons, gráficos, fuentes

  if (cap.name === 'pos-terminal') {
    // Añadir productos al carrito para comunicar el flujo de venta real
    for (const prod of ['Arroz', 'Aceite', 'Café', 'Frijol']) {
      const card = page.locator(`[aria-label^="Agregar ${prod}"]`).first();
      if (await card.isVisible({ timeout: 1500 }).catch(() => false)) {
        await card.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    await page.waitForTimeout(1200);
    // Abrir el panel del carrito (totales + métodos de pago visibles)
    const cartBtn = page.locator('button', { hasText: 'CARRITO' }).first();
    if (await cartBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await cartBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

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
    if (!point) throw new Error('Pill de tienda no encontrado');
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(1800);
    // Filtrar SOLO las tiendas demo (el selector admin lista todas las stores
    // de la plataforma — sin filtro aparecerían nombres de tiendas reales)
    const search = page.getByPlaceholder(/Buscar sucursal/i).first();
    if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
      await search.fill('Sucursal');
      await page.waitForTimeout(1500);
    }
  } else if (cap.action === 'month-filter') {
    for (const label of ['Este mes', 'ESTE MES', 'Mes', 'MES']) {
      const btn = page.locator('button', { hasText: label }).first();
      if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(2500);
        break;
      }
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${cap.name}.png`) });
  console.log(`  ✓ ${cap.name}.png`);
}

async function capturePublic(page, cap) {
  await page.goto(`${BASE_URL}/tienda/${STOREFRONT_SLUG}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  // Disparar lazy-loads de imágenes y esperar el fade-in completo
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(2500);
  if (cap.action === 'storefront-products') {
    // Segundo encuadre: la grilla de productos ya visible en viewport
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(2500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(4500);
  if (cap.action === 'storefront-products') {
    // Mantener el scroll en la grilla para el encuadre de productos
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(OUT_DIR, `${cap.name}.png`) });
  console.log(`  ✓ ${cap.name}.png (anónimo)`);
}

async function main() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const targets = only.length ? CAPTURES.filter(c => only.includes(c.name)) : CAPTURES;
  const publicTargets = only.length ? PUBLIC_CAPTURES.filter(c => only.includes(c.name)) : PUBLIC_CAPTURES;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // contexto autenticado (demo)
  if (targets.length) {
    const authCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'America/Havana',
    });
    await authCtx.addInitScript(consentInitScript(), CONSENT_JSON);
    const page = await authCtx.newPage();
    if (!only.length || targets.length) {
      console.log('▸ login demo');
      await login(page);
    }
    for (const cap of targets) {
      console.log(`▸ ${cap.name}`);
      try { await capture(page, cap); } catch (e) { console.error(`  ✗ ${cap.name}: ${e.message}`); }
    }
  }

  // contexto anónimo (storefront público)
  if (publicTargets.length) {
    const anonCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'es-ES',
      timezoneId: 'America/Havana',
    });
    await anonCtx.addInitScript(consentInitScript(), CONSENT_JSON);
    const anonPage = await anonCtx.newPage();
    for (const cap of publicTargets) {
      console.log(`▸ ${cap.name} (anónimo)`);
      try { await capturePublic(anonPage, cap); } catch (e) { console.error(`  ✗ ${cap.name}: ${e.message}`); }
    }
  }

  await browser.close();
  console.log('\n=== CAPTURAS COMPLETAS ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
