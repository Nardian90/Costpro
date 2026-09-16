#!/usr/bin/env node
/**
 * f2bug-staging.cjs — REM-R2-F2BUG-FIX · Staging dinámico (ephemeral PG17)
 *
 * Diferencia clave vs staging R2: aquí transfers.status se crea con el tipo
 * REAL de LIVE — enum public.transfer_status con las 4 etiquetas capturadas
 * (PENDIENTE/CONFIRMADA/CANCELADA/REVERSADA) — para reproducir el 42883
 * (enum = text) que el staging R2 no podía ver (creaba status text).
 *
 * Fase A: boot PG17 efímero (127.0.0.1:55434)
 * Fase B: roles Supabase + shim auth.uid()/auth.role() + esquema mínimo
 *         (enum byte-exacto de LIVE) + deps REALES byte-exactas
 *         (is_admin, has_store_access desde /tmp/r2-dep — captura PRE de hoy)
 * Fase C: seed 2 tiendas / 4 usuarios + 4 transferencias con estados del enum
 * Fase D: instalar cuerpo PRE (roto) → REPRO 42883 (U1 y service_role)
 * Fase E: aplicar migración 20260916000008 (bytes exactos) + byte-check
 * Fase F: matriz de pruebas (guard T1-T7 + semántica del filtro de estado)
 * Fase G: resumen → exit 0 solo si TODO pasa
 *
 * Método idéntico a R2-EXEC (r2-guard-staging.cjs, staging 82/82).
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { Client } = require('/home/z/my-project/Costpro/node_modules/pg');

const ROOT = '/home/z/my-project/scripts/6r-env';
const BIN = path.join(ROOT, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin');
const DATA = path.join(ROOT, 'pgdata-f2bug');
const SOCK = path.join(ROOT, 'pgsock-f2bug');
const LOG = path.join(ROOT, 'pg-f2bug.log');
const PORT = 55434;
const MIG = '/home/z/my-project/Costpro/supabase/migrations/20260916000008_rem_f2bug_transfers_status_cast.sql';
const CAP = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/f2bug-pre-live.json', 'utf8'));

const S1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const S2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'; // miembro S1
const U2 = 'aaaaaaaa-0000-0000-0000-000000000002'; // miembro S2
const U3 = 'aaaaaaaa-0000-0000-0000-000000000003'; // sin membership
const P1 = 'cccccccc-0000-0000-0000-000000000001';
const UUID_UNKNOWN = 'eeeeeeee-0000-0000-0000-000000000009';
// TR ids (marcadores):
const TR41  = 'dddddddd-0000-0000-0000-000000000041'; // S1→S2 PENDIENTE
const TR41b = 'dddddddd-0000-0000-0000-000000000043'; // S1→S2 CONFIRMADA
const TR41c = 'dddddddd-0000-0000-0000-000000000044'; // S1→S1 CANCELADA
const TR42  = 'dddddddd-0000-0000-0000-000000000042'; // S2→S2 PENDIENTE (marcador interno S2)

const GT = (store, from = 'NULL', to = 'NULL', status = 'NULL') =>
  `SELECT public.get_transfers(${store}, ${from}, ${to}, ${status}, 1000)`;

async function connect(db) {
  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: db });
  c.on('error', () => {});
  await c.connect();
  return c;
}
async function q(c, sql) {
  try { const r = await c.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: String(e.message).split('\n')[0], code: e.code }; }
}

let passes = 0, failures = 0;
const evidence = { repro: [], bytecheck: [], tests: [], summary: null };
function check(id, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${id} — ${detail}`); }
  else { failures++; console.log(`  FAIL  ${id} — ${detail}`); }
  return cond;
}

async function asUser(uid, role, sql) {
  const c = await connect('costpro');
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`SET LOCAL request.jwt.claim.sub = ${uid ? `'${uid}'` : "''"}`);
    await c.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
    const r = await q(c, sql);
    await c.query('ROLLBACK').catch(() => {});
    return r;
  } finally { await c.end().catch(() => {}); }
}

function depSql(dep) {
  return fs.readFileSync(`/tmp/r2-dep/${dep}.sql`, 'utf8').replace(/\r?\n$/, '');
}

async function main() {
  // ── Fase A: boot ──
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(SOCK, { recursive: true, force: true });
  fs.mkdirSync(SOCK, { recursive: true });
  console.log('[staging] initdb…');
  execSync(`${BIN}/initdb -D ${DATA} -U postgres --auth=trust -E UTF8`);
  console.log(`[staging] starting postgres on 127.0.0.1:${PORT}`);
  const ctl = spawnSync(`${BIN}/pg_ctl`, ['-D', DATA, '-o', `-p ${PORT} -k ${SOCK} -c listen_addresses=127.0.0.1`, '-l', LOG, '-w', 'start'], { encoding: 'utf8' });
  if (ctl.status !== 0) throw new Error('pg_ctl start failed: ' + ctl.stderr);

  try {
    const boot = await connect('postgres');
    await q(boot, 'CREATE DATABASE costpro');
    await boot.end();
    const db = await connect('costpro');

    // ── Fase B: roles, shim, esquema con ENUM REAL de LIVE ──
    console.log('[staging] roles + auth shim + schema (enum transfer_status byte-exacto)…');
    for (const s of [
      `CREATE ROLE anon NOLOGIN`,
      `CREATE ROLE authenticated NOLOGIN`,
      `CREATE ROLE service_role NOLOGIN`,
      `CREATE SCHEMA auth`,
      `CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$`,
      `CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text $fn$`,
      `GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`,
      `GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role`,
      `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`,
      `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC`,
    ]) { const r = await q(db, s); if (!r.ok) throw new Error('setup: ' + s.slice(0, 60) + ' → ' + r.err); }

    const labels = CAP.transfer_status_labels.map(l => `'${l}'`).join(',');
    if (CAP.transfers_status_column[0].kind !== 'e') throw new Error('LIVE transfers.status no es enum');
    await q(db, `CREATE TYPE public.transfer_status AS ENUM (${labels})`);

    await q(db, `
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, role text, tenant_id uuid);
      CREATE TABLE public.stores (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true, tenant_id uuid);
      CREATE TABLE public.user_store_memberships (id uuid PRIMARY KEY, user_id uuid, store_id uuid, status text DEFAULT 'active');
      CREATE TABLE public.products (id uuid PRIMARY KEY, store_id uuid, name text, sku text, price numeric, cost_price numeric, stock_current numeric DEFAULT 0, min_stock numeric DEFAULT 0, search_vector tsvector);
      CREATE TABLE public.transfers (id uuid PRIMARY KEY, origin_store_id uuid, destination_store_id uuid,
        created_by uuid, status transfer_status, notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE public.transfer_items (id uuid PRIMARY KEY, transfer_id uuid, product_id uuid,
        quantity numeric, unit_cost numeric, created_at timestamptz DEFAULT now());
    `);

    // dependencias REALES (LIVE capturadas hoy, byte-exacto): is_admin primero
    for (const dep of ['is_admin', 'has_store_access']) {
      const r = await q(db, depSql(dep));
      if (!r.ok) throw new Error(`dep ${dep}: ` + r.err);
    }
    await q(db, `GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role`);
    await q(db, `GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated, service_role`);

    // ── Fase C: seed ──
    console.log('[staging] seed (4 transferencias con estados del enum)…');
    const r = await q(db, `
      INSERT INTO public.stores (id, name) VALUES ('${S1}','Tienda Uno'),('${S2}','Tienda Dos');
      INSERT INTO public.profiles (id, full_name, role) VALUES
        ('${U1}','Usuario Uno','operario'),('${U2}','Usuario Dos','operario'),('${U3}','Usuario Tres','operario');
      INSERT INTO public.user_store_memberships (id, user_id, store_id) VALUES
        ('aaaaaaaa-1111-0000-0000-000000000001','${U1}','${S1}'),
        ('aaaaaaaa-1111-0000-0000-000000000002','${U2}','${S2}');
      INSERT INTO public.products (id, store_id, name, sku, price, cost_price, search_vector) VALUES
        ('${P1}','${S1}','Producto Uno','SKU-1',10,6, to_tsvector('spanish','Producto Uno'));
      INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, status) VALUES
        ('${TR41}','${S1}','${S2}','${U1}','PENDIENTE'),
        ('${TR41b}','${S1}','${S2}','${U1}','CONFIRMADA'),
        ('${TR41c}','${S1}','${S1}','${U1}','CANCELADA'),
        ('${TR42}','${S2}','${S2}','${U2}','PENDIENTE');
      INSERT INTO public.transfer_items (id, transfer_id, product_id, quantity, unit_cost) VALUES
        ('dddddddd-0000-0000-0000-000000000051','${TR41}','${P1}',3,12.00),
        ('dddddddd-0000-0000-0000-000000000052','${TR41b}','${P1}',1,7.50);
    `);
    if (!r.ok) throw new Error('seed: ' + r.err);

    const SIG = 'public.get_transfers(uuid,timestamptz,timestamptz,text,integer)';
    const installPre = () => CAP.get_transfers.def.replace(/\r?\n$/, '') + ';';
    const migSql = fs.readFileSync(MIG, 'utf8');
    // anclar al $function$; de CIERRE (el de apertura no lleva ';') — método R2
    const migStmt = (migSql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) || [null])[0];

    // ── Fase D: cuerpo PRE (roto) + REPRO 42883 ──
    console.log('\n[REPRO] cuerpo PRE roto con enum REAL (error 42883 esperado en TODA llamada):');
    {
      const ir = await q(db, installPre());
      if (!ir.ok) throw new Error('install PRE: ' + ir.err);
      await q(db, `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`);
      await q(db, `GRANT EXECUTE ON FUNCTION ${SIG} TO authenticated, service_role`);

      const r1 = await asUser(U1, 'authenticated', GT(`'${S1}'`));
      check('REPRO U1 miembro S1 (p_status NULL)', !r1.ok && r1.code === '42883', r1.ok ? 'EJECUTÓ (no repro)' : `${r1.code} ${r1.err}`);
      evidence.repro.push({ id: 'U1-NULL', repro: !r1.ok && r1.code === '42883', err: r1.err ?? null });

      const r2 = await asUser(U1, 'authenticated', GT(`'${S1}'`, 'NULL', 'NULL', `'PENDIENTE'`));
      check('REPRO U1 con estado PENDIENTE', !r2.ok && r2.code === '42883', r2.ok ? 'EJECUTÓ (no repro)' : `${r2.code} ${r2.err}`);
      evidence.repro.push({ id: 'U1-PENDIENTE', repro: !r2.ok && r2.code === '42883', err: r2.err ?? null });

      const r3 = await asUser(null, 'service_role', GT(`'${S2}'`));
      check('REPRO service_role (ruta interna)', !r3.ok && r3.code === '42883', r3.ok ? 'EJECUTÓ (no repro)' : `${r3.code} ${r3.err}`);
      evidence.repro.push({ id: 'service_role', repro: !r3.ok && r3.code === '42883', err: r3.err ?? null });
    }

    // ── Fase E: aplicar migración byte-exacta + byte-check ──
    console.log('\n[staging] aplicar migración 20260916000008 (bytes exactos)…');
    const mr = await q(db, migSql);
    if (!mr.ok) throw new Error('migración: ' + mr.err);
    await q(db, `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`);
    await q(db, `GRANT EXECUTE ON FUNCTION ${SIG} TO authenticated, service_role`);

    {
      const d = await q(db, `SELECT pg_get_functiondef(to_regprocedure('${SIG}')) AS def`);
      const live = d.rows[0].def.replace(/\s+$/, '');
      const mine = migStmt ? migStmt.replace(/\$function\$;\s*$/, '$function$').replace(/\s+$/, '') : null;
      const eq = mine && live === mine;
      check('BYTE get_transfers', eq, eq ? 'def staging == statement de la migración' : 'def != migración');
      evidence.bytecheck.push({ fn: 'get_transfers', equal: !!eq });
      // guard sigue presente tras el fix
      const probes = ["auth.role() <> 'service_role'", 'p_store_id IS NULL', 'public.has_store_access(p_store_id)', "ERRCODE = '42501'", 't.status::text = p_status'];
      for (const p of probes) {
        const okp = live.includes(p);
        check(`GUARD/FIX sonda «${p.slice(0, 40)}»`, okp, okp ? 'presente' : 'AUSENTE');
        evidence.bytecheck.push({ probe: p, present: okp });
      }
    }

    // ── Fase F: matriz de pruebas ──
    console.log('\n[T-matrix] guard + semántica del filtro de estado:');
    const arr = (r) => (r.ok ? (r.rows[0] && r.rows[0].get_transfers !== undefined ? r.rows[0].get_transfers : r.rows[0]) : null);
    const ids = (r) => { const v = arr(r); return v ? JSON.stringify(v) : 'null'; };

    // T1: miembro + tienda propia + NULL status → PASS + scope S1 (sin TR-042)
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`));
      const ok = r.ok && ids(r).includes(TR41) && ids(r).includes(TR41b) && ids(r).includes(TR41c) && !ids(r).includes(TR42);
      check('T1 U1/S1 NULL-status → 3 transf. propias, sin TR-042', ok, r.ok ? (ok ? 'scope S1 correcto' : 'SCOPE VIOLATED: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'T1', pass: ok });
    }
    // T1s: filtro PENDIENTE → solo TR-041
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`, 'NULL', 'NULL', `'PENDIENTE'`));
      const ok = r.ok && ids(r).includes(TR41) && !ids(r).includes(TR41b) && !ids(r).includes(TR41c);
      check('T1s filtro PENDIENTE → solo TR-041', ok, r.ok ? (ok ? 'filtro enum→text correcto' : 'FILTRO MAL: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'T1s-PENDIENTE', pass: ok });
    }
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`, 'NULL', 'NULL', `'CONFIRMADA'`));
      const ok = r.ok && ids(r).includes(TR41b) && !ids(r).includes(TR41) && !ids(r).includes(TR41c);
      check('T1s filtro CONFIRMADA → solo TR-041b', ok, r.ok ? (ok ? 'filtro correcto' : 'FILTRO MAL: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'T1s-CONFIRMADA', pass: ok });
    }
    // T1x: estado inexistente → vacío, SIN error
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`, 'NULL', 'NULL', `'NOEXISTE'`));
      const v = arr(r);
      const ok = r.ok && Array.isArray(v) && v.length === 0;
      check('T1x estado inexistente → [] sin error', ok, r.ok ? (ok ? 'fail-safe vacío' : 'respuesta: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'T1x-invalid-status', pass: ok });
    }
    // T1l: minúsculas → vacío (etiquetas enum son mayúsculas; comparación text exacta)
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`, 'NULL', 'NULL', `'pendiente'`));
      const v = arr(r);
      const ok = r.ok && Array.isArray(v) && v.length === 0;
      check('T1l estado en minúsculas → [] (case-sensitive)', ok, r.ok ? (ok ? 'semántica text exacta' : 'respuesta: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'T1l-lowercase', pass: ok });
    }
    // T2: tienda ajena → 42501
    {
      const r = await asUser(U1, 'authenticated', GT(`'${S2}'`));
      check('T2 U1 pide S2 → 42501', !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
      evidence.tests.push({ test: 'T2', pass: !r.ok && r.code === '42501' });
    }
    // T3: UUID desconocido → 42501
    {
      const r = await asUser(U1, 'authenticated', GT(`'${UUID_UNKNOWN}'`));
      check('T3 UUID desconocido → 42501', !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
      evidence.tests.push({ test: 'T3', pass: !r.ok && r.code === '42501' });
    }
    // T4: NULL store → 42501 (contrato R2 intacto)
    {
      const r = await asUser(U1, 'authenticated', GT('NULL'));
      check('T4 NULL store → 42501', !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO (NULL=ALL reviviría)' : `${r.code} ${r.err}`);
      evidence.tests.push({ test: 'T4', pass: !r.ok && r.code === '42501' });
    }
    // T5: sin membership → 42501
    {
      const r = await asUser(U3, 'authenticated', GT(`'${S1}'`));
      check('T5 U3 sin membership → 42501', !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
      evidence.tests.push({ test: 'T5', pass: !r.ok && r.code === '42501' });
    }
    // T6: service_role → PASS (store y NULL y con filtro)
    {
      const r1 = await asUser(null, 'service_role', GT(`'${S2}'`));
      const r2 = await asUser(null, 'service_role', GT('NULL'));
      const r3 = await asUser(null, 'service_role', GT('NULL', 'NULL', 'NULL', `'PENDIENTE'`));
      const ok = r1.ok && r2.ok && r3.ok;
      check('T6 service_role store+NULL+filtro → PASS', ok, ok ? 'ruta interna operativa (42883 eliminada)' : (r1.err || r2.err || r3.err));
      evidence.tests.push({ test: 'T6', pass: ok });
    }
    // T7: anon → denegado por ACL
    {
      const r = await asUser(null, 'anon', GT(`'${S1}'`));
      check('T7 anon → denegado', !r.ok && (r.code === '42501' || /permission denied/i.test(r.err)), r.ok ? 'anon EJECUTÓ (mal)' : `${r.code} ${r.err}`);
      evidence.tests.push({ test: 'T7', pass: !r.ok && (r.code === '42501' || /permission denied/i.test(r.err)) });
    }
    // Extra: filtro por fechas sigue operativo
    {
      const future = `'${new Date(Date.now() + 864e5).toISOString()}'`;
      const r = await asUser(U1, 'authenticated', GT(`'${S1}'`, future, 'NULL'));
      const v = arr(r);
      const ok = r.ok && Array.isArray(v) && v.length === 0;
      check('EXTRA p_date_from futuro → [] (fechas intactas)', ok, r.ok ? (ok ? 'fechas operativas' : 'respuesta: ' + ids(r)) : r.err);
      evidence.tests.push({ test: 'EXTRA-dates', pass: ok });
    }

    // ── Fase G: resumen ──
    console.log(`\n════════════════════════════════════════`);
    console.log(`STAGING RESULT: ${passes} PASS / ${failures} FAIL`);
    console.log(`════════════════════════════════════════`);
    evidence.summary = { passes, failures, at: new Date().toISOString(), port: PORT, enum_labels: CAP.transfer_status_labels };
    fs.writeFileSync('/home/z/my-project/scripts/f2bug-staging-results.json', JSON.stringify(evidence, null, 1));
    await db.end();
  } finally {
    spawnSync(`${BIN}/pg_ctl`, ['-D', DATA, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
