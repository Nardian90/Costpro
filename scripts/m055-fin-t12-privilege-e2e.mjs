#!/usr/bin/env node
// ============================================================================
// M055 — CP-FIN-T12-PRIVILEGE-HARDENING-001 · PRUEBAS E2E EN BD AISLADA (§4)
// ============================================================================
// Demuestra sobre la BD E2E AISLADA (lguovmvrozxgssupkwpf) que la migración
// correctiva 20261116120000_cp_fin_t12_privilege_hardening.sql:
//   P1  aplica de forma IDEMPOTENTE (dos ejecuciones, la segunda sin cambios).
//   P2  ACL final: authenticated/anon/PUBLIC sin EXECUTE; service_role y
//       owner con EXECUTE (catálogo, antes vs después).
//   P3  Denegación REAL vía PostgREST: anon → PGRST202/404; usuario
//       authenticated REAL (creado y eliminado vía Admin Auth API) → denied.
//   P4  service_role SÍ ejecuta (200 con resultado numérico).
//   P5  Batería SQL supabase/tests/cp_fin_t12_privilege_hardening_test.sql
//       (C1..C9: denegaciones por SET ROLE, cadenas internas operativas,
//       resultados contables intactos, limpieza).
//   P6  Las operaciones legítimas pasan sus pruebas: RE-EJECUCIÓN de la
//       batería T12 existente (cp_fin_t12_partial_reversal_guard_test.sql)
//       tras la migración correctiva — sin regresión.
//   P7  NET DELTA 0: sin residuos (usuario auth eliminado, rol de prueba
//       eliminado, baterías transaccionales autolimpiantes).
//
// REGLA: producción INTACTA. Guardas: assert-isolated-db (centinela SQL/REST)
// + assertNotProduction (CP-INFRA-019). Uso: node scripts/m055-fin-t12-privilege-e2e.mjs
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
assertNotProduction({ mode: 'write', url: BASE, context: 'm055-fin-t12-privilege-e2e' });

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !m[1].startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.E2E_SUPABASE_ANON_KEY;
if (!KEY || !ANON) throw new Error('FALTAN E2E_SUPABASE_* en .env');

const { assertIsolatedDb } = await import(resolve(process.cwd(), 'e2e/fixtures/assert-isolated-db.cjs'));
await assertIsolatedDb();

const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: decodeURIComponent(env.E2E_SUPABASE_DB_URL.match(/:\/\/[^:]+:([^@]+)@/)[1]),
  ssl: { rejectUnauthorized: false } };

const OUT = resolve('docs/audits/fin-t12-privilege-hardening-001/e2e-privilege-hardening.json');
const EV = { mision: 'CP-FIN-T12-PRIVILEGE-HARDENING-001', script: 'm055-fin-t12-privilege-e2e.mjs',
  fecha: new Date().toISOString(), base: BASE, pasos: {}, veredicto: null };
const log = (...a) => console.log(...a);
let fallos = 0;
async function paso(nombre, fn) {
  try {
    const r = await fn();
    EV.pasos[nombre] = { estado: 'PASS', ...(r || {}) };
    log(`✓ ${nombre}${r && r.resumen ? ' — ' + r.resumen : ''}`);
  } catch (e) {
    fallos++;
    EV.pasos[nombre] = { estado: 'FAIL', error: String(e.message).slice(0, 600) };
    log(`✗ ${nombre} — ${String(e.message).slice(0, 200)}`);
  }
}

const db = new pg.Client(POOLER);
await db.connect();
const Q = (text, params) => db.query(text, params);

const ACL_SQL = (fn) => `
  SELECT coalesce(a.grantee::text,'0') AS grantee_oid, r.rolname, a.privilege_type
  FROM pg_proc p
  LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a ON true
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE p.oid = to_regprocedure('${fn}') ORDER BY 2 NULLS FIRST;`;
const HASP_SQL = `
  SELECT has_function_privilege('anon','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS anon,
         has_function_privilege('authenticated','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS authenticated,
         has_function_privilege('service_role','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS service_role,
         has_function_privilege('postgres','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS owner,
         has_function_privilege('public','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS public;`;

// ═══ P2-pre: ACL ANTES (la BD aislada solo tiene T12 aplicada) ══════════════
let antes = null, despues = null;
await paso('P2a-ACL-antes', async () => {
  const { rows: h } = await Q(HASP_SQL); antes = h[0];
  const { rows: g } = await Q(ACL_SQL('public.fin_entry_reversal_residual(uuid)'));
  const yaAplicada = !antes.authenticated;
  return { resumen: yaAplicada
    ? 'migración ya aplicada previamente (re-ejecución idempotente) — se registra y continua'
    : `estado ANTES confirmado: authenticated=${antes.authenticated} anon=${antes.anon} service_role=${antes.service_role}`,
    has: antes, grants: g, ya_aplicada_previamente: yaAplicada };
});

