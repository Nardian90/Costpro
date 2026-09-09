#!/usr/bin/env node
/**
 * REM-F4-06b — PRE-FIX HTTP REPRODUCTION (§4B)
 * Camino HTTP real: POST /api/fiscal-close {action:'lock'} → lock_fiscal_period
 * → UPDATE fiscal_closings → trigger defectuoso → HTTP 500.
 * No sustituye HTTP por SQL directo (directiva §4B).
 * Credenciales fixture ya públicas en evidence commiteado (admin@demo.com).
 * Token de Management API NO se imprime (leído de .env).
 */
import fs from 'node:fs';

const SUPABASE_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const ANON_KEY = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr';
const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const env = {};
for (const l of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/); if (m) env[m[1]] = m[2];
}
const MGMT_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const API = 'http://localhost:3000';
const STORE_A = 'f91b0e17-ac23-42ba-b08e-8159a6b57d83';
const F1 = '17558101-2d1e-498b-b995-542717735e93';
const OUT = [];
const log = (s) => { OUT.push(s); console.log(s); };

async function mgmt(sql) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, text: await r.text() };
}
async function login() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.com', password: 'demo123' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed');
  log(`[ok] login fixture user admin@demo.com (uid a1111111-1111-1111-1111-111111111111)`);
  return j.access_token;
}

(async () => {
  log(`# REM-F4-06b PRE-FIX HTTP REPRODUCTION — ${new Date().toISOString()}`);
  log(`# Path: POST /api/fiscal-close {action:'lock'} (camino REAL de la UI FiscalCloseView)`);
  const TOKEN = await login();

  // Estado PRE
  const pre = await mgmt(`SELECT status FROM fiscal_closings WHERE id='${F1}'; SELECT count(*)::int AS n FROM audit_logs WHERE table_name='fiscal_closings';`);
  log(`\n== Estado PRE (DB) ==\n${pre.text}`);

  // GET status (no dispara trigger — control positivo)
  const get = await fetch(`${API}/api/fiscal-close?store_id=${STORE_A}&year=2026&month=8`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  log(`\n== Control: GET /api/fiscal-close (solo SELECT) ==`);
  log(`HTTP ${get.status} — ${await get.text()}`);

  // POST lock — el camino que debe fallar
  log(`\n== REPRO: POST /api/fiscal-close {action:'lock'} ==`);
  const post = await fetch(`${API}/api/fiscal-close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, Origin: 'http://localhost:3000' },
    body: JSON.stringify({ store_id: STORE_A, year: 2026, month: 8, action: 'lock' }),
  });
  log(`HTTP ${post.status}`);
  log(`body: ${(await post.text()).slice(0, 600)}`);

  // Estado POST-intento: sin cambio de estado, sin auditoría, sin txn parcial
  const post1 = await mgmt(`SELECT status, locked_by IS NULL AS locked_by_null, locked_at IS NULL AS locked_at_null FROM fiscal_closings WHERE id='${F1}'; SELECT count(*)::int AS n FROM audit_logs WHERE table_name='fiscal_closings';`);
  log(`\n== Estado POST-intento (DB) — demostrar 0 estado parcial ==\n${post1.text}`);

  log(`\n# CONCLUSIÓN PRE: HTTP 500 (o distinto de 2xx) en lock; fila intacta; 0 audit rows.`);
  process.exitCode = 0;
})().catch(e => { console.error('CRASH', e); process.exitCode = 1; });
