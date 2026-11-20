#!/usr/bin/env node
/**
 * m008-apply-migration-e2e.mjs — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008.
 * Aplica la migración 20261121120000_adn008_sr_drafts_supplier_multipago.sql
 * a la BD AISLADA CostproE2E (Management API + guard canónico de aislamiento).
 * Idempotente (IF NOT EXISTS / CREATE OR REPLACE) → re-ejecutable sin daño.
 *
 * Uso: node scripts/m008-apply-migration-e2e.mjs [--check]
 *   --check: solo verifica que columnas/funciones/marcas existen (sin aplicar).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const MIGRATION = 'supabase/migrations/20261121120000_adn008_sr_drafts_supplier_multipago.sql';

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

// Marcas de verificación (re-verificables): columnas + 4 RPCs nuevos + gate.
const MARKS = {
  cols: `(SELECT count(*) = 6 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='received_services'
          AND column_name IN ('supplier_id','supplier_master_party_id','supplier_code','supplier_tax_id','supplier_phone','supplier_address'))`,
  f_draft: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='create_received_service_draft')`,
  f_update: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname='public' AND p.proname='update_received_service_draft')`,
  f_batch: `(SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='register_supplier_payment_batch')`,
  gate_status: `pg_get_functiondef('public.set_received_service_status(uuid,text,uuid,text)'::regprocedure) LIKE '%ERR_SUPPLIER_REQUIRED%'`,
  batch_uses_motor: `pg_get_functiondef('public.register_supplier_payment_batch(uuid,text,uuid,jsonb,uuid,timestamp with time zone,text)'::regprocedure) LIKE '%register_supplier_payment%'`,
  v2_untouched: `pg_get_functiondef('public.create_received_service_v2(uuid,text,numeric,uuid,text,date,text,numeric,integer,text,text,text,jsonb,uuid,jsonb)'::regprocedure) LIKE '%ERR_SUPPLIER_REQUIRED%'`,
};

if (process.argv.includes('--check')) {
  let allOk = true;
  for (const [k, q] of Object.entries(MARKS)) {
    const rows = await runSql(`SELECT ${q} AS ok`);
    const ok = rows[0]?.ok === true;
    if (!ok) allOk = false;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  console.log(allOk ? 'MIGRACIÓN ADN-008 PRESENTE en la BD aislada' : 'FALTAN MARCAS — re-aplicar');
  process.exit(allOk ? 0 : 1);
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

let allOk = true;
for (const [k, q] of Object.entries(MARKS)) {
  const rows = await runSql(`SELECT ${q} AS ok`);
  const ok = rows[0]?.ok === true;
  if (!ok) allOk = false;
  console.log(`verificación ${k}: ${ok}`);
}
console.log(allOk ? 'OK — todas las marcas presentes' : 'FALLO — marcas ausentes');
process.exit(allOk ? 0 : 1);
