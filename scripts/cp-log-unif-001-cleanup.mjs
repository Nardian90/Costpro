/**
 * cp-log-unif-001-cleanup.mjs — Limpieza autorizada de residuos del run E2E
 * CP-LOG-UNIFICATION-001 (BD aislada CostproE2E).
 *
 * Usar SOLO con .env.e2e-run activo (guard: ref lguovmvrozxgssupkwpf).
 * Re-ejecutable: elimina por patrón del run; si no hay residuos, no hace nada.
 *
 * Uso: node scripts/cp-log-unif-001-cleanup.mjs [--check]
 */
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db.cjs';

await assertIsolatedDb();

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const onlyCheck = process.argv.includes('--check');
const hdr = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const runMarker = process.env.E2E_RUN_MARKER || 'e2e20261121a8bce1';

// 1. Stores de test residuales (patrón del run o E2E STORE CPLOG)
const stores = await (await fetch(
  `${url}/rest/v1/stores?select=id,name&or=(name.ilike.*CPLOG*,name.ilike.*${runMarker}*)`,
  { headers: hdr },
)).json();

// 2. Profiles de usuarios del run (auth + profile)
const profiles = await (await fetch(
  `${url}/rest/v1/profiles?select=id,email&email=ilike.*${runMarker}*`,
  { headers: hdr },
)).json();

console.log(`[check] stores residuales: ${stores.length} · profiles residuales: ${profiles.length}`);
if (onlyCheck) process.exit(stores.length || profiles.length ? 1 : 0);

for (const s of stores) {
  const r = await fetch(`${url}/rest/v1/rpc/e2e_hard_delete_store`, {
    method: 'POST', headers: hdr, body: JSON.stringify({ p_store_id: s.id }),
  });
  console.log(`store ${s.name}: ${await r.text()}`);
}

for (const p of profiles) {
  // hardDeleteRunUser es TS — replicar su mínimo aquí: borrar profile + auth.
  const delProfile = await fetch(`${url}/rest/v1/profiles?id=eq.${p.id}`, { method: 'DELETE', headers: hdr });
  const authList = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=50`, { headers: hdr })).json();
  const authUser = (authList.users || []).find((u) => u.email === p.email);
  if (authUser) {
    const delAuth = await fetch(`${url}/auth/v1/admin/users/${authUser.id}`, { method: 'DELETE', headers: hdr });
    console.log(`user ${p.email}: profile ${delProfile.status} · auth ${delAuth.status}`);
  } else {
    console.log(`user ${p.email}: profile ${delProfile.status} · auth (ya inexistente)`);
  }
}
console.log('[cleanup] fin — re-ejecutar con --check para verificar net zero.');
