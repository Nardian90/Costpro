// MISIÓN 2026-10-22 · B5 — panel usable en resolución estrecha (móvil).
// En <lg el panel es hoja lateral (patrón del menú principal en móvil) con
// backdrop; el reporte queda debajo (visible al cerrar).
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/evidencia-mision-1022';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(4000);
await page.goto(`${BASE}/?view=cash_report`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: /Reporte de Caja — Entrega/i }).first().waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: /Configuración del reporte/i }).first().click();
await page.waitForTimeout(600);
const panel = page.locator('[data-testid="cash-report-config-panel"]');
const panelBox = await panel.boundingBox();
const position = await panel.evaluate((el) => getComputedStyle(el).position);
const backdropVisible = await page.locator('[data-testid="cash-report-config-backdrop"]').isVisible();
// Sin scroll horizontal accidental de toda la página (B5).
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
console.log(`panel: position=${position} width=${Math.round(panelBox?.width ?? 0)}px (viewport 390) backdrop=${backdropVisible} sin-scroll-horizontal=${noHScroll}`);
await page.screenshot({ path: `${OUT}/b5-panel-movil-390px.png`, fullPage: false });
// Cierre con el botón explícito también en móvil.
await page.locator('[data-testid="cash-report-config-close"]').first().click();
await page.waitForTimeout(500);
console.log(`cerrado: data-open=${await panel.getAttribute('data-open')} aria-hidden=${await panel.getAttribute('aria-hidden')}`);
await browser.close();
