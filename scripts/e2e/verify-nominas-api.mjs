#!/usr/bin/env node
/**
 * MISIÓN B — NÓMINAS SC-4-06 — FASE 5: verificación HTTP del API de nóminas
 * contra la BD AISLADA (CostproE2E, ref lguovmvrozxgssupkwpf). NO toca
 * producción (guard fail-closed canónico CP-INFRA-011 + pre-check del .env
 * activo del servidor).
 *
 * PRECONDICIÓN: el servidor local debe correr con el .env switcheado al
 * proyecto aislado (scripts del sandbox: e2e-swap.sh swap). El script aborta
 * fail-closed si el .env activo apunta a producción.
 *
 * Fases:
 *   0. Pre-chequeos: guard canónico + .env del servidor apunta al aislado +
 *      health 200 + fixture determinista (con active_store_id y contraseñas
 *      reales para sign-in HTTP) + tarifas + limpieza previa + conteos.
 *   1. Sign-in HTTP real (Supabase auth REST) → Bearer JWT.
 *   2. GET /api/workers?include_rate=1 — tarifa vigente mergeada + RLS
 *      cross-store (encargado de store2 NO ve trabajadores de store1).
 *   3. POST /api/payrolls — confección: totales EXACTOS calculados por el
 *      servidor (misma cifra que verify-nominas-pg: base 157.500, brutto
 *      163.100, neto 162.600), numeración NOM, idempotencia por clave,
 *      totales espurios del body IGNORADOS (trust boundary).
 *   4. GET detalle (items+conceptos anidados) + PUT borrador (recálculo) +
 *      errores de validación mapeados (400 zod, 422 sin tarifa, 422 período
 *      inválido, 403 trabajador ajeno, 401 sin sesión).
 *   5. Ciclo documental HTTP: confirmar → contabilizar → marcar pagada →
 *      ERR_NOT_VOIDABLE sobre pagada → anulación con motivo (borrador) +
 *      edición bloqueada tras confirmar + RLS cross-store (lista vacía,
 *      anulación ajena rechazada) + auditoría audit_logs del ciclo.
 *   6. Cleanup del fixture + delta 0 en tablas sensibles.
 *
 * Uso:  set -a; source .env; set +a   (con .env YA switcheado al aislado)
 *       node scripts/e2e/verify-nominas-api.mjs
 * Requiere SUPABASE_ACCESS_TOKEN (Management API) + E2E_* en el entorno.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

// ─── Entorno (fail-closed) ─────────────────────────────────────────────────
const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}

function readEnv() {
  const raw = readFileSync(join(repoRoot, '.env'), 'utf8');
  const out = {};
  for (const l of raw.split('\n')) {
    const i = l.indexOf('=');
    if (i > 0 && !l.startsWith('#')) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}
const fileEnv = readEnv();
const activeRef = (fileEnv.NEXT_PUBLIC_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1] || '';
if (activeRef !== E2E_REF) {
  console.error(`FALLO DE SEGURIDAD: el .env del servidor apunta a '${activeRef || '(sin URL)'}', no al proyecto aislado CostproE2E (${E2E_REF}). Ejecuta primero el swap (e2e-swap.sh swap) y reinicia PM2. Abortando.`);
  process.exit(2);
}

const E2E_URL = process.env.E2E_SUPABASE_URL || fileEnv.E2E_SUPABASE_URL;
const E2E_ANON = process.env.E2E_SUPABASE_ANON_KEY || fileEnv.E2E_SUPABASE_ANON_KEY;
const E2E_SRK = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || fileEnv.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!E2E_URL || !E2E_ANON || !E2E_SRK) {
  console.error('FALLO: faltan E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const APP = 'http://localhost:3000';

// Guard canónico del repo (CP-INFRA-011): fail-closed contra producción.
const { assertIsolatedDb } = await import(
  pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.ts')).href
).catch(() => ({}));
const guard = assertIsolatedDb
  ? { assertIsolatedDb }
  : await import(pathToFileURL(join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.cjs')).href);
if (!guard?.assertIsolatedDb) {
  console.error('FALLO DE SEGURIDAD: no se pudo cargar e2e/fixtures/assert-isolated-db (guard canónico). Abortando.');
  process.exit(2);
}
await guard.assertIsolatedDb();

// ─── Transporte SQL (Management API) ───────────────────────────────────────
async function execSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`SQL HTTP ${res.status}: ${msg?.slice(0, 400)}`);
  }
  if (body && !Array.isArray(body) && body.error) throw new Error(`SQL error: ${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body) ? body : [];
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ─── Fixture (IDs deterministas, idénticos a verify-nominas-pg.mjs) ────────
const FX = {
  tenant1: 'dd0200a1-0000-4000-8000-00000000000a',
  store1:  'dd0200b1-0000-4000-8000-00000000000a',
  store2:  'dd0200b2-0000-4000-8000-00000000000a',
  user1:   'dd0200c1-0000-4000-8000-00000000000a', // manager store1 (confecciona; API)
  user2:   'dd0200c2-0000-4000-8000-00000000000a', // encargado store1
  user3:   'dd0200c3-0000-4000-8000-00000000000a', // encargado store2 (ajeno)
  user4:   'dd0200c4-0000-4000-8000-00000000000a', // sin membresías
  w1:      'dd0200d1-0000-4000-8000-00000000000a', // horaria 250 CUP (store1)
  w2:      'dd0200d2-0000-4000-8000-00000000000a', // diaria 5000 CUP (store1)
  w3:      'dd0200d3-0000-4000-8000-00000000000a', // sin tarifa (store1)
  w4:      'dd0200d4-0000-4000-8000-00000000000a', // trabajador store2 (ajeno)
  w5:      'dd0200d5-0000-4000-8000-00000000000a', // horaria 10 USD (store1)
};
const PASS1 = 'Verify-Nominas-Api-1!';
const PASS3 = 'Verify-Nominas-Api-3!';

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}
async function q(sql, params = []) {
  let out = sql;
  // Sustitución en orden INVERSO (bug documentado: '$1' rompe '$10..$12').
  for (let i = params.length - 1; i >= 0; i--) out = out.split(`$${i + 1}`).join(lit(params[i]));
  return execSql(out);
}
async function asAuthSql(rpcSql, uid) {
  const claims = lit(JSON.stringify({ role: 'authenticated', sub: uid }));
  const sql = `WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', ${claims}, false) AS b,
           set_config('request.jwt.claim.sub', ${lit(uid)}, false) AS c
  )
  SELECT r.* FROM setup, LATERAL (
    ${rpcSql}
  ) r;`;
  return execSql(sql);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────
async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${APP}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuestas vacías */ }
  return { status: res.status, data };
}

