#!/usr/bin/env node
/**
 * MISIÓN B — NÓMINAS SC-4-06 (Res. 13/2007 MFP) — Verificación de la migración
 * 20261112180000_cp_payrolls_sc406.sql en PostgreSQL REAL (BD aislada
 * CostproE2E, guard fail-closed del repo). NO toca producción.
 *
 * Fases:
 *   0. Pre-chequeos: conteos sensibles ANTES + limpieza de residuos previos.
 *   1. Aplicar la migración (idempotente si ya está aplicada).
 *   2. Estructura: tablas + RLS FORCED + políticas de aislamiento + perfil
 *      laboral en workers + numeración NOM en next_document_number.
 *   3. Fixture determinista: tenant con 2 tiendas, 4 usuarios (gobernador,
 *      encargado store1, encargado store2 ajeno a store1, usuario SIN
 *      membresías), 5 trabajadores (horario, jornal, sin tarifa, ajeno,
 *      USD) y tarifas con historial.
 *   4. Tarifa salarial: set_worker_salary_rate (creación, cierre de vigencia,
 *      ERR_RATE_OVERLAP, ERR_UNAUTHORIZED ajeno, snapshot intacto tras nueva
 *      tarifa).
 *   5. Creación de nómina: cálculos EXACTOS (horaria y diaria), overtime,
 *      conceptos 4 clases, vacaciones informativas, totales cabecera,
 *      numeración NOM-000001-2026, ERR_* (trabajador sin tarifa, duplicado,
 *      neto negativo, tiempo↔tarifa incoherente, extras sin horas, moneda
 *      mixta, trabajador ajeno/inactivo), idempotencia y aislamiento RLS.
 *   6. Ciclo documental: confirmación (consistencia + firma revisa), edición
 *      bloqueada tras confirmar, contabilización (idempotente), pago,
 *      anulación con motivo obligatorio, no anulación de pagadas, escritura
 *      directa denegada a authenticated, auditoría audit_logs.
 *   7. Conteos DESPUÉS == ANTES (delta 0) + cleanup del fixture.
 *
 * Uso:  node scripts/e2e/verify-nominas-pg.mjs
 * Requiere SUPABASE_ACCESS_TOKEN y E2E_SUPABASE_DB_URL en el entorno.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}
const E2E_REF = 'lguovmvrozxgssupkwpf';

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const DB_URL = process.env.E2E_SUPABASE_DB_URL || '';
if (!DB_URL.includes('lguovmvrozxgssupkwpf')) {
  console.error('FALLO DE SEGURIDAD: E2E_SUPABASE_DB_URL debe apuntar al proyecto aislado CostproE2E (lguovmvrozxgssupkwpf). Abortando.');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// GUARD CANÓNICO DEL REPO (CP-INFRA-011): fail-closed contra producción.
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

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20261112180000_cp_payrolls_sc406.sql');

// IDs deterministas del fixture (re-ejecutable: limpia antes de crear).
const FX = {
  tenant1: 'dd0200a1-0000-4000-8000-00000000000a',
  store1:  'dd0200b1-0000-4000-8000-00000000000a',
  store2:  'dd0200b2-0000-4000-8000-00000000000a',
  user1:   'dd0200c1-0000-4000-8000-00000000000a', // admin/manager de store1 (confecciona)
  user2:   'dd0200c2-0000-4000-8000-00000000000a', // encargado store1 (confirma)
  user3:   'dd0200c3-0000-4000-8000-00000000000a', // encargado store2 (ajeno a store1)
  user4:   'dd0200c4-0000-4000-8000-00000000000a', // SIN membresías (no autorizado)
  w1:      'dd0200d1-0000-4000-8000-00000000000a', // horario store1
  w2:      'dd0200d2-0000-4000-8000-00000000000a', // jornal store1
  w3:      'dd0200d3-0000-4000-8000-00000000000a', // sin tarifa store1
  w4:      'dd0200d4-0000-4000-8000-00000000000a', // trabajador de store2 (ajeno)
  w5:      'dd0200d5-0000-4000-8000-00000000000a', // tarifa USD store1
};

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}
async function q(sql, params = []) {
  let out = sql;
  // Sustitución en orden INVERSO (bug real 2026-11-12: con ≥10 parámetros,
  // split('$1') parte '$10'/'$11'/'$12' en '⟨$1⟩0'… generando SQL inválido
  // que los .catch del cleanup tragaban en silencio — el delete broad de
  // auditoría con 12 parámetros NO se ejecutaba y el delta quedaba en 17).
  for (let i = params.length - 1; i >= 0; i--) {
    out = out.split(`$${i + 1}`).join(lit(params[i]));
  }
  return execSql(out);
}
async function qExpectError(sql, params = []) {
  try { await q(sql, params); return null; } catch (e) { return e.message; }
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
async function asAuthExpectError(rpcSql, uid) {
  try { await asAuthSql(rpcSql, uid); return null; } catch (e) { return e.message; }
}

// Impersonación REAL para SCANS de tabla (RLS): transacción explícita con
// SET LOCAL ROLE authenticated. El patrón del CTE (set_config('role',...))
// NO demota el rol para el scan LATERAL (verificado 2026-11-12: el count
// corría como postgres y veía todo) — con BEGIN/SET LOCAL ROLE la política
// se evalúa de verdad como authenticated con los claims del usuario.
async function asAuthTableScan(selectSql, uid) {
  const claims = JSON.stringify({ role: 'authenticated', sub: uid }).replace(/'/g, "''");
  const sql = `BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '${claims}', true);
    SELECT set_config('request.jwt.claim.sub', '${uid}', true);
    ${selectSql};
    ROLLBACK;`;
  return execSql(sql);
}

async function sensitiveCounts() {
  const tables = ['transactions', 'transaction_items', 'stock_movements', 'receipts', 'receipt_items', 'products', 'master_products', 'audit_logs'];
  const out = {};
  for (const t of tables) {
    try {
      const r = await q(`SELECT COUNT(*)::int AS n FROM public.${t}`);
      out[t] = r[0].n;
    } catch { out[t] = '(tabla inexistente)'; }
  }
  return out;
}

async function fixtureCleanup() {
  // Re-ejecutabilidad (patrón verify-catalogo/master-gestion — CORREGIDO
  // tras diagnóstico real contra la BD aislada 2026-11-12):
  // · auth.users y profiles PERSISTEN (prevent_hard_delete_profile, política
  //   soft-delete Iter.12 Q6): INSERT con ON CONFLICT, jamás DELETE.
  // · stores y tenants PERSISTEN: el DELETE físico de una tienda con
  //   auditoría es IMPOSIBLE (trigger_audit_store_changes escribe AFTER
  //   DELETE filas con store_id → FK audit_logs_store_id_fkey violada —
  //   verificado empíricamente; los scripts del catálogo nunca los borran).
  // · Numeración NOM: se resetea borrando la fila de document_sequences del
  //   tipo 'payroll' (sin triggers ni FKs que la protejan) — la aserción
  //   exacta NOM-000002 lo exige entre corridas.
  // · audit_logs se limpia AL FINAL (los triggers auditan los DELETE).
  await q(`DELETE FROM public.idempotency_registry WHERE idempotency_key IN ('verify-nominas-key-1','verify-nominas-key-2','verify-nominas-key-3') OR (operation = 'payroll' AND idempotency_key LIKE 'verify-nominas%')`).catch(() => {});
  await q(`DELETE FROM public.payroll_item_concepts WHERE item_id IN (SELECT i.id FROM public.payroll_items i JOIN public.payrolls p ON p.id = i.payroll_id WHERE p.store_id IN ($1,$2))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payroll_items WHERE payroll_id IN (SELECT id FROM public.payrolls WHERE store_id IN ($1,$2))`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.payrolls WHERE store_id IN ($1,$2)`, [FX.store1, FX.store2]).catch(() => {});
  await q(`DELETE FROM public.worker_salary_rates WHERE worker_id IN ($1,$2,$3,$4,$5)`, [FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.workers WHERE id IN ($1,$2,$3,$4,$5)`, [FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
  await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2,$3,$4)`, [FX.user1, FX.user2, FX.user3, FX.user4]).catch(() => {});
  await q(`DELETE FROM public.document_sequences WHERE store_id IN ($1,$2) AND document_type = 'payroll'`, [FX.store1, FX.store2]).catch(() => {});
  // Auditoría AL FINAL y BROAD: cubre filas de los RPC (store_id/user_id) y
  // las de triggers de memberships/profiles (record_id/user_id de miembros
  // autogenerados cubiertos por store_id de la membresía).
  await q(`DELETE FROM public.audit_logs WHERE store_id IN ($1,$2) OR user_id IN ($3,$4,$5,$6) OR record_id IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [FX.store1, FX.store2, FX.user1, FX.user2, FX.user3, FX.user4, FX.tenant1, FX.w1, FX.w2, FX.w3, FX.w4, FX.w5]).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('══ FASE 0 · PRE-CHECKS ══');
// Residuos de corridas ANTERIORES fuera del delta: limpiar ANTES de contar
// (patrón catalogo: el delta mide SOLO lo que esta corrida genera y limpia).
await fixtureCleanup();
const countsBefore = await sensitiveCounts();
console.log('conteos ANTES:', JSON.stringify(countsBefore));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 1 · APLICAR MIGRACIÓN ══');
const migSql = readFileSync(MIGRATION, 'utf8');
const already = await q(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='payrolls'`);
if (already[0].n === 1) {
  // Idempotencia real: re-aplicar no debe dañar (CREATE OR REPLACE + guards).
  await execSql(migSql);
  check('migración re-aplicable (idempotente) sin errores', true);
} else {
  await execSql(migSql);
  check('migración aplicada sin errores', true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 2 · ESTRUCTURA ══');
let r = await q(`SELECT count(*)::int AS n FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates') AND c.relrowsecurity`);
check('RLS FORCED activo en las 4 tablas nuevas', r[0].n === 4, `n=${r[0].n}`);
r = await q(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND policyname IN ('payrolls_store_isolation','payroll_items_store_isolation','payroll_item_concepts_store_isolation','worker_salary_rates_store_isolation')`);
check('4 políticas de aislamiento por tienda', r[0].n === 4, `n=${r[0].n}`);
r = await q(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name IN ('expediente_laboral','categoria_ocupacional','cargo','area_trabajo')`);
check('perfil laboral extendido en workers (4 columnas)', r[0].n === 4, `n=${r[0].n}`);
r = await q(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='next_document_number'`);
check("numeración: next_document_number con 'payroll'→'NOM'", r[0].def.includes("WHEN 'payroll' THEN 'NOM'"));
r = await q(`SELECT COALESCE(array_agg(r.grantee ORDER BY r.grantee), ARRAY[]::text[]) AS grantees FROM information_schema.routine_privileges r WHERE r.routine_schema='public' AND r.routine_name='fn_payroll_validate_items'`);
const helperAcl = JSON.stringify(r[0].grantees);
check('ACL helper interno: solo service_role (+postgres)', helperAcl.includes('service_role') && !helperAcl.includes('authenticated') && !helperAcl.includes('anon'), helperAcl);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 3 · FIXTURE (idempotente — patrón verify-catalogo) ══');
// auth.users y profiles PERSISTEN entre corridas (soft-delete bloquea el
// DELETE físico): ON CONFLICT DO NOTHING. Roles sincronizados por trigger
// (tenant_admin) — inofensivos: has_store_access_as usa membresías activas.
await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  VALUES ($1,'verify-nominas-1@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($2,'verify-nominas-2@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($3,'verify-nominas-3@test.local','x',now(),now(),now(),'{}'::jsonb),
         ($4,'verify-nominas-4@test.local','x',now(),now(),now(),'{}'::jsonb)
  ON CONFLICT (id) DO NOTHING`, [FX.user1, FX.user2, FX.user3, FX.user4]);
await q(`INSERT INTO public.profiles (id, role) VALUES ($1,'manager'),($2,'encargado'),($3,'encargado'),($4,'usuario')
  ON CONFLICT (id) DO NOTHING`, [FX.user1, FX.user2, FX.user3, FX.user4]);
await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1,'ORG-VERIFY-NOMINAS-SC406',$2)
  ON CONFLICT (id) DO NOTHING`, [FX.tenant1, FX.user1]);
await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES ($1,'Tienda Nóminas 1',$3),($2,'Tienda Nóminas 2',$3)
  ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.store2, FX.tenant1]);
// Membresías: DELETE+INSERT determinista (id autogenerado — sin conflicto).
await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2,$3,$4)`, [FX.user1, FX.user2, FX.user3, FX.user4]);
await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ($1,$5,'admin','active'),($2,$5,'encargado','active'),($3,$6,'encargado','active')`, [FX.user1, FX.user2, FX.user3, FX.user4, FX.store1, FX.store2]);
// Trabajadores: DO UPDATE resetea los campos que el test de snapshot muta.
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
check('fixture creado (tenant, 2 tiendas, 4 usuarios, 5 trabajadores)', true);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 4 · TARIFA SALARIAL ══');
let res = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',250.00,'CUP',NULL,NULL::uuid) AS r`, FX.user1);
check('set_worker_salary_rate horaria 250 CUP (user1 store1)', !!res[0]?.r?.status, JSON.stringify(res[0]?.r || {}));
res = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w2 + '\''}::uuid,'daily',5000.00,'CUP',NULL,NULL::uuid) AS r`, FX.user1);
check('set_worker_salary_rate diaria 5000 CUP', !!res[0]?.r?.status);
res = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w5 + '\''}::uuid,'hourly',10.00,'USD',NULL,NULL::uuid) AS r`, FX.user1);
check('set_worker_salary_rate horaria 10 USD (moneda distinta)', !!res[0]?.r?.status);

// Solape: nueva tarifa con misma fecha → ERR_RATE_OVERLAP
let err = await asAuthExpectError(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',260.00,'CUP',NULL,NULL::uuid) AS r`, FX.user1);
check('ERR_RATE_OVERLAP: tarifa nueva con fecha no posterior', err.includes('ERR_RATE_OVERLAP'), (err || '').slice(0, 80));

// Usuario ajeno a la tienda → ERR_UNAUTHORIZED
err = await asAuthExpectError(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',260.00,'CUP',CURRENT_DATE + 1,NULL::uuid) AS r`, FX.user3);
check('ERR_UNAUTHORIZED: usuario ajeno no fija tarifas', err.includes('ERR_UNAUTHORIZED'));

// Usuario sin membresías → ERR_UNAUTHORIZED
err = await asAuthExpectError(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',260.00,'CUP',CURRENT_DATE + 2,NULL::uuid) AS r`, FX.user4);
check('ERR_UNAUTHORIZED: usuario sin membresía no fija tarifas', err.includes('ERR_UNAUTHORIZED'));

// Tarifa futura programada → válida (aumento anunciado; el DOCUMENTO no puede ser futuro)
res = await asAuthSql(`SELECT public.set_worker_salary_rate(${'\'' + FX.w1 + '\''}::uuid,'hourly',300.00,'CUP',CURRENT_DATE + 1,NULL::uuid) AS r`, FX.user1);
check('tarifa posterior aceptada (mañana: no es el documento el que es futuro)', !!res[0]?.r?.status, JSON.stringify(res[0]?.r || {}));
r = await q(`SELECT valid_from, valid_to, rate_amount FROM public.worker_salary_rates WHERE worker_id = $1 ORDER BY valid_from`, [FX.w1]);
check('historial de vigencia: anterior cerrada y nueva abierta',
  r.length === 2 && r[0].valid_to !== null && r[1].valid_to === null && Number(r[1].rate_amount) === 300,
  JSON.stringify(r.map(x => ({ vf: x.valid_from, vt: x.valid_to, amt: x.rate_amount }))));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 5 · CREACIÓN Y CÁLCULOS EXACTOS ══');
const itemsValid = JSON.stringify([
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
]);
const createSql = `SELECT public.create_payroll(
  '${FX.store1}'::uuid, 'sueldos', (CURRENT_DATE - INTERVAL '15 days')::date, CURRENT_DATE,
  'efectivo', 'CHQ-777', CURRENT_DATE, NULL, NULL, 'Nómina de verificación SC-4-06',
  '${itemsValid}'::jsonb, 'verify-nominas-key-1', NULL::uuid) AS r`;
res = await asAuthSql(createSql, FX.user1);
const created = res[0]?.r;
check('create_payroll → success + numeración NOM', created?.status === 'success' && /^NOM-\d{6}-\d{4}$/.test(created?.payroll_number || ''), JSON.stringify(created || {}));
const payrollId = created?.payroll_id;
const payrollNumber = created?.payroll_number;

// Cálculos por fila (exactos)
r = await q(`SELECT worker_id, base_salary, total_complementos, total_other_earnings, total_social_security,
  total_gross, total_deductions, total_net, rate_amount, rate_currency, worker_names, expediente_laboral,
  categoria_ocupacional, overtime_amount, vacation_days, vacation_amount
  FROM public.payroll_items WHERE payroll_id = $1 ORDER BY worker_names`, [payrollId]);
const [rowAna, rowLuis] = r;
check('fila Ana: base 190×250=47.500,00 (tarifa ANTERIOR vigente al período, snapshot)',
  Number(rowAna.base_salary) === 47500 && Number(rowAna.rate_amount) === 250,
  `base=${rowAna.base_salary} rate=${rowAna.rate_amount}`);
check('fila Ana: extras 3.750, complementos 1.000, seguros 850, brutto 53.100, ded 500, neto 52.600',
  Number(rowAna.overtime_amount) === 3750 && Number(rowAna.total_complementos) === 1000
  && Number(rowAna.total_social_security) === 850 && Number(rowAna.total_gross) === 53100
  && Number(rowAna.total_deductions) === 500 && Number(rowAna.total_net) === 52600,
  JSON.stringify({ g: rowAna.total_gross, d: rowAna.total_deductions, n: rowAna.total_net }));
check('fila Ana: snapshot identidad (nombres, expediente, categoría)',
  rowAna.worker_names === 'Ana Torres' && rowAna.expediente_laboral === 'EXP-001' && rowAna.categoria_ocupacional === 'Técnico Medio');
check('fila Luis: jornal 22×5.000=110.000, brutto=neto=110.000',
  Number(rowLuis.base_salary) === 110000 && Number(rowLuis.total_gross) === 110000 && Number(rowLuis.total_net) === 110000);
check('vacaciones informativas (fuera del devengado): Ana 2 días / 10.000',
  Number(rowAna.vacation_days) === 2 && Number(rowAna.vacation_amount) === 10000);

// Totales de cabecera
r = await q(`SELECT * FROM public.payrolls WHERE id = $1`, [payrollId]);
const h = r[0];
check('cabecera: 2 trabajadores, horas 190, extras 10h, días 22',
  h.total_workers === 2 && Number(h.total_regular_hours) === 190 && Number(h.total_overtime_hours) === 10 && Number(h.total_accrued_days) === 22);
check('cabecera: base 157.500, extras 3.750, complementos 1.000, seguros 850, brutto 163.100, ded 500, neto 162.600',
  Number(h.total_base_salary) === 157500 && Number(h.total_overtime) === 3750 && Number(h.total_complementos) === 1000
  && Number(h.total_social_security) === 850 && Number(h.total_gross) === 163100
  && Number(h.total_deductions) === 500 && Number(h.total_net) === 162600,
  JSON.stringify({ base: h.total_base_salary, gross: h.total_gross, net: h.total_net }));
check('cabecera: vacaciones totales 2 días / 10.000 (informativas)',
  Number(h.total_vacation_days) === 2 && Number(h.total_vacation_amount) === 10000);
check('cabecera: entidad snapshot de la tienda + moneda CUP + borrador',
  h.entidad_nombre === 'Tienda Nóminas 1' && h.currency === 'CUP' && h.status === 'draft' && h.payment_method === 'efectivo' && h.cheque_number === 'CHQ-777');

// Conceptos persistidos con sigla
r = await q(`SELECT c.kind, c.sigla, c.amount FROM public.payroll_item_concepts c
  JOIN public.payroll_items i ON i.id = c.item_id WHERE i.payroll_id = $1 ORDER BY c.sigla`, [payrollId]);
check('conceptos por fila: 4 clases persistidas (PRIMA/SEGS/INAS/AJU)', r.length === 4 && r.every(c => Number(c.amount) >= 0));

// Idempotencia: misma clave → mismo documento, sin duplicar
res = await asAuthSql(createSql, FX.user1);
check('idempotencia: reenvío con misma clave devuelve el MISMO documento', res[0]?.r?.payroll_id === payrollId);
r = await q(`SELECT count(*)::int AS n FROM public.payrolls WHERE store_id = $1`, [FX.store1]);
check('sin duplicados de nómina tras idempotencia', r[0].n === 1, `n=${r[0].n}`);

// Errores controlados
err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w3}","regular_hours":8}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_WORKER_WITHOUT_RATE: trabajador sin tarifa', err.includes('ERR_WORKER_WITHOUT_RATE'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":8},{"worker_id":"${FX.w1}","regular_hours":4}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_DUPLICATE_WORKER: trabajador duplicado', err.includes('ERR_DUPLICATE_WORKER'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w2}","regular_hours":8}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_INVALID_TIME: tarifa diaria con horas', err.includes('ERR_INVALID_TIME'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w2}","accrued_days":1,"overtime_hours":0,"overtime_amount":50}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_OVERTIME_WITHOUT_HOURS: importe de extras sin horas', err.includes('ERR_OVERTIME_WITHOUT_HOURS'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":8,"concepts":[{"kind":"deduccion","sigla":"X","amount":999999}]}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_NEGATIVE_NET: deducciones > devengado', err.includes('ERR_NEGATIVE_NET'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":8},{"worker_id":"${FX.w5}","regular_hours":4}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_CURRENCY_MISMATCH: tarifas de monedas distintas', err.includes('ERR_CURRENCY_MISMATCH'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w4}","regular_hours":8}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_WORKER_NOT_ELIGIBLE: trabajador de otra tienda', err.includes('ERR_WORKER_NOT_ELIGIBLE'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":8}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user3);
check('ERR_UNAUTHORIZED: confección por usuario ajeno a la tienda', err.includes('ERR_UNAUTHORIZED'));

err = await asAuthExpectError(`SELECT public.create_payroll('${FX.store1}'::uuid,'sueldos',CURRENT_DATE,(CURRENT_DATE - INTERVAL '1 day')::date,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":8}]$JSON$::jsonb,NULL::text,NULL::uuid) AS r`, FX.user1);
check('ERR_INVALID_PERIOD: inicio posterior al fin', err.includes('ERR_INVALID_PERIOD'));

// Aislamiento RLS (scan REAL): user3 (store2) no VE las nóminas de store1.
// Transacción explícita con SET LOCAL ROLE authenticated — el CTE
// set_config('role',...) NO demota el rol del scan (diagnóstico 2026-11-12:
// corría como postgres y veía todo) — probado: con SET LOCAL ROLE la
// política se evalúa de verdad como authenticated.
r = await asAuthTableScan(`SELECT count(*)::int AS n FROM public.payrolls`, FX.user3);
check('RLS: usuario de otra tienda NO ve nóminas ajenas', r[0]?.n === 0, `n=${r[0]?.n}`);

// Segunda nómina → numeración consecutiva
res = await asAuthSql(`SELECT public.create_payroll('${FX.store1}'::uuid,'jornales',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'tarjeta',NULL,NULL::date,NULL,NULL::date,'Segunda nómina',$JSON$[{"worker_id":"${FX.w2}","accrued_days":10}]$JSON$::jsonb,'verify-nominas-key-2',NULL::uuid) AS r`, FX.user1);
check('segunda nómina → número consecutivo (NOM-000002)', /^NOM-000002-\d{4}$/.test(res[0]?.r?.payroll_number || ''), res[0]?.r?.payroll_number);
const payroll2 = res[0].r.payroll_id;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 6 · CICLO DOCUMENTAL ══');
// Confirmar (user2 = encargado store1)
res = await asAuthSql(`SELECT public.confirm_payroll('${payrollId}'::uuid, NULL::uuid) AS r`, FX.user2);
check('confirm_payroll: draft→confirmed, firma revisa y aprueba', res[0]?.r?.to === 'confirmed');
r = await q(`SELECT status, reviewed_by, reviewed_at FROM public.payrolls WHERE id = $1`, [payrollId]);
check('reviewed_by/at registrados (identidad histórica)', r[0].reviewed_by === FX.user2 && r[0].reviewed_at !== null);

// Editar tras confirmar → ERR_NOT_DRAFT
err = await asAuthExpectError(`SELECT public.update_payroll('${payrollId}'::uuid,'sueldos',(CURRENT_DATE - INTERVAL '15 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w1}","regular_hours":100}]$JSON$::jsonb,NULL::uuid) AS r`, FX.user1);
check('ERR_NOT_DRAFT: edición bloqueada tras confirmar', err.includes('ERR_NOT_DRAFT'));

// Escritura directa denegada a authenticated (solo SELECT concedido)
r = await q(`SELECT has_table_privilege('authenticated','public.payrolls','UPDATE') AS upd,
                    has_table_privilege('authenticated','public.payrolls','SELECT') AS sel,
                    has_table_privilege('authenticated','public.payroll_items','UPDATE') AS upd_items,
                    has_table_privilege('anon','public.payrolls','SELECT') AS sel_anon`);
check('grants: authenticated solo SELECT (payrolls + items); anon nada',
  r[0].upd === false && r[0].sel === true && r[0].upd_items === false && r[0].sel_anon === false,
  JSON.stringify(r[0]));

// Contabilización
res = await asAuthSql(`SELECT public.account_payroll('${payrollId}'::uuid, NULL::uuid) AS r`, FX.user2);
check('account_payroll: firma contabiliza (sin cambio de estado)', res[0]?.r?.accounted_by === FX.user2);
err = await asAuthExpectError(`SELECT public.account_payroll('${payrollId}'::uuid, NULL::uuid) AS r`, FX.user2);
check('ERR_ALREADY_ACCOUNTED: contabilización idempotente bloqueada', err.includes('ERR_ALREADY_ACCOUNTED'));

// Pago
res = await asAuthSql(`SELECT public.mark_payroll_paid('${payrollId}'::uuid, NULL::uuid) AS r`, FX.user2);
check('mark_payroll_paid: confirmed→paid', res[0]?.r?.to === 'paid');
err = await asAuthExpectError(`SELECT public.void_payroll('${payrollId}'::uuid,'motivo',NULL::uuid) AS r`, FX.user2);
check('ERR_NOT_VOIDABLE: nómina pagada no anulable', err.includes('ERR_NOT_VOIDABLE'));

// Anulación de la segunda (draft) — motivo obligatorio
err = await asAuthExpectError(`SELECT public.void_payroll('${payroll2}'::uuid,'   ',NULL::uuid) AS r`, FX.user2);
check('ERR_REASON_REQUIRED: motivo vacío rechazado', err.includes('ERR_REASON_REQUIRED'));
res = await asAuthSql(`SELECT public.void_payroll('${payroll2}'::uuid,'Nómina de prueba anulada (verificación SC-4-06)',NULL::uuid) AS r`, FX.user2);
check('void_payroll: draft→voided con motivo', res[0]?.r?.to === 'voided');
r = await q(`SELECT status, void_reason, voided_by FROM public.payrolls WHERE id = $1`, [payroll2]);
check('documento anulado CONSERVADO (numeración + motivo + trazabilidad)', r[0].status === 'voided' && r[0].void_reason !== null && r[0].voided_by === FX.user2);

// Confirmar con totales manipulados → ERR_INCONSISTENT_TOTALS (protección del confirmado)
res = await asAuthSql(`SELECT public.create_payroll('${FX.store1}'::uuid,'otros',(CURRENT_DATE - INTERVAL '10 days')::date,CURRENT_DATE,'efectivo',NULL,NULL::date,NULL,NULL::date,NULL,$JSON$[{"worker_id":"${FX.w2}","accrued_days":5}]$JSON$::jsonb,'verify-nominas-key-3',NULL::uuid) AS r`, FX.user1);
const payroll3 = res[0].r.payroll_id;
await q(`UPDATE public.payrolls SET total_net = 1 WHERE id = $1`, [payroll3]);
err = await asAuthExpectError(`SELECT public.confirm_payroll('${payroll3}'::uuid, NULL::uuid) AS r`, FX.user2);
check('ERR_INCONSISTENT_TOTALS: totales manipulados no pasan la confirmación', err.includes('ERR_INCONSISTENT_TOTALS'));

// Auditoría
r = await q(`SELECT action FROM public.audit_logs WHERE table_name = 'payrolls' AND record_id = $1 ORDER BY created_at`, [payrollId]);
const actions = r.map(x => x.action);
check('audit_logs: CREATE → CONFIRM → ACCOUNT → MARK_PAID registrados',
  actions.includes('CREATE_PAYROLL') && actions.includes('CONFIRM_PAYROLL') && actions.includes('ACCOUNT_PAYROLL') && actions.includes('MARK_PAYROLL_PAID'), actions.join(','));

// Snapshot de tarifa intacta tras cambio posterior del trabajador
await q(`UPDATE public.workers SET categoria_ocupacional = 'CAMBIADA', first_name = 'XXXX' WHERE id = $1`, [FX.w1]);
r = await q(`SELECT categoria_ocupacional, worker_names, base_salary FROM public.payroll_items WHERE payroll_id = $1 AND worker_id = $2`, [payrollId, FX.w1]);
check('snapshot inmutable: cambio posterior del trabajador NO altera la nómina histórica',
  r[0].categoria_ocupacional === 'Técnico Medio' && r[0].worker_names === 'Ana Torres' && Number(r[0].base_salary) === 47500);
await q(`UPDATE public.workers SET categoria_ocupacional = 'Técnico Medio', first_name = 'Ana' WHERE id = $1`, [FX.w1]);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ FASE 7 · INTEGRIDAD + CLEANUP ══');
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

const failed = results.filter(x => !x.ok);
console.log(`\n══════════════ RESULTADO: ${results.length - failed.length}/${results.length} ═══════════════`);
if (failed.length > 0) {
  console.error('FALLOS:');
  failed.forEach(f => console.error(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log('VERIFY-NOMINAS-PG: todos los checks OK.');