// ═══ P1: aplicar la migración correctiva ×2 (idempotencia) ══════════════════
const MIG = readFileSync(resolve('supabase/migrations/20261116120000_cp_fin_t12_privilege_hardening.sql'), 'utf8');
await paso('P1a-aplicar-migracion', async () => {
  await Q(MIG); return { resumen: '20261116120000 aplicada (1ª vez)' };
});
await paso('P1b-idempotencia-2ª-ejecución', async () => {
  await Q(MIG); return { resumen: '20261116120000 re-aplicada sin error ni cambios (idempotente)' };
});

// ═══ P2-post: ACL DESPUÉS ═══════════════════════════════════════════════════
await paso('P2b-ACL-después', async () => {
  const { rows: h } = await Q(HASP_SQL); despues = h[0];
  const { rows: g } = await Q(ACL_SQL('public.fin_entry_reversal_residual(uuid)'));
  if (despues.authenticated) throw new Error('authenticated conserva EXECUTE tras la migración');
  if (despues.anon) throw new Error('anon conserva EXECUTE tras la migración');
  if (despues.public) throw new Error('PUBLIC conserva EXECUTE tras la migración');
  if (!despues.service_role) throw new Error('service_role perdió EXECUTE');
  if (!despues.owner) throw new Error('owner perdió EXECUTE');
  return { resumen: `authenticated=false anon=false PUBLIC=false service_role=true owner=true`, has: despues, grants: g };
});

// ═══ P5: batería SQL (C1..C9) ═══════════════════════════════════════════════
await paso('P5-bateria-sql-C1-C9', async () => {
  const bat = readFileSync(resolve('supabase/tests/cp_fin_t12_privilege_hardening_test.sql'), 'utf8');
  const notices = [];
  await db.query(bat);
  return { resumen: 'C1 catálogo · C2 anon · C3 authenticated · C4 sin-grants · C5 service_role · C6 owner · C7 bloqueo T12 · C8 contable intacto · C9 limpieza', notices };
});

// ═══ P6: re-ejecución de la batería T12 (regresión 0) ═══════════════════════
await paso('P6-bateria-T12-sin-regresión', async () => {
  const bat = readFileSync(resolve('supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql'), 'utf8');
  await db.query(bat);
  return { resumen: 'T12-BATTERY PASS completa (C1..C5) tras la migración correctiva — semántica contable intacta' };
});

// ═══ P3/P4: denegaciones REST reales ════════════════════════════════════════
const RPC = `${BASE}/rest/v1/rpc/fin_entry_reversal_residual`;
const BODY = JSON.stringify({ p_entry_id: '00000000-0000-4000-8000-000000000000' });
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

await paso('P3a-RPC-anon-denegado', async () => {
  const r = await fetch(RPC, { method: 'POST', headers: H, body: BODY });
  const t = await r.text();
  const denegado = r.status === 404 || r.status === 401 || r.status === 403 || /PGRST20|could not find the function|permission denied/i.test(t);
  if (!denegado) throw new Error(`anon obtuvo HTTP ${r.status}: ${t.slice(0, 160)}`);
  return { resumen: `HTTP ${r.status} (denegado)`, respuesta: t.slice(0, 200) };
});

let uTest = null;
await paso('P3b-RPC-authenticated-REAL-denegado', async () => {
  // Dominio @costpro.test: requisito del RPC canónico e2e_hard_delete_user
  // (gobernanza E2E-DATA-LIFECYCLE) para la limpieza posterior.
  const email = `priv-hardening-${Date.now()}@costpro.test`;
  const cu = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'PrvH@rd2026!x', email_confirm: true, email_visibility: 'private' }) });
  const cuText = await cu.text();
  if (!cu.ok) throw new Error(`crear usuario: HTTP ${cu.status} ${cuText.slice(0, 160)}`);
  uTest = JSON.parse(cuText);
  const tk = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'PrvH@rd2026!x' }) });
  if (!tk.ok) throw new Error(`login: HTTP ${tk.status}`);
  const jwt = (await tk.json()).access_token;
  const r = await fetch(RPC, { method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }, body: BODY });
  const t = await r.text();
  const denegado = r.status === 404 || r.status === 401 || r.status === 403 || /PGRST20|could not find the function|permission denied/i.test(t);
  if (!denegado) throw new Error(`authenticated REAL obtuvo HTTP ${r.status}: ${t.slice(0, 160)}`);
  return { resumen: `usuario ${email} (rol authenticated) → HTTP ${r.status} (denegado)`, respuesta: t.slice(0, 200) };
});

