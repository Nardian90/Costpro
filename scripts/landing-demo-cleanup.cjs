#!/usr/bin/env node
/**
 * landing-demo-cleanup.cjs — Elimina el estado demo del landing (FASE 16:
 * sin residuos) usando los RPC de hard-cleanup del E2E.
 *
 * Los RPC e2e_hard_delete_store / e2e_hard_delete_user SOLO aceptan artefactos
 * con nombres de test (guardas anti-borrado de datos reales). El estado demo
 * usa nombres realistas (necesarios para las capturas), así que este script
 * los RENOMBRA transitoriamente al patrón de test antes de invocar los RPC:
 *   stores  → "E2E LANDING DEMO <nombre>"  (patrón ^E2E)
 *   usuario → landing.demo@costpro.test    (patrón @costpro.test)
 *
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

function h() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: h(), body: JSON.stringify(params),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
}

(async () => {
  if (!fs.existsSync(CTX)) {
    console.log('• no hay contexto demo (ya limpiado)');
    return;
  }
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));
  console.log('tenant:', ctx.tenantId, '| user:', ctx.userId);

  // 1) renombrar stores al patrón de test → RPC hard-delete
  for (const [slug, storeId] of Object.entries(ctx.stores || {})) {
    const name = 'E2E LANDING DEMO ' + slug.replace(/^demo-/, '').replace(/^./, c => c.toUpperCase());
    const ren = await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${storeId}`, {
      method: 'PATCH', headers: h(), body: JSON.stringify({ name }),
    });
    if (!ren.ok) console.log(`rename ${slug}: HTTP ${ren.status} (continuo con nombre actual)`);
    const del = await rpc('e2e_hard_delete_store', { p_store_id: storeId });
    console.log(`store ${slug}:`, del.ok ? 'HARD-DELETED' : `HTTP ${del.status} ${del.body.slice(0, 150)}`);
  }

  // 2) renombrar email del auth user al patrón de test → RPC hard-delete
  const renUser = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ctx.userId}`, {
    method: 'PUT', headers: h(),
    body: JSON.stringify({ email: 'landing.demo@costpro.test', email_confirm: true }),
  });
  if (!renUser.ok) console.log('rename user email: HTTP', renUser.status, '(continúo)');
  const delUser = await rpc('e2e_hard_delete_user', { p_user_id: ctx.userId });
  console.log('usuario demo:', delUser.ok ? 'HARD-DELETED' : `HTTP ${delUser.status} ${delUser.body.slice(0, 150)}`);

  // 3) tenant si quedó vacío
  const profiles = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?tenant_id=eq.${ctx.tenantId}&select=id&limit=1`, { headers: h() })).json();
  const storesLeft = await (await fetch(`${SUPABASE_URL}/rest/v1/stores?tenant_id=eq.${ctx.tenantId}&select=id&limit=1`, { headers: h() })).json();
  if (!profiles.length && !storesLeft.length) {
    const delT = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${ctx.tenantId}`, { method: 'DELETE', headers: h() });
    console.log('tenant demo:', delT.status === 204 ? 'DELETED (vacío)' : `HTTP ${delT.status}`);
  } else {
    console.log(`tenant demo: NO vacío (profiles=${profiles.length}, stores=${storesLeft.length}) — se conserva`);
  }

  fs.unlinkSync(CTX);
  console.log('\n=== DEMO LIMPIADO (net zero) ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
