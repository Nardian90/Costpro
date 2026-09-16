#!/usr/bin/env node
/**
 * r2-guard-staging.cjs — REM-R2-READ-EXEC · Staging dinámico (ephemeral PG17)
 *
 * Fase A: boot PG17 efímero (127.0.0.1:55433)
 * Fase B: roles Supabase + shim auth.uid()/auth.role() + esquema mínimo
 *         + dependencias REALES (is_admin, has_store_access) byte-exactas
 * Fase C: seed 2 tiendas / 4 usuarios (U1 miembro S1, U2 miembro S2, U3 sin
 *         membership, UA admin global) + datos marcadores cross-store
 * Fase D: instalar 9 cuerpos LIVE (PRE) → REPRO de la vulnerabilidad (T-pre)
 * Fase E: aplicar migraciones 20260916000005/06/07 (bytes exactos)
 * Fase F: T1-T7 × 9 funciones + aserciones de alcance de datos
 * Fase G: resumen → exit 0 si TODO pasa
 *
 * Método idéntico a REM-INV-6R Gate J/K (staging 14/14).
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { Client } = require('/home/z/my-project/Costpro/node_modules/pg');

const ROOT = '/home/z/my-project/scripts/6r-env';
const BIN = path.join(ROOT, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin');
const DATA = path.join(ROOT, 'pgdata-r2');
const SOCK = path.join(ROOT, 'pgsock-r2');
const LOG = path.join(ROOT, 'pg-r2.log');
const PORT = 55433;
const MIG = '/home/z/my-project/Costpro/supabase/migrations';
const CAP = JSON.parse(fs.readFileSync(
  '/home/z/my-project/Costpro/audit-evidence/R2-SECDEF-READ-SURFACE/03_prep-live-capture.json', 'utf8'));

const T1 = '11111111-1111-1111-1111-111111111111'; // tenant S1
const S1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const S2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const U1 = 'aaaaaaaa-0000-0000-0000-000000000001'; // miembro S1
const U2 = 'aaaaaaaa-0000-0000-0000-000000000002'; // miembro S2
const U3 = 'aaaaaaaa-0000-0000-0000-000000000003'; // sin membership
const UA = 'aaaaaaaa-0000-0000-0000-000000000003'.replace('3', '4'); // admin global
const P1 = 'cccccccc-0000-0000-0000-000000000001';
const P2 = 'cccccccc-0000-0000-0000-000000000002';
const P3 = 'cccccccc-0000-0000-0000-000000000003';
const P4 = 'cccccccc-0000-0000-0000-000000000004';
const P5 = 'cccccccc-0000-0000-0000-000000000005';
const UUID_UNKNOWN = 'eeeeeeee-0000-0000-0000-000000000009';

const FNS = {
  get_cash_closures: (store) => `SELECT public.get_cash_closures(${store}, NULL, NULL, 1000)`,
  get_transfers: (store) => `SELECT public.get_transfers(${store}, NULL, NULL, NULL, 1000)`,
  get_store_analytics_advanced: (store) => `SELECT public.get_store_analytics_advanced(${store}, NULL, NULL, 30)`,
  get_sales_since_last_closure: (store) => `SELECT * FROM public.get_sales_since_last_closure(${store})`,
  get_paginated_products: (store) => `SELECT * FROM public.get_paginated_products(${store}, '', '', 100, 0)`,
  get_products_for_reception: (store) => `SELECT * FROM public.get_products_for_reception(${store}, '', 1, 50)`,
  get_product_stock_ledger_paginated: (store) => `SELECT * FROM public.get_product_stock_ledger_paginated('cccccccc-0000-0000-0000-000000000001', ${store}, 100, 0)`,
  get_daily_expenses_aggregated: (store) => `SELECT public.get_daily_expenses_aggregated(${store}, NULL, NULL, 1000)`,
  get_low_stock_count: (store) => `SELECT public.get_low_stock_count(${store})`,
};
const FN_NAMES = Object.keys(FNS);

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
const evidence = { repro: [], tests: [], bytecheck: [] };
function check(id, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${id} — ${detail}`); }
  else { failures++; console.log(`  FAIL  ${id} — ${detail}`); }
  return cond;
}

// ejecutar sql como (uid, role); devuelve {ok, rows, err, code}
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

function installDefs(list) {
  return list.map(name => CAP.funcs[name][0].def.replace(/\r?\n$/, '') + ';');
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

    // ── Fase B: roles, shim, esquema ──
    console.log('[staging] roles + auth shim + schema…');
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

    await q(db, `
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, role text, tenant_id uuid);
      CREATE TABLE public.stores (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true, tenant_id uuid);
      CREATE TABLE public.user_store_memberships (id uuid PRIMARY KEY, user_id uuid, store_id uuid, status text DEFAULT 'active');
      CREATE TABLE public.cash_closures (id uuid PRIMARY KEY, user_id uuid, store_id uuid, session_reference text,
        declared_cash numeric, declared_vouchers numeric, system_total numeric, notes text, status text,
        closed_at timestamptz, created_at timestamptz, declared_total numeric, system_expected_total numeric, difference numeric);
      CREATE TABLE public.transactions (id uuid PRIMARY KEY, store_id uuid, status text, created_at timestamptz,
        total_amount numeric, payment_method text);
      CREATE TABLE public.transaction_items (id uuid PRIMARY KEY, transaction_id uuid, product_id uuid,
        quantity numeric, price_at_sale numeric, cost_at_sale numeric, created_at timestamptz);
      CREATE TABLE public.products (id uuid PRIMARY KEY, store_id uuid, name text, description text, sku text,
        barcode text, barcode_type text, price numeric, precio_empresa numeric, cost_price numeric, image_url text,
        category text, unit_of_measure text, supplier text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        stock_current numeric DEFAULT 0, cost_average numeric DEFAULT 0, min_stock numeric DEFAULT 0, is_active boolean DEFAULT true,
        visible_en_tienda boolean DEFAULT false, price_visible boolean DEFAULT true, stock_visible boolean DEFAULT true,
        on_promotion boolean DEFAULT false, price_currency text DEFAULT 'CUP', search_vector tsvector);
      CREATE TABLE public.inventory (id uuid PRIMARY KEY, product_id uuid, store_id uuid, quantity numeric DEFAULT 0);
      CREATE TABLE public.stock_movements (id uuid PRIMARY KEY, product_id uuid, store_id uuid, movement_type text,
        reference_id uuid, reference_doc text, quantity_change numeric, unit_cost numeric, created_at timestamptz DEFAULT now());
      CREATE TABLE public.transfers (id uuid PRIMARY KEY, origin_store_id uuid, destination_store_id uuid,
        created_by uuid, status text, notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE public.transfer_items (id uuid PRIMARY KEY, transfer_id uuid, product_id uuid,
        quantity numeric, unit_cost numeric, created_at timestamptz DEFAULT now());
      CREATE TABLE public.receipts (id uuid PRIMARY KEY, store_id uuid, total_cost numeric, created_at timestamptz DEFAULT now());
    `);

    // dependencias REALES (LIVE capturadas hoy): is_admin primero, luego has_store_access
    for (const dep of ['is_admin', 'has_store_access']) {
      const r = await q(db, depSql(dep));
      if (!r.ok) throw new Error(`dep ${dep}: ` + r.err);
    }
    await q(db, `GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role`);
    await q(db, `GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated, service_role`);

    // ── Fase C: seed ──
    console.log('[staging] seed data (marcadores cross-store)…');
    const D1 = new Date(Date.now() - 26 * 864e5).toISOString(); // dentro de ventana 30d
    const D2 = new Date(Date.now() - 1 * 864e5).toISOString();
    const D3 = new Date(Date.now() - 3 * 864e5).toISOString(); // fecha exclusiva S2 (marcador F4a)
    const D0 = new Date(Date.now() - 27 * 864e5).toISOString(); // cierre C2 anterior a las tx de S1
    const D0b = new Date(Date.now() - 28 * 864e5).toISOString(); // cierre C1 aún más antiguo
    await q(db, `
      INSERT INTO public.stores (id, name) VALUES ('${S1}','Tienda Uno'),('${S2}','Tienda Dos');
      INSERT INTO public.profiles (id, full_name, role) VALUES
        ('${U1}','Usuario Uno','operario'),('${U2}','Usuario Dos','operario'),
        ('${U3}','Usuario Tres','operario'),('${UA}','Admin Global','admin');
      INSERT INTO public.user_store_memberships (id, user_id, store_id) VALUES
        ('aaaaaaaa-1111-0000-0000-000000000001','${U1}','${S1}'),
        ('aaaaaaaa-1111-0000-0000-000000000002','${U2}','${S2}');
      -- S1
      INSERT INTO public.cash_closures (id, user_id, store_id, session_reference, declared_cash, declared_vouchers, system_total, status, closed_at, created_at, declared_total, system_expected_total, difference) VALUES
        ('dddddddd-0000-0000-0000-000000000001','${U1}','${S1}','ses-1',100.50,0,100.50,'cerrado','${D0b}','${D0b}',100.50,100.50,0),
        ('dddddddd-0000-0000-0000-000000000002','${U1}','${S1}','ses-2',200.25,0,200.25,'cerrado','${D0}','${D0}',200.25,200.25,0);
      INSERT INTO public.products (id, store_id, name, sku, price, cost_price, stock_current, min_stock, search_vector) VALUES
        ('${P1}','${S1}','Producto Uno','SKU-1',10,6,5,10, to_tsvector('spanish','Producto Uno')),
        ('${P2}','${S1}','Producto Dos','SKU-2',20,12,50,5, to_tsvector('spanish','Producto Dos')),
        ('${P3}','${S1}','Producto Tres','SKU-3',30,18,0,5, to_tsvector('spanish','Producto Tres'));
      INSERT INTO public.inventory (id, product_id, store_id, quantity) VALUES
        ('eeeeeeee-0000-0000-0000-000000000001','${P1}','${S1}',5),
        ('eeeeeeee-0000-0000-0000-000000000002','${P2}','${S1}',50),
        ('eeeeeeee-0000-0000-0000-000000000003','${P3}','${S1}',0);
      INSERT INTO public.transactions (id, store_id, status, created_at, total_amount, payment_method) VALUES
        ('dddddddd-0000-0000-0000-000000000011','${S1}','completed','${D1}',150.00,'cash'),
        ('dddddddd-0000-0000-0000-000000000012','${S1}','completed','${D1}',75.50,'transfer');
      INSERT INTO public.transaction_items (id, transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
        ('dddddddd-0000-0000-0000-000000000021','dddddddd-0000-0000-0000-000000000011','${P1}',2,100.00,60.00),
        ('dddddddd-0000-0000-0000-000000000022','dddddddd-0000-0000-0000-000000000012','${P2}',1,50.50,30.00);
      INSERT INTO public.stock_movements (id, product_id, store_id, movement_type, quantity_change, unit_cost, created_at) VALUES
        ('dddddddd-0000-0000-0000-000000000031','${P1}','${S1}','entrada',50,10.00,'${D1}'),
        ('dddddddd-0000-0000-0000-000000000032','${P1}','${S1}','salida',-2,10.00,'${D2}');
      -- marcador cross-store: movimiento de P1 en S2 con unit_cost distinto
      INSERT INTO public.stock_movements (id, product_id, store_id, movement_type, quantity_change, unit_cost, created_at) VALUES
        ('dddddddd-0000-0000-0000-000000000033','${P1}','${S2}','entrada',8,22.50,'${D1}');
      INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, status) VALUES
        ('dddddddd-0000-0000-0000-000000000041','${S1}','${S2}','${U1}','pendiente'),
        ('dddddddd-0000-0000-0000-000000000042','${S2}','${S2}','${U2}','pendiente');
      INSERT INTO public.transfer_items (id, transfer_id, product_id, quantity, unit_cost) VALUES
        ('dddddddd-0000-0000-0000-000000000051','dddddddd-0000-0000-0000-000000000041','${P1}',3,12.00),
        ('dddddddd-0000-0000-0000-000000000052','dddddddd-0000-0000-0000-000000000042','${P4}',1,99.00);
      INSERT INTO public.receipts (id, store_id, total_cost, created_at) VALUES
        ('dddddddd-0000-0000-0000-000000000061','${S1}',30.10,'${D1}'),
        ('dddddddd-0000-0000-0000-000000000062','${S1}',45.20,'${D2}');
      -- S2 (marcadores de fuga, receipt en fecha exclusiva D3)
      INSERT INTO public.cash_closures (id, user_id, store_id, session_reference, declared_cash, declared_vouchers, system_total, status, closed_at, created_at, declared_total, system_expected_total, difference) VALUES
        ('dddddddd-0000-0000-0000-000000000003','${U2}','${S2}','ses-3',999.99,0,999.99,'cerrado','${D1}','${D1}',999.99,999.99,0);
      INSERT INTO public.products (id, store_id, name, sku, price, cost_price, stock_current, min_stock, search_vector) VALUES
        ('${P4}','${S2}','Producto Cuatro','SKU-4',40,25,1,9, to_tsvector('spanish','Producto Cuatro')),
        ('${P5}','${S2}','Producto Cinco','SKU-5',50,30,100,5, to_tsvector('spanish','Producto Cinco'));
      INSERT INTO public.inventory (id, product_id, store_id, quantity) VALUES
        ('eeeeeeee-0000-0000-0000-000000000004','${P4}','${S2}',1),
        ('eeeeeeee-0000-0000-0000-000000000005','${P5}','${S2}',100);
      INSERT INTO public.transactions (id, store_id, status, created_at, total_amount, payment_method) VALUES
        ('dddddddd-0000-0000-0000-000000000013','${S2}','completed','${D2}',500.00,'cash');
      INSERT INTO public.transaction_items (id, transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
        ('dddddddd-0000-0000-0000-000000000023','dddddddd-0000-0000-0000-000000000013','${P4}',5,100.00,10.00);
      INSERT INTO public.receipts (id, store_id, total_cost, created_at) VALUES
        ('dddddddd-0000-0000-0000-000000000063','${S2}',777.77,'${D3}');
    `);

    // ACL de las 9 (estado PRE = LIVE): EXECUTE {authenticated, service_role}
    const SIGS = {
      get_cash_closures: 'public.get_cash_closures(uuid,date,date,integer)',
      get_transfers: 'public.get_transfers(uuid,timestamptz,timestamptz,text,integer)',
      get_store_analytics_advanced: 'public.get_store_analytics_advanced(uuid,date,date,integer)',
      get_sales_since_last_closure: 'public.get_sales_since_last_closure(uuid)',
      get_paginated_products: 'public.get_paginated_products(uuid,text,text,integer,integer)',
      get_products_for_reception: 'public.get_products_for_reception(uuid,text,integer,integer)',
      get_product_stock_ledger_paginated: 'public.get_product_stock_ledger_paginated(uuid,uuid,integer,integer)',
      get_daily_expenses_aggregated: 'public.get_daily_expenses_aggregated(uuid,date,date,integer)',
      get_low_stock_count: 'public.get_low_stock_count(uuid)',
    };
    for (const f of FN_NAMES) await q(db, `GRANT EXECUTE ON FUNCTION ${SIGS[f]} TO authenticated, service_role`);

    // ── Fase D: cuerpos LIVE (PRE) + REPRO ──
    console.log('[staging] instalar cuerpos LIVE (PRE)…');
    for (const stmt of installDefs(FN_NAMES)) {
      const r = await q(db, stmt);
      if (!r.ok) throw new Error('install PRE: ' + r.err + ' :: ' + stmt.slice(0, 80));
    }
    // default de Postgres: funciones nuevas heredan EXECUTE a PUBLIC → replicar ACL Supabase
    await q(db, `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`);
    for (const f of FN_NAMES) await q(db, `GRANT EXECUTE ON FUNCTION ${SIGS[f]} TO authenticated, service_role`);
    await q(db, `GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role`);
    await q(db, `GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated, service_role`);

    console.log('\n[REPRO] vulnerabilidad presente en cuerpos PRE (U1 = miembro solo de S1):');
    const reproExpect = [
      ['get_cash_closures(NULL)', FNS.get_cash_closures('NULL'), (r) => JSON.stringify(r).includes('999.99'), 'cierres de S2 (999.99) visibles'],
      ['get_cash_closures(S2)', FNS.get_cash_closures(`'${S2}'`), (r) => JSON.stringify(r).includes('999.99'), 'cierres de S2 por UUID directo'],
      ['get_transfers(NULL)', FNS.get_transfers('NULL'), (r) => JSON.stringify(r).includes('000000000042'), 'transferencia interna de S2 (TR-042) visible'],
      ['get_store_analytics_advanced(S2)', FNS.get_store_analytics_advanced(`'${S2}'`), (r) => JSON.stringify(r).includes('500'), 'ventas de S2 (500) visibles'],
      ['get_sales_since_last_closure(S2)', FNS.get_sales_since_last_closure(`'${S2}'`), (r) => r.ok && r.rows.some(x => Number(x.total_sales) === 500), 'total_sales de S2 = 500'],
      ['get_paginated_products(S2)', FNS.get_paginated_products(`'${S2}'`), (r) => r.rows.every(x => x.store_id === S2) && r.rows.length === 2, 'catálogo S2 (P4/P5) con costos'],
      ['get_products_for_reception(S2)', FNS.get_products_for_reception(`'${S2}'`), (r) => r.rows.length === 2, 'productos S2 para recepción'],
      ['get_product_stock_ledger_paginated(NULL)', FNS.get_product_stock_ledger_paginated('NULL'), (r) => JSON.stringify(r).includes('22.50'), 'movimiento de P1 en S2 (unit_cost 22.50)'],
      ['get_daily_expenses_aggregated(NULL)', FNS.get_daily_expenses_aggregated('NULL'), (r) => JSON.stringify(r).includes('777.77'), 'gastos de S2 (777.77) visibles'],
      ['get_low_stock_count(NULL)', FNS.get_low_stock_count('NULL'), (r) => r.ok && Number(Object.values(r.rows[0])[0]) >= 2, 'conteo global incluye S2 (≥2)'],
    ];
    for (const [id, sql, cond, why] of reproExpect) {
      const r = await asUser(U1, 'authenticated', sql);
      const ok = r.ok && cond(r);
      check(`REPRO ${id}`, ok, ok ? why : (r.err || 'condición no cumplida'));
      evidence.repro.push({ id, repro: !!ok, detail: why, err: r.err ?? null });
    }

    // ── Fase E: aplicar migraciones EXACTAS ──
    console.log('\n[staging] aplicar migraciones R2-A/B/C (bytes exactos)…');
    for (const f of [
      '20260916000005_rem_r2_a_high_read_guards.sql',
      '20260916000006_rem_r2_b_medium_read_guards.sql',
      '20260916000007_rem_r2_c_low_read_guards.sql',
    ]) {
      const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
      const r = await q(db, sql);
      if (!r.ok) throw new Error(`migración ${f}: ` + r.err);
      console.log(`  aplicada ${f}`);
    }
    await q(db, `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`);
    for (const f of FN_NAMES) await q(db, `GRANT EXECUTE ON FUNCTION ${SIGS[f]} TO authenticated, service_role`);

    // byte-check staging: pg_get_functiondef == statement de la migración
    console.log('\n[byte-check] cuerpos instalados == migraciones (staging):');
    for (const f of FN_NAMES) {
      const r = await q(db, `SELECT pg_get_functiondef(to_regprocedure('${SIGS[f]}')) AS def`);
      const live = r.rows[0].def;
      const mig = fs.readFileSync(path.join(MIG, f === 'get_cash_closures' || f === 'get_transfers' ? '20260916000005_rem_r2_a_high_read_guards.sql'
        : (f === 'get_daily_expenses_aggregated' || f === 'get_low_stock_count' ? '20260916000007_rem_r2_c_low_read_guards.sql'
          : '20260916000006_rem_r2_b_medium_read_guards.sql')), 'utf8');
      const stmts = mig.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g) || [];
      const mine = stmts.find(s => s.includes(`public.${f}(`));
      const eq = mine && live.replace(/\s+$/, '') === mine.replace(/\$function\$;\s*$/, '$function$').replace(/\s+$/, '');
      check(`BYTE ${f}`, eq, eq ? 'def == migración' : 'def != migración');
      evidence.bytecheck.push({ fn: f, equal: !!eq });
    }

    // ── Fase F: T1-T7 × 9 ──
    console.log('\n[T-matrix] T1-T7 × 9 funciones:');
    const s1s2 = `'${S2}'`, s1q = `'${S1}'`;
    for (const f of FN_NAMES) {
      // T1: miembro + tienda propia → PASS + datos SOLO de S1
      {
        const r = await asUser(U1, 'authenticated', FNS[f](s1q));
        let scope = true;
        if (r.ok && f === 'get_cash_closures') scope = JSON.stringify(r.rows[0]).includes(S1) && !JSON.stringify(r.rows[0]).includes('999.99');
        if (r.ok && f === 'get_transfers') scope = !JSON.stringify(r.rows[0]).includes('000000000042');
        if (r.ok && f === 'get_store_analytics_advanced') {
          const v = r.rows[0][Object.keys(r.rows[0])[0]];
          const obj = typeof v === 'string' ? JSON.parse(v) : v;
          scope = Math.abs(obj.kpis.period_sales - 225.5) < 0.01;
        }
        if (r.ok && f === 'get_sales_since_last_closure') scope = Math.abs(Number(r.rows[0].total_sales) - 225.5) < 0.01;
        if (r.ok && f === 'get_paginated_products') scope = r.rows.every(x => x.store_id === S1) && r.rows.length === 3;
        if (r.ok && f === 'get_products_for_reception') scope = r.rows.length === 3;
        if (r.ok && f === 'get_product_stock_ledger_paginated') scope = !JSON.stringify(r.rows).includes('22.50');
        if (r.ok && f === 'get_daily_expenses_aggregated') scope = !JSON.stringify(r.rows[0]).includes('777.77');
        if (r.ok && f === 'get_low_stock_count') scope = Number(Object.values(r.rows[0])[0]) === 1;
        check(`T1 ${f}`, r.ok && scope, r.ok ? `PASS + datos solo S1${scope ? '' : ' (SCOPE VIOLATED)'}` : r.err);
        evidence.tests.push({ test: 'T1', fn: f, pass: r.ok && scope });
      }
      // T2: tienda ajena → 42501
      {
        const r = await asUser(U1, 'authenticated', FNS[f](s1s2));
        check(`T2 ${f}`, !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
        evidence.tests.push({ test: 'T2', fn: f, pass: !r.ok && r.code === '42501' });
      }
      // T3: UUID manipulado → 42501
      {
        const r = await asUser(U1, 'authenticated', FNS[f](`'${UUID_UNKNOWN}'`));
        check(`T3 ${f}`, !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
        evidence.tests.push({ test: 'T3', fn: f, pass: !r.ok && r.code === '42501' });
      }
      // T4: NULL → 42501 (contrato; elimina NULL=ALL)
      {
        const r = await asUser(U1, 'authenticated', FNS[f]('NULL'));
        check(`T4 ${f}`, !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO (NULL=ALL sigue vivo)' : `${r.code} ${r.err}`);
        evidence.tests.push({ test: 'T4', fn: f, pass: !r.ok && r.code === '42501' });
      }
      // T5: sin membership → 42501
      {
        const r = await asUser(U3, 'authenticated', FNS[f](s1q));
        check(`T5 ${f}`, !r.ok && r.code === '42501', r.ok ? 'NO BLOQUEADO' : `${r.code} ${r.err}`);
        evidence.tests.push({ test: 'T5', fn: f, pass: !r.ok && r.code === '42501' });
      }
      // T6: service_role → PASS (con tienda y con NULL)
      {
        const r1 = await asUser(null, 'service_role', FNS[f](s1s2));
        const r2 = await asUser(null, 'service_role', FNS[f]('NULL'));
        check(`T6 ${f}`, r1.ok && r2.ok, r1.ok && r2.ok ? 'service_role PASS (store y NULL operativos)' : (r1.err || r2.err));
        evidence.tests.push({ test: 'T6', fn: f, pass: r1.ok && r2.ok });
      }
      // T7: anon → denegado por ACL (sin EXECUTE)
      {
        const r = await asUser(null, 'anon', FNS[f](s1q));
        check(`T7 ${f}`, !r.ok && (r.code === '42501' || /permission denied/i.test(r.err)), r.ok ? 'anon EJECUTÓ (mal)' : `${r.code} ${r.err}`);
        evidence.tests.push({ test: 'T7', fn: f, pass: !r.ok && (r.code === '42501' || /permission denied/i.test(r.err)) });
      }
    }

    // ── Fase G: resumen ──
    console.log(`\n════════════════════════════════════════`);
    console.log(`STAGING RESULT: ${passes} PASS / ${failures} FAIL`);
    console.log(`════════════════════════════════════════`);
    evidence.summary = { passes, failures, at: new Date().toISOString(), port: PORT };
    fs.writeFileSync('/home/z/my-project/scripts/r2-guard-staging-results.json', JSON.stringify(evidence, null, 1));
    await db.end();
  } finally {
    spawnSync(`${BIN}/pg_ctl`, ['-D', DATA, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
