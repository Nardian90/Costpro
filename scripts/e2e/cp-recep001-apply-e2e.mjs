#!/usr/bin/env node
/**
 * cp-recep001-apply-e2e.mjs — Aplica las migraciones de la misión
 * CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). --check = solo pre/post estado.
 *
 * Uso: node scripts/e2e/cp-recep001-apply-e2e.mjs [--check]
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

const MIGRATIONS = [
  'supabase/migrations/20261125120000_cp_recep001_confirm_notes_link.sql',
  'supabase/migrations/20261125120100_cp_recep001_master_sku_consecutivo.sql',
];

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const checkOnly = process.argv.includes('--check');

const pre = await runSql(`
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('confirm_pending_reception','fn_classify_reception_import_row',
                     'resolve_reception_import_rows','register_reception',
                     'next_master_catalog_sku','cp_recep001_backfill_confirm_notes')
 order by p.proname;
`);
console.log('=== PRE funciones ===');
console.log(`HTTP ${pre.status}`);
console.log(pre.text.slice(0, 2000));
if (!pre.ok) process.exit(1);

if (!checkOnly) {
  for (const m of MIGRATIONS) {
    const sql = readFileSync(join(REPO, m), 'utf8');
    console.log(`\n=== Aplicando ${m} ===`);
    const r = await runSql(sql);
    console.log(`HTTP ${r.status}`);
    console.log(r.text.slice(0, 2500));
    if (!r.ok) { console.error('ABORT: fallo aplicando migración'); process.exit(1); }
  }
}

const post = await runSql(`
-- S1: firmas presentes
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('confirm_pending_reception','next_master_catalog_sku',
                     'cp_recep001_backfill_confirm_notes')
 order by p.proname;
`);
console.log('\n=== POST S1: firmas ===');
console.log(`HTTP ${post.status}`);
console.log(post.text.slice(0, 1200));

const post2 = await runSql(`
-- S2: confirm_pending_reception escribe notes=receipt_id
select position('p_receipt_id::text' in pg_get_functiondef(p.oid)) > 0 as escribe_enlace
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='confirm_pending_reception'
   and pg_get_function_identity_arguments(p.oid)='p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone';
`);
console.log('\n=== POST S2: enlace documental ===');
console.log(`HTTP ${post2.status}`);
console.log(post2.text.slice(0, 800));

const post3 = await runSql(`
-- S3: los 3 escritores usan el generador oficial; clasificador sin ERR_PRODUCT_WITHOUT_SKU
select p.proname,
       position('next_master_catalog_sku' in pg_get_functiondef(p.oid)) > 0 as usa_generador,
       position('ERR_PRODUCT_WITHOUT_SKU' in pg_get_functiondef(p.oid)) > 0 as exige_sku_conectada
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public'
   and p.proname in ('fn_classify_reception_import_row','resolve_reception_import_rows','register_reception')
 order by p.proname;
`);
console.log('\n=== POST S3: generador oficial ===');
console.log(`HTTP ${post3.status}`);
console.log(post3.text.slice(0, 1200));

const post4 = await runSql(`
-- S4: dry-run del backfill debe devolver movements_linked = 0 (ya aplicado o nada pendiente)
select public.cp_recep001_backfill_confirm_notes(true) as dry_run;
`);
console.log('\n=== POST S4: backfill idempotente (dry-run) ===');
console.log(`HTTP ${post4.status}`);
console.log(post4.text.slice(0, 800));

process.exit(post.ok && post2.ok && post3.ok && post4.ok ? 0 : 1);
