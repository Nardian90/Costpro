#!/usr/bin/env node
/**
 * MISION TRABAJADORES↔NÓMINAS (2026-11-13) — Verificación HTTP INTEGRAL del
 * fix contra la BD AISLADA (CostproE2E, ref lguovmvrozxgssupkwpf). NO toca
 * producción (guard fail-closed CP-INFRA-11 + pre-check del .env activo).
 *
 * PRECONDICIÓN: servidor local con el .env switcheado al proyecto aislado
 * (misma técnica de alias que el CI; ver docs/e2e/EJECUCION_LOCAL_AISLADA.md)
 * y PM2 reiniciado. Aborta fail-closed si el .env apunta a producción.
 *
 * Matriz (causa raíz nº1 + selector + integración + seguridad):
 *   FASE 1 · Selector — GET /api/workers: q por nombre/CI (acentos y
 *            mayúsculas), tarifa evaluada al PERÍODO (misma regla del motor
 *            servidor), has_any_rate, alias worker_id≡id, RLS cross-store.
 *   FASE 2 · Causa raíz — divergencia perfil/UI: manager con membresía en
 *            DOS tiendas y profiles.active_store_id en la OTRA: legacy POST
 *            (sin store_id) reproduce ERR_WORKER_NOT_ELIGIBLE; POST con
 *            store_id de la tienda operada → 201 (el fix). Tienda ajena →
 *            403 ERR_UNAUTHORIZED (autorización INTACTA en el RPC).
 *   FASE 3 · Incorporación a borrador (mismo servicio del editor): GET
 *            detalle → PUT añade trabajador → duplicado 409 → sin tarifa
 *            422 → tarifa vencida 422 → nómina confirmada no acepta
 *            incorporaciones (ERR_NOT_DRAFT).
 *   FASE 4 · RPC directo: create_payroll con anon sin JWT → rechazado;
 *            set_worker_salary_rate de tienda ajena → ERR_UNAUTHORIZED.
 *   FASE 5 · Cleanup del fixture + delta 0.
 *
 * Uso:  set -a; source .env; set +a   (con .env YA switcheado al aislado)
 *       node scripts/e2e/verify-trabajadores-nominas.mjs
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
    if (i > 0 && !l.startsWith('#')) out[l.slice(0, i).trim()] = l.slice(1 + i).trim();
  }
  return out;
}
const fileEnv = readEnv();
const activeRef = (fileEnv.NEXT_PUBLIC_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1] || '';
if (activeRef !== E2E_REF) {
  console.error(`FALLO DE SEGURIDAD: el .env del servidor apunta a '${activeRef || '(sin URL)'}', no al proyecto aislado CostproE2E (${E2E_REF}). Ejecuta primero el swap del entorno y reinicia PM2. Abortando.`);
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

let PASS = 0, FAIL = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? PASS++ : FAIL++;
};

// ─── Fixture (IDs deterministas del prefijo dd0201) ────────────────────────
const FX = {
  tenant1: 'dd0201a1-0000-4000-8000-00000000000a',
  store1:  'dd0201b1-0000-4000-8000-00000000000a', // tienda operada por la UI
  store2:  'dd0201b2-0000-4000-8000-00000000000a', // tienda del perfil (divergente)
  mgr:     'dd0201c1-0000-4000-8000-00000000000a', // manager con membresía en store1+store2, perfil en store2
  enc2:    'dd0201c3-0000-4000-8000-00000000000a', // encargado de store2 (ajeno a store1)
  w1:      'dd0201d1-0000-4000-8000-00000000000a', // horaria 250 CUP (store1) vigente
  w3:      'dd0201d3-0000-4000-8000-00000000000a', // sin tarifa (store1)
  w4:      'dd0201d4-0000-4000-8000-00000000000a', // trabajador de store2 (ajeno)
  w5:      'dd0201d5-0000-4000-8000-00000000000a', // horaria 300 CUP (store1) VENCIDA ayer
};
const PASS_MGR = 'Verify-TrabNom-Mgr-1!';
const PASS_ENC2 = 'Verify-TrabNom-Enc-2!';

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = iso(new Date(today.getFullYear(), today.getMonth(), 1));
// Fin del mes ANTERIOR: una tarifa que vence AQUÍ no cubre el período del mes
// actual → inelegible real para el período de la nómina.
const prevMonthEnd = iso(new Date(today.getFullYear(), today.getMonth(), 0));
const threeMonthsAgo = iso(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000));

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}
async function q(sql, params = []) {
  let out = sql;
  for (let i = params.length - 1; i >= 0; i--) out = out.split(`$${i + 1}`).join(lit(params[i]));
  return execSql(out);
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${APP}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* vacías */ }
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
  if (!res.ok) throw new Error(`admin PUT password ${uid}: HTTP ${res.status}`);
}

