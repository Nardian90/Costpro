#!/usr/bin/env node
/**
 * cp-log-reception-apply-e2e.mjs — Aplica las migraciones de la misión
 * CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 a la BD AISLADA CostproE2E
 * (Management API + guard canónico de aislamiento). Validación de sintaxis,
 * guards fail-closed y smoke de las nuevas RPCs.
 *
 * Uso: node scripts/e2e/cp-log-reception-apply-e2e.mjs [--check]
 *   --check: solo verifica que las funciones existen (sin aplicar).
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
  'supabase/migrations/20261116140000_cp_reception_master_catalog_integrity.sql',
  'supabase/migrations/20261116140100_cp_reception_import_classification.sql',
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

if (!checkOnly) {
  for (const m of MIGRATIONS) {
    const sql = readFileSync(join(REPO, m), 'utf8');
    console.log(`\n=== Aplicando ${m} ===`);
    const r = await runSql(sql);
    console.log(`HTTP ${r.status}`);
    console.log(r.text.slice(0, 3000));
    if (!r.ok) { console.error('ABORT: fallo aplicando migración'); process.exit(1); }
  }
}

// Smoke: las nuevas funciones existen con su firma.
const smoke = `
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('classify_reception_import_rows','resolve_reception_import_rows',
                     'reactivate_master_product','fn_classify_reception_import_row',
                     'fn_products_master_link_guard')
 order by p.proname;
`;
console.log('\n=== SMOKE funciones ===');
const s = await runSql(smoke);
console.log(`HTTP ${s.status}`);
console.log(s.text.slice(0, 3000));

// Smoke: trigger presente.
const trg = `
select tgname, tgrelid::regclass as tabla, tgenabled
  from pg_trigger where tgname = 'trg_products_master_link_guard' and not tgisinternal;
`;
console.log('\n=== SMOKE trigger ===');
const t = await runSql(trg);
console.log(`HTTP ${t.status}`);
console.log(t.text.slice(0, 1500));

process.exit(s.ok && t.ok ? 0 : 1);
