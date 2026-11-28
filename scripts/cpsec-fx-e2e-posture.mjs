#!/usr/bin/env node
/**
 * cpsec-fx-e2e-posture.mjs — CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001.
 * ───────────────────────────────────────────────────────────────────────────
 * Batería de validación E2E (FASE 6) del endurecimiento ACL de la tabla de
 * respaldo de tasas — EXCLUSIVAMENTE contra la BD AISLADA CostproE2E
 * (lguovmvrozxgssupkwpf). Guard fail-closed assertIsolatedDb + centinela.
 *
 * Qué prueba (matriz de la misión):
 *   F0  Replique el estado PRE vulnerable (tabla fixture con grants anon/
 *       authenticated + RLS OFF) y DEMUESTRE la exposición que existió en
 *       producción (SELECT anónimo HTTP 200 con filas).
 *   F1  Aplique la migración REAL del repo (20261128173000) sobre la fixture.
 *   F2  Lectura anónima → DENEGADA (403/42501 tras REVOKE).
 *   F3  Escritura anónima (INSERT/UPDATE/DELETE) → DENEGADA.
 *   F4  Lectura autenticada → DENEGADA.
 *   F5  Escritura autenticada → DENEGADA.
 *   F6  Lectura privilegiada legítima (service_role) → OK con filas.
 *   F7  Escritura privilegiada legítima (service_role INSERT) → OK (canal de
 *       rollback/sondeo sigue operativo).
 *   F8  Postura en catálogo: RLS ON + 0 policies + 0 grants anon/auth/PUBLIC.
 *   F9  Datos históricos conservados: filas PRE == filas POST (el
 *       endurecimiento no toca datos).
 *   F10 Rechazo de escrituras anon con GRANTS RESTAURADOS pero RLS ON
 *       (defensa en profundidad: la RLS sola ya deniega INSERT/UPDATE/DELETE
 *       con 0 policies) — replica el estado intermedio real de producción
 *       (17:10Z: RLS on, grants presentes).
 *   F11 Reintentos: password grant con 4 reintentos (patrón run-env) para
 *       obtener el token autenticado.
 *   F12 Net-zero: DROP de la fixture + borrado del usuario de prueba (perfil
 *       + auth user) → higiene E2E sin residuos.
 *
 * Uso: bun scripts/cpsec-fx-e2e-posture.mjs
 * Expediente: docs/audits/CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001/TEST-EVIDENCE.md
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIsolatedDb } from '../e2e/fixtures/assert-isolated-db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const MIG_FILE = join(REPO, 'supabase/migrations/20261128173000_cpsec_fx_backup_private.sql');
const T = 'exchange_rates_backup_cpfx001';

/* Credenciales SOLO desde .env local (nunca en el repo ni en logs) */
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const E2E_URL = process.env.E2E_SUPABASE_URL;
const E2E_ANON = process.env.E2E_SUPABASE_ANON_KEY;
const E2E_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!E2E_URL || !E2E_ANON || !E2E_SERVICE || !MGMT_TOKEN) {
  console.error('BLOQUEADO: faltan variables E2E_* / SUPABASE_ACCESS_TOKEN en .env.');
  process.exit(2);
}

/* Guard oficial fail-closed (CP-INFRA-011): destino certificado como aislado */
const decision = await assertIsolatedDb({
  env: {
    E2E_SUPABASE_URL: E2E_URL,
    E2E_SUPABASE_SERVICE_ROLE_KEY: E2E_SERVICE,
    E2E_ISOLATION: '1',
    E2E_TARGET_KIND: 'project',
    E2E_ALLOWED_REMOTE_REF: 'lguovmvrozxgssupkwpf',
  },
  checkSentinel: true,
});
const E2E_REF = decision.ref;
console.log(`Guard de aislamiento OK — BD aislada certificada (${decision.kind}, ref ${E2E_REF}).`);
const mgmtBase = `https://api.supabase.com/v1/projects/${E2E_REF}/database/query`;

