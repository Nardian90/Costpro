// ANTES (defecto original, main d401a67): overlay modal con velo oscuro.
// Se ejecuta con src/ en stash — captura cómo el reporte queda OSCURECIDO
// y BLOQUEADO (elementFromPoint sobre el periodo cae en el VELO, no en el
// reporte) al abrir «Configuración del reporte».
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/evidencia-mision-1022';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(4000);
await page.goto(`${BASE}/?view=cash_report`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: /Reporte de Caja — Entrega/i }).first().waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(2000);
const generar = page.getByRole('button', { name: /Generar reporte/i }).first();
if (await generar.count() > 0) { await generar.click(); await page.waitForTimeout(3500); }

// Panel cerrado (antes) — referencia visual.
await page.screenshot({ path: `${OUT}/antes-1-reporte-panel-cerrado.png` });

// ABRIR la configuración (implementación ANTES: overlay + velo).
await page.getByRole('button', { name: /Configuración del reporte/i }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/antes-2-configuracion-abierta-DEFECTO.png` });

// Prueba de interactividad: ¿el punto central del periodo del reporte cae en
// el reporte o en el VELO/backdrop? (En el defecto: el velo lo intercepta.)
const period = page.locator('#cr-sd').first();
const box = await period.boundingBox();
if (box) {
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return 'nada';
    const cls = String(el.className || '');
    if (cls.includes('backdrop-blur') || cls.includes('bg-background/70')) return 'VELO (bloquea el reporte)';
    if (el.closest('[data-testid="cash-report-config-panel"]')) return 'panel';
    if (el.closest('[data-testid="cash-report-view"]')) return 'reporte';
    return 'otro';
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  console.log(`ANTES · elementFromPoint sobre el periodo del reporte → ${hit}`);
  // Opacidad efectiva percibida del reporte bajo el velo (fondo oscuro 70%).
  const veil = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="cash-report-config-backdrop"]');
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  console.log(`ANTES · color del velo sobre el reporte: ${veil}`);
}
await browser.close();
