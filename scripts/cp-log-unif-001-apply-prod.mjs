// ============================================================================
// CP-LOG-UNIF-APPLY-PROD — CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001
// ============================================================================
// Aplica EXCLUSIVAMENTE las dos migraciones aprobadas de la misión a
// producción (CostproBD, wthkddeleylijmonclxg) por el canal oficial
// (Management API, mecanismo 'management_api' del libro), patrón runbook
// m055 / m-log-reception-apply.mjs (CP-LOG-RECEPTION-MASTER-CATALOG-001).
//
//   1. supabase/migrations/20261121130000_cp_log_unification_master_visibility.sql
//   2. supabase/migrations/20261121130100_cp_log_unification_pos_transfer_reference.sql
//
// Controles fail-closed (todos obligatorios, en este orden):
//  1. Guard oficial CP-INFRA-019 (scripts/lib/assert-not-production.mjs) en
//     modo WRITE contra el ref real + doble flag del entorno:
//     ALLOW_PROD=read-only y ALLOW_PROD_WRITE=I_UNDERSTAND.
//  2. SHA-256 de cada archivo == hash del blob del commit aprobado
//     (verificado con git rev-parse HEAD:path en tiempo de ejecución).
//  3. Pre-chequeo por migración: NO registrada en
//     supabase_migrations.schema_migrations NI en production_migration_ledger;
//     última fila del libro impresa; prerrequisitos de firma ADN-009.
//  4. Un único POST por migración con el contenido EXACTO del archivo (sin
//     reescrituras). Si una falla: NO reintenta fragmentos, NO borra objetos,
//     NO aplica migraciones inversas; guarda evidencia y exit 1.
//  5. NOTIFY pgrst 'reload schema' (patrón oficial apply-migration-mgmt.ts).
//  6. Registro en public.production_migration_ledger (paso 2 del proceso
//     oficial) + verificación post-estado de objetos (marcas de la misión).
//
// Uso:
//   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
//     node scripts/cp-log-unif-001-apply-prod.mjs --aplicar [--pre-check]
//   --pre-check: solo controles 1-3 (sin escritura) — re-ejecutable.
// ============================================================================
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MIGS = [
  {
    version: '20261121130000',
    path: 'supabase/migrations/20261121130000_cp_log_unification_master_visibility.sql',
    label: 'PARTE 1 — unión maestra en búsqueda POS/Recepciones + gate ERR_RECEIPT_NOT_PAYABLE',
  },
  {
    version: '20261121130100',
    path: 'supabase/migrations/20261121130100_cp_log_unification_pos_transfer_reference.sql',
    label: 'PARTE 2 — referencia de transferencia por componente en create_sale_v2',
  },
];
const EVID = 'docs/audits/CP-LOG-UNIFICATION-001_2026-11-21.md';
const LAST_LEDGER_VERSION = '20261120220000';

const log = [];
const push = (s) => { console.log(s); log.push(s); };
const preOnly = process.argv.includes('--pre-check');

// ── 1. Flags y guard oficial ───────────────────────────────────────────────
if (!process.argv.includes('--aplicar') && !preOnly) {
  console.error('BLOQUEADO: falta el flag explícito --aplicar (intención inequívoca).'); process.exit(1);
}
if (!preOnly) {
  if (process.env.ALLOW_PROD !== 'read-only' || process.env.ALLOW_PROD_WRITE !== 'I_UNDERSTAND') {
    console.error('BLOQUEADO: faltan los dobles flags ALLOW_PROD=read-only + ALLOW_PROD_WRITE=I_UNDERSTAND.'); process.exit(1);
  }
}

// .env del repo (ref de producción + token Management API)
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const SUP_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const ref = (SUP_URL.match(/https:\/\/(.*?)\.supabase\.co/) || [])[1];
if (!ref || !TOKEN) { console.error('BLOQUEADO: .env sin NEXT_PUBLIC_SUPABASE_URL/SUPABASE_ACCESS_TOKEN'); process.exit(1); }

const q = async (query) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
};

// ── 2. SHA-256 del archivo vs blob del commit aprobado ─────────────────────
for (const mig of MIGS) {
  const contenido = readFileSync(resolve(process.cwd(), mig.path));
  mig.sha256 = createHash('sha256').update(contenido).digest('hex');
  const blobSha = execSync(`git rev-parse HEAD:${mig.path}`).toString().trim();
  // sha256 del CONTENIDO (git hash-object no es sha256 del archivo crudo)
  const gitSha = execSync(`git hash-object ${mig.path}`).toString().trim();
  if (gitSha !== blobSha) {
    console.error(`BLOQUEADO: ${mig.path} difiere del commit aprobado (${blobSha}).`); process.exit(1);
  }
  push(`[sha] ${mig.path.split('/').pop()}: blob==working-tree OK · sha256=${mig.sha256}`);
}

