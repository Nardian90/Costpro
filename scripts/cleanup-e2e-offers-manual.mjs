/**
 * CP-OFFERS-PUERTOPADRE-001 — Limpieza de los artefactos de la reproducción
 * manual en CostproE2E (identificación por email/id EXACTO — nunca barridos).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db';

loadEnv({ path: resolve(import.meta.dir, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const MANUAL_EMAILS = [
  'e2e-offers001-adm@costpro.test',
  'e2e-offers002-adm@costpro.test',
  'e2e-offers-foreign@costpro.test',
];

async function svc(method, path, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function main() {
  await assertIsolatedDb(); // fail-closed: solo CostproE2E

  // 1. Buscar usuarios manuales por email EXACTO (auth.users)
  for (const email of MANUAL_EMAILS) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) { console.log(`[skip] ${email}: búsqueda HTTP ${res.status}`); continue; }
    const data = await res.json();
    const user = data.users?.[0];
    if (!user) { console.log(`[ok] ${email}: ya no existe`); continue; }

    // 2. Borrar sus ofertas y tiendas por created_by/owner EXACTO
    await svc('DELETE', `ofertas?created_by=eq.${user.id}`);
    const storesRes = await svc('GET', `stores?select=id&owner_id=eq.${user.id}`);
    const stores = await storesRes.json().catch(() => []);
    for (const s of (Array.isArray(stores) ? stores : [])) {
      await svc('DELETE', `ofertas?store_id=eq.${s.id}`);
      await svc('DELETE', `user_store_memberships?store_id=eq.${s.id}`);
      await svc('DELETE', `stores?id=eq.${s.id}`);
      console.log(`[store] ${s.id} eliminada`);
    }
    // 3. Tenants propios del usuario manual
    const tenantsRes = await svc('GET', `tenants?select=id&owner_id=eq.${user.id}`);
    const tenants = await tenantsRes.json().catch(() => []);
    for (const t of (Array.isArray(tenants) ? tenants : [])) {
      await svc('DELETE', `tenants?id=eq.${t.id}`);
      console.log(`[tenant] ${t.id} eliminado`);
    }
    // 4. Profile + auth user
    await svc('DELETE', `profiles?id=eq.${user.id}`);
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    console.log(`[user] ${email} → auth delete HTTP ${del.status}`);
  }
  console.log('[done] limpieza manual completada');
}

main().catch(e => { console.error(`[FATAL] ${e.message}`); process.exit(1); });
