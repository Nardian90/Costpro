// Captura de evidencia visual en la interfaz REAL: Reporte Entrega (16/10/2026)
// — pestaña Resultados + Vista previa PDF Diario (plantilla por defecto).
// SOLO navegación y descarga de PDF en el navegador: no crea operaciones.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261017-reporte-entrega-monedas-1610';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU', viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const cb = page.getByRole('button', { name: /aceptar todas/i }).first();
if (await cb.isVisible().catch(() => false)) { await cb.click().catch(() => {}); await page.waitForTimeout(800); }
for (const t of ['Entrar a COSTPRO', 'Iniciar sesión', 'Entrar']) {
  const b = page.getByText(t, { exact: false }).first();
  if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
}
await page.waitForTimeout(2000);
await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(8000);
console.log('[1] login ok');

// Navegación: OPERACIÓN → Ventas → Reporte Entrega
await page.getByText('OPERACIÓN', { exact: true }).first().click().catch(async () => {
  await page.getByRole('button', { name: /operación/i }).first().click();
});
await page.waitForTimeout(1200);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('cash-report-view').waitFor({ state: 'visible', timeout: 20000 });
console.log('[2] vista Reporte Entrega visible');

// Fechas 16/10 → 16/10 (inputs date)
const dateInputs = page.locator('input[type="date"]');
const n = await dateInputs.count();
console.log('[3] inputs date:', n);
await dateInputs.nth(0).fill('2026-10-16');
if (n > 1) await dateInputs.nth(1).fill('2026-10-16');
await page.getByRole('button', { name: /generar reporte/i }).first().click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/ui_resultados_1610.png`, fullPage: false });
console.log('[3] reporte generado (pestaña Resultados capturada)');

// Vista previa PDF (plantilla Diario por defecto)
const prevBtn = page.getByRole('button', { name: /vista previa|previsualizar/i }).first();
if (await prevBtn.isVisible().catch(() => false)) {
  await prevBtn.click();
  await page.waitForTimeout(9000); // builder + jsPDF + iframe
  await page.screenshot({ path: `${OUT}/ui_pdf_preview_1610_p1.png`, fullPage: false });
  // scroll del iframe/contenedor de vista previa si existe
  const frames = page.frames();
  for (const f of frames.slice(1)) {
    try { await f.mouse.wheel(0, 600); await page.waitForTimeout(1500); break; } catch {}
  }
  await page.screenshot({ path: `${OUT}/ui_pdf_preview_1610_p2.png`, fullPage: false });
  console.log('[4] vista previa PDF capturada');
} else {
  console.log('[4] botón vista previa no visible (se conserva captura de Resultados)');
}
await browser.close();
console.log('OK');
