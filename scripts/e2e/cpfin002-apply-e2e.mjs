#!/usr/bin/env node
/**
 * cpfin002-apply-e2e.mjs — Aplica la migración de CP-FIN-ENERVIDA-CASH-BANK-
 * CLASSIFICATION-AND-BALANCE-RECONCILIATION-001
 * (20261119150000_cp_fin002_cash_bank_reclassification.sql) a la BD AISLADA
 * CostproE2E (Management API + guard canónico de aislamiento).
 *
 * Uso: node scripts/e2e/cpfin002-apply-e2e.mjs [--check]
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

const MIGRATION = 'supabase/migrations/20261119150000_cp_fin002_cash_bank_reclassification.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

const MARKS = {
  dashboard: `pg_get_functiondef('public.fin_get_dashboard(uuid,date,date,uuid)'::regprocedure) LIKE '%desequilibrio_balance%'`,
  dashboard_gasto: `pg_get_functiondef('public.fin_get_dashboard(uuid,date,date,uuid)'::regprocedure) LIKE '%reclasificacion_moneda_cobro%' OR (pg_get_functiondef('public.fin_get_dashboard(uuid,date,date,uuid)'::regprocedure) LIKE '%clase = ' || chr(39) || 'gasto' || chr(39) || '%')`,
  reclass: `(SELECT count(*) FROM pg_proc p WHERE p.proname = 'fin_reclassify_sale_payment_currency')`,
};

if (process.argv.includes('--check')) {
  for (const [k, q] of Object.entries(MARKS)) {
    const rows = await runSql(`SELECT ${q} AS ok`);
    console.log(`${k}: ${JSON.stringify(rows[0])}`);
  }
  process.exit(0);
}

const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
console.log(`Aplicando ${MIGRATION} (${sql.length} bytes) a la BD aislada…`);
const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`FALLO al aplicar: HTTP ${res.status}: ${body.slice(0, 1000)}`);
  process.exit(1);
}
console.log('Migración aplicada (sin control transaccional por convención del canal).');

for (const [k, q] of Object.entries(MARKS)) {
  const rows = await runSql(`SELECT ${q} AS ok`);
  console.log(`verificación ${k}: ${JSON.stringify(rows[0])}`);
}
console.log('OK');