async function signIn(email, password) {
  const res = await fetch(`${E2E_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: E2E_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`sign-in ${email}: HTTP ${res.status}`);
  return data.access_token;
}
async function setUserPassword(uid, password) {
  const res = await fetch(`${E2E_URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: { apikey: E2E_SRK, Authorization: `Bearer ${E2E_SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`admin PUT password ${uid}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// ─── Cleanup + conteos (paridad con verify-nominas-pg.mjs) ─────────────────
const SENSITIVE = [
  'transactions', 'transaction_items', 'stock_movements', 'receipts',
  'receipt_items', 'products', 'master_products', 'audit_logs',
];
async function sensitiveCounts() {
  const out = {};
  for (const t of SENSITIVE) {
    const r = await q(`SELECT count(*)::int AS n FROM public.${t}`).catch(() => null);
    out[t] = r ? r[0].n : '(tabla inexistente)';
  }
  return out;
}
async function fixtureCleanup() {
  // Idempotente + re-ejecutable (patrón verify-catalogo/verify-nominas-pg):
  // usuarios/perfiles/tiendas persisten (soft-delete), lo demás se borra.
  await q(`DELETE FROM public.idempotency_registry WHERE idempotency_key LIKE 'verify-nominas-api-%' OR (operation = 'payroll' AND idempotency_key LIKE 'verify-nominas%')`).catch(() => {});
  await q(`DELETE FROM public.payroll_item_concepts WHERE item_id IN (SELECT i.id FROM public.payroll_items i JOIN public.payrolls p ON p.id = i.payroll_id WHERE p.store_id IN ($1,$2))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payroll_items WHERE payroll_id IN (SELECT id FROM public.payrolls WHERE store_id IN ($1,$2))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payrolls WHERE store_id IN ($1,$2)`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.worker_salary_rates WHERE worker_id IN ($1,$2,$3,$4,$5)`, [FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.workers WHERE id IN ($1,$2,$3,$4,$5)`, [FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2,$3,$4)`, [FX.user1, FX.user2, FX.user3, FX.user4]).catch(() => {});
  await q(`DELETE FROM public.document_sequences WHERE store_id IN ($1,$2) AND document_type = 'payroll'`, [FX.store1, FX.store2]).catch(() => {});
  // Auditoría AL FINAL (los triggers auditan los DELETE) — broad, 12 params.
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2) OR user_id IN ($3,$4,$5,$6) OR record_id IN ($7,$8,$9,$10,$11,$12)`,
    [FX.store1, FX.store2, FX.user1, FX.user2, FX.user3, FX.user4, FX.tenant1, FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('══ FASE 0 · PRE-CHECKS + FIXTURE ══');
{
  const health = await fetch(`${APP}/api/health`).catch(() => null);
  check('health del servidor local (con .env aislado activo)', !!health && health.status === 200,
    health ? `HTTP ${health.status}` : 'sin conexión');
}

// Limpieza previa + conteos ANTES (residuos de corridas muertas fuera del delta)
await fixtureCleanup();
const countsBefore = await sensitiveCounts();
console.log('conteos ANTES:', JSON.stringify(countsBefore));

// Fixture: mismos IDs que verify-nominas-pg.mjs + active_store_id (derivación
// de tienda del perfil en POST /api/payrolls) + contraseñas reales (sign-in).
await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  VALUES ($1,'verify-nominas-api-1@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($2,'verify-nominas-api-2@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($3,'verify-nominas-api-3@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($4,'verify-nominas-api-4@test.local','x',now(),now(),now(),'{}'::jsonb)
  ON CONFLICT (id) DO NOTHING`, [FX.user1, FX.user2, FX.user3, FX.user4]);
// GoTrue solo ve/escanea filas con la forma completa (columnas token '' y
// no-NULL, is_sso_user false, instance_id real): alineación idempotente.
await q(`UPDATE auth.users SET email_confirmed_at = now(),
  instance_id = COALESCE(instance_id, (SELECT instance_id FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1)),
  is_sso_user = false, aud = 'authenticated', role = 'authenticated',
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '',
  phone = NULL,
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
  WHERE id IN ($1,$2,$3,$4)`, [FX.user1, FX.user2, FX.user3, FX.user4]);
// Emails deterministas de ESTE script: el INSERT de arriba puede chocar con
// filas preexistentes del fixture PG (ON CONFLICT DO NOTHING conserva el
// email viejo) — GoTrue firma sesión por email, así que lo fijamos por id.
await q(`UPDATE auth.users SET email = 'verify-nominas-api-1@test.local' WHERE id = $1`, [FX.user1]);
await q(`UPDATE auth.users SET email = 'verify-nominas-api-2@test.local' WHERE id = $1`, [FX.user2]);
await q(`UPDATE auth.users SET email = 'verify-nominas-api-3@test.local' WHERE id = $1`, [FX.user3]);
await q(`UPDATE auth.users SET email = 'verify-nominas-api-4@test.local' WHERE id = $1`, [FX.user4]);
await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1,'ORG-VERIFY-NOMINAS-API-SC406',$2)
  ON CONFLICT (id) DO NOTHING`, [FX.tenant1, FX.user1]);
await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1,'Tienda Nóminas API 1',$3),($2,'Tienda Nóminas API 2',$3)
  ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.store2, FX.tenant1]);
// Membresías ANTES de active_store_id (trigger validate_active_store exige
// membership activa en la tienda al fijar el perfil).
await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2,$3,$4)`, [FX.user1, FX.user2, FX.user3, FX.user4]);
await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ($1,$5,'admin','active'),($2,$5,'encargado','active'),($3,$6,'encargado','active')`,
  [FX.user1, FX.user2, FX.user3, FX.user4, FX.store1, FX.store2]);
await q(`INSERT INTO public.profiles (id, role, active_store_id) VALUES ($1,'manager',$5),($2,'encargado',$5),($3,'encargado',$6),($4,'usuario',NULL)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active_store_id = EXCLUDED.active_store_id`,
  [FX.user1, FX.user2, FX.user3, FX.user4, FX.store1, FX.store2]);
await q(`INSERT INTO public.workers (id, store_id, tenant_id, first_name, last_name, ci, expediente_laboral, categoria_ocupacional, cargo, area_trabajo, status) VALUES
  ($1,$6,$8,'Ana','Torres','00000000001','EXP-001','Técnico Medio','Dependiente','Salón','active'),
  ($2,$6,$8,'Luis','Pérez','00000000002','EXP-002','Operario','Almacenista','Almacén','active'),
  ($3,$6,$8,'Marta','Díaz','00000000003','EXP-003','Administrativo','Auxiliar','Oficina','active'),
  ($4,$7,$8,'Otro','Tienda','00000000004','EXP-004','Operario','Ayudante','Salón','active'),
  ($5,$6,$8,'Elena','USD','00000000005','EXP-005','Técnico','Especialista','Taller','active')
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
    ci = EXCLUDED.ci, expediente_laboral = EXCLUDED.expediente_laboral,
    categoria_ocupacional = EXCLUDED.categoria_ocupacional,
    cargo = EXCLUDED.cargo, area_trabajo = EXCLUDED.area_trabajo,
    status = EXCLUDED.status`, [FX.w1, FX.w2, FX.w3, FX.w4, FX.w5, FX.store1, FX.store2, FX.tenant1]);
check('fixture (4 usuarios con active_store_id, 2 tiendas, 5 trabajadores)', true);

// Tarifas (RPC como user1 — paridad con verify-nominas-pg FASE 4)
let r = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',250.00,'CUP',NULL,NULL::uuid) AS r`, FX.user1);
check('tarifa horaria 250 CUP (w1)', !!r[0]?.r?.status);
r = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w2 + '\''}::uuid,'daily',5000.00,'CUP',NULL,NULL::uuid) AS r`, FX.user1);
check('tarifa diaria 5000 CUP (w2)', !!r[0]?.r?.status);

// Contraseñas reales para sign-in HTTP (admin API)
await setUserPassword(FX.user1, PASS1);
await setUserPassword(FX.user3, PASS3);
check('contraseñas reales fijadas vía admin API (user1, user3)', true);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 1 · SIGN-IN HTTP ══');
const tok1 = await signIn('verify-nominas-api-1@test.local', PASS1);
check('sign-in user1 (manager store1) → Bearer JWT', !!tok1);
const tok3 = await signIn('verify-nominas-api-3@test.local', PASS3);
check('sign-in user3 (encargado store2) → Bearer JWT', !!tok3);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 2 · TRABAJADORES CON TARIFA (GET /api/workers) ══');
let res = await api('GET', `/api/workers?store_id=${FX.store1}&include_rate=1`, tok1);
check('GET workers store1 (user1) → 200 con 4 trabajadores', res.status === 200 && res.data?.workers?.length === 4,
  `HTTP ${res.status} n=${res.data?.workers?.length ?? '?'}`);
const anaHttp = (res.data?.workers || []).find((w) => w.id === FX.w1);
const luisHttp = (res.data?.workers || []).find((w) => w.id === FX.w2);
check('tarifa vigente mergeada en workers (Ana hourly 250 / Luis daily 5000)',
  anaHttp?.rate_type === 'hourly' && Number(anaHttp?.rate_amount) === 250
  && luisHttp?.rate_type === 'daily' && Number(luisHttp?.rate_amount) === 5000,
  `ana=${anaHttp?.rate_type}/${anaHttp?.rate_amount} luis=${luisHttp?.rate_type}/${luisHttp?.rate_amount}`);

res = await api('GET', `/api/workers?store_id=${FX.store1}&include_rate=1`, tok3);
check('RLS: encargado de store2 NO ve trabajadores de store1', res.status === 200 && (res.data?.workers?.length ?? 0) === 0,
  `HTTP ${res.status} n=${res.data?.workers?.length ?? '?'}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 3 · CONFECCIÓN (POST /api/payrolls) ══');
const itemsPayload = [
  {
    worker_id: FX.w1,
    regular_hours: 190, accrued_days: 0,
    overtime_hours: 10, overtime_amount: 3750.00,
    vacation_days: 2, vacation_amount: 10000.00,
    concepts: [
      { kind: 'complemento', sigla: 'PRIMA', description: 'Prima por productividad', amount: 1000.00 },
      { kind: 'obligacion_social', sigla: 'SEGS', description: 'Seguridad social', amount: 850.00 },
      { kind: 'deduccion', sigla: 'INAS', description: 'Inasistencia', amount: 200.00 },
      { kind: 'deduccion', sigla: 'AJU', description: 'Ajuste anterior', amount: 300.00 },
    ],
  },
  {
    worker_id: FX.w2,
    regular_hours: 0, accrued_days: 22,
    overtime_hours: 0, overtime_amount: 0,
    vacation_days: 0, vacation_amount: 0,
    concepts: [],
  },
];
const today = new Date().toISOString().slice(0, 10);
const from = `${today.slice(0, 8)}01`;
const createBody = {
  tipo_nomina: 'sueldos',
  period_start: from,
  period_end: today,
  payment_method: 'efectivo',
  cheque_number: 'CHQ-777',
  notes: 'Nómina de verificación API SC-4-06',
  items: itemsPayload,
  idempotency_key: 'verify-nominas-api-key-1',
  // Trust boundary: campos espurios que el servidor DEBE ignorar
  store_id: FX.store2, user_id: FX.user3,
  total_net: 1, total_gross: 2, total_deductions: 3,
};
res = await api('POST', '/api/payrolls', tok1, createBody);
const created = res.data;
check('POST create → 201 success + numeración NOM', res.status === 201 && created?.status === 'success' && /^NOM-\d{6}-\d{4}$/.test(created?.payroll_number || ''),
  `HTTP ${res.status} ${created?.payroll_number || JSON.stringify(created || {}).slice(0, 120)}`);
const pid = created?.payroll_id;
check('totales EXACTOS del servidor (base 157500, brutto 163100, neto 162600)',
  created?.totals && created.totals.total_base_salary === 157500 && created.totals.total_gross === 163100
  && created.totals.total_net === 162600 && created.totals.total_workers === 2,
  JSON.stringify(created?.totals || {}));
check('trust boundary: totales espurios del body IGNORADOS (neto ≠ 1)',
  created?.totals?.total_net === 162600);

// Idempotencia: re-POST con la MISMA clave → mismo documento
res = await api('POST', '/api/payrolls', tok1, createBody);
check('idempotencia: re-POST misma clave → MISMO payroll_id', res.status === 201 && res.data?.payroll_id === pid,
  `HTTP ${res.status} id=${res.data?.payroll_id?.slice(0, 8)}…`);
r = await q(`SELECT count(*)::int AS n FROM public.payrolls WHERE store_id = $1`, [FX.store1]);
check('sin duplicados tras idempotencia', r[0].n === 1, `n=${r[0].n}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 4 · DETALLE + EDICIÓN + ERRORES MAPEADOS ══');
res = await api('GET', `/api/payrolls/${pid}`, tok1);
const detail = res.data?.payroll;
check('GET detalle → 200 con items anidados y conceptos', res.status === 200 && detail?.items?.length === 2
  && detail.items.find((i) => i.worker_id === FX.w1)?.concepts?.length === 4,
  `HTTP ${res.status} items=${detail?.items?.length} conceptos(w1)=${detail?.items?.find((i) => i.worker_id === FX.w1)?.concepts?.length}`);
const anaItem = detail?.items?.find((i) => i.worker_id === FX.w1);
check('fila Ana snapshot+cálculo (base 47500, brutto 53100, neto 52600)',
  Number(anaItem?.base_salary) === 47500 && Number(anaItem?.total_gross) === 53100 && Number(anaItem?.total_net) === 52600,
  `base=${anaItem?.base_salary} g=${anaItem?.total_gross} n=${anaItem?.total_net}`);

// PUT (update borrador): extras 3750→4000 ⇒ brutto 53350 / cabecera 163350
const updateBody = JSON.parse(JSON.stringify(createBody));
updateBody.items[0].overtime_amount = 4000;
delete updateBody.idempotency_key;
res = await api('PUT', `/api/payrolls/${pid}`, tok1, updateBody);
check('PUT borrador → recálculo del servidor (brutto 163350, neto 162850)',
  res.status === 200 && res.data?.totals && res.data.totals.total_gross === 163350 && res.data.totals.total_net === 162850,
  `HTTP ${res.status} g=${res.data?.totals?.total_gross} n=${res.data?.totals?.total_net}`);

// Errores mapeados (cada uno con su código rpc_error + HTTP canónico)
res = await api('POST', '/api/payrolls', tok1, { tipo_nomina: 'sueldos', period_start: from, period_end: today, items: itemsPayload });
check('400 zod: falta idempotency_key', res.status === 400 && !!res.data?.details, `HTTP ${res.status}`);

res = await api('POST', '/api/payrolls', tok1, {
  tipo_nomina: 'sueldos', period_start: today, period_end: from,
  items: [{ worker_id: FX.w1, regular_hours: 10 }], idempotency_key: 'verify-nominas-api-err-period',
});
check('422 ERR_INVALID_PERIOD: inicio posterior al fin', res.status === 422 && (res.data?.rpc_error || '').includes('ERR_INVALID_PERIOD'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', '/api/payrolls', tok1, {
  tipo_nomina: 'sueldos', period_start: from, period_end: today,
  items: [{ worker_id: FX.w3, regular_hours: 10 }], idempotency_key: 'verify-nominas-api-err-norate',
});
check('422 ERR_WORKER_WITHOUT_RATE: trabajador sin tarifa', res.status === 422 && (res.data?.rpc_error || '').includes('ERR_WORKER_WITHOUT_RATE'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', '/api/payrolls', tok1, {
  tipo_nomina: 'sueldos', period_start: from, period_end: today,
  items: [{ worker_id: FX.w4, accrued_days: 5 }], idempotency_key: 'verify-nominas-api-err-alien',
});
check('422 ERR_WORKER_NOT_ELIGIBLE: trabajador de otra tienda', res.status === 422 && (res.data?.rpc_error || '').includes('ERR_WORKER_NOT_ELIGIBLE'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', '/api/payrolls', null, createBody);
check('401 sin sesión (sin Bearer)', res.status === 401, `HTTP ${res.status}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 5 · CICLO DOCUMENTAL HTTP ══');
res = await api('POST', `/api/payrolls/${pid}/confirm`, tok1);
check('confirm → confirmed (firma revisa y aprueba)', res.status === 200 && res.data?.to === 'confirmed',
  `HTTP ${res.status} ${JSON.stringify(res.data || {}).slice(0, 100)}`);
{
  const d = await api('GET', `/api/payrolls/${pid}`, tok1);
  check('detalle tras confirmar: estado confirmed + reviewed_at (identidad histórica)',
    d.status === 200 && d.data?.payroll?.status === 'confirmed' && !!d.data?.payroll?.reviewed_at,
    `status=${d.data?.payroll?.status} reviewed=${d.data?.payroll?.reviewed_at}`);
}

res = await api('PUT', `/api/payrolls/${pid}`, tok1, updateBody);
check('ERR_NOT_DRAFT: edición bloqueada tras confirmar', res.status === 422 && (res.data?.rpc_error || '').includes('ERR_NOT_DRAFT'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', `/api/payrolls/${pid}/account`, tok1);
check('account → contabilizada', res.status === 200 && !!res.data?.accounted_by,
  `HTTP ${res.status} accounted_by=${res.data?.accounted_by?.slice(0, 8)}…`);
res = await api('POST', `/api/payrolls/${pid}/account`, tok1);
check('ERR_ALREADY_ACCOUNTED: re-contabilización bloqueada', res.status === 409 && (res.data?.rpc_error || '').includes('ERR_ALREADY_ACCOUNTED'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', `/api/payrolls/${pid}/pay`, tok1);
check('pay → pagada', res.status === 200 && res.data?.to === 'paid', `HTTP ${res.status}`);
{
  const d = await api('GET', `/api/payrolls/${pid}`, tok1);
  check('detalle tras pago: estado paid + paid_at',
    d.status === 200 && d.data?.payroll?.status === 'paid' && !!d.data?.payroll?.paid_at,
    `status=${d.data?.payroll?.status} paid_at=${d.data?.payroll?.paid_at}`);
}

res = await api('POST', `/api/payrolls/${pid}/void`, tok1, { reason: 'motivo de prueba api' });
check('ERR_NOT_VOIDABLE: nómina pagada no anulable', res.status === 422 && (res.data?.rpc_error || '').includes('ERR_NOT_VOIDABLE'),
  `HTTP ${res.status} ${res.data?.rpc_error}`);

res = await api('POST', `/api/payrolls/${pid}/void`, tok1, { reason: '' });
check('400: motivo vacío rechazado', res.status === 400, `HTTP ${res.status}`);

// Segunda nómina (borrador) → anulación con motivo
const createBody2 = {
  tipo_nomina: 'jornales', period_start: from, period_end: today,
  items: [{ worker_id: FX.w2, accrued_days: 5 }], idempotency_key: 'verify-nominas-api-key-2',
};
res = await api('POST', '/api/payrolls', tok1, createBody2);
const pid2 = res.data?.payroll_id;
check('segunda nómina (jornales 5 días = 25000) → numeración consecutiva',
  res.status === 201 && res.data?.totals?.total_net === 25000 && res.data?.payroll_number === 'NOM-000002-2026',
  `HTTP ${res.status} ${res.data?.payroll_number} neto=${res.data?.totals?.total_net}`);

res = await api('POST', `/api/payrolls/${pid2}/void`, tok1, { reason: 'anulación de verificación api' });
check('void borrador → voided (motivo persistido)',
  res.status === 200 && res.data?.to === 'voided', `HTTP ${res.status}`);
{
  const d = await api('GET', `/api/payrolls/${pid2}`, tok1);
  check('detalle tras anular: estado voided + motivo CONSERVADO + numeración intacta',
    d.status === 200 && d.data?.payroll?.status === 'voided'
    && /verificación api/.test(d.data?.payroll?.void_reason || '')
    && /^NOM-\d{6}-\d{4}$/.test(d.data?.payroll?.payroll_number || ''),
    `status=${d.data?.payroll?.status} motivo=${d.data?.payroll?.void_reason}`);
}

// RLS cross-store por HTTP
res = await api('GET', `/api/payrolls?store_id=${FX.store1}`, tok3);
check('RLS HTTP: encargado store2 NO lista nóminas de store1', res.status === 200 && (res.data?.payrolls?.length ?? 0) === 0,
  `HTTP ${res.status} n=${res.data?.payrolls?.length ?? '?'}`);
res = await api('POST', `/api/payrolls/${pid}/void`, tok3, { reason: 'intento ajeno' });
check('RLS HTTP: usuario ajeno NO anula nómina de store1', res.status !== 200,
  `HTTP ${res.status} ${res.data?.rpc_error || ''}`);

// Auditoría del ciclo (SQL read-only)
r = await q(`SELECT DISTINCT action FROM public.audit_logs WHERE record_id = $1 ORDER BY action`, [pid]);
const actions = r.map((x) => x.action).join(',');
check('audit_logs: ciclo documental registrado (CREATE→CONFIRM→ACCOUNT→MARK_PAID)',
  actions.includes('CREATE_PAYROLL') && actions.includes('CONFIRM_PAYROLL')
  && actions.includes('ACCOUNT_PAYROLL') && actions.includes('MARK_PAYROLL_PAID'),
  actions);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 6 · CLEANUP + DELTA 0 ══');
await fixtureCleanup();
const countsAfter = await sensitiveCounts();
let deltaOk = true;
const delta = {};
for (const t of Object.keys(countsBefore)) {
  if (countsBefore[t] === '(tabla inexistente)') continue;
  delta[t] = countsAfter[t] - countsBefore[t];
  if (delta[t] !== 0) deltaOk = false;
}
check('integridad: delta 0 en tablas sensibles tras el cleanup', deltaOk, JSON.stringify(delta));

// ═══════════════════════════════════════════════════════════════════════════
const failed = results.filter((x) => !x.ok);
console.log(`\n══════════════ RESULTADO: ${results.length - failed.length}/${results.length} ═══════════════`);
if (failed.length > 0) {
  console.error('FALLOS:');
  failed.forEach((f) => console.error(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log('VERIFY-NOMINAS-API: todos los checks OK.');
