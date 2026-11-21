// CP-LOG-001 — Test RPC como usuario real (vía token de sesión del navegador).
// Reproduce lo que ve un usuario autenticado (RLS + auth.uid()) en cada tienda.
// SOLO LECTURA.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'admin@costpro.com';
const PASSWORD = process.env.COSTPRO_E2E_PASSWORD || 'Costpro-Mision14-15Oct-2026!';

const STORES = {
  'ENERVIDA-VITALLCONS': '5e6fe821-5465-48b1-b3f1-3aa3182edc38',
  'FERROCARRIL VITALLCONS': '8eb56fa3-7e22-408e-a44b-8f14cdd7f52f',
  'PUERTO PADRE': '899d2503-d000-41d2-89f0-0827f4ac37ab',
  'SHADDAI': 'bc94e3d0-32c3-4f2f-8e42-d46a341f9451',
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, timezoneId: 'America/Havana', locale: 'es-CU' });
const page = await ctx.newPage();

try {
  await page.goto(`${BASE}/?login=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  const cookieBtn = page.getByRole('button', { name: /aceptar|accept/i }).first();
  try { await cookieBtn.click({ timeout: 2500 }); } catch {}
  await page.locator('button[type="submit"], button:has-text("Iniciar")').first().click();
  await page.waitForTimeout(6000);

  // Extraer token de sesión
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('auth-token')) {
        try { return JSON.parse(localStorage.getItem(k)).access_token; } catch { return localStorage.getItem(k); }
      }
    }
    return null;
  });
  if (!token) throw new Error('No se encontró token de sesión');
  console.log('Token de sesión obtenido OK\n');

  const SUPA_URL = 'https://wthkddeleylijmonclxg.supabase.co';
  const rpc = async (fn, body) => {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'apikey': 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      return { error: `${r.status}: ${t.slice(0, 200)}` };
    }
    return { data: await r.json() };
  };

  for (const [name, id] of Object.entries(STORES)) {
    console.log(`════ ${name} ════`);
    const pos = await rpc('get_products_for_pos', { p_store_id: id, p_search_term: '', p_category: '' });
    if (pos.error) console.log(`  get_products_for_pos: ERROR ${pos.error}`);
    else {
      const rows = pos.data || [];
      const withStock = rows.filter(p => (p.stock_current ?? 0) > 0 || p.operational_class === 'service');
      console.log(`  get_products_for_pos: ${rows.length} filas | visibles con filtro default (stock>0 o service): ${withStock.length}`);
    }
    const rec = await rpc('get_products_for_reception', { p_store_id: id, p_search_term: '', p_page: 1, p_page_size: 24 });
    if (rec.error) console.log(`  get_products_for_reception: ERROR ${rec.error}`);
    else console.log(`  get_products_for_reception: ${rec.data.length} filas (total=${rec.data[0]?.total_count ?? '?'})`);
    const cat = await rpc('get_paginated_products_v2', { p_limit: 5, p_offset: 0, p_store_id: id, p_search_term: '', p_category: null, p_include_master: true });
    if (cat.error) console.log(`  get_paginated_products_v2 (catálogo): ERROR ${cat.error}`);
    else {
      const rows = cat.data || [];
      const masterRows = rows.filter(r => r.source === 'master');
      console.log(`  get_paginated_products_v2 (catálogo): ${rows.length} filas muestra (master=${masterRows.length})`);
    }
    console.log('');
  }
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await browser.close();
}
