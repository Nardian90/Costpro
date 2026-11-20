#!/usr/bin/env node
/**
 * m008-apply-migration-prod.mjs — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008.
 * Aplica la migración 20261121120000 a PRODUCCIÓN (CostproBD, wthkddeleylijmonclxg)
 * UNA SOLA VEZ (§11g regla de oro), por el canal gobernado:
 *   · guard scripts/lib/assert-not-production.mjs (CP-INFRA-019) con el
 *     doble flag explícito del operador;
 *   · verificación post-aplicación con marcas re-ejecutables (--check);
 *   · idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP CONSTRAINT IF EXISTS).
 * Requisitos de invocación:
 *   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *   SUPABASE_ACCESS_TOKEN=... node scripts/m008-apply-migration-prod.mjs [--check]
 * Expediente: docs/audits/ADN-SR-CREATION-WORKFLOW-008_2026-11-20.md §5-§6.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

if (!TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

// GUARD CP-INFRA-019 — destino REAL (producción) + doble flag del operador.
const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${PROD_REF}.supabase.co`;
assertNotProduction({ mode: 'write', url: prodUrl, context: 'm008-apply-migration-prod.mjs' });

const MIGRATION = 'supabase/migrations/20261121120000_adn008_sr_drafts_supplier_multipago.sql';

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

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
  constraint_condicional: `(SELECT pg_get_constraintdef(c.oid) LIKE '%status = ''draft''%' FROM pg_constraint c WHERE c.conname = 'received_services_supplier_not_null')`,
};

if (process.argv.includes('--check')) {
  let allOk = true;
  for (const [k, q] of Object.entries(MARKS)) {
    const rows = await runSql(`SELECT ${q} AS ok`);
    const ok = rows[0]?.ok === true;
    if (!ok) allOk = false;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}`);
  }
  console.log(allOk ? 'MIGRACIÓN ADN-008 PRESENTE EN PRODUCCIÓN' : 'FALTAN MARCAS');
  process.exit(allOk ? 0 : 1);
}

const sql = readFileSync(join(REPO, MIGRATION), 'utf8');
console.log(`Aplicando ${MIGRATION} (${sql.length} bytes) a PRODUCCIÓN (CostproBD)…`);
const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`FALLO al aplicar: HTTP ${res.status}: ${body.slice(0, 1000)}`);
  process.exit(1);
}
console.log('Migración aplicada.');

let allOk = true;
for (const [k, q] of Object.entries(MARKS)) {
  const rows = await runSql(`SELECT ${q} AS ok`);
  const ok = rows[0]?.ok === true;
  if (!ok) allOk = false;
  console.log(`verificación ${k}: ${ok}`);
}
console.log(allOk ? 'OK — todas las marcas presentes en producción' : 'FALLO — marcas ausentes');
process.exit(allOk ? 0 : 1);
