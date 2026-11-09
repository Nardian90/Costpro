// ree-probe-payload.mjs — sonda: vuelca sales_by_user y sales_rows del reporte
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'qa-correcciones@costpro-e2e.dev';
const PASSWORD = 'CpE2E-Ree2026!9';
const payloads = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU' });
const page = await ctx.newPage();
page.on('response', async res => {
  if (res.url().includes('/api/cash-report?')) {
    payloads.push({ url: res.url(), body: await res.json().catch(() => null) });
  }
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (const t of ['Iniciar sesión', 'Iniciar Sesión', 'Entrar', 'Acceder']) {
  const btn = page.getByText(t, { exact: false }).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break; }
}
await page.waitForTimeout(1500);
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(7000);
await page.getByText('OPERACIÓN', { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.getByText('Ventas', { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByText('Reporte Entrega', { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.locator('#cr-sd').fill('2026-09-01');
await page.locator('#cr-ed').fill('2026-10-31');
await page.getByRole('button', { name: /Generar reporte/ }).first().click();
await page.waitForTimeout(7000);

const p = payloads.at(-1);
if (!p) { console.log('SIN PAYLOAD'); process.exit(1); }
console.log('URL:', p.url);
const rows = (p.body?.sales_rows || []).map(r => ({
  id: r.id?.slice(0, 13), seller: r.seller_id?.slice(0, 8), src: r.source,
  buckets: (r.buckets || []).map(b => `${b.method}/${b.currency}=${b.amount}(cup ${b.amount_cup})`),
}));
console.log('sales_by_user:', JSON.stringify(p.body?.sales_by_user));
console.log('total_cup universo:', p.body?.sales_by_user_total_cup);
console.log('sales_rows:', JSON.stringify(rows, null, 1));
console.log('sales_split:', JSON.stringify(p.body?.sales_split));
fs.writeFileSync('/home/z/my-project/scripts/ree-probe-payload-out.json', JSON.stringify(p.body, null, 1));
await browser.close();
