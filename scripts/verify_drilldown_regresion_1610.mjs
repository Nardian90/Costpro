// Verificación extendida READ-ONLY: drill-down por moneda + regresión 15/10.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU' });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
// Aceptar cookies si aparece el banner (bloquea clicks)
const cookieBtn = page.getByRole('button', { name: /aceptar todas/i }).first();
if (await cookieBtn.isVisible().catch(() => false)) { await cookieBtn.click().catch(() => {}); await page.waitForTimeout(800); }
// Acceso: "Entrar a COSTPRO" / "Iniciar sesión"
for (const t of ['Entrar a COSTPRO', 'Iniciar sesión', 'Iniciar Sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(2000);
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().waitFor({ state: 'visible', timeout: 30000 });
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: 'audit-evidence/20261017-reporte-entrega-monedas-1610/post-login-verify.png', fullPage: false });

const lsDump = await page.evaluate(() => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => {
  const k = localStorage.key(i); return [k, localStorage.getItem(k)];
})));
const findToken = (obj) => {
  for (const v of Object.values(obj)) {
    try {
      const stack = [JSON.parse(v)];
      while (stack.length) {
        const cur = stack.pop();
        if (cur && typeof cur === 'object') for (const [kk, vv] of Object.entries(cur)) {
          if ((kk === 'token' || kk === 'accessToken' || kk === 'access_token') && typeof vv === 'string' && vv.length > 20) return vv;
          if (vv && typeof vv === 'object') stack.push(vv);
        }
      }
    } catch {}
  }
  return null;
};
const TOKEN = await (async () => {
  for (let a = 0; a < 15; a++) {
    const dump = await page.evaluate(() => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => {
      const k = localStorage.key(i); return [k, localStorage.getItem(k)];
    })));
    const t = findToken(dump);
    if (t) return t;
    await page.waitForTimeout(2000);
  }
  return null;
})();
if (!TOKEN) throw new Error('sin token');

const get = (u) => page.evaluate(async ({ u, token }) => {
  const r = await fetch(u, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
}, { u, token: TOKEN });

const S16 = '2026-10-16T04:00:00.000Z', E16 = '2026-10-17T03:59:59.999Z';
const S15 = '2026-10-15T04:00:00.000Z', E15 = '2026-10-16T03:59:59.999Z';

// ── Drill-down 16/10 ──
const ddUsd = await get(`/api/cash-report/details?type=sale&method=cash&currency=USD&start_date=${encodeURIComponent(S16)}&end_date=${encodeURIComponent(E16)}`);
console.log('=== DETAILS cash/USD 16/10 ===', ddUsd.status);
for (const r of ddUsd.body) console.log(JSON.stringify({ id: r.id?.slice(0, 8), total: r.total, total_amount: r.total_amount, sale_currency: r.sale_currency }));

const ddCup = await get(`/api/cash-report/details?type=sale&method=cash&currency=CUP&start_date=${encodeURIComponent(S16)}&end_date=${encodeURIComponent(E16)}`);
console.log('=== DETAILS cash/CUP 16/10 (', ddCup.body.length, 'rows) ===');
for (const r of ddCup.body) console.log(JSON.stringify({ id: r.id?.slice(0, 8), total: r.total, total_amount: r.total_amount }));

// ── Regresión 15/10 ──
const cr15 = await get(`/api/cash-report?start_date=${encodeURIComponent(S15)}&end_date=${encodeURIComponent(E15)}`);
console.log('=== CASH-REPORT 15/10 ===', cr15.status);
console.log('sales_split:', JSON.stringify(cr15.body.sales_split));
console.log('cash_balance_cup:', cr15.body.cash_balance_cup);
const its15 = await get(`/api/cash-report/items-summary?start_date=${encodeURIComponent(S15)}&end_date=${encodeURIComponent(E15)}`);
console.log('=== ITEMS-SUMMARY 15/10 ===');
for (const i of its15.body.items) console.log(JSON.stringify({ sku: i.sku, qty: i.total_quantity, cash_cup: i.cash_cup, transfer_cup: i.transfer_cup, usd: i.usd_total, total_cup: i.total_cup, inc: i.has_payment_incident }));
console.log('totals 15/10:', JSON.stringify({ qty: its15.body.total_quantity, cash: its15.body.cash_cup, transfer: its15.body.transfer_cup, usd: its15.body.usd_total, total_cup: its15.body.total_cup }));

fs.writeFileSync('audit-evidence/20261017-reporte-entrega-monedas-1610/verificacion_drilldown_regresion.json', JSON.stringify({ ddUsd: ddUsd.body, ddCupCount: ddCup.body.length, cr15: cr15.body, its15: its15.body }, null, 2));
console.log('Guardado evidence');
await browser.close();
