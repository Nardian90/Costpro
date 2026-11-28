#!/usr/bin/env node
/**
 * CP-FX-001 — Canal GOBERNADO de recuperación histórica de la serie informal USD.
 *
 * FASE 7 de la misión (seguridad e integridad de datos):
 *   1. RESPALDO previo de exchange_rates (dump JSON completo de filas
 *      informales + tabla congelada exchange_rates_backup_cpfx001 en BD).
 *   2. SIMULACIÓN (dry-run por defecto): plan completo SIN escritura.
 *   3. CANTIDADES presentadas antes de aplicar (recuperadas/estimadas/protegidas).
 *   4. APPLY idempotente por lotes (solo con --apply).
 *   5. VERIFICACIÓN post-aplicación:
 *      - las observaciones reales previas NO cambiaron (set-rate idéntico);
 *      - conteos post = pre + plan;
 *      - ninguna fila del lote con rate_date ≥ fecha operativa;
 *      - idempotencia: re-plan sobre el estado final produce los mismos valores.
 *
 * Uso (regla de oro §11g: SIEMPRE primero e2e; producción UNA vez):
 *   bun scripts/fx-apply-recovery.mjs --target e2e                (dry-run)
 *   bun scripts/fx-apply-recovery.mjs --target e2e --apply
 *   bun scripts/fx-apply-recovery.mjs --target prod               (dry-run)
 *   bun scripts/fx-apply-recovery.mjs --target prod --apply --confirm-prod
 *
 * Reversión quirúrgica por lote (documentada, no automática):
 *   DELETE FROM exchange_rates WHERE import_batch = 'CP-FX-001-<AAAAMMDD>';
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNotProduction } from './lib/assert-not-production.mjs';
// Lib pura de la misión (bun compila TS en caliente; imports relativos puros).
import {
  parseCubaClaraJson,
  buildRecoveryPlan,
  validatePlanSafety,
} from '../src/lib/fx-recovery.ts';
import { getOperativeDate, addDaysToDateString } from '../src/lib/operative-date.ts';

const args = process.argv.slice(2);
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'e2e';
const apply = args.includes('--apply');
const confirmProd = args.includes('--confirm-prod');

if (!['e2e', 'prod'].includes(target)) {
  console.error('target inválido: --target e2e|prod');
  process.exit(1);
}
if (target === 'prod' && !confirmProd) {
  console.error('BLOQUEADO: producción exige --confirm-prod (regla de oro §11g).');
  process.exit(1);
}

// ── Credenciales SOLO desde .env local (nunca en el repo ni en logs) ──
const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}

const E2E_URL = 'https://lguovmvrozxgssupkwpf.supabase.co';
const E2E_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const BASE = target === 'e2e' ? E2E_URL : PROD_URL;
const KEY = target === 'e2e' ? (E2E_KEY || PROD_KEY) : PROD_KEY;
if (!BASE || !KEY) {
  console.error(`BLOQUEADO: credenciales ausentes para ${target} (URL/key).`);
  process.exit(1);
}
const projectRef = BASE.match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (!projectRef) { console.error('ref no resoluble desde la URL'); process.exit(1); }

// Guard oficial fail-closed (CP-INFRA-019): el ref resuelto es el destino REAL.
assertNotProduction({ mode: 'write', projectRef, context: 'scripts/fx-apply-recovery.mjs' });
console.log(`Destino: ${target} (${projectRef}) · modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

// ── Helpers REST (sin SDK) ──
const restHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function restGetAll(path, params) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) });
    const res = await fetch(`${BASE}/rest/v1/${path}?${q}`, { headers: restHeaders });
    if (!res.ok) throw new Error(`REST GET ${path}: HTTP ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
    offset += 1000;
  }
}

async function restUpsertBatch(payload) {
  const res = await fetch(
    `${BASE}/rest/v1/exchange_rates?on_conflict=rate_date,currency,source,segment`,
    {
      method: 'POST',
      headers: { ...restHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`REST UPSERT: HTTP ${res.status} ${await res.text()}`);
  return payload.length;
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MGMT SQL: HTTP ${res.status} ${text.slice(0, 500)}`);
  return text;
}

// ── 1) Estado actual (read-only) ──
const existingRows = await restGetAll('exchange_rates', {
  select: 'rate_date,captured_at,currency,source,segment,rate,capture_method',
  source: 'neq.BCC',
  order: 'rate_date.asc',
});
console.log(`Filas informales existentes: ${existingRows.length}`);

const operativeDate = getOperativeDate();
const realDates = existingRows.filter(r => r.capture_method === 'real').map(r => r.rate_date).sort();
const rangeFrom = realDates[0] ?? addDaysToDateString(operativeDate, -30);
const rangeTo = addDaysToDateString(operativeDate, -1);
console.log(`Rango a procesar: ${rangeFrom} → ${rangeTo} · fecha operativa: ${operativeDate}`);

// ── 2) Fuente recuperable: Cuba Clara (CC BY 4.0) ──
const ccRes = await fetch('https://cubaclara.org/datos/dolar-cuba-clara.json', {
  signal: AbortSignal.timeout(20_000),
  headers: { Accept: 'application/json', 'Accept-Language': 'es-CU,es;q=0.9' },
});
if (!ccRes.ok) {
  console.error(`Cuba Clara no disponible: HTTP ${ccRes.status} — abortado sin escritura.`);
  process.exit(1);
}
const cubaClara = parseCubaClaraJson(await ccRes.json());
console.log(`Cuba Clara: ${cubaClara.rows.length} filas utilizables (versión ${cubaClara.sourceVersion ?? '—'}, ${cubaClara.license ?? '—'})`);

// ── 3) Plan + guardas fail-closed ──
const importBatch = `CP-FX-001-${operativeDate.replace(/-/g, '')}`;
const plan = buildRecoveryPlan({
  existingRows,
  cubaClara,
  rangeFrom,
  rangeTo,
  operativeDate,
  importBatch,
  importedAt: new Date().toISOString(),
});
const violations = validatePlanSafety(plan, operativeDate);
if (violations.length > 0) {
  console.error('PLAN INSEGURO — escritura bloqueada:', violations.slice(0, 10));
  process.exit(1);
}

const byConfidence = plan.entries.reduce((acc, e) => {
  if (e.category === 'estimada' && e.confidence_level) acc[e.confidence_level] = (acc[e.confidence_level] ?? 0) + 1;
  return acc;
}, {});
console.log('─'.repeat(70));
console.log(`PLAN: ${plan.entries.length} filas · recuperadas ${plan.recoveredDates.length} (Cuba Clara real) · estimadas ${plan.estimatedDates.length} (interpolación)`);
console.log(`  Protegidas (reales intocables): ${plan.protectedRealDates.length}`);
console.log(`  Irrecuperables (sin anclas): ${plan.unrecoverableDates.length}`);
console.log(`  Confianza estimadas: ${JSON.stringify(byConfidence)}`);
console.log(`  Clasificación huecos: sin publicación ${plan.classification.likelyNoPublication} · perdidos ${plan.classification.likelyLost}`);
const sampleR = plan.entries.filter(e => e.category === 'recuperada').slice(0, 3);
const sampleE = plan.entries.filter(e => e.category === 'estimada').slice(0, 3);
for (const e of sampleR) console.log(`  [REC] ${e.rate_date} ${e.rate} CUP (${e.source})`);
for (const e of sampleE) console.log(`  [EST] ${e.rate_date} ${e.rate} CUP (conf ${e.confidence_level}, ${e.source})`);
console.log('─'.repeat(70));

// Evidencia compartida (dry-run y apply)
const evidenceDir = resolve(process.cwd(), 'docs/audits/CP-FX-001');
mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  generated: new Date().toISOString(),
  target,
  projectRef,
  mode: apply ? 'apply' : 'dry-run',
  operativeDate,
  range: plan.range,
  cubaClara: { rows: cubaClara.rows.length, version: cubaClara.sourceVersion, license: cubaClara.license, skippedNoMedio: cubaClara.skippedNoMedio },
  plan: {
    total: plan.entries.length,
    recovered: plan.recoveredDates.length,
    estimated: plan.estimatedDates.length,
    protectedReal: plan.protectedRealDates.length,
    unrecoverable: plan.unrecoverableDates.length,
    classification: plan.classification,
    byConfidence,
  },
  existingRowsBefore: existingRows.length,
};

if (!apply) {
  const out = resolve(evidenceDir, `dry-run-${target}.json`);
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(`DRY-RUN completado — sin escritura. Evidencia: ${out}`);
  process.exit(0);
}

// ── 4) RESPALDO previo (obligatorio antes de escribir) ──
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = resolve(evidenceDir, `backup-exchange-rates-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({ generated: new Date().toISOString(), target, projectRef, informalRows: existingRows }, null, 2));
await mgmtQuery(
  'CREATE TABLE IF NOT EXISTS public.exchange_rates_backup_cpfx001 AS SELECT * FROM public.exchange_rates;',
);
// Postura de tabla EXCLUSIVAMENTE PRIVADA (CP-SEC-EXCHANGE-RATES-BACKUP-
// HARDENING-001): RLS sin policies (deny-all) + revocación de los grants que
// los default privileges de Supabase otorgan a anon/authenticated a toda
// tabla creada vía postgres. Defensa en profundidad: dos barreras. Idempotente.
await mgmtQuery(`
  DO $do$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'exchange_rates_backup_cpfx001' AND n.nspname = 'public') THEN
      ALTER TABLE public.exchange_rates_backup_cpfx001 ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM anon;
      REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM authenticated;
      REVOKE ALL ON TABLE public.exchange_rates_backup_cpfx001 FROM PUBLIC;
    END IF;
  END
  $do$;
`);
const backupCount = JSON.parse(await mgmtQuery('SELECT count(*)::int AS n FROM public.exchange_rates_backup_cpfx001;'))[0]?.n;
console.log(`RESPALDO: dump JSON (${backupPath}) + tabla congelada exchange_rates_backup_cpfx001 (${backupCount} filas).`);

// ── 5) APPLY idempotente por lotes ──
const BATCH = 100;
let applied = 0;
for (let i = 0; i < plan.entries.length; i += BATCH) {
  const chunk = plan.entries.slice(i, i + BATCH).map(e => ({
    rate_date: e.rate_date,
    captured_at: e.imported_at,
    currency: e.currency,
    source: e.source,
    segment: e.segment,
    rate: e.rate,
    capture_method: e.capture_method,
    rate_source_url: e.rate_source_url,
    reconstruction_method: e.reconstruction_method,
    confidence_level: e.confidence_level,
    notes: e.notes,
    imported_at: e.imported_at,
    import_batch: e.import_batch,
  }));
  applied += await restUpsertBatch(chunk);
  process.stdout.write(`  lote ${Math.floor(i / BATCH) + 1}/${Math.ceil(plan.entries.length / BATCH)} → ${applied} filas\r\n`);
}
console.log(`APLICADAS: ${applied} filas (lote ${importBatch}).`);

// ── 6) VERIFICACIÓN post-aplicación ──
const postRows = await restGetAll('exchange_rates', {
  select: 'rate_date,captured_at,currency,source,segment,rate,capture_method,import_batch',
  source: 'neq.BCC',
  order: 'rate_date.asc',
});
const keyOf = r => `${r.rate_date}|${r.currency}|${r.source}|${r.segment}`;

// 6a. Las observaciones reales previas NO cambiaron (misma tasa y método).
const preReal = new Map(existingRows.filter(r => r.capture_method === 'real').map(r => [keyOf(r), r]));
const postReal = new Map(postRows.filter(r => r.capture_method === 'real').map(r => [keyOf(r), r]));
let realChanged = 0;
for (const [k, pre] of preReal) {
  const post = postReal.get(k);
  if (!post || Number(post.rate) !== Number(pre.rate)) realChanged++;
}
// 6b. Conteos: post = pre + plan (por clave).
const addedExpected = plan.entries.length;
const addedActual = postRows.length - existingRows.length;
// 6c. Nada del lote en fecha operativa o posterior.
const futureBatch = postRows.filter(r => r.import_batch === importBatch && r.rate_date >= operativeDate);
// 6d. Idempotencia: re-plan sobre el estado final produce los MISMOS valores estimados
//     (las anclas reales no cambiaron) y CERO recuperadas nuevas (ya existen).
const rePlan = buildRecoveryPlan({
  existingRows: postRows,
  cubaClara,
  rangeFrom,
  rangeTo,
  operativeDate,
  importBatch,
  importedAt: new Date().toISOString(),
});
const estApplied = new Map(plan.entries.filter(e => e.category === 'estimada').map(e => [e.rate_date, e.rate]));
const estRePlan = new Map(rePlan.entries.filter(e => e.category === 'estimada').map(e => [e.rate_date, e.rate]));
let estMismatch = 0;
for (const [d, v] of estApplied) {
  const rv = estRePlan.get(d);
  if (rv === undefined || Number(rv) !== Number(v)) estMismatch++;
}
const recoveredDuplicates = rePlan.entries.filter(e => e.category === 'recuperada').length;

const verification = {
  realRowsChanged: realChanged,               // DEBE ser 0
  addedExpected, addedActual,                 // DEBEN ser iguales
  futureBatchRows: futureBatch.length,        // DEBE ser 0
  idempotency: {
    estimatedMismatch: estMismatch,           // DEBE ser 0
    recoveredDuplicatesOnRerun: recoveredDuplicates, // DEBE ser 0
  },
  postRows: postRows.length,
};
console.log('VERIFICACIÓN:', JSON.stringify(verification, null, 2));

const ok =
  realChanged === 0 &&
  addedActual === addedExpected &&
  futureBatch.length === 0 &&
  estMismatch === 0 &&
  recoveredDuplicates === 0;

evidence.applied = applied;
evidence.verification = verification;
evidence.ok = ok;
writeFileSync(resolve(evidenceDir, `apply-${target}.json`), JSON.stringify(evidence, null, 2));
// Copia para el usuario (visible fuera del repo)
try {
  const dl = '/home/z/my-project/download';
  mkdirSync(dl, { recursive: true });
  writeFileSync(resolve(dl, `fx-apply-${target}-${stamp}.json`), JSON.stringify(evidence, null, 2));
} catch { /* download opcional */ }

if (!ok) {
  console.error('FALLO de verificación — revisar evidencia. La reversión quirúrgica es: DELETE WHERE import_batch = ' + importBatch);
  process.exit(1);
}
console.log(`OK — verificación completa PASS. Evidencia en docs/audits/CP-FX-001/apply-${target}.json`);
