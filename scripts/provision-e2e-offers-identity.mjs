/**
 * CP-OFFERS-PUERTOPADRE-001 — Provisioning mínimo para reproducir el flujo
 * Ofertas en el proyecto aislado CostproE2E (ref lguovmvrozxgssupkwpf).
 *
 * Crea (vía Admin API + API real de la app):
 *   1. Usuario admin de prueba  e2e-offers-<slug>-adm@costpro.test
 *   2. Tienda "E2E OFERTAS PUERTOPADRE (TEST)" vía POST /api/stores (API real)
 *
 * Guard de aislamiento: assert-isolated-db.ts (fail-closed) antes de escribir.
 * Salida: /tmp/e2e-offers-identity.json (NO contiene la service key).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db';

loadEnv({ path: resolve(import.meta.dir, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = 'http://localhost:3000';

const SLUG = process.argv[2] || 'offers001';
const EMAIL = `e2e-${SLUG}-adm@costpro.test`;
const PASSWORD = `Ofertas!${randomBytes(4).toString('hex')}`;
const STORE_NAME = `E2E OFERTAS TEST ${SLUG.toUpperCase()}`;

async function main() {
  // 1. GUARD de aislamiento — fail-closed (nunca producción)
  const decision = await assertIsolatedDb();
  console.log(`[guard] destino validado: kind=${decision.kind} ref=${decision.ref}`);

  // 2. Crear usuario admin vía Admin API (email_confirm: true)
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'admin', roles: ['admin'] },
      user_metadata: { full_name: `E2E Ofertas ${SLUG}` },
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Creación de usuario falló: HTTP ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const userId = created.id;
  console.log(`[user] creado ${EMAIL} (${userId})`);

  // Esperar propagación del trigger on_auth_user_created (profiles)
  await new Promise(r => setTimeout(r, 2000));

  // 3a. Crear TENANT dedicado del run (patrón run-env.ts paso 3)
  const tenantRes = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=id`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify([{
      name: `E2E TENANT OFERTAS ${SLUG.toUpperCase()}`,
      owner_id: userId,
      plan: 'enterprise',
      subscription_status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    }]),
  });
  if (!tenantRes.ok) {
    throw new Error(`Creación de tenant falló: HTTP ${tenantRes.status} ${await tenantRes.text()}`);
  }
  const tenantRows = await tenantRes.json();
  const tenantId = tenantRows[0]?.id;
  console.log(`[tenant] creado ${tenantId}`);

  // 3b. Asegurar rol admin + tenant enterprise en profiles
  const patchProfile = async (patch) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    return res.status;
  };
  console.log(`[profile] rol/tenant → HTTP ${await patchProfile({ role: 'admin', plan: 'enterprise', tenant_id: tenantId })}`);

  // 4. Login (password grant) para obtener token de usuario
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Login falló: HTTP ${loginRes.status} ${await loginRes.text()}`);
  const session = await loginRes.json();

  // 5. Crear tienda vía API REAL de la app (POST /api/stores)
  const storeRes = await fetch(`${BASE_URL}/api/stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Origin: BASE_URL,
    },
    body: JSON.stringify({ name: STORE_NAME, create_flow: 'create-quick' }),
  });
  const storeBody = await storeRes.json().catch(() => ({}));
  console.log(`[store] POST /api/stores → HTTP ${storeRes.status}`);
  if (!storeRes.ok) {
    console.log(`[store] body: ${JSON.stringify(storeBody).slice(0, 500)}`);
    throw new Error('Creación de tienda falló');
  }
  const store = storeBody.data || storeBody.store || storeBody;
  console.log(`[store] creada: ${store.name} (${store.id})`);

  // 6. active_store del admin → tienda del test
  console.log(`[profile] active_store → HTTP ${await patchProfile({ active_store_id: store.id })}`);

  // 7. Guardar identidad (sin secretos de plataforma — solo credenciales del test)
  const fs = await import('fs');
  fs.writeFileSync('/tmp/e2e-offers-identity.json', JSON.stringify({
    runId: SLUG,
    email: EMAIL,
    password: PASSWORD,
    userId,
    storeId: store.id,
    storeName: store.name || STORE_NAME,
    token: session.access_token,
    supabaseUrl: SUPABASE_URL,
  }, null, 2));
  console.log('[identity] guardada en /tmp/e2e-offers-identity.json');
}

main().catch(e => { console.error(`[FATAL] ${e.message}`); process.exit(1); });
