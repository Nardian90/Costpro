#!/usr/bin/env node
/**
 * csmv-transfer-identity-apply-e2e.mjs — MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-
 * TRANSFER-VALIDATION-001 (§11g). Aplica la migración 20261128120000
 * (create_sale_v2 36 params + p_customer_phone + puerta
 * ERR_TRANSFER_IDENTITY_REQUIRED) a la BD AISLADA CostproE2E vía Management
 * API + guard canónico de aislamiento. --check = solo PRE/POST sin aplicar.
 *
 * Uso: node scripts/e2e/csmv-transfer-identity-apply-e2e.mjs [--check]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido (almacén autorizado).');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATION = 'supabase/migrations/20261128120000_cp_pos_transfer_identity_validation.sql';

const SIG_35 = "p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb, p_customer_code text, p_customer_address text, p_customer_ci text";
const SIG_36 = SIG_35 + ', p_customer_phone text';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const PRE_SQL = `
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2'
      and pg_get_function_identity_arguments(p.oid)='${SIG_35}') as firma_35,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2'
      and pg_get_function_identity_arguments(p.oid)='${SIG_36}') as firma_36,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='transactions' and column_name='customer_phone') as col_customer_phone;
`;

const POST_SQL = `
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2') as total_overloads,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2'
      and pg_get_function_identity_arguments(p.oid)='${SIG_36}') as firma_36,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2'
      and pg_get_function_identity_arguments(p.oid)='${SIG_35}') as firma_35_residual,
  (select proacl::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_sale_v2'
      and pg_get_function_identity_arguments(p.oid)='${SIG_36}') as proacl;
`;

const checkOnly = process.argv.includes('--check');

const pre = await runSql(PRE_SQL);
console.log('=== PRE estado aislada (transfer-identity) ===');
console.log(`HTTP ${pre.status}`);
console.log(pre.text.slice(0, 500));
if (!pre.ok) process.exit(1);
const preRows = JSON.parse(pre.text || '[]');
if (preRows[0]?.firma_36 > 0) {
  console.log('CSMV-APPLY: la firma de 36 YA existe en la aislada — no se re-aplica (idempotencia de expediente).');
  process.exit(0);
}
if (preRows[0]?.firma_35 !== 1) {
  console.error('CSMV-GUARD: se esperaba EXACTAMENTE una firma de 35 params — abortando.');
  process.exit(1);
}
if (preRows[0]?.col_customer_phone !== 1) {
  console.error('CSMV-GUARD: transactions.customer_phone no existe — abortando.');
  process.exit(1);
}

if (checkOnly) {
  console.log('CSMV-CHECK: PRE correcto (firma_35=1, firma_36=0, columna customer_phone presente). Sin aplicación (--check).');
  process.exit(0);
}

if (!checkOnly) {
  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  console.log(`\n=== Aplicando ${MIGRATION} ===`);
  const r = await runSql(sql);
  console.log(`HTTP ${r.status}`);
  if (!r.ok) {
    console.error('APLICACIÓN FALLIDA:', r.text.slice(0, 2000));
    process.exit(1);
  }

  // Recarga del esquema de PostgREST (patrón de las aplicaciones gobernadas)
  await runSql("NOTIFY pgrst, 'reload schema';");
  console.log('NOTIFY pgrst (reload schema) emitido.');
}

const post = await runSql(POST_SQL);
console.log('=== POST estado aislada ===');
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 600));
if (!post.ok) process.exit(1);
const rows = JSON.parse(post.text || '[]');
const postRow = rows[0] ?? {};
const ok =
  postRow.total_overloads === 1 &&
  postRow.firma_36 === 1 &&
  postRow.firma_35_residual === 0 &&
  String(postRow.proacl ?? '').includes('authenticated');
if (!ok) {
  console.error('CSMV-POST-GUARD: estado post inesperado (overloads/firma/ACL).');
  process.exit(1);
}
console.log('CSMV-APPLY: OK — una sola firma de 36 params, sin residual de 35, ACL authenticated/service_role.');
