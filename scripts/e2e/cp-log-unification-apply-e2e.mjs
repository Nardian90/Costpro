#!/usr/bin/env node
/**
 * cp-log-unification-apply-e2e.mjs — Aplica las migraciones de
 * CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001
 * (20261121130000 + 20261121130100) a la BD AISLADA CostproE2E.
 *
 * Guard canónico de aislamiento + verificación de prerrequisitos:
 *  · register_supplier_payment_batch con firma ADN-009 (debe existir ANTES:
 *    mi migración la reemite con el gate de receipts).
 *  · create_sale_v2 con firma de 33 params (la reemite la 20261121130100).
 *
 * Uso: node scripts/e2e/cp-log-unification-apply-e2e.mjs [--check]
 *   --check: solo verifica prerrequisitos y marcas (sin aplicar).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const M1 = 'supabase/migrations/20261121130000_cp_log_unification_master_visibility.sql';
const M2 = 'supabase/migrations/20261121130100_cp_log_unification_pos_transfer_reference.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 600)}`);
  return JSON.parse(body);
}

const CHECKS = {
  'batch ADN-009 presente (firma 7 params)': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment_batch' AND pg_get_function_identity_arguments(p.oid) LIKE 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text'`,
  'create_sale_v2 presente (p_payment_components)': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND pg_get_function_identity_arguments(p.oid) LIKE '%p_payment_components jsonb%'`,
  'gate receipts aplicado (ERR_RECEIPT_NOT_PAYABLE en el motor)': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment' AND position('ERR_RECEIPT_NOT_PAYABLE' in p.prosrc) > 0`,
  'unión maestra en get_products_for_reception': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_reception' AND position('is_catalog_store_connected' in p.prosrc) > 0`,
  'unión maestra en get_products_for_pos': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_pos' AND position('is_catalog_store_connected' in p.prosrc) > 0`,
  'referencia por componente en create_sale_v2': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND position('v_comp->>''reference''' in p.prosrc) > 0`,
};

const onlyCheck = process.argv.includes('--check');

// ── 1. Prerrequisitos ──
const pre = await runSql(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment_batch' AND pg_get_function_identity_arguments(p.oid) LIKE 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text')::int AS batch_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND pg_get_function_identity_arguments(p.oid) LIKE '%p_payment_components jsonb%')::int AS sale_v2_ok`);
const row = pre[0] || {};
console.log(`[pre] batch ADN-009: ${row.batch_ok === 1 ? 'OK' : 'AUSENTE'} · create_sale_v2 33p: ${row.sale_v2_ok === 1 ? 'OK' : 'AUSENTE'}`);
if (row.batch_ok !== 1 || row.sale_v2_ok !== 1) {
  console.error('FALLO: prerrequisitos ausentes — la BD aislada no está al día con main (aplicar primero las migraciones previas).');
  process.exit(1);
}

// ── 2. Verificar marcas (idempotencia) ──
const marks = await runSql(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment' AND position('ERR_RECEIPT_NOT_PAYABLE' in p.prosrc) > 0)::int AS gate_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_reception' AND position('is_catalog_store_connected' in p.prosrc) > 0)::int AS reception_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_pos' AND position('is_catalog_store_connected' in p.prosrc) > 0)::int AS pos_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND position('v_comp_idx' in p.prosrc) > 0)::int AS ref_ok`);
const m = marks[0] || {};
const alreadyApplied = m.gate_ok === 1 && m.reception_ok === 1 && m.pos_ok === 1 && m.ref_ok === 1;

if (onlyCheck || alreadyApplied) {
  for (const [label, q] of Object.entries(CHECKS)) {
    const r = (await runSql(q))[0];
    console.log(`${r.n === 1 ? 'OK  ' : 'FAIL'} ${label}: ${r.n}`);
  }
  console.log(alreadyApplied ? '[apply] Ya aplicadas — nada que hacer.' : '[check] marcas faltantes (usar sin --check para aplicar).');
  process.exit(alreadyApplied ? 0 : 3);
}

// ── 3. Aplicar M1 + M2 (transacciones separadas; CREATE OR REPLACE idempotentes) ──
for (const mig of [M1, M2]) {
  const sql = readFileSync(join(REPO, mig), 'utf-8');
  console.log(`[apply] ${mig.split('/').pop()} (${sql.length} chars)…`);
  await runSql('BEGIN');
  try {
    await runSql(sql);
    await runSql('COMMIT');
    console.log(`[apply] ${mig.split('/').pop()} OK`);
  } catch (e) {
    await runSql('ROLLBACK').catch(() => {});
    console.error(`FALLO aplicando ${mig}: ${e.message}`);
    process.exit(1);
  }
}

// ── 4. Verificación post-aplicación ──
let allOk = true;
for (const [label, q] of Object.entries(CHECKS)) {
  const r = (await runSql(q))[0];
  const ok = r.n === 1;
  if (!ok) allOk = false;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${r.n}`);
}
console.log(allOk ? '[apply] Migraciones aplicadas y verificadas.' : '[apply] VERIFICACIÓN FALLIDA.');
process.exit(allOk ? 0 : 1);
