// Reproducción READ-ONLY del incidente vía la API real del Reporte de Entrega.
// Solo GETs con la sesión real (login documentado en scripts/fasea_repro_reporte_entrega.mjs).
// NO crea operaciones, NO escribe nada.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = 'audit-evidence/20261017-reporte-entrega-monedas-1610';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';
// Ventana de negocio 16/10/2026 (America/Havana) — la misma que envía el frontend
const S = '2026-10-16T04:00:00.000Z';
const E = '2026-10-17T03:59:59.999Z';

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU' });
const page = await ctx.newPage();

console.log('[1] login…');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const t of ['Iniciar sesión', 'Iniciar Sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1500);
const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
await emailInput.waitFor({ state: 'visible', timeout: 30000 });
await emailInput.fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")').first().click();
await page.waitForTimeout(7000);
console.log('[1] login hecho →', page.url());
await page.screenshot({ path: `${OUT}/post-login.png`, fullPage: false });

// withAuth (SEC-024) exige Bearer token: extraerlo del store persistido
const lsDump = await page.evaluate(() => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => {
  const k = localStorage.key(i);
  return [k, localStorage.getItem(k)];
})));
fs.writeFileSync(`${OUT}/localStorage_keys.json`, JSON.stringify(Object.keys(lsDump), null, 2));
const findToken = (obj) => {
  for (const [k, v] of Object.entries(obj)) {
    try {
      const parsed = JSON.parse(v);
      const stack = [parsed];
      while (stack.length) {
        const cur = stack.pop();
        if (cur && typeof cur === 'object') {
          for (const [kk, vv] of Object.entries(cur)) {
            if ((kk === 'token' || kk === 'accessToken' || kk === 'access_token') && typeof vv === 'string' && vv.length > 20) return vv;
            if (vv && typeof vv === 'object') stack.push(vv);
          }
        }
      }
    } catch {}
  }
  return null;
};
const TOKEN = findToken(lsDump);
console.log('[1] token extraído:', TOKEN ? `${TOKEN.slice(0, 12)}…` : 'NO ENCONTRADO');
if (!TOKEN) throw new Error('Sin token de sesión: revisar login');

const results = {};
const endpoints = [
  ['cash-report', `/api/cash-report?start_date=${encodeURIComponent(S)}&end_date=${encodeURIComponent(E)}`],
  ['items-summary', `/api/cash-report/items-summary?start_date=${encodeURIComponent(S)}&end_date=${encodeURIComponent(E)}`],
  ['payment-totals', `/api/cash-report/payment-totals?start_date=${encodeURIComponent(S)}&end_date=${encodeURIComponent(E)}`],
];
for (const [name, url] of endpoints) {
  const data = await page.evaluate(async ({ u, token }) => {
    const r = await fetch(u, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  }, { u: url, token: TOKEN });
  results[name] = data;
  console.log(`\n=== ${name} → HTTP ${data.status} ===`);
  console.log(JSON.stringify(data.body, null, 1).slice(0, 3500));
}
fs.writeFileSync(process.env.REPRO_OUT || `${OUT}/reproduccion_api_antes.json`, JSON.stringify(results, null, 2));
console.log(`\nGuardado: ${process.env.REPRO_OUT || `${OUT}/reproduccion_api_antes.json`}`);
await browser.close();