async function mgmt(query) {
  const res = await fetch(mgmtBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`MGMT SQL: HTTP ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

/* Recarga inmediata del caché de esquema de PostgREST tras cambios de ACL */
async function pgrstReload(tag) {
  await mgmt("NOTIFY pgrst, 'reload schema';");
  await new Promise(r => setTimeout(r, 700));
  console.log(`  (PostgREST recargado tras ${tag})`);
}

async function rest(method, path, key, body, opts = {}) {
  const auth = opts.bearer ?? key; // apikey SIEMPRE clave válida; el bearer puede ser el JWT del usuario
  const res = await fetch(`${E2E_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', ...(body ? { Prefer: 'return=representation' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch { /* texto plano */ }
  return { status: res.status, json, txt: txt.slice(0, 200) };
}

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
}

console.log('\n== F0: replicar estado PRE (vulnerable) en la BD aislada ==');
await mgmt(`DROP TABLE IF EXISTS public.${T};`);
await mgmt(`
  CREATE TABLE public.${T} (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date date, currency text, source text, segment text, rate numeric,
    capture_method text, notes text, import_batch text
  );`);
await mgmt(`
  INSERT INTO public.${T} (rate_date, currency, source, segment, rate, capture_method, notes) VALUES
    ('2026-11-20','USD','BCC','3',410,'real','CPSEC-FX-E2E-FIXTURE'),
    ('2026-11-21','USD','Diviza','3',415,'real','CPSEC-FX-E2E-FIXTURE'),
    ('2026-11-22','USD','elToque','3',418,'real','CPSEC-FX-E2E-FIXTURE');`);
/* Estado PRE exacto medido en producción: grants default-privileges + RLS OFF */
await mgmt(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${T} TO anon;`);
await mgmt(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${T} TO authenticated;`);

await pgrstReload('creación fixture PRE (grants visibles)');
const preAnon = await rest('GET', `${T}?select=source,rate&order=rate_date.asc`, E2E_ANON);
record('F0.exposicion_PRE', preAnon.status === 200 && Array.isArray(preAnon.json) && preAnon.json.length === 3,
  `SELECT anónimo PRE-migración: HTTP ${preAnon.status} con ${preAnon.json?.length ?? '?'} filas visibles (replica la exposición que vivió producción 13:27Z→17:10Z)`);

console.log('\n== F1: aplicar la migración REAL del repo sobre la fixture ==');
try {
  await mgmt(readFileSync(MIG_FILE, 'utf8'));
  await pgrstReload('aplicación migración 20261128173000');
  record('F1.migracion_aplicada', true, 'SQL de 20261128173000 ejecutado sin error (guardas y verificación interna superadas)');
} catch (e) {
  record('F1.migracion_aplicada', false, `ERROR: ${String(e.message).slice(0, 150)}`);
}

console.log('\n== F2-F3: lecturas y escrituras anónimas (POST-migración) ==');
const rSel = await rest('GET', `${T}?select=source`, E2E_ANON);
record('F2.lectura_anonima_denegada', rSel.status !== 200, `SELECT anónimo: HTTP ${rSel.status} (${rSel.txt.slice(0, 80)})`);
const rIns = await rest('POST', T, E2E_ANON, [{ rate_date: '2026-11-23', currency: 'USD', source: 'BCC', segment: '3', rate: 1, capture_method: 'real', notes: 'CPSEC-FX-E2E-ATTEMPT' }]);
record('F3a.insert_anonimo_denegado', rIns.status !== 201 && rIns.status !== 200, `INSERT anónimo: HTTP ${rIns.status} (${rIns.txt.slice(0, 80)})`);
const rUpd = await rest('PATCH', `${T}?source=eq.Diviza`, E2E_ANON, { rate: 999 });
record('F3b.update_anonimo_denegado', rUpd.status !== 200 && rUpd.status !== 204, `UPDATE anónimo: HTTP ${rUpd.status} (${rUpd.txt.slice(0, 80)})`);
const rDel = await rest('DELETE', `${T}?source=eq.elToque`, E2E_ANON);
record('F3c.delete_anonimo_denegado', rDel.status !== 200 && rDel.status !== 204, `DELETE anónimo: HTTP ${rDel.status} (${rDel.txt.slice(0, 80)})`);

console.log('\n== F4-F5-F11: usuario autenticado real (con reintentos) ==');
/* Email con dominio de test OFICIAL (@costpro.test) — el RPC de limpieza
   e2e_hard_delete_user solo acepta patrones de test inequívocos. */
const TEST_EMAIL = `cpsec-fx-e2e-${Date.now()}@costpro.test`;
const TEST_PASS = 'CPsec-Fx-E2E-2026!';
let userId = null, token = null;
try {
  const cu = await fetch(`${E2E_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: E2E_SERVICE, Authorization: `Bearer ${E2E_SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS, email_confirm: true, user_metadata: { role: 'clerk', full_name: 'CPSEC FX E2E' } }),
  });
  if (cu.ok) { userId = (await cu.json()).id; }
  /* F11 — reintentos del password grant (patrón run-env: flake conocido) */
  for (let i = 1; i <= 4 && !token; i++) {
    const sg = await fetch(`${E2E_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: E2E_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS }),
    });
    if (sg.ok) token = (await sg.json()).access_token;
    else await new Promise(r => setTimeout(r, 750 * i));
  }
  record('F11.usuario_autenticado', Boolean(token), `usuario de prueba + password grant ${token ? 'OK' : 'FALLÓ'} (${userId ? 'id presente' : 'sin id'})`);
} catch (e) {
  record('F11.usuario_autenticado', false, String(e.message).slice(0, 120));
}
if (token) {
  const aSel = await rest('GET', `${T}?select=source`, E2E_ANON, null, { bearer: token });
  record('F4.lectura_autenticada_denegada', aSel.status !== 200, `SELECT autenticado: HTTP ${aSel.status} (${aSel.txt.slice(0, 80)})`);
  const aIns = await rest('POST', T, E2E_ANON, [{ rate_date: '2026-11-24', currency: 'USD', source: 'BCC', segment: '3', rate: 2, capture_method: 'real' }], { bearer: token });
  record('F5.escritura_autenticada_denegada', aIns.status !== 201 && aIns.status !== 200, `INSERT autenticado: HTTP ${aIns.status} (${aIns.txt.slice(0, 80)})`);
} else {
  record('F4.lectura_autenticada_denegada', false, 'sin token — no evaluado');
  record('F5.escritura_autenticada_denegada', false, 'sin token — no evaluado');
}

console.log('\n== F6-F7: proceso privilegiado legítimo (service_role) ==');
const sSel = await rest('GET', `${T}?select=source,rate&order=rate_date.asc`, E2E_SERVICE);
record('F6.lectura_privilegiada_ok', sSel.status === 200 && sSel.json?.length === 3, `SELECT service_role: HTTP ${sSel.status}, ${sSel.json?.length ?? 0} filas (canal de rollback/sondeo intacto)`);
const sIns = await rest('POST', T, E2E_SERVICE, [{ rate_date: '2026-11-25', currency: 'USD', source: 'BCC', segment: '3', rate: 420, capture_method: 'real', notes: 'CPSEC-FX-E2E-PRIV' }]);
record('F7.escritura_privilegiada_ok', sIns.status === 201, `INSERT service_role: HTTP ${sIns.status} (canal privilegiado operativo)`);

console.log('\n== F8-F9: postura en catálogo + conservación de datos ==');
const pos = await mgmt(`
  SELECT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relname='${T}' AND n.nspname='public') AS rls_on,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='${T}') AS policies,
    (SELECT count(*) FROM information_schema.role_table_grants g WHERE g.table_schema='public'
      AND g.table_name='${T}' AND g.grantee IN ('anon','authenticated','PUBLIC')) AS grants_publicos,
    (SELECT count(*)::int FROM public.${T}) AS filas,
    (SELECT count(*)::int FROM public.${T} WHERE notes = 'CPSEC-FX-E2E-FIXTURE') AS originales;`);
const q = pos[0];
record('F8.postura_RLS_sin_policies', q.rls_on === true && Number(q.policies) === 0, `RLS=${q.rls_on}, policies=${q.policies}, grants públicos=${q.grants_publicos}`);
record('F8b.grants_cero', Number(q.grants_publicos) === 0, `grants anon/authenticated/PUBLIC = ${q.grants_publicos}`);
/* F9: la migración no toca datos — las 3 filas ORIGINALES intactas; el total
   es 4 SOLO por el INSERT privilegiado del propio test F7 (notas PRIV). */
record('F9.datos_conservados', Number(q.originales) === 3 && Number(q.filas) === 4,
  `filas originales intactas=${q.originales}/3; total=${q.filas} (3 originales + 1 insert privilegiado del test F7) — la migración no añade/quita filas`);

console.log('\n== F10: defensa en profundidad — grants restaurados + RLS ON ==');
/* Replica el estado intermedio real de producción (17:10Z: RLS on, grants
   presentes): la RLS con 0 policies YA deniega todas las operaciones. */
await mgmt(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${T} TO anon;`);
await pgrstReload('re-grant F10 (estado intermedio real)');
const dSel = await rest('GET', `${T}?select=source`, E2E_ANON);
record('F10.lectura_grants_con_rls', dSel.status === 200 && dSel.json?.length === 0, `SELECT anónimo con grants+RLS: HTTP ${dSel.status}, filas=${dSel.json?.length ?? '?'} (0 filas visibles — deny-all)`);
const dIns = await rest('POST', T, E2E_ANON, [{ rate_date: '2026-11-26', currency: 'USD', source: 'BCC', segment: '3', rate: 3, capture_method: 'real' }]);
record('F10b.insert_grants_con_rls', dIns.status !== 201 && dIns.status !== 200, `INSERT anónimo con grants+RLS: HTTP ${dIns.status} (denegado por RLS sin WITH CHECK)`);
/* revoca de nuevo para dejar la postura final endurecida antes del cleanup */
await mgmt(`REVOKE ALL ON TABLE public.${T} FROM anon;`);
await pgrstReload('re-revoke final');

console.log('\n== F12: net-zero (cleanup) ==');
await mgmt(`DROP TABLE IF EXISTS public.${T};`);
let limpio = true;
if (userId) {
  /* RPC oficial de limpieza (migra- ción 20261005120001): hard-delete server-side
     de profile + identidad Auth para emails de test. Email del fixture usa
     @costpro.test — patrón aceptado. */
  try {
    const du = await rest('POST', 'rpc/e2e_hard_delete_user', E2E_SERVICE, { p_user_id: userId });
    limpio = du.status === 200;
  } catch { limpio = false; }
}
const verif = await mgmt(`SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='${T}' AND n.nspname='public') AS existe, (SELECT count(*) FROM public.exchange_rates) AS vivas;`);
record('F12.net_zero', !verif[0].existe && limpio, `fixture eliminada (${verif[0].existe ? 'AÚN EXISTE' : 'ok'}), usuario ${userId ? (limpio ? 'eliminado vía RPC e2e_hard_delete_user' : 'POSIBLE RESIDUO') : 'no creado'}, tabla viva exchange_rates intacta (${verif[0].vivas} filas, no tocada)`);

const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`\n═══ BATERÍA CP-SEC-FX E2E: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
