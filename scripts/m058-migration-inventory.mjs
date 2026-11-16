#!/usr/bin/env node
// ============================================================================
// M058 — CP-FIN-ULTIMATE-CLOSE-008 · INVENTARIO COMPLETO DE MIGRACIONES
// Compara supabase/migrations/ (repo) contra:
//   (a) production_migration_ledger (ledger oficial de aplicaciones)
//   (b) supabase_migrations.schema_migrations (ledger del CLI de Supabase)
// READ-ONLY ESTRICTO — Management API /database/query, SOLO SELECT.
// Guard: el destino debe ser producción identificada (wthkddeleylijmonclxg).
// Uso: node scripts/m058-migration-inventory.mjs [out.json]
// ============================================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino no es producción identificada (wthkddeleylijmonclxg)'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} fila(s)`);
  return rows;
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ── 1. Migraciones del repo ──────────────────────────────────────────────────
const MIG_DIR = 'supabase/migrations';
const archivos = readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
const repo = archivos.map(f => {
  const contenido = readFileSync(resolve(MIG_DIR, f), 'utf8');
  return { file: f, version: f.replace(/\.sql$/, ''), sha256: sha256(contenido) };
});
console.log(`[OK] repo → ${repo.length} migración(es) .sql`);

// ── 2. Ledger de producción ──────────────────────────────────────────────────
const ledger = await q(`SELECT id, version, file, sha256, mechanism, evidence, applied_by, status, applied_at FROM public.production_migration_ledger ORDER BY id`, 'ledger');
const sm = await q(`SELECT version, statements, name FROM supabase_migrations.schema_migrations ORDER BY version`, 'schema_migrations');
const smSet = new Set(sm.map(r => r.version));
// Ledger: la clave canónica es la RUTA DE ARCHIVO (version y filename divergen en filas históricas);
// fallback por versión numérica (prefijo timestamp del nombre de archivo).
const ledgerByFile = new Map();
const ledgerByVersion = new Map();
for (const r of ledger) {
  if (r.file && !ledgerByFile.has(r.file)) ledgerByFile.set(r.file, r);
  if (!ledgerByVersion.has(r.version)) ledgerByVersion.set(r.version, r);
}
const versionNumerica = (file) => file.match(/^(\d{12,17})_/)?.[1] ?? null;

// ── 3. Ciclo CP-FIN (migraciones añadidas por los PR del ciclo) ──────────────
const CICLO = new Set([
  '20261115100000_cp_fin_t12_partial_reversal_guard',
  '20261115120000_cp_valuation_nominal_pp64',
  '20261115120100_cp_valuation_activation_nominal',
  '20261116120000_cp_fin_t12_privilege_hardening',
]);

// ── 4. Clasificación de cada migración del repo ──────────────────────────────
const clasificar = (f) => {
  const ruta = `supabase/migrations/${f.file}`;
  const lr = ledgerByFile.get(ruta) ?? (ledgerByFile.get(f.file) ?? (versionNumerica(f.file) ? ledgerByVersion.get(versionNumerica(f.file)) : undefined));
  const enLedger = !!lr;
  const numVer = versionNumerica(f.file);
  const enSchemaMigrations = numVer ? smSet.has(numVer) : smSet.has(f.version);
  const esCiclo = CICLO.has(f.version);
  let categoria;
  if (enLedger && lr.sha256 === f.sha256) categoria = 'aplicada-checksum-ok';
  else if (enLedger && lr.sha256 !== f.sha256) categoria = 'aplicada-divergencia-checksum';
  else if (!enLedger && enSchemaMigrations) categoria = 'historica-mecanismo-independiente';
  else categoria = esCiclo ? 'pendiente-ciclo' : 'pendiente-ajena-al-ciclo';
  return {
    version: f.version, file: f.file, categoria,
    sha256_repo: f.sha256.slice(0, 16),
    ledger_status: lr?.status ?? null,
    ledger_sha256_match: enLedger ? (lr.sha256 === f.sha256) : null,
    ledger_mechanism: lr?.mechanism ?? null,
    ledger_applied_at: lr?.applied_at ?? null,
    ledger_applied_by: lr?.applied_by ?? null,
    en_schema_migrations: enSchemaMigrations,
    es_del_ciclo: esCiclo,
  };
};
const inventario = repo.map(clasificar);

// ── 5. Filas del ledger sin archivo correspondiente en el repo ───────────────
const repoVersions = new Set(repo.map(r => r.version));
const repoRutas = new Set(repo.map(r => `supabase/migrations/${r.file}`));
const repoNums = new Set(repo.map(r => versionNumerica(r.file)).filter(Boolean));
const ledgerHuerfano = ledger.filter(r => {
  const enRepo = repoRutas.has(r.file) || repoNums.has(r.version);
  return !enRepo;
}).map(r => ({ version: r.version, file: r.file, status: r.status }));

// ── 6. Resumen ───────────────────────────────────────────────────────────────
const porCategoria = {};
for (const e of inventario) porCategoria[e.categoria] = (porCategoria[e.categoria] ?? 0) + 1;
const resumen = {
  total_repo: repo.length,
  total_ledger: ledger.length,
  ledger_por_status: ledger.reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {}),
  total_schema_migrations: sm.length,
  por_categoria: porCategoria,
  pendientes_del_ciclo: inventario.filter(e => e.categoria === 'pendiente-ciclo').map(e => e.version),
  ciclo_aplicado: inventario.filter(e => e.es_del_ciclo).map(e => ({ version: e.version, categoria: e.categoria, sha_ok: e.ledger_sha256_match, applied_at: e.ledger_applied_at, applied_by: e.ledger_applied_by })),
  ledger_huerfano: ledgerHuerfano,
  capturado_utc: new Date().toISOString(),
  modo: 'READ-ONLY',
  proyecto: ref,
};

const OUT = process.argv[2] || 'docs/audits/cp-fin-ultimate-close-008/PRODUCTION_MIGRATION_INVENTORY.json';
mkdirSync(resolve('docs/audits/cp-fin-ultimate-close-008'), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify({ resumen, inventario }, null, 2));
console.log('\n== RESUMEN ==');
console.log(JSON.stringify(resumen, (k, v) => v, 2).slice(0, 2200));
console.log(`\nEvidencia completa → ${OUT}`);
const pendientesCiclo = resumen.pendientes_del_ciclo.length;
console.log(`\nMIGRACIONES PENDIENTES DEL CICLO: ${pendientesCiclo === 0 ? 'NINGUNA — NO HAY MIGRACIONES PENDIENTES DE ESTE CICLO' : JSON.stringify(resumen.pendientes_del_ciclo)}`);
process.exit(0);
