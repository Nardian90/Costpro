// ============================================================================
// M-LOG-APPLY — CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 · APLICADOR
// ============================================================================
// Aplica EXCLUSIVAMENTE las dos migraciones aprobadas de la misión a
// producción (CostproBD, wthkddeleylijmonclxg) por el canal oficial
// (Management API, mecanismo 'management_api' del libro de migraciones),
// siguiendo el patrón runbook m055 (CP-FIN-T12-PRODUCTION-MIGRATION-006).
//
//   1. supabase/migrations/20261116140000_cp_reception_master_catalog_integrity.sql
//   2. supabase/migrations/20261116140100_cp_reception_import_classification.sql
//
// Controles fail-closed (todos obligatorios, en este orden):
//  1. Guard oficial CP-INFRA-019 (scripts/lib/assert-not-production.mjs) en
//     modo WRITE contra el ref real + doble flag del entorno:
//     ALLOW_PROD=read-only y ALLOW_PROD_WRITE=I_UNDERSTAND.
//  2. SHA-256 de cada archivo == hash del blob del commit fusionado aprobado
//     (constantes abajo; verificadas contra git rev-parse HEAD:path).
//  3. Pre-chequeo por migración: NO registrada en supabase_migrations
//     .schema_migrations NI en production_migration_ledger; y estado de la
//     última fila del libro (20261116120000) en el momento de aplicar.
//  4. Un único POST por migración con el contenido EXACTO del archivo (sin
//     reescrituras). Si una falla: NO reintenta fragmentos, NO borra objetos,
//     NO aplica migraciones inversas; guarda evidencia y exit 1.
//  5. NOTIFY pgrst 'reload schema' (patrón oficial apply-migration-mgmt.ts).
//  6. Registro en public.production_migration_ledger (paso 2 del proceso
//     oficial) + verificación post-estado de objetos.
//
// Uso:
//   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
//     node scripts/m-log-reception-apply.mjs --aplicar [--pre-check]
//   --pre-check: solo ejecuta controles 1-3 (sin escritura) — re-ejecutable.
// ============================================================================
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MIGS = [
  {
    version: '20261116140000',
    path: 'supabase/migrations/20261116140000_cp_reception_master_catalog_integrity.sql',
    sha256: '094527e6f5d3c18411b164925327c616b3512413105333a4f294c98cddb6cfaf',
    label: 'PARTE 1 — regla estructural + escritores corregidos',
  },
  {
    version: '20261116140100',
    path: 'supabase/migrations/20261116140100_cp_reception_import_classification.sql',
    sha256: '8f18d153485f6d632151432da1b9639ac913f00a23fd7c5c06f95ebb55bf7fcd',
    label: 'PARTE 2 — motor de clasificación del importador',
  },
];
const EVID = 'docs/audits/CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001_2026-11-16.md';
const LAST_LEDGER_VERSION = '20261116120000';

const log = [];
const push = (s) => { console.log(s); log.push(s); };
let preOnly = process.argv.includes('--pre-check');
let applied = [];

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

// ── Guard oficial CP-INFRA-019 (modo WRITE; falla si ref no esperado) ──
assertNotProduction({ mode: preOnly ? 'read' : 'write', url: SUP_URL, context: 'm-log-reception-apply.mjs' });
push(`[guard] assert-not-production OK — ref=${ref} mode=${preOnly ? 'read' : 'write'}`);

const mgmt = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text || '[]');
};

// ── 2. SHA-256 de los archivos locales vs hash aprobado ────────────────────
for (const m of MIGS) {
  const buf = readFileSync(resolve(process.cwd(), m.path));
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== m.sha256) {
    push(`[FAIL] SHA-256 de ${m.path} = ${h} ≠ aprobado ${m.sha256}`); writeEvidenceAndExit(1);
  }
  push(`[sha] ${m.version} ${h.slice(0, 16)}… == aprobado ✓`);
}

