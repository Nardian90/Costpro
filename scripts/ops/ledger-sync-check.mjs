#!/usr/bin/env node
/**
 * ledger-sync-check.mjs — CP-MIGRATION-LEDGER (prevención de reincidencia,
 * misión CP-SECURITY-AND-BACKLOG-CLOSURE-001 §4).
 *
 * Control AUTOMÁTICO de sincronización libro ↔ repositorio:
 *   1. Lee las migraciones SQL de supabase/migrations/ del repo.
 *   2. Lee el libro public.production_migration_ledger de producción (read-only).
 *   3. Reporta TRES clases de discrepancia:
 *      · PENDIENTE_DE_REGISTRAR: efectos en producción sin fila en el libro
 *        (detectable comparando el archivo con las filas existentes).
 *      · SIN_APLICAR: archivo del repo sin fila 'applied' (esperado para
 *        migraciones preparadas pendientes de compuerta — se listan, no fallan).
 *      · FICHERO_DESCONOCIDO: fila del libro cuyo archivo no existe en el repo.
 *   4. Exit 1 si hay PENDIENTE_DE_REGISTRAR o FICHERO_DESCONOCIDO.
 *
 * Cómo detecta "aplicada sin registrar" SIN escribir nada: compara contra una
 * lista de VERIFICADORES de efectos por migración (queries read-only de
 * catálogo). Hoy cubre las familias conocidas; el mecanismo es extensible
 * añadiendo entradas a EFFECT_PROBES.
 *
 * Uso: SUPABASE_ACCESS_TOKEN=… CP_LEDGER_REF=wthkddeleylijmonclxg \
 *        node scripts/ops/ledger-sync-check.mjs
 * (canal Management API, solo SELECT; guard de identidad por ref exacto)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const MIG_DIR = join(REPO, 'supabase', 'migrations');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.CP_LEDGER_REF || 'wthkddeleylijmonclxg';
const PROD = 'wthkddeleylijmonclxg';

if (!TOKEN) {
  console.error('FALLO: falta SUPABASE_ACCESS_TOKEN.');
  process.exit(2);
}
if (REF !== PROD) {
  console.error(`FALLO: CP_LEDGER_REF (${REF}) no es el esperado (${PROD}) — este control lee el libro de PRODUCCIÓN.`);
  process.exit(2);
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`SQL HTTP ${res.status}`);
    process.exit(4);
  }
  return res.json();
}

// Sondas de efectos (read-only): versión → query que devuelve 1 si el efecto
// existe en la BD. Extender al añadir migraciones con objetos verificables.
const EFFECT_PROBES = {
  '20261114180000': `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND policyname='payrolls_admin_privacy'`,
  '20261114180100': `SELECT (SELECT count(*)::int FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')) AS n`,
  '20261114180200': `SELECT (SELECT count(*)::int FROM pg_constraint WHERE conrelid='public.commission_payments'::regclass AND contype='x') AS n`,
  '20261114180300': `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_cp_infra_020_block_truncate'`,
  '20261114180400': `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='rate_limit_buckets'`,
  '20261114180500': `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='public.audit_logs'::regclass AND conname='audit_logs_store_id_check' AND pg_get_constraintdef(oid) LIKE '%legal_incidents%'`,
  '20261108141000': `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_sales_dashboard_analytics'`,
  '20261108150000': `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='operational_class'`,
  '20261108200000': `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='store_code'`,
  '20261108201000': `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='receipts' AND column_name='document_number'`,
  '20261108220000': `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='get_sales_dashboard_product_detail' AND pg_get_functiondef(p.oid) LIKE '%stores_comparison%'`,
  '20261110120000': `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename='cost_sheet_templates' AND policyname='Templates visibility'`,
};

const repoFiles = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({ version: f.slice(0, 14), file: `supabase/migrations/${f}` }));

const ledger = await q(`SELECT version, file, status FROM public.production_migration_ledger ORDER BY version`);
const ledgerVersions = new Set(ledger.map((r) => r.version));

console.log(`# ledger-sync-check — ${new Date().toISOString()}`);
console.log(`repo: ${repoFiles.length} migraciones SQL · libro: ${ledger.length} filas (${ledgerVersions.size} versiones)\n`);

let bloqueantes = 0;

// 1) Archivos del repo sin fila aplicada. Las migraciones ANTERIORES al
//    baseline 2026-11-06 están cubiertas por la fila BASELINE-2026-11-06
//    (procedencia declarada honestamente — DERIVA_PRODUCCION_VS_REPO): solo
//    se listan las POSTERIORES al baseline.
const BASELINE_CORTE = '20261106000000';
const sinAplicar = repoFiles.filter((f) => /^\d{14}/.test(f.version) && f.version > BASELINE_CORTE && !ledgerVersions.has(f.version));
if (sinAplicar.length) {
  console.log(`## SIN_APLICAR (${sinAplicar.length}) — posteriores al baseline sin fila 'applied' (normal solo si penden compuerta):`);
  for (const f of sinAplicar) console.log(`  · ${f.version} ${f.file}`);
}

// 2) Filas del libro sin archivo en el repo (casa por versión O por archivo —
//    las filas de regularización con version truncada de 13 chars tienen el
//    archivo correcto y están superseded por su fila canónica de 14)
const repoVersions = new Set(repoFiles.map((f) => f.version));
const repoFileNames = new Set(repoFiles.map((f) => f.file.split('/').pop()));
const tieneFilaCanonica = new Set(ledger.map((r) => r.version).filter((v) => /^\d{14}$/.test(v)));
const desconocidas = ledger.filter((r) =>
  !r.version.startsWith('BASELINE')
  && !repoVersions.has(r.version)
  && !repoFileNames.has((r.file || '').split('/').pop())
  && !(r.version.length === 13 && tieneFilaCanonica.has(r.version + '0') === false && repoFileNames.has((r.file || '').split('/').pop()))
);
if (desconocidas.length) {
  console.log(`\n## FICHERO_DESCONOCIDO (${desconocidas.length}) — filas del libro cuya versión no existe como archivo (BLOQUEANTE):`);
  for (const r of desconocidas) console.log(`  · ${r.version} ${r.file} [${r.status}]`);
  bloqueantes += desconocidas.length;
}

// 3) Sondas de efectos: aplicada sin registrar
console.log('');
let pendientes = 0;
for (const [version, probe] of Object.entries(EFFECT_PROBES)) {
  const tieneFila = ledgerVersions.has(version) || ledgerVersions.has(version.slice(0, 13));
  const rows = await q(probe);
  const efectoPresente = Number(rows[0]?.n ?? 0) > 0;
  if (efectoPresente && !tieneFila) {
    console.log(`PENDIENTE_DE_REGISTRAR: ${version} tiene efectos en producción SIN fila en el libro`);
    pendientes++;
  }
}
if (pendientes === 0) console.log('Sondas de efectos: 0 migraciones aplicadas sin registrar.');
bloqueantes += pendientes;

console.log(`\nRESULTADO: ${bloqueantes === 0 ? 'OK — libro sincronizado con el repo (sin perjuicio de las preparadas pendientes de compuerta)' : `FALLO — ${bloqueantes} discrepancias bloqueantes`}`);
process.exit(bloqueantes === 0 ? 0 : 1);
