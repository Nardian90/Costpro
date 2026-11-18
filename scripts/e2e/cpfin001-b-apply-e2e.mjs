#!/usr/bin/env node
/**
 * cpfin001-b-apply-e2e.mjs — Aplica la migración parte B de
 * CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001
 * (20261119120000_cp_fin001_rectificador_backfill.sql) a la BD AISLADA
 * CostproE2E (Management API + guard canónico de aislamiento).
 *
 * Uso: node scripts/e2e/cpfin001-b-apply-e2e.mjs [--check]
 *   --check: solo verifica que las funciones/marcas existen (sin aplicar).
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

const MIGRATION = 'supabase/migrations/20261119120000_cp_fin001_rectificador_backfill.sql';

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
  const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
  console.log(`=== Aplicando ${MIGRATION} (lote único transaccional) ===`);
  const r = await runSql(sql);
  console.log(`HTTP ${r.status}`);
  console.log(r.text.slice(0, 3000));
  if (!r.ok) { console.error('ABORT: fallo aplicando migración'); process.exit(1); }
}

// Smoke: función nueva con marca de la misión + métrica FLUJO_CAJA presente.
const smoke = `
SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%importe_cup_origin%' AS tiene_flujo_origin,
       pg_get_functiondef(p.oid) LIKE '%ERR_AMBIGUOUS_COB_MOVEMENT%' AS tiene_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fin_compute_metrics', 'fin_rectify_sale_payment_method')
ORDER BY p.proname;
`;
const s = await runSql(smoke);
console.log('\n=== SMOKE ===');
console.log(`HTTP ${s.status}`);
console.log(s.text.slice(0, 2000));
if (!s.ok || !s.text.includes('fin_rectify_sale_payment_method')) {
  console.error('FALLO: smoke no encuentra las funciones esperadas');
  process.exit(1);
}
console.log('\nOK: migración parte B aplicada/verificada en la BD aislada.');
