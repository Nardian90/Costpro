#!/usr/bin/env node
/**
 * rem-inv-6r-staging.cjs — REM-INV-6R Gate J/K: ephemeral PostgreSQL staging
 * (pg-driver variant — the embedded distribution ships initdb/pg_ctl/postgres
 * but not psql). Boots EPHEMERAL PG17 on 127.0.0.1:55432, recreates the
 * Supabase role model (anon/authenticated/service_role + auth.uid()/role()
 * claim stubs), installs REAL function bodies extracted from migrations
 * (Layer C guarantees LIVE equality) and runs the negative/legitimate matrix.
 *
 * Exit 0 = all expectations met; 1 = any expectation violated.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { Client } = require('/home/z/my-project/Costpro/node_modules/pg');

const ROOT = '/home/z/my-project/scripts/6r-env';
const BIN = path.join(ROOT, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin');
const DATA = path.join(ROOT, 'pgdata-6r');
const SOCK = path.join(ROOT, 'pgsock');
const PORT = 55432;
const BODIES = require('/tmp/6r-bodies2.json');

async function connect(db) {
  const c = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: db });
  c.on('error', () => {}); // server-side termination (pg_ctl stop) must not crash node
  await c.connect();
  return c;
}
async function q(c, sql) {
  try { const r = await c.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: String(e.message).split('\n')[0] }; }
}

let failures = 0, passes = 0;
function check(id, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${id} — ${detail}`); }
  else { failures++; console.log(`  FAIL  ${id} — ${detail}`); }
}

// run `attackSql` as (uid, role); returns error message or null
async function asUser(uid, role, attackSql, commit = false) {
  const c = await connect('costpro');
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${role}`);
    await c.query(`SET LOCAL request.jwt.claim.sub = ${uid ? `'${uid}'` : "''"}`);
    await c.query(`SET LOCAL request.jwt.claim.role = '${role}'`);
    const r = await q(c, attackSql);
    await c.query(commit ? 'COMMIT' : 'ROLLBACK').catch(() => {});
    return r.ok ? null : r.err;
  } finally { await c.end().catch(() => {}); }
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(SOCK, { recursive: true, force: true });
  fs.mkdirSync(SOCK, { recursive: true });
  console.log('[staging] initdb…');
  execSync(`${path.join(BIN, 'initdb')} -D ${DATA} -U postgres --auth=trust -E UTF8`);
  console.log('[staging] starting postgres on 127.0.0.1:' + PORT);
  const ctl = spawnSync(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-o', `-p ${PORT} -k ${SOCK} -c listen_addresses=127.0.0.1`, '-l', path.join(ROOT, 'pg6r.log'), '-w', 'start'], { encoding: 'utf8' });
  if (ctl.status !== 0) throw new Error('pg_ctl start failed: ' + ctl.stderr);

  const T1 = '11111111-1111-1111-1111-111111111111', T2 = '22222222-2222-2222-2222-222222222222';
  const U1 = 'aaaaaaaa-0000-0000-0000-000000000001';
  const U2 = 'aaaaaaaa-0000-0000-0000-000000000002';
  const UA = 'aaaaaaaa-0000-0000-0000-000000000003';
  const S1 = 'bbbbbbbb-0000-0000-0000-000000000001', S2 = 'bbbbbbbb-0000-0000-0000-000000000002', S3 = 'bbbbbbbb-0000-0000-0000-000000000003';
  const P1 = 'cccccccc-0000-0000-0000-000000000001';
  const P2 = 'cccccccc-0000-0000-0000-000000000002';
  const TR1 = 'dddddddd-0000-0000-0000-000000000001';

  try {
    const boot = await connect('postgres');
    await q(boot, 'CREATE DATABASE costpro');
    await boot.end();

    const db = await connect('costpro');
    for (const stmt of [`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE authenticator LOGIN PASSWORD 'staging';
      GRANT anon, authenticated, service_role TO authenticator;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
    `, `
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TYPE user_role AS ENUM ('admin','manager','encargado','warehouse','clerk','usuario','costpro_snapshot');
      CREATE TABLE profiles (id uuid PRIMARY KEY, tenant_id uuid, role user_role, active_store_id uuid);
      CREATE TABLE stores (id uuid PRIMARY KEY, tenant_id uuid, is_active boolean DEFAULT true, name text);
      CREATE TABLE user_store_memberships (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, store_id uuid, role text, status text);
      CREATE TABLE transfers (id uuid PRIMARY KEY, origin_store_id uuid, destination_store_id uuid, status text, notes text, total_cost numeric DEFAULT 0, effective_date timestamptz DEFAULT now(), requires_approval boolean DEFAULT false, approved_by uuid, approved_at timestamptz, created_by uuid, confirmed_by uuid, confirmed_at timestamptz, reversed_by uuid, reversed_at timestamptz, reversal_reason text, tenant_id uuid, created_at timestamptz DEFAULT now());
      CREATE TABLE transfer_items (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, transfer_id uuid, product_id uuid, destination_product_id uuid, quantity numeric, unit_cost numeric DEFAULT 0, total numeric DEFAULT 0);
      CREATE TABLE products (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, tenant_id uuid, name text, sku text, stock_current numeric DEFAULT 0, min_stock numeric DEFAULT 0, is_active boolean DEFAULT true, visible_en_tienda boolean DEFAULT true, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), version integer DEFAULT 1, has_movements boolean DEFAULT false, cost_price numeric DEFAULT 0, cost_average numeric DEFAULT 0, unit_of_measure text DEFAULT 'unit', description text, category text DEFAULT 'General', price numeric DEFAULT 0, price_currency text DEFAULT 'CUP');
      CREATE TABLE inventory_reservations (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, product_id uuid, reference_type text, reference_id uuid, quantity numeric, status text, created_at timestamptz DEFAULT now(), released_at timestamptz, consumed_at timestamptz, created_by uuid, metadata jsonb, expires_at timestamptz);
      CREATE TABLE inventory (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, product_id uuid, store_id uuid, quantity numeric, version integer DEFAULT 1, low_stock_threshold numeric DEFAULT 0, updated_at timestamptz DEFAULT now(), tenant_id uuid, created_at timestamptz DEFAULT now());
      CREATE TABLE audit_logs (id bigserial PRIMARY KEY, user_id uuid, store_id uuid, action text, table_name text, record_id uuid, metadata jsonb, created_at timestamptz DEFAULT now());
      CREATE TABLE transactions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, status text, total_amount numeric, created_at timestamptz);
      CREATE TABLE receipts (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, status text, created_at timestamptz);
      CREATE TYPE movement_type AS ENUM ('initial','purchase','sale','transfer_in','transfer_out','adjustment','return','production_in','production_out','devolution');
      CREATE TABLE stock_movements (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, product_id uuid, variant_id uuid, quantity_change numeric, movement_type movement_type, reference_id text, reference_doc text, movement_date timestamptz, created_by uuid, created_at timestamptz DEFAULT now(), unit_cost numeric, unit_price numeric, cost_value_change numeric, balance_after numeric, notes text, tenant_id uuid);
      CREATE TABLE IF NOT EXISTS business_events (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, event_type text, entity_id uuid, payload jsonb, created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS cash_closures (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, store_id uuid, session_reference text, declared_cash numeric, declared_vouchers numeric, system_total numeric, notes text, closed_at timestamp with time zone, created_at timestamp with time zone, declared_total numeric, system_expected_total numeric, status text, difference numeric, opening_balance numeric, cash_movements_total numeric);
      CREATE TABLE IF NOT EXISTS inventory_adjustments (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, created_by uuid, created_at timestamp with time zone, status text, notes text, reason text, confirmed_at timestamp with time zone, confirmed_by uuid, reversed_at timestamp with time zone, reversed_by uuid, reversal_reason text, currency text, exchange_rate numeric);
      CREATE TABLE IF NOT EXISTS inventory_movements (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, created_at timestamp with time zone, product_id uuid, type text, quantity_change numeric, reference_id uuid, user_id uuid, balance_after numeric);
      CREATE TABLE IF NOT EXISTS payment_transactions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, ref_type text, ref_id uuid, amount numeric, payment_method text, currency text, exchange_rate numeric, amount_cup numeric, payment_date timestamp with time zone, reference text, notes text, paid_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, idempotency_key text, transaction_id uuid, direction text);
      CREATE TABLE IF NOT EXISTS product_variants (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, product_id uuid, name text, sku text, price numeric, conversion_factor integer, created_at timestamp with time zone, updated_at timestamp with time zone, precio_empresa numeric);
      CREATE TABLE IF NOT EXISTS service_cost_distributions (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, service_id uuid, receipt_id uuid, receipt_item_id uuid, product_id uuid, distribution_amount numeric, distribution_percentage numeric, created_at timestamp with time zone);
      CREATE TABLE IF NOT EXISTS transaction_items (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, transaction_id uuid, product_id uuid, variant_id uuid, quantity numeric, price_at_sale numeric, created_at timestamp with time zone, cost_at_sale numeric, discount_type text, discount_value numeric, cash_paid numeric, transfer_paid numeric, price_currency text, price_at_sale_cup numeric, zelle_paid numeric, currency text, exchange_rate numeric, cash_currency text, transfer_currency text, zelle_currency text, cash_discount_type text, cash_discount_value numeric, cash_discount_currency text, transfer_discount_type text, transfer_discount_value numeric, transfer_discount_currency text, zelle_discount_type text, zelle_discount_value numeric, zelle_discount_currency text);
      CREATE TABLE wac_change_log (id bigserial PRIMARY KEY, store_id uuid, product_id uuid, wac_before numeric, wac_after numeric, event text, qty_in numeric, uc_in numeric, source_ref text, changed_by uuid, created_at timestamptz DEFAULT now());
    `]) {
      const r = await q(db, stmt);
      if (!r.ok) throw new Error('bootstrap failed: ' + r.err);
    }

    for (const [key, fn] of Object.entries(BODIES)) {
      const tag = '$r6r' + Math.random().toString(36).slice(2, 8) + '$';
      const r = await q(db, `CREATE OR REPLACE FUNCTION public.${fn.name}(${fn.args}) ${fn.header} AS ${tag}${fn.body}${tag};`);
      if (!r.ok) throw new Error('install failed for ' + key + ': ' + r.err);
    }
    await q(db, `GRANT EXECUTE ON FUNCTION public.has_store_access(uuid), public.has_store_access_as(uuid,uuid), public.is_admin(), public.get_available_stock(uuid,uuid) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.get_batch_store_daily_kpis(uuid[],date) TO authenticated, service_role;`);
    // realistic ACLs (mirror of LIVE proacl): default PUBLIC EXECUTE revoked, per-function grants as certified
    const acl = await q(db, `
      REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone), public.create_transfer(uuid,uuid,jsonb,text,uuid,timestamp with time zone,uuid), public.has_store_access(uuid), public.has_store_access_as(uuid,uuid), public.is_admin(), public.get_available_stock(uuid,uuid), public.get_batch_store_daily_kpis(uuid[],date) TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid), public.reset_store_data(uuid,boolean) TO service_role;
    `);
    if (!acl.ok) throw new Error('ACL install failed: ' + acl.err);

    const seed = await q(db, `
      INSERT INTO profiles (id, tenant_id, role) VALUES ('${U1}','${T1}','usuario'), ('${U2}','${T1}','usuario'), ('${UA}','${T1}','admin');
      INSERT INTO stores (id, tenant_id, name) VALUES ('${S1}','${T1}','S1'), ('${S2}','${T1}','S2'), ('${S3}','${T2}','S3-OTHER-TENANT');
      INSERT INTO user_store_memberships (user_id, store_id, role, status) VALUES ('${U1}','${S1}','warehouse','active'), ('${U1}','${S2}','warehouse','active');
      INSERT INTO products (id, store_id, tenant_id, name, sku, stock_current) VALUES ('${P1}','${S1}','${T1}','P1@S1','SKU1', 100), ('${P2}','${S2}','${T1}','P1@S2','SKU1', 2);
      INSERT INTO transfers (id, origin_store_id, destination_store_id, status, created_by) VALUES ('${TR1}','${S1}','${S2}','PENDIENTE','${U1}');
      INSERT INTO transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost) VALUES ('${TR1}','${P1}','${P2}', 5, 10);
      INSERT INTO inventory_reservations (store_id, product_id, reference_type, reference_id, quantity, status) VALUES ('${S1}','${P1}','TRANSFER','${TR1}', 5, 'ACTIVE');
      INSERT INTO transactions (store_id, status, total_amount, created_at) VALUES ('${S3}','completed', 999.99, now());
    `);
    if (!seed.ok) throw new Error('seed failed: ' + seed.err);
    const seedChk = await q(db, `SELECT (SELECT count(*) FROM profiles)::text p, (SELECT count(*) FROM user_store_memberships)::text m, (SELECT count(*) FROM transfers)::text t, (SELECT count(*) FROM products)::text pr`);
    if (!seedChk.ok || seedChk.rows[0].p !== '3' || seedChk.rows[0].m !== '2' || seedChk.rows[0].t !== '1' || seedChk.rows[0].pr !== '2') {
      throw new Error('seed failed or incomplete: ' + JSON.stringify(seedChk));
    }

    console.log('\n── Attacks (must be denied) ──');
    {
      const err = await asUser(null, 'anon', `SELECT public.confirm_transfer('${TR1}', '${U1}', now());`);
      check('A1.anon.confirm_transfer.denied', !!err && /permission denied/i.test(err), err ? err : 'NO ERROR (executed!)');
    }
    {
      const err = await asUser(U2, 'authenticated', `SELECT public.confirm_transfer('${TR1}', '${U1}', now());`);
      check('A2.nonmember.p_user_id_spoof.denied', !!err && /ERR_UNAUTHORIZED/i.test(err), err ? err : 'NO ERROR — BYPASS!');
    }
    {
      const err = await asUser(U2, 'authenticated', `SELECT public.create_transfer('${S1}', '${S3}', '[{"product_id":"${P1}","quantity":1}]'::jsonb, 'note', NULL, NULL, '${U1}');`);
      check('A3.nonmember.cross_tenant_create.denied', !!err && /ERR_UNAUTHORIZED/i.test(err), err ? err : 'NO ERROR — BYPASS!');
    }
    {
      const err = await asUser(U1, 'authenticated', `SELECT public.reverse_transfer('${TR1}', 'why', '${U1}');`);
      check('A4.authenticated.reverse_transfer.acl_denied', !!err && /permission denied/i.test(err), err ? err : 'NO ERROR');
    }
    {
      const err = await asUser(U1, 'authenticated', `SELECT public.reset_store_data('${S1}', false);`);
      check('A5.authenticated.reset_store_data.acl_denied', !!err && /permission denied/i.test(err), err ? err : 'NO ERROR');
    }
    {
      const c = await connect('costpro');
      await c.query('BEGIN');
      await c.query(`SET LOCAL ROLE authenticator`);
      await c.query(`SET LOCAL request.jwt.claim.sub = '${U1}'`);
      await c.query(`SET LOCAL request.jwt.claim.role = 'authenticated'`);
      const r = await q(c, `SELECT count(*) AS n FROM public.get_batch_store_daily_kpis(ARRAY['${S3}']::uuid[], CURRENT_DATE);`);
      await c.query('ROLLBACK').catch(() => {}); await c.end().catch(() => {});
      check('A6.kpi_cross_tenant_read.REPRODUCED', r.ok && String(r.rows[0].n) === '1', r.ok ? `returned ${r.rows[0].n} row for OTHER-TENANT store (finding demonstrated on LIVE body)` : r.err);
    }

    console.log('\n── Legitimate flows (must pass) ──');
    {
      const err = await asUser(U1, 'authenticated', `SELECT public.create_transfer('${S1}', '${S2}', '[{"product_id":"${P1}","quantity":1}]'::jsonb, 'legit', NULL, NULL, NULL);`);
      check('L1.member.create_transfer.success', !err, err ? err : 'created');
    }
    {
      const err = await asUser(U1, 'authenticated', `SELECT public.confirm_transfer('${TR1}', '${UA}', now());`, true);
      check('L2.member.confirm.success', !err, err ? err : 'confirmed');
      if (!err) {
        const c = await connect('costpro');
        const r = await q(c, `SELECT confirmed_by::text AS who FROM transfers WHERE id='${TR1}'`);
        await c.end();
        check('L2b.binding.confirmed_by=auth.uid()', r.ok && r.rows[0].who === U1, `confirmed_by=${r.rows[0].who} (p_user_id supplied was admin ${UA} — ignored)`);
      }
    }
    {
      const err = await asUser(null, 'service_role', `SELECT public.create_transfer('${S1}', '${S2}', '[{"product_id":"${P1}","quantity":2}]'::jsonb, 'on-behalf', NULL, NULL, '${U1}');`);
      check('L3.service_role.on_behalf.success', !err, err ? err : 'created (explicit capability)');
    }
    {
      const err = await asUser(U1, 'authenticated', `SELECT count(*) FROM public.get_batch_store_daily_kpis(ARRAY['${S1}','${S2}']::uuid[], CURRENT_DATE);`);
      check('L4.member.kpi_own_stores.success', !err, err ? err : 'own-store KPIs returned');
    }

    console.log('\n── Phase 2: remediated get_batch_store_daily_kpis (migration 20260916000004) ──');
    {
      const mig = fs.readFileSync('/home/z/my-project/Costpro/supabase/migrations/20260916000004_rem_inv_6r_kpi_store_access_guard.sql', 'utf8');
      const r = await q(db, mig);
      if (!r.ok) throw new Error('remediated fn install failed: ' + r.err);
      // A6R: cross-tenant read must now be DENIED
      const err = await asUser(U1, 'authenticated', `SELECT count(*) FROM public.get_batch_store_daily_kpis(ARRAY['${S3}']::uuid[], CURRENT_DATE);`);
      check('A6R.kpi_cross_tenant_read.denied', !!err && /ERR_UNAUTHORIZED_STORE|42501|permission denied/i.test(err), err ? err : 'NO ERROR — STILL VULNERABLE');
      // L4R: own-store read still passes (no false positive)
      const err2 = await asUser(U1, 'authenticated', `SELECT count(*) FROM public.get_batch_store_daily_kpis(ARRAY['${S1}','${S2}']::uuid[], CURRENT_DATE);`);
      check('L4R.kpi_own_stores.still_pass', !err2, err2 ? err2 : 'own-store KPIs still returned');
      // A6R2: anon must still be denied by ACL
      const err3 = await asUser(null, 'anon', `SELECT count(*) FROM public.get_batch_store_daily_kpis(ARRAY['${S1}']::uuid[], CURRENT_DATE);`);
      check('A6R2.kpi_anon.denied', !!err3 && /permission denied/i.test(err3), err3 ? err3 : 'NO ERROR');
    }

    console.log('\n' + '═'.repeat(72));
    console.log(`STAGING RESULT: ${passes} pass / ${failures} fail (A6 = intentional finding demonstration)`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    spawnSync(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop'], { encoding: 'utf8' });
    console.log('[staging] postgres stopped, cluster disposable');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