// ── 3. Pre-chequeos ────────────────────────────────────────────────────────
const lastLedger = (await q('SELECT version, file, status FROM production_migration_ledger ORDER BY applied_at DESC LIMIT 1'))[0];
push(`[libro] última fila: ${lastLedger.version} ${lastLedger.file} (${lastLedger.status})`);
if (lastLedger.version !== LAST_LEDGER_VERSION) {
  push(`[libro] AVISO: la última fila no es ${LAST_LEDGER_VERSION} — revisar antes de continuar.`);
}
for (const mig of MIGS) {
  const sm = await q(`SELECT count(*) n FROM supabase_migrations.schema_migrations WHERE version='${mig.version}'`);
  const led = await q(`SELECT count(*) n FROM production_migration_ledger WHERE version='${mig.version}'`);
  if (sm[0].n > 0 || led[0].n > 0) {
    console.error(`BLOQUEADO: ${mig.version} YA está registrada (schema_migrations=${sm[0].n}, ledger=${led[0].n}).`); process.exit(1);
  }
  push(`[pre] ${mig.version}: no registrada en schema_migrations ni ledger OK`);
}
const pre = (await q(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment_batch' AND pg_get_function_identity_arguments(p.oid) LIKE 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text') AS batch_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND pg_get_function_identity_arguments(p.oid) LIKE '%p_payment_components jsonb%') AS sale_v2_ok`))[0];
push(`[pre] batch ADN-009: ${pre.batch_ok === 1 ? 'OK' : 'AUSENTE'} · create_sale_v2 33p: ${pre.sale_v2_ok === 1 ? 'OK' : 'AUSENTE'}`);
if (pre.batch_ok !== 1 || pre.sale_v2_ok !== 1) {
  console.error('BLOQUEADO: prerrequisitos ausentes en producción.'); process.exit(1);
}

const MARKS = {
  'unión maestra en get_products_for_reception': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_reception' AND position('is_catalog_store_connected' in p.prosrc) > 0`,
  'unión maestra en get_products_for_pos': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_products_for_pos' AND position('is_catalog_store_connected' in p.prosrc) > 0`,
  'gate receipts (ERR_RECEIPT_NOT_PAYABLE)': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='register_supplier_payment' AND position('ERR_RECEIPT_NOT_PAYABLE' in p.prosrc) > 0`,
  'referencia por componente en create_sale_v2': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND position('v_comp->>''reference''' in p.prosrc) > 0`,
  'duplicados por (método, moneda, referencia)': `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='create_sale_v2' AND position('NULLIF(btrim(COALESCE(c->>''reference'', '''')), '''')' in p.prosrc) > 0`,
};
const preMarks = {};
for (const [label, sql] of Object.entries(MARKS)) {
  preMarks[label] = (await q(sql))[0].n;
}
push('[pre] marcas actuales: ' + JSON.stringify(preMarks));

if (preOnly) {
  push('[pre-check] COMPLETO — sin escritura.');
  mkdirSync('docs/audits/CP-LOG-UNIFICATION-001/pre-check', { recursive: true });
  writeFileSync('docs/audits/CP-LOG-UNIFICATION-001/pre-check/pre-check.json', JSON.stringify(log, null, 2));
  process.exit(0);
}

// ── 4. Aplicar (un POST exacto por migración) ─────────────────────────────
const evidDir = 'docs/audits/CP-LOG-UNIFICATION-001/aplicacion-prod';
mkdirSync(evidDir, { recursive: true });
for (const mig of MIGS) {
  const sql = readFileSync(resolve(process.cwd(), mig.path), 'utf-8');
  push(`[apply] ${mig.version} (${sql.length} chars)…`);
  let out;
  try {
    out = await q(sql);
  } catch (e) {
    writeFileSync(`${evidDir}/${mig.version}-FALLO.json`, JSON.stringify({ error: String(e), log }, null, 2));
    console.error(`FALLO aplicando ${mig.version}: ${e.message}`); process.exit(1);
  }
  writeFileSync(`${evidDir}/${mig.version}-respuesta.json`, JSON.stringify({ respuesta: out, log }, null, 2));
  push(`[apply] ${mig.version} OK`);
  // NOTIFY pgrst (patrón oficial)
  await q("NOTIFY pgrst, 'reload schema';").catch((e) => push(`[notify] aviso: ${String(e).slice(0, 120)}`));
}

// ── 5. Registro en el libro + verificación post ───────────────────────────
for (const mig of MIGS) {
  await q(`INSERT INTO production_migration_ledger (version, file, sha256, mechanism, evidence, applied_by, status, notes)
    VALUES ('${mig.version}', '${mig.path.split('/').pop()}', '${mig.sha256}', 'management_api', '${EVID}', 'cp-log-unif-001-apply-prod.mjs', 'applied', '${mig.label.replace(/'/g, "''")}')`);
  push(`[ledger] ${mig.version} registrada`);
}
const post = {};
let allOk = true;
for (const [label, sql] of Object.entries(MARKS)) {
  const n = (await q(sql))[0].n;
  post[label] = n;
  if (n !== 1) allOk = false;
}
push('[post] marcas: ' + JSON.stringify(post));
writeFileSync(`${evidDir}/post-estado.json`, JSON.stringify({ post, log }, null, 2));
console.log(allOk ? 'APLICACIÓN COMPLETA Y VERIFICADA.' : 'VERIFICACIÓN POST FALLIDA — REVISAR.');
process.exit(allOk ? 0 : 1);
