#!/usr/bin/env node
/**
 * SEC-TS-08 — PROVISIONAMIENTO DEL ENTORNO PILOTO MULTI-TIENDA
 * ============================================================================
 * ⚠️  NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA DEL RESPONSABLE.
 *
 * Este script materializa las dos tiendas piloto dedicadas dentro del
 * proyecto Supabase ACTUAL (NO se crea ninguna BD ni proyecto nuevo):
 *
 *   PILOT STORE A  'E2E PILOT A CostPro'  (origen / venta / inventario / transferencia)
 *   PILOT STORE B  'E2E PILOT B CostPro'  (destino / venta / inventario / recepción)
 *
 * Características:
 *   - Usa el flujo REAL de negocio (POST /api/stores → RPC
 *     create_store_with_membership) contra el servidor local — no SQL directo;
 *   - Idempotente: si las tiendas ya existen (por nombre exacto), no crea nada;
 *   - El producto de referencia (E2E-PILOT-A/B-001) lo siembra pilot-env.ts
 *     en el primer global-setup (seed determinista idempotente);
 *   - NUNCA toca: TIENDA CENTRAL COSTPRO, Puerto Padre VITALLCONS,
 *     ENERVIDA-VITALLCONS, usuarios reales, memberships existentes.
 *
 * Prerrequisitos (en orden, ver SEC-TS-08 GATES 25-26):
 *   1. Servidor local corriendo (pm2) — http://localhost:3000
 *   2. .env con NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
 *   3. Autorización explícita del responsable para provisionar
 *
 * Después de provisionar (pasos del responsable, NO de este script):
 *   a) (Recomendado, P2) proteger GitHub Environment 'e2e':
 *        required reviewers + restricted branches (main / security/*)
 *   b) (Autorización explícita) configurar los 3 secrets en el environment;
 *   c) Primera corrida E2E REAL con suite pequeña controlada
 *      (p.ej. `npx playwright test e2e/flows/transfers-flow.spec.ts`).
 *
 * Uso:  node e2e/scripts/provision-pilot-env.cjs          (provisiona)
 *       node e2e/scripts/provision-pilot-env.cjs --check  (solo verifica, read-only)
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const repoRoot = path.join(__dirname, '..', '..');
loadEnvFile(path.join(repoRoot, '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const PILOT_A = { name: 'E2E PILOT A CostPro', slug: 'e2e_pilot_a_costpro', label: 'A (origen/venta/inventario/transferencia)' };
const PILOT_B = { name: 'E2E PILOT B CostPro', slug: 'e2e_pilot_b_costpro', label: 'B (destino/venta/inventario/recepción)' };

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@costpro.com';

function loadEnvFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* sin .env — fallará en la validación de prerrequisitos */ }
}

async function svcGet(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`SELECT falló: HTTP ${res.status}`);
  return res.json();
}

async function findStore(name) {
  const rows = await svcGet(`stores?name=eq.${encodeURIComponent(name)}&select=id,name,is_active,is_archived&limit=1`);
  return rows[0] || null;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login falló para ${email}: HTTP ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, userId: data.user.id };
}

async function createStoreViaApi(adminToken, def) {
  const res = await fetch(`${BASE_URL}/api/stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      name: def.name,
      address: 'Entorno Piloto E2E SEC-TS-08 (dedicado)',
      phone: '+5355550000',
      email: 'e2e-pilot@costpro.test',
      slug: def.slug,
      plantilla: 'construccion',
    }),
  });
  if (!res.ok) throw new Error(`createStore(${def.name}) falló: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  const id = json?.data?.store_id ?? json?.data?.id ?? json?.store_id;
  if (!id) throw new Error(`createStore(${def.name}): respuesta sin store_id`);
  return id;
}

async function confirmHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch { return false; }
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  console.log('SEC-TS-08 — Entorno Piloto Multi-Tienda (proyecto Supabase ACTUAL)\n');

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error('FALTAN NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env — abort.');
    process.exit(1);
  }
  console.log(`Supabase: ${SUPABASE_URL.replace(/(https:\/\/[a-z0-9]{4})[a-z0-9]*/, '$1***')}`);

  // Estado actual (read-only)
  const a = await findStore(PILOT_A.name);
  const b = await findStore(PILOT_B.name);
  console.log(`PILOT A '${PILOT_A.name}': ${a ? `EXISTE (${a.id}) activa=${a.is_active} archivada=${a.is_archived}` : 'NO EXISTE'}`);
  console.log(`PILOT B '${PILOT_B.name}': ${b ? `EXISTE (${b.id}) activa=${b.is_active} archivada=${b.is_archived}` : 'NO EXISTE'}`);

  if (checkOnly) { console.log('\n--check: verificación read-only terminada.'); return; }
  if (a && b) { console.log('\nEntorno ya provisionado — nada que hacer (idempotente).'); return; }

  if (!(await confirmHealthy())) {
    console.error(`Servidor ${BASE_URL} no responde /api/health — arranca pm2 antes de provisionar.`);
    process.exit(1);
  }

  // Confirmación interactiva (escritura sobre el Supabase real — autorización)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`\nSe crearán las tiendas piloto que falten (A y/o B) en el proyecto Supabase actual vía POST /api/stores (membership admin automática para ${ADMIN_EMAIL}). ¿Continuar? [escribe SI]: `, resolve);
  });
  rl.close();
  if (answer.trim() !== 'SI') { console.log('Abortado por el operador.'); process.exit(0); }

  const admin = await signIn(ADMIN_EMAIL, process.env.E2E_ADMIN_PASS || process.env.ADMIN_PASS || 'costpro123');
  if (!a) {
    const idA = await createStoreViaApi(admin.token, PILOT_A);
    console.log(`CREADA PILOT STORE A: ${idA} — ${PILOT_A.label}`);
  }
  if (!b) {
    const idB = await createStoreViaApi(admin.token, PILOT_B);
    console.log(`CREADA PILOT STORE B: ${idB} — ${PILOT_B.label}`);
  }

  // Verificación final
  const a2 = await findStore(PILOT_A.name);
  const b2 = await findStore(PILOT_B.name);
  console.log(`\nVerificación: A=${a2 ? a2.id : 'FALTA'} B=${b2 ? b2.id : 'FALTA'}`);
  console.log('El producto de referencia se sembrará automáticamente en el primer global-setup (pilot-env.ts).');
  console.log('Siguiente paso (responsable): proteger environment e2e → autorizar secrets → primera corrida controlada.');
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