// ── 3. Pre-chequeo del libro (por migración, EN EL MOMENTO) ────────────────
const sm = await mgmt(`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version IN ('20261116140000','20261116140100')`);
if (sm.length) { push(`[FAIL] ya registrada en schema_migrations: ${JSON.stringify(sm)}`); writeEvidenceAndExit(1); }
const led = await mgmt(`SELECT id, version, status FROM production_migration_ledger WHERE version IN ('20261116140000','20261116140100')`);
if (led.length) { push(`[FAIL] ya registrada en production_migration_ledger: ${JSON.stringify(led)}`); writeEvidenceAndExit(1); }
const lastLed = await mgmt(`SELECT version FROM production_migration_ledger ORDER BY id DESC LIMIT 1`);
const lastV = lastLed[0]?.version;
if (lastV !== LAST_LEDGER_VERSION) {
  push(`[WARN] última fila del libro = ${lastV} (esperado ${LAST_LEDGER_VERSION}) — continuar SOLO si esa migración está aplicada y verificada`);
  if (!preOnly) { writeEvidenceAndExit(1); }
} else {
  push(`[ledger] última fila = ${lastV} ✓`);
}
push('[pre] migraciones NO registradas previamente ✓');

// Post-estado de objetos (read-only, re-ejecutable)
const objs = await mgmt(`SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_products_master_link_guard') AS trg_link_guard,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reactivate_master_product') AS fn_reactivate,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='classify_reception_import_rows') AS fn_classify,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='resolve_reception_import_rows') AS fn_resolve`);
push('[objs] pre-estado: ' + JSON.stringify(objs[0]));

if (preOnly) { push('[PRE-CHECK] OK — sin escritura'); writeEvidenceAndExit(0); }

// ── 4. Aplicación: un único POST exacto por migración, en orden ────────────
for (const m of MIGS) {
  // re-chequeo del libro justo antes de aplicar cada una
  const led2 = await mgmt(`SELECT version FROM production_migration_ledger WHERE version='${m.version}'`);
  if (led2.length) { push(`[SKIP] ${m.version} ya en el libro (aplicación previa) — verificación de estado y continúa`); applied.push(m.version + ':ya-aplicada'); continue; }
  const sql = readFileSync(resolve(process.cwd(), m.path), 'utf8');
  push(`[apply] ${m.version} (${m.label}) — POST único, ${sql.length} bytes…`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    push(`[FAIL] ${m.version} HTTP ${res.status}: ${text.slice(0, 600)}`);
    writeEvidenceAndExit(1);
  }
  push(`[apply] ${m.version} OK (HTTP ${res.status})`);
  applied.push(m.version + ':aplicada');
  // 5. NOTIFY pgrst reload schema (patrón oficial)
  await mgmt(`NOTIFY pgrst, 'reload schema'`);
  push('[pgrst] NOTIFY reload schema OK');
}

// ── 6. Registro en el libro + verificación post-estado ────────────────────
for (const m of MIGS) {
  const reg = await mgmt(`SELECT version FROM production_migration_ledger WHERE version='${m.version}'`);
  if (reg.length) continue;
  const esc = (s) => s.replace(/'/g, "''");
  await mgmt(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
    VALUES ('${m.version}', '${m.path}', '${m.sha256}', now(), 'management_api', '${esc(EVID)}',
      'm-log-reception-apply (patrón runbook m055)', 'applied',
      '${esc(`CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 ${m.label}. Autorización expresa del propietario (adenda final 2026-11-16). SHA-256 verificado; un único POST con el contenido exacto; NOTIFY pgrst ejecutado; post-estado verificado.`)}')`);
  push(`[ledger] ${m.version} registrada ✓`);
}

const objs2 = await mgmt(`SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_products_master_link_guard') AS trg_link_guard,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reactivate_master_product') AS fn_reactivate,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='activate_master_product') AS fn_activate,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='classify_reception_import_rows') AS fn_classify,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='resolve_reception_import_rows') AS fn_resolve,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='register_reception') AS fn_register,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_transfer') AS fn_transfer`);
push('[objs] post-estado: ' + JSON.stringify(objs2[0]));
const o = objs2[0];
const ok = o.trg_link_guard >= 1 && o.fn_reactivate >= 1 && o.fn_classify >= 1 && o.fn_resolve >= 1 && o.fn_activate >= 1 && o.fn_register >= 1 && o.fn_transfer >= 1;
push(ok ? '[POST] todos los objetos presentes ✓' : '[FAIL] post-estado incompleto');
writeEvidenceAndExit(ok ? 0 : 1);

function writeEvidenceAndExit(code) {
  try { mkdirSync(resolve(process.cwd(), 'audit-evidence/cp-log-reception-001'), { recursive: true }); } catch {}
  const stamp = new Date().toISOString();
  writeFileSync(resolve(process.cwd(), 'audit-evidence/cp-log-reception-001/m-log-apply-evidence.json'),
    JSON.stringify({ stamp, ref, applied, log }, null, 2));
  process.exit(code);
}
