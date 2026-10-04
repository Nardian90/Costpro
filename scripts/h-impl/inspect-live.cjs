#!/usr/bin/env node
/**
 * H-IMPL — Inspección LIVE (read-only) del estado contractual en Supabase.
 * Extrae definiciones de funciones, ACL, policies y constraints relevantes
 * para la fase de implementación H1–H6. NO modifica nada.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(REPO, '.env');

const env = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ACCESS = env.SUPABASE_ACCESS_TOKEN;
const REF = URL_.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`mgmt query falló: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

const OUT = [];

async function fnDef(name) {
  const rows = await q(`SELECT pg_get_functiondef(p.oid) AS def, COALESCE(array_to_string(p.proacl, ','), '(NULL=default)') AS acl,
    pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='${name}' ORDER BY p.oid;`);
  for (const r of rows) {
    OUT.push(`\n/* ===== ${name}(${r.args}) ACL={${r.acl}} ===== */\n${r.def}\n`);
  }
}

(async () => {
  await fnDef('create_sale_v2');
  await fnDef('create_sale');
  await fnDef('update_transaction_taxes');
  await fnDef('adjust_total_amount');
  await fnDef('has_store_access_as');
  await fnDef('has_store_access');
  await fnDef('has_store_role_as');
  await fnDef('is_admin');
  await fnDef('check_idempotency');

  const acl = await q(`SELECT COALESCE(array_to_string(proacl, ','), '(NULL)') AS acl FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_sale_v2';`);
  OUT.push(`\n/* ===== ACL LIVE create_sale_v2 ===== */\n${acl[0].acl}\n`);

  const pols = await q(`SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('tax_configurations','store_exchange_rates','exchange_rates')
    ORDER BY tablename, policyname;`);
  OUT.push(`\n/* ===== POLICIES LIVE ===== */`);
  for (const p of pols) {
    OUT.push(`-- ${p.tablename} :: ${p.policyname} [${p.cmd}] roles=${p.roles}\n   USING: ${p.qual}\n   WITH CHECK: ${p.with_check}`);
  }

  const cons = await q(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid IN ('public.tax_configurations'::regclass, 'public.store_exchange_rates'::regclass, 'public.exchange_rates'::regclass)
    ORDER BY conrelid::regclass::text, conname;`);
  OUT.push(`\n/* ===== CONSTRAINTS ===== */`);
  for (const c of cons) OUT.push(`-- ${c.tbl}.${c.conname}: ${c.def}`);

  const cols = await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' ORDER BY ordinal_position;`);
  OUT.push(`\n/* ===== transactions columns ===== */`);
  for (const c of cols) OUT.push(`-- ${c.column_name} ${c.data_type} nullable=${c.is_nullable} default=${c.column_default}`);

  const trg = await q(`SELECT t.tgname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='transactions' AND NOT t.tgisinternal;`);
  OUT.push(`\n/* ===== triggers transactions ===== */`);
  for (const t of trg) OUT.push(`-- ${t.def}`);

  const idem = await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='idempotency_registry' ORDER BY ordinal_position;`);
  OUT.push(`\n/* ===== idempotency_registry columns ===== */`);
  for (const c of idem) OUT.push(`-- ${c.column_name} ${c.data_type} nullable=${c.is_nullable}`);

  for (const tname of ['tax_configurations', 'store_exchange_rates', 'exchange_rates', 'profiles', 'payment_transactions']) {
    const cc = await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${tname}' ORDER BY ordinal_position;`);
    OUT.push(`\n/* ===== ${tname} columns ===== */`);
    for (const c of cc) OUT.push(`-- ${c.column_name} ${c.data_type} nullable=${c.is_nullable}`);
  }

  const roles = await q(`SELECT rolname FROM pg_roles WHERE rolname IN ('costpro_transaction_adjuster','authenticated','service_role','anon','supabase_auth_admin');`);
  OUT.push(`\n/* ===== roles ===== */\n${roles.map(r => r.rolname).join(', ')}`);

  const owners = await q(`SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('create_sale_v2','update_transaction_taxes','adjust_total_amount');`);
  OUT.push(`\n/* ===== owners ===== */`);
  for (const o of owners) OUT.push(`-- ${o.proname}: owner=${o.owner} secdef=${o.secdef}`);

  fs.writeFileSync(path.join(__dirname, 'live-state.sql.txt'), OUT.join('\n'));
  console.log(`✅ estado LIVE volcado a scripts/h-impl/live-state.sql.txt (${OUT.length} bloques)`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
