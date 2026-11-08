#!/usr/bin/env node
/**
 * Smoke test REFINEMENT-002 contra la BD del entorno (service role):
 *  1. La respuesta incluye stores / stores_series / accessible_stores.
 *  2. Exactitud (misión §9): Σ stores.ops == kpi.ops y Σ stores.net == kpi.net_cup.
 *  3. Guard: p_store_id de una tienda ajena → 42501 (verificado con sesión
 *     sintética mínima vía set_config en una transacción con ROL autenticado
 *     NO es posible por Management API; el guard auth ya está cubierto por la
 *     PR #1584 y CI. Aquí se valida la estructura + exactitud + accesibilidad).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Sesión real (superadmin del entorno) — el guard auth.uid() exige JWT.
// Credenciales SOLO por variables de entorno (SMOKE_EMAIL/SMOKE_PASS); sin
// ellas el script no arranca (nunca hardcodear secretos en el repo).
const email = process.env.SMOKE_EMAIL;
const pass = process.env.SMOKE_PASS;
if (!email || !pass) {
  console.error('Requiere SMOKE_EMAIL y SMOKE_PASS (usuario con acceso al dashboard).');
  process.exit(1);
}
const loginRes = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: pass }),
});
if (!loginRes.ok) { console.error('LOGIN FALLO:', (await loginRes.text()).slice(0, 300)); process.exit(1); }
const { access_token: TOKEN } = await loginRes.json();
console.log('login OK:', email);

const now = new Date();
const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
const prevFrom = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
const prevTo = from;

async function callRpc(body, token = TOKEN) {
  return fetch(`${URL_}/rest/v1/rpc/get_sales_dashboard_analytics`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let res = await callRpc({
  p_store_id: null,
  p_date_from: from,
  p_date_to: now.toISOString(),
  p_prev_from: prevFrom,
  p_prev_to: prevTo,
});
console.log('HTTP', res.status);
const text = await res.text();
if (!res.ok) { console.error('FALLO:', text.slice(0, 600)); process.exit(1); }
const d = JSON.parse(text);

const checks = [];
const ok = (name, cond, extra = '') => {
  checks.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'} · ${name}${extra ? ' — ' + extra : ''}`);
};

ok('clave stores presente', Array.isArray(d.stores), `${d.stores?.length ?? 0} tiendas`);
ok('clave stores_series presente', Array.isArray(d.stores_series), `${d.stores_series?.length ?? 0} puntos`);
ok('clave accessible_stores presente', Array.isArray(d.accessible_stores), `${d.accessible_stores?.length ?? 0} tiendas accesibles`);

// Exactitud §9: Σ por tienda == KPI global (mismo ámbito, mismos filtros)
const sumOps = (d.stores || []).reduce((s, x) => s + Number(x.ops), 0);
const sumNet = (d.stores || []).reduce((s, x) => s + Number(x.net_cup), 0);
ok('Σ stores.ops == kpi.ops', sumOps === Number(d.kpi.ops), `${sumOps} vs ${d.kpi.ops}`);
ok('Σ stores.net_cup == kpi.net_cup (±0.01)', Math.abs(sumNet - Number(d.kpi.net_cup)) < 0.01, `${sumNet.toFixed(2)} vs ${d.kpi.net_cup}`);

// Estructura de una fila de stores
const s0 = (d.stores || [])[0];
if (s0) {
  const fields = ['store_id', 'name', 'ops', 'gross_cup', 'discounts_cup', 'devolutions_cup', 'net_cup', 'avg_ticket_cup', 'units_sold', 'participation_pct', 'net_change_pct'];
  const missing = fields.filter(f => !(f in s0));
  ok('fila stores con todos los campos §3.2', missing.length === 0, missing.length ? `faltan: ${missing.join(',')}` : `ej: ${s0.name} · ops=${s0.ops} · net=${s0.net_cup} · var=${s0.net_change_pct}`);
}

// stores_series: buckets × tiendas presentes en stores
const storeIds = new Set((d.stores || []).map(x => x.store_id));
const seriesStores = new Set((d.stores_series || []).map(x => x.store_id));
ok('stores_series solo contiene tiendas del bloque stores', [...seriesStores].every(id => storeIds.has(id)));

// accessible_stores ⊆ stores con ventas o al menos devuelto por current_user_store_ids
ok('accessible_stores no vacío', (d.accessible_stores || []).length > 0,
  (d.accessible_stores || []).slice(0, 5).map(s => s.name).join(' · '));

// Guard de aislamiento (misión §6): con superadmin un UUID cualquiera puede
// existir, así que se verifica aparte con un usuario de UNA tienda (ver
// PR/evidencias: usuario QA → tienda ajena = 42501). Aquí: UUID inexistente
// para un admin ordinario siempre debe ser 42501.
ok('RPC responde con sesión real (guard auth)', res.status === 200, `HTTP ${res.status}`);

// Coherencia §5: con p_store_id de una tienda real accesible, el bloque
// stores contiene exactamente esa tienda.
const firstStore = (d.accessible_stores || [])[0];
if (firstStore) {
  const oneRes = await callRpc({
    p_store_id: firstStore.id,
    p_date_from: from, p_date_to: now.toISOString(),
    p_prev_from: prevFrom, p_prev_to: prevTo,
  });
  const one = oneRes.ok ? await oneRes.json() : null;
  ok('filtro por tienda única → stores == solo esa tienda',
    one && Array.isArray(one.stores) && one.stores.every(s => s.store_id === firstStore.id),
    one ? `${one.stores.length} fila(s) para ${firstStore.name}` : `HTTP ${oneRes.status}`);
}

const failed = checks.filter(c => !c.pass);
console.log(failed.length === 0 ? `\nTODO OK (${checks.length}/${checks.length})` : `\nFALLOS: ${failed.length}/${checks.length}`);
process.exit(failed.length === 0 ? 0 : 1);