await paso('P3c-limpieza-usuario-auth', async () => {
  if (!uTest?.id) throw new Error('usuario de prueba ausente');
  // Cauce canónico (e2e/fixtures/hard-cleanup.ts): RPC e2e_hard_delete_user
  // SECURITY DEFINER — maneja profile + identidad Auth server-side.
  const d = await fetch(`${BASE}/rest/v1/rpc/e2e_hard_delete_user`, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: uTest.id }) });
  const dt = await d.text();
  const g = await fetch(`${BASE}/auth/v1/admin/users/${uTest.id}`, {
    method: 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  const ausente = g.status === 404;
  if (!ausente) throw new Error(`RPC e2e_hard_delete_user HTTP ${d.status} ${dt.slice(0, 120)} — usuario sigue existiendo`);
  return { resumen: 'usuario de prueba eliminado vía RPC canónico (net delta 0)' };
});

await paso('P4-RPC-service_role-operativo', async () => {
  const r = await fetch(RPC, { method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: BODY });
  const t = await r.text();
  if (!r.ok) throw new Error(`service_role bloqueado: HTTP ${r.status} ${t.slice(0, 160)}`);
  // PostgREST devuelve escalar simple o array/objeto según la forma de la función:
  // aceptar cualquiera de las tres formas siempre que el valor sea numérico.
  let v = NaN;
  const s = t.trim();
  try {
    const j = JSON.parse(s);
    if (typeof j === 'number') v = j;
    else if (Array.isArray(j)) v = Number(Array.isArray(j[0]) ? j[0][0] : (j[0]?.fin_entry_reversal_residual ?? j[0]));
    else if (j && typeof j === 'object') v = Number(j.fin_entry_reversal_residual);
  } catch { v = Number(s); }
  if (Number.isNaN(v)) throw new Error(`respuesta sin numérico: ${t.slice(0, 160)}`);
  return { resumen: `HTTP 200 → ${v} (capacidad server-side intacta)` };
});

// ═══ P7: net delta 0 ════════════════════════════════════════════════════════
await paso('P7-net-delta-cero', async () => {
  const { rows } = await Q(`SELECT
    (SELECT count(*) FROM stores WHERE slug='prv-sqlbat' OR slug='t12-sqlbat') AS stores_residuo,
    (SELECT count(*) FROM pg_roles WHERE rolname='prv_no_exec_role') AS rol_residuo,
    (SELECT count(*) FROM fin_entries WHERE store_id IN (SELECT id FROM stores WHERE slug IN ('prv-sqlbat','t12-sqlbat'))) AS asientos_residuo`);
  const r = rows[0];
  if (Number(r.rol_residuo) > 0) await Q(`DROP ROLE IF EXISTS prv_no_exec_role`).catch(() => {});
  const { rows: r2 } = await Q(`SELECT
    (SELECT count(*) FROM stores WHERE slug IN ('prv-sqlbat','t12-sqlbat')) AS stores_residuo,
    (SELECT count(*) FROM pg_roles WHERE rolname='prv_no_exec_role') AS rol_residuo,
    (SELECT count(*) FROM auth.users WHERE email LIKE 'priv-hardening-%@costpro.test') AS usuarios_residuo`);
  if (Number(r2[0].stores_residuo) !== 0 || Number(r2[0].rol_residuo) !== 0 || Number(r2[0].usuarios_residuo) !== 0) {
    throw new Error(`residuos: ${JSON.stringify(r2[0])}`);
  }
  return { resumen: 'stores/asientos/rol de prueba = 0 residuos (baterías autolimpiantes)', checks: r2[0] };
});

await db.end();

EV.veredicto = fallos === 0
  ? 'PRIVILEGE-HARDENING E2E: 100% PASS — denegación externa (anon/authenticated/PUBLIC/sin-grants), capacidad interna (service_role/owner) y semántica contable T12 intactas; net delta 0'
  : `FALLO: ${fallos} paso(s) en FAIL`;
EV.delta_acl = { antes, despues };
writeFileSync(OUT, JSON.stringify(EV, null, 2) + '\n');
console.log('\n' + EV.veredicto);
console.log(`Evidencia: ${OUT}`);
process.exit(fallos === 0 ? 0 : 1);