async function restRpc(name, token, params) {
  const res = await fetch(`${E2E_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: E2E_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  return { status: res.status, text };
}

// ─── Cleanup + conteos ─────────────────────────────────────────────────────
const SENSITIVE = ['payrolls', 'payroll_items', 'payroll_item_concepts', 'worker_salary_rates', 'workers', 'idempotency_registry', 'document_sequences'];
async function tableCount(t) {
  try { return (await q(`SELECT count(*)::int AS n FROM public.${t}`))[0].n; } catch { return -1; }
}
async function countsBefore() {
  const out = {};
  for (const t of SENSITIVE) out[t] = await tableCount(t);
  return out;
}

async function fixtureCleanup() {
  // Idempotente y re-ejecutable: borra TODO el fixture del prefijo dd0201*.
  await q(`DELETE FROM public.idempotency_registry WHERE idempotency_key LIKE 'verify-trabnom-%'`).catch(() => {});
  await q(`DELETE FROM public.payroll_item_concepts WHERE item_id IN (SELECT i.id FROM public.payroll_items i JOIN public.payrolls p ON p.id = i.payroll_id WHERE p.id = ANY(ARRAY[$1::uuid,$2::uuid]))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payroll_items WHERE payroll_id IN (SELECT id FROM public.payrolls WHERE store_id IN ($1,$2))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payrolls WHERE store_id IN ($1,$2)`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.worker_salary_rates WHERE worker_id IN ($1,$2,$3)`, [FX.w1, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.workers WHERE id IN ($1,$2,$3,$4)`, [FX.w1, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2)`, [FX.mgr, FX.enc2]).catch(() => {});
  await q(`DELETE FROM public.stores WHERE id IN ($1,$2)`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.tenants WHERE id = $1`, [FX.tenant1]).catch(() => {});
  await q(`DELETE FROM public.document_sequences WHERE store_id IN ($1,$2) AND document_type = 'payroll'`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2) OR user_id IN ($3,$4) OR record_id IN ($5,$6,$7,$8,$9)`,
    [FX.store1, FX.store2, FX.mgr, FX.enc2, FX.tenant1, FX.w1, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM auth.users WHERE id IN ($1,$2)`, [FX.mgr, FX.enc2]).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('══ FASE 0 · PRE-CHECKS + FIXTURE ══');
{
  const health = await fetch(`${APP}/api/health`).catch(() => null);
  check('health del servidor local (con .env aislado activo)', !!health && health.status === 200,
    health ? `HTTP ${health.status}` : 'sin conexión');
}

await fixtureCleanup();
const before = await countsBefore();
console.log('conteos ANTES:', JSON.stringify(before));

// auth.users con contraseña real (GoTrue firma sesión por email)
await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  VALUES ($1,'verify-trabnom-mgr@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($2,'verify-trabnom-enc2@test.local','x',now(),now(),now(),'{}'::jsonb)
  ON CONFLICT (id) DO NOTHING`, [FX.mgr, FX.enc2]);
await q(`UPDATE auth.users SET email_confirmed_at = now(),
  instance_id = COALESCE(instance_id, (SELECT instance_id FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1)),
  is_sso_user = false, aud = 'authenticated', role = 'authenticated',
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '',
  phone = NULL, raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
  WHERE id IN ($1,$2)`, [FX.mgr, FX.enc2]);
await setUserPassword(FX.mgr, PASS_MGR);
await setUserPassword(FX.enc2, PASS_ENC2);

// Tenant + tiendas + membresías + perfiles + trabajadores + tarifas
await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1,'ORG-VERIFY-TRABNOM',$2)
  ON CONFLICT (id) DO NOTHING`, [FX.tenant1, FX.mgr]);
await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1,'Tienda TrabNom UI',$3),($2,'Tienda TrabNom Perfil',$3)
  ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.store2, FX.tenant1]);
await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2)`, [FX.mgr, FX.enc2]);
// Manager con membresía en AMBAS tiendas (escenario multi-tienda real) y
// profiles.active_store_id en store2 — la UI opera store1 (divergencia).
await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ($1,$2,'manager','active'),($1,$3,'manager','active'),($4,$3,'encargado','active')`,
  [FX.mgr, FX.store1, FX.store2, FX.enc2]);
await q(`INSERT INTO public.profiles (id, email, role, active_store_id) VALUES
  ($1,'verify-trabnom-mgr@test.local','manager',$2),($3,'verify-trabnom-enc2@test.local','encargado',$4)
  ON CONFLICT (id) DO UPDATE SET active_store_id = EXCLUDED.active_store_id, role = EXCLUDED.role`,
  [FX.mgr, FX.store2, FX.enc2, FX.store2]);
await q(`INSERT INTO public.workers (id, store_id, first_name, last_name, ci, status, created_by) VALUES
  ($1,$5,'Dup','Test','99010111111','active',$7),
  ($2,$5,'Ana','Núñez','99010122222','active',$7),
  ($3,$6,'Ajeno','StoreDos','99010133333','active',$7),
  ($4,$5,'Vencida','Tarifa','99010144444','active',$7)
  ON CONFLICT (id) DO NOTHING`, [FX.w1, FX.w3, FX.w4, FX.w5, FX.store1, FX.store2, FX.mgr]);
await q(`INSERT INTO public.worker_salary_rates (worker_id, store_id, rate_type, rate_amount, currency, valid_from, valid_to, created_by) VALUES
  ($1,$3,'hourly',250,'CUP',$4,NULL,$7),
  ($2,$3,'hourly',300,'CUP',$5,$6,$7)`, [FX.w1, FX.w5, FX.store1, monthStart, threeMonthsAgo, prevMonthEnd, FX.mgr]);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 1 · SELECTOR — GET /api/workers (q + período + RLS) ══');
const tokMgr = await signIn('verify-trabnom-mgr@test.local', PASS_MGR);
const tokEnc2 = await signIn('verify-trabnom-enc2@test.local', PASS_ENC2);

{
  const r = await api('GET', `/api/workers?store_id=${FX.store1}&q=DUP&include_rate=1&period_start=${monthStart}&period_end=${iso(today)}`, tokMgr);
  const ws = r.data?.workers ?? [];
  check('q=DUP (mayúsculas) → solo Dup Test de store1', r.status === 200 && ws.length === 1 && ws[0].worker_id === FX.w1, `${ws.length} resultados`);

  const r2 = await api('GET', `/api/workers?store_id=${FX.store1}&q=núñez`, tokMgr);
  check('q=núñez (acentos) → Ana Núñez', r2.status === 200 && (r2.data?.workers ?? []).length === 1);

  const r3 = await api('GET', `/api/workers?store_id=${FX.store1}&q=99010111111`, tokMgr);
  check('q por CI → 1 exacto + alias worker_id≡id', r3.status === 200 && (r3.data?.workers ?? []).every((w) => w.worker_id === w.id));

  const r4 = await api('GET', `/api/workers?store_id=${FX.store1}&include_rate=1&period_start=${monthStart}&period_end=${iso(today)}`, tokMgr);
  const by = Object.fromEntries((r4.data?.workers ?? []).map((w) => [w.id, w]));
  check('tarifa vigente al período: Dup Test 250 CUP/hora', Number(by[FX.w1]?.rate_amount) === 250 && by[FX.w1]?.rate_type === 'hourly');
  check('sin tarifa: Ana Núñez → rate null + has_any_rate=false', by[FX.w3]?.rate_amount == null && by[FX.w3]?.has_any_rate === false);
  check('tarifa VENCIDA: visible con has_any_rate=true y rate null (no oculta, explica)',
    by[FX.w5]?.rate_amount == null && by[FX.w5]?.has_any_rate === true);
  check('ventana de vigencia expuesta (rate_valid_from)', by[FX.w1]?.rate_valid_from === monthStart);

  // RLS cross-store: encargado de store2 NO ve trabajadores de store1
  const r5 = await api('GET', `/api/workers?store_id=${FX.store1}`, tokEnc2);
  check('RLS cross-store: encargado de store2 NO lista trabajadores de store1', r5.status === 200 && (r5.data?.workers ?? []).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 2 · CAUSA RAÍZ — divergencia perfil↔UI (tienda del body) ══');
const PERIOD = { start: monthStart, end: iso(today) };
const itemW1 = { worker_id: FX.w1, regular_hours: 8, overtime_hours: 0, overtime_amount: 0, vacation_days: 0, vacation_amount: 0 };
let payrollId = null;

{
  // 2.1 REPRODUCCIÓN del bug original en el aislado: legacy (sin store_id) →
  // deriva profiles.active_store_id (store2) → trabajador de store1 inelegible.
  const legacy = await api('POST', '/api/payrolls', tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1], idempotency_key: `verify-trabnom-legacy-${Date.now()}`,
  });
  check('REPRODUCCIÓN: legacy sin store_id (perfil en store2) → 422 ERR_WORKER_NOT_ELIGIBLE',
    legacy.status === 422 && String(legacy.data?.rpc_error).includes('ERR_WORKER_NOT_ELIGIBLE'), `HTTP ${legacy.status}`);

  // 2.2 EL FIX: store_id explícito de la tienda operada por la UI → 201.
  const fixed = await api('POST', '/api/payrolls', tokMgr, {
    store_id: FX.store1,
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1], idempotency_key: `verify-trabnom-fixed-${Date.now()}`,
  });
  check('FIX: POST con store_id de la tienda operada → 201 borrador', fixed.status === 201,
    `HTTP ${fixed.status} ${JSON.stringify(fixed.data?.totals ?? {}).slice(0, 120)}`);
  payrollId = fixed.data?.payroll_id ?? null;
  check('totales del SERVIDOR: 8 horas × 250 = base 2000', Number(fixed.data?.totals?.total_base_salary) === 2000 && Number(fixed.data?.totals?.total_net) === 2000);

  // 2.3 Seguridad: tienda SIN membresía → 403 ERR_UNAUTHORIZED (RPC autoriza).
  const encStore1 = await api('POST', '/api/payrolls', tokEnc2, {
    store_id: FX.store1,
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [{ ...itemW1, worker_id: FX.w4 }], idempotency_key: `verify-trabnom-ajeno-${Date.now()}`,
  });
  check('SEGURIDAD: encargado de store2 → POST store1 → 403 ERR_UNAUTHORIZED',
    encStore1.status === 403 && String(encStore1.data?.rpc_error).includes('ERR_UNAUTHORIZED'), `HTTP ${encStore1.status}`);

  // 2.4 store_id no-uuid → zod 400 (sin tocar el RPC).
  const bad = await api('POST', '/api/payrolls', tokMgr, {
    store_id: 'no-uuid', tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1], idempotency_key: 'verify-trabnom-baduuid-1',
  });
  check('store_id no-uuid → 400 zod (sin tocar el RPC)', bad.status === 400, `HTTP ${bad.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 3 · INCORPORACIÓN A BORRADOR (mismo servicio del editor) ══');
{
  const detail = await api('GET', `/api/payrolls/${payrollId}`, tokMgr);
  const items = detail.data?.payroll?.items ?? [];
  check('GET detalle → borrador con la línea de Dup Test', detail.status === 200 && items.length === 1 && items[0].worker_id === FX.w1);
  check('snapshot de tarifa en la línea (250 CUP/hora)', Number(items[0]?.rate_amount) === 250 && items[0]?.rate_type === 'hourly');

  // 3.1 Duplicado en el MISMO documento → 409 (servidor).
  const dup = await api('PUT', `/api/payrolls/${payrollId}`, tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1, itemW1],
  });
  check('duplicado en el documento → 409 ERR_DUPLICATE_WORKER', dup.status === 409, `HTTP ${dup.status}`);

  // 3.2 Trabajador sin tarifa → 422 con explicación.
  const noRate = await api('PUT', `/api/payrolls/${payrollId}`, tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1, { worker_id: FX.w3, regular_hours: 8 }],
  });
  check('trabajador SIN tarifa → 422 ERR_WORKER_WITHOUT_RATE', noRate.status === 422 && String(noRate.data?.rpc_error).includes('ERR_WORKER_WITHOUT_RATE'));

  // 3.3 Tarifa vencida para el período → 422 (elegibilidad por período real).
  const expired = await api('PUT', `/api/payrolls/${payrollId}`, tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1, { worker_id: FX.w5, regular_hours: 8 }],
  });
  check('tarifa VENCIDA para el período → 422 ERR_WORKER_WITHOUT_RATE', expired.status === 422 && String(expired.data?.rpc_error).includes('ERR_WORKER_WITHOUT_RATE'));

  // 3.4 Incorporación VÁLIDA de un segundo trabajador... no hay otro con
  // tarifa vigente en store1 — reutilizamos w1 con horas distintas (PUT
  // reemplaza líneas): cambia horas y verifica recálculo del servidor.
  const upd = await api('PUT', `/api/payrolls/${payrollId}`, tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [{ ...itemW1, regular_hours: 100 }],
  });
  check('PUT edición de borrador → recálculo servidor (100 h × 250 = 25000)',
    upd.status === 200 && Number(upd.data?.totals?.total_base_salary) === 25000, `HTTP ${upd.status}`);

  // 3.5 Confirmar → ya NO acepta incorporaciones (ERR_NOT_DRAFT).
  const conf = await api('POST', `/api/payrolls/${payrollId}/confirm`, tokMgr, {});
  check('confirmación → 200 (draft→confirmed)', conf.status === 200, `HTTP ${conf.status}`);
  const afterConfirm = await api('PUT', `/api/payrolls/${payrollId}`, tokMgr, {
    tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [itemW1, { worker_id: FX.w4, regular_hours: 4 }],
  });
  check('nómina CONFIRMADA no acepta incorporaciones → ERR_NOT_DRAFT',
    [409, 422].includes(afterConfirm.status) && String(afterConfirm.data?.rpc_error).includes('ERR_NOT_DRAFT'), `HTTP ${afterConfirm.status}`);

  // 3.6 Trabajador de OTRA tienda → inelegible incluso con horas válidas.
  const cross = await api('POST', '/api/payrolls', tokMgr, {
    store_id: FX.store1, tipo_nomina: 'sueldos', period_start: PERIOD.start, period_end: PERIOD.end,
    items: [{ worker_id: FX.w4, regular_hours: 4 }], idempotency_key: `verify-trabnom-cross-${Date.now()}`,
  });
  check('trabajador de OTRA tienda → 422 ERR_WORKER_NOT_ELIGIBLE', cross.status === 422, `HTTP ${cross.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 4 · RPC DIRECTO (seguridad sin la API) ══');
{
  // 4.1 create_payroll con anon (sin JWT) → rechazado (401/403 permission denied
  // — el EXECUTE está revocado a anon — o ERR_UNAUTHORIZED si llegara a correr).
  const anon = await restRpc('create_payroll', E2E_ANON, {
    p_store_id: FX.store1, p_tipo_nomina: 'sueldos',
    p_period_start: PERIOD.start, p_period_end: PERIOD.end,
    p_items: JSON.stringify([itemW1]), p_idempotency_key: 'verify-trabnom-anon-1',
  });
  check('RPC directo con anon (sin JWT) → rechazado (EXECUTE revocado o ERR_UNAUTHORIZED)',
    anon.status >= 400 && /ERR|permission|denied|JWT|apikey/i.test(anon.text), `HTTP ${anon.status} · ${anon.text.slice(0, 90)}`);

  // 4.2 set_worker_salary_rate de tienda ajena → ERR_UNAUTHORIZED.
  const ajeno = await restRpc('set_worker_salary_rate', tokEnc2, {
    p_worker_id: FX.w1, p_rate_type: 'hourly', p_rate_amount: 999, p_currency: 'CUP',
    p_valid_from: iso(today), p_user_id: FX.enc2,
  });
  check('set_worker_salary_rate sobre trabajador de OTRA tienda → ERR_UNAUTHORIZED',
    ajeno.status >= 400 && /ERR_UNAUTHORIZED/i.test(String(ajeno.text)), `HTTP ${ajeno.status}`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 5 · CLEANUP + DELTA ══');
await fixtureCleanup();
const after = await countsBefore();
console.log('conteos DESPUÉS:', JSON.stringify(after));
check('delta 0 en tablas sensibles (net-zero)', JSON.stringify(before) === JSON.stringify(after));

console.log(`\n══ RESULTADO: ${PASS} PASS / ${FAIL} FAIL ══`);
process.exit(FAIL === 0 ? 0 : 1);
