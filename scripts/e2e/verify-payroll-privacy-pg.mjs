#!/usr/bin/env node
/**
 * verify-payroll-privacy-pg.mjs — CP-SEC-PAYROLL (CP-SECURITY-AND-BACKLOG-CLOSURE-001)
 *
 * MATRIZ OBLIGATORIA DE PRUEBAS DE PRIVACIDAD DE NÓMINAS (misión §3),
 * ejecutada contra la BD AISLADA CostproE2E con impersonación REAL de RLS
 * (BEGIN; SET LOCAL ROLE authenticated + claims — patrón verificado
 * 2026-11-12 de verify-nominas-pg.mjs: el CTE set_config NO demota el rol
 * para el scan; esta forma SÍ evalúa las políticas como authenticated).
 *
 * Matriz exigida (SELECT sobre payrolls / payroll_items /
 * payroll_item_concepts / worker_salary_rates):
 *   | Perfil            | Nómina de su tienda | Nómina de otra tienda |
 *   | superadmin        | Permitido           | Permitido             |
 *   | admin de la tienda| Permitido           | Denegado              |
 *   | encargado         | Denegado            | Denegado              |
 *   | clerk             | Denegado            | Denegado              |
 *   | usuario           | Denegado            | Denegado              |
 *   | no autenticado    | Denegado            | Denegado              |
 *
 * Además: gate administrativo de los 7 RPC (create/update/confirm/account/
 * mark_paid/void/set_worker_salary_rate) — un miembro NO admin jamás puede
 * confeccionar ni transicionar nóminas aunque llame al RPC directamente.
 *
 * Pre-requisito: las migraciones 20261112180000 y 20261114180000 aplicadas
 * a la BD aislada (replay del manifiesto). El script NO aplica migraciones.
 *
 * Uso:  node scripts/e2e/verify-payroll-privacy-pg.mjs
 * Requiere SUPABASE_ACCESS_TOKEN y E2E_SUPABASE_DB_URL (aislada).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido para el transporte Management API.');
  process.exit(2);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const DB_URL = process.env.E2E_SUPABASE_DB_URL || '';
if (!DB_URL.includes(E2E_REF)) {
  console.error('FALLO DE SEGURIDAD: E2E_SUPABASE_DB_URL debe apuntar al proyecto aislado CostproE2E. Abortando.');
  process.exit(2);
}

// GUARD CANÓNICO (CP-INFRA-011)
const { assertIsolatedDb } = await import(
  join(repoRoot, 'e2e', 'fixtures', 'assert-isolated-db.cjs')
);
if (typeof assertIsolatedDb !== 'function') {
  console.error('FALLO DE SEGURIDAD: guard canónico no disponible. Abortando.');
  process.exit(2);
}
await assertIsolatedDb();

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
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`);
};

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

// Impersonación REAL de RLS para scans (patrón VERIFICADO 2026-11-12 en
// verify-nominas-pg.mjs: BEGIN + SET LOCAL ROLE authenticated + claims;
// la política se evalúa de verdad como authenticated y la API devuelve el
// resultset del SELECT).
async function asAuthTableScan(selectSql, uid) {
  const claims = JSON.stringify({ role: 'authenticated', sub: uid }).replace(/'/g, "''");
  const sql = `BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claims', '${claims}', true);
    SELECT set_config('request.jwt.claim.sub', '${uid}', true);
    ${selectSql};
    ROLLBACK;`;
  return execSql(sql);
}

async function asRoleTableScan(selectSql, role) {
  const sql = `BEGIN; SET LOCAL ROLE ${role}; ${selectSql}; ROLLBACK;`;
  return execSql(sql);
}

async function countAs(uid, table, where) {
  const r = await asAuthTableScan(`SELECT COUNT(*)::int AS n FROM public.${table} WHERE ${where}`, uid);
  return r[0]?.n;
}

async function asAuthRpc(rpcCall, uid) {
  const claims = lit(JSON.stringify({ role: 'authenticated', sub: uid }));
  // Para RPC usamos el CTE de claims (la función es SECURITY DEFINER: lee
  // auth.uid() de los claims; el gate can_manage_payroll_as se evalúa con
  // la identidad del claim, exactamente como PostgREST).
  const sql = `WITH setup AS (
    SELECT set_config('role','authenticated',false) AS a,
           set_config('request.jwt.claims', ${claims}, false) AS b,
           set_config('request.jwt.claim.sub', ${lit(uid)}, false) AS c
  )
  SELECT r.* FROM setup, LATERAL ( ${rpcCall} ) r;`;
  return execSql(sql);
}
async function asAuthRpcExpectError(rpcCall, uid) {
  try { await asAuthRpc(rpcCall, uid); return null; } catch (e) { return e.message; }
}

// ── Fixture determinista (prefijo ee…, limpio antes y después) ──
const FX = {
  tenantA: 'ee100000-0000-4000-8000-00000000000a',
  tenantB: 'ee100000-0000-4000-8000-00000000000b',
  store1:  'ee100001-0000-4000-8000-000000000001', // tenant A
  store2:  'ee100002-0000-4000-8000-000000000002', // tenant A
  store3:  'ee100003-0000-4000-8000-000000000003', // tenant B
  uSuper:  'ee100010-0000-4000-8000-000000000010', // superadmin de plataforma (sin membresías)
  uAdmPlat:'ee100011-0000-4000-8000-000000000011', // admin de plataforma del tenant A
  uAdmSto: 'ee100012-0000-4000-8000-000000000012', // admin de TIENDA (membresía admin en store1)
  uEnc:    'ee100013-0000-4000-8000-000000000013', // encargado store1
  uClerk:  'ee100014-0000-4000-8000-000000000014', // clerk store1
  uUsu:    'ee100015-0000-4000-8000-000000000015', // usuario store1
  w1:      'ee100020-0000-4000-8000-000000000020', // trabajador store1 con tarifa
  rate1:   'ee100021-0000-4000-8000-000000000021',
  p1:      'ee100030-0000-4000-8000-000000000030', // nómina store1 (draft)
  p1c:     'ee100033-0000-4000-8000-000000000033', // nómina store1 (CONFIRMADA — para mark_paid/account)
  p2:      'ee100031-0000-4000-8000-000000000031', // nómina store2 (tenant A)
  p3:      'ee100032-0000-4000-8000-000000000032', // nómina store3 (tenant B)
  pi1:     'ee100040-0000-4000-8000-000000000040', // línea de p1
};

async function cleanup() {
  // Orden por FKs: concepts → items → payrolls → rates → workers → memberships.
  // Los payrolls creados dinámicamente por los tests D9/D10 (numeración
  // NOM-00000X del document_sequences) también se limpian: las tiendas EE son
  // exclusivas de este script, todo payrolls suyo es del fixture.
  await q(`DELETE FROM public.payroll_item_concepts WHERE item_id IN (
    SELECT i.id FROM public.payroll_items i
    WHERE i.payroll_id IN (SELECT id FROM public.payrolls WHERE store_id IN ($1,$2,$3)))`,
    [FX.store1, FX.store2, FX.store3]);
  await q(`DELETE FROM public.payroll_items WHERE worker_id = $1 OR payroll_id IN (
    SELECT id FROM public.payrolls WHERE store_id IN ($2,$3,$4))`,
    [FX.w1, FX.store1, FX.store2, FX.store3]);
  await q(`DELETE FROM public.payrolls WHERE id IN ($1,$2,$3,$4) OR store_id IN ($5,$6,$7)`,
    [FX.p1, FX.p1c, FX.p2, FX.p3, FX.store1, FX.store2, FX.store3]);
  await q(`DELETE FROM public.worker_salary_rates WHERE worker_id = $1 OR id = $2`, [FX.w1, FX.rate1]);
  await q(`DELETE FROM public.workers WHERE id = $1`, [FX.w1]);
  await q(`DELETE FROM public.user_store_memberships WHERE user_id IN ($1,$2,$3,$4,$5)`,
    [FX.uAdmSto, FX.uEnc, FX.uClerk, FX.uUsu, FX.uSuper]);
  await q(`DELETE FROM public.document_sequences WHERE store_id IN ($1,$2,$3) AND document_type='payroll'`,
    [FX.store1, FX.store2, FX.store3]);
}

async function main() {
  console.log('== CP-SEC-PAYROLL: matriz de privacidad de nóminas (BD aislada) ==\n');

  // ── FASE A: sanidad de las políticas instaladas ──
  const policies = await q(`SELECT tablename, policyname FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('payrolls','payroll_items','payroll_item_concepts','worker_salary_rates')
     ORDER BY tablename, policyname`);
  const policyNames = policies.map((p) => p.policyname);
  check('A1. políticas antigua (solo-membresía) reemplazadas',
    !policyNames.some((n) => n.endsWith('_store_isolation')),
    policyNames.join(', '));
  check('A2. las 4 políticas SELECT restrictivas presentes',
    ['payrolls_admin_privacy', 'payroll_items_admin_privacy', 'payroll_item_concepts_admin_privacy', 'worker_salary_rates_admin_privacy']
      .every((n) => policyNames.includes(n)));
  const gates = await q(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='public' AND p.proname IN ('create_payroll','update_payroll','confirm_payroll','account_payroll','mark_payroll_paid','void_payroll','set_worker_salary_rate')
       AND pg_get_functiondef(p.oid) LIKE '%can_manage_payroll_as(v_caller_uid%'`);
  check('A3. los 7 RPC gatean con can_manage_payroll_as', gates[0].n === 7, `${gates[0].n}/7`);

  // ── FASE B: fixture ──
  await cleanup();
  // auth.users primero (FK profiles_id_fkey); persisten entre corridas (patrón
  // verify-nominas-pg: soft-delete impide el DELETE físico de profiles).
  await q(`INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    VALUES ($1,'ee-privacy-super@test.local','x',now(),now(),now(),'{}'::jsonb),
           ($2,'ee-privacy-admplat@test.local','x',now(),now(),now(),'{}'::jsonb),
           ($3,'ee-privacy-admsto@test.local','x',now(),now(),now(),'{}'::jsonb),
           ($4,'ee-privacy-enc@test.local','x',now(),now(),now(),'{}'::jsonb),
           ($5,'ee-privacy-clerk@test.local','x',now(),now(),now(),'{}'::jsonb),
           ($6,'ee-privacy-usu@test.local','x',now(),now(),now(),'{}'::jsonb)
    ON CONFLICT (id) DO NOTHING`, [FX.uSuper, FX.uAdmPlat, FX.uAdmSto, FX.uEnc, FX.uClerk, FX.uUsu]);
  await q(`INSERT INTO public.profiles (id, role) VALUES
    ($1,'superadmin'),($2,'admin'),($3,'usuario'),($4,'encargado'),($5,'usuario'),($6,'usuario')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
    [FX.uSuper, FX.uAdmPlat, FX.uAdmSto, FX.uEnc, FX.uClerk, FX.uUsu]);
  // tenants primero (FK profiles.tenant_id → tenants), luego el UPDATE del
  // tenant de cada profile (FK circular profiles↔tenants).
  await q(`INSERT INTO public.tenants (id, name, owner_id) VALUES ($1,'ORG-EE-PRIVACY-A',$2),($3,'ORG-EE-PRIVACY-B',$2)
    ON CONFLICT (id) DO NOTHING`, [FX.tenantA, FX.uAdmPlat, FX.tenantB]);
  await q(`UPDATE public.profiles SET tenant_id = $7 WHERE id IN ($2,$3,$4,$5,$6)
    AND (tenant_id IS DISTINCT FROM $7)`,
    [FX.uSuper, FX.uAdmPlat, FX.uAdmSto, FX.uEnc, FX.uClerk, FX.uUsu, FX.tenantA]);
  await q(`INSERT INTO public.stores (id, name, tenant_id) VALUES
    ($1,'EE Privacidad Store1',$4),($2,'EE Privacidad Store2',$4),($3,'EE Privacidad Store3',$5)
    ON CONFLICT (id) DO NOTHING`, [FX.store1, FX.store2, FX.store3, FX.tenantA, FX.tenantB]);
  await q(`INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
    ($1,$6,'admin','active'),($2,$6,'encargado','active'),($3,$6,'clerk','active'),($4,$6,'usuario','active')`,
    [FX.uAdmSto, FX.uEnc, FX.uClerk, FX.uUsu, FX.uSuper, FX.store1]);
  await q(`INSERT INTO public.workers (id, store_id, tenant_id, first_name, last_name, ci, status) VALUES
    ($1,$2,$3,'Ester','Ejemplo','98765432098','active')
    ON CONFLICT (id) DO NOTHING`, [FX.w1, FX.store1, FX.tenantA]);
  await q(`INSERT INTO public.worker_salary_rates (id, worker_id, store_id, tenant_id, rate_type, rate_amount, currency, valid_from, created_by)
    VALUES ($1,$2,$3,$4,'hourly',50.00,'CUP',CURRENT_DATE - 30,$5)
    ON CONFLICT (id) DO NOTHING`, [FX.rate1, FX.w1, FX.store1, FX.tenantA, FX.uAdmSto]);
  for (const [pid, store, num, status] of [
    [FX.p1, FX.store1, 'NOM-EE-000001-2026', 'draft'],
    [FX.p1c, FX.store1, 'NOM-EE-000004-2026', 'confirmed'],
    [FX.p2, FX.store2, 'NOM-EE-000002-2026', 'draft'],
    [FX.p3, FX.store3, 'NOM-EE-000003-2026', 'draft'],
  ]) {
    await q(`INSERT INTO public.payrolls (id, store_id, tenant_id, payroll_number, status, tipo_nomina, period_start, period_end, currency, entidad_nombre, payment_method, total_workers, total_net, created_by)
      VALUES ($1,$2,$5,$6,$7,'sueldos',CURRENT_DATE - 10,CURRENT_DATE - 4,'CUP','EE','efectivo',1,50.00,$4)
      ON CONFLICT (id) DO NOTHING`,
      [pid, store, null, FX.uAdmSto, store === FX.store1 || store === FX.store2 ? FX.tenantA : FX.tenantB, num, status]);
  }
  await q(`INSERT INTO public.payroll_items (id, payroll_id, worker_id, worker_names, rate_type, rate_amount, rate_currency, regular_hours, base_salary, total_gross, total_net)
    VALUES ($1,$2,$3,'Ester Ejemplo','hourly',50.00,'CUP',8,400.00,400.00,400.00)
    ON CONFLICT (id) DO NOTHING`, [FX.pi1, FX.p1, FX.w1]);

  // ── FASE C: matriz de LECTURA (RLS con impersonación real) ──
  console.log('— Matriz: lectura de payrolls —');
  // superadmin: su tienda (store1) y otra (store3) PERMITIDAS
  check('C1. superadmin lee nómina de store1', (await countAs(FX.uSuper, 'payrolls', `store_id='${FX.store1}'`)) >= 1);
  check('C2. superadmin lee nómina de store3 (ajena)', (await countAs(FX.uSuper, 'payrolls', `store_id='${FX.store3}'`)) >= 1);
  // admin de plataforma (tenant A): store1/store2 permitidas, store3 denegada
  check('C3. admin plataforma lee store1 (su tenant)', (await countAs(FX.uAdmPlat, 'payrolls', `store_id='${FX.store1}'`)) >= 1);
  check('C4. admin plataforma lee store2 (su tenant)', (await countAs(FX.uAdmPlat, 'payrolls', `store_id='${FX.store2}'`)) >= 1);
  check('C5. admin plataforma NO lee store3 (otro tenant)', (await countAs(FX.uAdmPlat, 'payrolls', `store_id='${FX.store3}'`)) === 0);
  // admin de tienda: store1 permitida, store2 (mismo tenant sin membresía) denegada
  check('C6. admin de tienda lee SU store1', (await countAs(FX.uAdmSto, 'payrolls', `store_id='${FX.store1}'`)) >= 1);
  check('C7. admin de tienda NO lee store2 (sin membresía admin allí)', (await countAs(FX.uAdmSto, 'payrolls', `store_id='${FX.store2}'`)) === 0);
  check('C8. admin de tienda NO lee store3', (await countAs(FX.uAdmSto, 'payrolls', `store_id='${FX.store3}'`)) === 0);
  // encargado / clerk / usuario: TODO denegado
  check('C9.  encargado NO lee nómina de SU tienda', (await countAs(FX.uEnc, 'payrolls', `store_id='${FX.store1}'`)) === 0);
  check('C10. encargado NO lee nómina ajena', (await countAs(FX.uEnc, 'payrolls', `store_id='${FX.store3}'`)) === 0);
  check('C11. clerk NO lee nómina de SU tienda', (await countAs(FX.uClerk, 'payrolls', `store_id='${FX.store1}'`)) === 0);
  check('C12. clerk NO lee nómina ajena', (await countAs(FX.uClerk, 'payrolls', `store_id='${FX.store3}'`)) === 0);
  check('C13. usuario NO lee nómina de SU tienda', (await countAs(FX.uUsu, 'payrolls', `store_id='${FX.store1}'`)) === 0);
  check('C14. usuario NO lee nómina ajena', (await countAs(FX.uUsu, 'payrolls', `store_id='${FX.store3}'`)) === 0);

  // Tablas relacionadas: tarifas salariales y líneas
  console.log('— Matriz: tarifas salariales y líneas —');
  check('C15. encargado NO lee tarifas salariales', (await countAs(FX.uEnc, 'worker_salary_rates', `store_id='${FX.store1}'`)) === 0);
  check('C16. clerk NO lee tarifas salariales', (await countAs(FX.uClerk, 'worker_salary_rates', `store_id='${FX.store1}'`)) === 0);
  check('C17. usuario NO lee tarifas salariales', (await countAs(FX.uUsu, 'worker_salary_rates', `store_id='${FX.store1}'`)) === 0);
  check('C18. admin de tienda SÍ lee tarifas salariales', (await countAs(FX.uAdmSto, 'worker_salary_rates', `store_id='${FX.store1}'`)) >= 1);
  check('C19. encargado NO lee líneas de nómina (join)', (await countAs(FX.uEnc, 'payroll_items', `payroll_id='${FX.p1}'`)) === 0);
  check('C20. clerk NO lee líneas de nómina', (await countAs(FX.uClerk, 'payroll_items', `payroll_id='${FX.p1}'`)) === 0);
  check('C21. admin de tienda SÍ lee líneas de nómina', (await countAs(FX.uAdmSto, 'payroll_items', `payroll_id='${FX.p1}'`)) >= 1);

  // anon: sin privilegios SELECT → permission denied (denegado)
  try {
    await asRoleTableScan(`SELECT COUNT(*)::int FROM public.payrolls`, 'anon');
    check('C22. anon NO puede leer payrolls', false, 'el scan como anon no falló');
  } catch (e) {
    check('C22. anon NO puede leer payrolls (permiso denegado)', /permission|denied|42501/i.test(e.message), e.message.slice(0, 90));
  }

  // ── FASE D: gate administrativo de los RPC ──
  console.log('— Matriz: RPC de nómina —');
  const ITEMS = `jsonb_build_array(jsonb_build_object('worker_id','${FX.w1}','regular_hours',8,'concepts','[]'::jsonb))`;
  const e1 = await asAuthRpcExpectError(`SELECT public.create_payroll('${FX.store1}','sueldos',CURRENT_DATE - 3,CURRENT_DATE - 2,'efectivo',NULL,NULL,NULL,NULL,NULL,${ITEMS},'EE-MTX-ENC','${FX.uEnc}')`, FX.uEnc);
  check('D1. encargado NO puede confeccionar nómina (ERR_UNAUTHORIZED)', /ERR_UNAUTHORIZED/i.test(e1 || ''), (e1 || '').slice(0, 80));
  const e2 = await asAuthRpcExpectError(`SELECT public.create_payroll('${FX.store1}','sueldos',CURRENT_DATE - 3,CURRENT_DATE - 2,'efectivo',NULL,NULL,NULL,NULL,NULL,${ITEMS},'EE-MTX-CLK','${FX.uClerk}')`, FX.uClerk);
  check('D2. clerk NO puede confeccionar nómina', /ERR_UNAUTHORIZED/i.test(e2 || ''), (e2 || '').slice(0, 80));
  const e3 = await asAuthRpcExpectError(`SELECT public.create_payroll('${FX.store1}','sueldos',CURRENT_DATE - 3,CURRENT_DATE - 2,'efectivo',NULL,NULL,NULL,NULL,NULL,${ITEMS},'EE-MTX-USU','${FX.uUsu}')`, FX.uUsu);
  check('D3. usuario NO puede confeccionar nómina', /ERR_UNAUTHORIZED/i.test(e3 || ''), (e3 || '').slice(0, 80));
  const e4 = await asAuthRpcExpectError(`SELECT public.set_worker_salary_rate('${FX.w1}','hourly',75,'CUP',NULL,'${FX.uClerk}')`, FX.uClerk);
  check('D4. clerk NO puede fijar tarifa salarial', /ERR_UNAUTHORIZED/i.test(e4 || ''), (e4 || '').slice(0, 80));
  const e5 = await asAuthRpcExpectError(`SELECT public.confirm_payroll('${FX.p1}','${FX.uEnc}')`, FX.uEnc);
  check('D5. encargado NO puede confirmar nómina', /ERR_UNAUTHORIZED/i.test(e5 || ''), (e5 || '').slice(0, 80));
  const e6 = await asAuthRpcExpectError(`SELECT public.void_payroll('${FX.p1}','motivo prueba','${FX.uUsu}')`, FX.uUsu);
  check('D6. usuario NO puede anular nómina', /ERR_UNAUTHORIZED/i.test(e6 || ''), (e6 || '').slice(0, 80));
  const e7 = await asAuthRpcExpectError(`SELECT public.mark_payroll_paid('${FX.p1c}','${FX.uClerk}')`, FX.uClerk);
  check('D7. clerk NO puede marcar pagada (nómina confirmada)', /ERR_UNAUTHORIZED/i.test(e7 || ''), (e7 || '').slice(0, 80));
  const e8 = await asAuthRpcExpectError(`SELECT public.account_payroll('${FX.p1c}','${FX.uEnc}')`, FX.uEnc);
  check('D8. encargado NO puede contabilizar (nómina confirmada)', /ERR_UNAUTHORIZED/i.test(e8 || ''), (e8 || '').slice(0, 80));

  // Operaciones legítimas de administradores SIGUEN funcionando
  let admOk = true, admDetail = '';
  try {
    // store1 es del tenant A del admin de plataforma: debe poder confeccionar
    // (w1 es trabajador ELEGIBLE de store1 — el gate de autorización es lo
    // que se prueba aquí).
    await asAuthRpc(`SELECT public.create_payroll('${FX.store1}','sueldos',CURRENT_DATE - 3,CURRENT_DATE - 2,'efectivo',NULL,NULL,NULL,NULL,NULL,${ITEMS},'EE-MTX-ADMPLAT','${FX.uAdmPlat}')`, FX.uAdmPlat);
  } catch (e) { admOk = false; admDetail = e.message.slice(0, 90); }
  check('D9. admin de plataforma SÍ confecciona nómina de su tenant', admOk, admDetail);

  let stoOk = true, stoDetail = '';
  try {
    await asAuthRpc(`SELECT public.create_payroll('${FX.store1}','sueldos',CURRENT_DATE - 3,CURRENT_DATE - 2,'efectivo',NULL,NULL,NULL,NULL,NULL,${ITEMS},'EE-MTX-ADMSTO','${FX.uAdmSto}')`, FX.uAdmSto);
  } catch (e) { stoOk = false; stoDetail = e.message.slice(0, 90); }
  check('D10. admin de tienda SÍ confecciona nómina de su tienda', stoOk, stoDetail);

  let supOk = true, supDetail = '';
  try {
    await asAuthRpc(`SELECT public.set_worker_salary_rate('${FX.w1}','hourly',60,'CUP',CURRENT_DATE + 1,'${FX.uSuper}')`, FX.uSuper);
  } catch (e) { supOk = false; supDetail = e.message.slice(0, 90); }
  check('D11. superadmin SÍ fija tarifa salarial', supOk, supDetail);

  // ── FASE E: limpieza + resumen ──
  await cleanup();
  // Reset de la sesión (por si acaso) — la limpieza corre como postgres.
  const failed = results.filter((r) => !r.ok);
  console.log(`\n== RESULTADO: ${results.length - failed.length}/${results.length} PASS ==`);
  if (failed.length) {
    console.error('\nFALLOS:');
    for (const f of failed) console.error(` · ${f.name} ${f.detail ? `(${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('NET: fixture limpiado (delta 0 en nóminas/tarifas/trabajadores del fixture EE).');
}

main().catch((e) => {
  console.error('ERROR FATAL:', e.message);
  process.exit(1);
});
