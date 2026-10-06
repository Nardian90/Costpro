#!/usr/bin/env node
/**
 * landing-demo-cleanup.cjs — Elimina el estado demo del landing (FASE 16:
 * sin residuos). Usa los RPC de hard-cleanup del E2E (e2e_hard_delete_store /
 * e2e_hard_delete_user — migraciones del hygiene PR #1365) + tenant si vacío.
 * Patrón: e2e/fixtures/hard-cleanup.ts.
 */
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CTX = path.join(__dirname, '..', '.e2e-run-contexts', 'landing-demo-context.json');

function authHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  const body = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, body };
}

(async () => {
  if (!fs.existsSync(CTX)) {
    console.log('• no hay contexto demo (ya limpiado)');
    return;
  }
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));

  // 1) hard-delete de cada store demo (RPC del hard-cleanup E2E)
  for (const [slug, storeId] of Object.entries(ctx.stores || {})) {
    const del = await rpc('e2e_hard_delete_store', { p_store_id: storeId });
    console.log(`store ${slug}:`, del.ok ? 'HARD-DELETED' : `HTTP ${del.status} ${del.body.slice(0, 150)}`);
  }

  // 2) hard-delete del usuario demo (RPC — datos user-scoped + profile + Auth)
  const delUser = await rpc('e2e_hard_delete_user', { p_user_id: ctx.userId });
  console.log('usuario demo:', delUser.ok ? 'HARD-DELETED' : `HTTP ${delUser.status} ${delUser.body.slice(0, 150)}`);

  // 3) tenant si quedó vacío
  const profiles = await fetch(`${SUPABASE_URL}/rest/v1/profiles?tenant_id=eq.${ctx.tenantId}&select=id&limit=1`, { headers: authHeaders() });
  const storesLeft = await fetch(`${SUPABASE_URL}/rest/v1/stores?tenant_id=eq.${ctx.tenantId}&select=id&limit=1`, { headers: authHeaders() });
  const hasProfiles = (await profiles.json()).length > 0;
  const hasStores = (await storesLeft.json()).length > 0;
  if (!hasProfiles && !hasStores) {
    const delT = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${ctx.tenantId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    console.log('tenant demo:', delT.status === 204 ? 'DELETED (vacío)' : `HTTP ${delT.status}`);
  } else {
    console.log(`tenant demo: NO vacío (profiles=${hasProfiles}, stores=${hasStores}) — se conserva`);
  }

  fs.unlinkSync(CTX);
  console.log('\n=== DEMO LIMPIADO (net zero) ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
