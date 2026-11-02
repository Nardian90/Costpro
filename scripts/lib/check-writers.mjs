#!/usr/bin/env node
/**
 * check-writers.mjs — Protección de CI contra futuros scripts escritores
 * (CP-INFRA-019-FOLLOWUP, fix D).
 * ============================================================================
 * Estrategia (manifiesto explícito, no regex mágica):
 *
 *   1. SEÑAL de escritor (2 niveles OBLIGATORIOS en el mismo archivo):
 *      a) señal de endpoint/credencial Supabase (api.supabase.com/v1/projects,
 *         *.supabase.co, createClient(, SUPABASE_SERVICE_ROLE_KEY,
 *         SUPABASE_ACCESS_TOKEN, service_role) — de la lista ENDPOINT_SIGNALS;
 *      b) señal de operación de ESCRITURA (SQL DML/DDL, .insert(/.update(/
 *         .upsert(/.delete(/.remove(, /rest/v1/rpc/, database/query, .rpc()
 *         — de la lista WRITE_SIGNALS.
 *
 *   2. Todo archivo con ambas señales debe declararse en
 *      scripts/lib/writers.manifest.json en UNA de estas categorías:
 *      · guardProtected    → invoca el guard de producción con el destino real
 *                            (referencia assert-not-production).
 *      · isolationProtected→ protegido por el guard de aislamiento E2E
 *                            (assert-isolated-db, CP-INFRA-011).
 *      · exceptions        → NO protegido: justificación OBLIGATORIA (p.ej.
 *                            read-only pese a la señal, script de CI contra
 *                            mock, verificación estática sin conexión).
 *
 *   3. El checker VERIFICA que la clasificación sea cierta:
 *      · guardProtected debe referenciar 'assert-not-production';
 *      · isolationProtected debe referenciar 'assert-isolated-db';
 *      · exceptions debe tener justificación no vacía.
 *      Un archivo clasificado que no cumple su categoría → ERROR (evita que
 *      el manifiesto se llene de entradas falsas).
 *
 *   4. Fail-closed ante lo NUEVO:
 *      · un archivo con señal de escritor que NO está en el manifiesto → ERROR;
 *      · una entrada del manifiesto que ya no existe o ya no tiene señal →
 *        ERROR (mantener el manifiesto sincronizado).
 *
 * ALCANCE Y LÍMITES (documentados en
 * docs/audits/CP-INFRA-019_GUARD_PRODUCCION_AUDIT.md):
 *   · Solo cubre scripts/ (no src/, e2e/ ni workflows): es la protección de
 *     herramientas de mantenimiento/integración pedida por la misión.
 *   · La señal es heurística de dos niveles para reducir falsos positivos,
 *     no un análisis semántico completo: un escritor que no use ninguna de
 *     las señales conocidas (p.ej. HTTP a un host distinto con SQL en el
 *     body) NO será detectado. La defensa principal sigue siendo revisión de
 *     PR + el guard en tiempo de ejecución.
 *   · Los archivos .d.ts, fixtures de test y librerías del propio guard se
 *     excluyen por patrón.
 *
 * Uso:  node scripts/lib/check-writers.mjs   → exit 0 OK / exit 1 con reporte.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const MANIFEST = join(REPO_ROOT, 'scripts', 'lib', 'writers.manifest.json');

// Nivel 1: señal de endpoint/credencial Supabase en el MISMO archivo. Además
// de hosts y clientes explícitos, las variables de entorno que transportan el
// destino o las credenciales cuentan como señal (un escritor las necesita
// para construir su petición).
const ENDPOINT_SIGNALS = [
  /api\.supabase\.com\/v1\/projects/,
  /\.supabase\.co/,
  /createClient\(/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /SUPABASE_ACCESS_TOKEN/,
  /service_role/i,
  /NEXT_PUBLIC_SUPABASE_URL/,
  /E2E_SUPABASE_URL/,
  /DATABASE_URL/,
];
// Nivel 2: señal de operación de ESCRITURA en el MISMO archivo. Además de
// SQL/RPC, un fetch con método de escritura (POST/PATCH/PUT/DELETE) cuenta:
// un POST a /rest/v1/<tabla> o a la Management API es una escritura aunque
// el body no contenga SQL.
const WRITE_SIGNALS = [
  /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+(TABLE|FUNCTION|INDEX)|CREATE\s+(TABLE|OR\s+REPLACE\s+FUNCTION)|TRUNCATE|NOTIFY\s+pgrst)\b/i,
  /\.(insert|update|upsert|delete|remove)\s*\(/,
  /\/rest\/v1\/rpc\//,
  /database\/query/,
  /\.rpc\s*\(/,
  /method\s*:\s*['"](POST|PATCH|PUT|DELETE)['"]/,
];
// Archivos que no son herramientas ejecutables (no pueden "escribir" por sí solos).
const SKIP_PATH_PATTERNS = [
  /(^|\/)node_modules\//,
  /\.d\.ts$/,
  /(^|\/)__mocks__\//,
];
// Herramientas del propio sistema de guard: se auto-verifican en otra suite.
const SELF_PATHS = new Set([
  'scripts/lib/assert-not-production.mjs',
  'scripts/lib/assert-not-production.py',
  'scripts/lib/assert-not-production.sh',
  'scripts/lib/check-writers.mjs',
  'scripts/lib/writers.manifest.json',
  'scripts/lib/test-fixa-token.sh',
  'scripts/lib/smoke-writers-cp-infra-019.sh',
]);

const EXTENSIONS = new Set(['.ts', '.js', '.cjs', '.mjs', '.sh', '.py']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

function rel(p) { return relative(REPO_ROOT, p).split('\\').join('/'); }

/** ¿El archivo tiene señal de escritor (endpoint + escritura)? */
export function hasWriterSignal(source) {
  const ep = ENDPOINT_SIGNALS.some((r) => r.test(source));
  const wr = WRITE_SIGNALS.some((r) => r.test(source));
  return { ep, wr, writer: ep && wr };
}

/** Verifica el manifiesto contra los archivos reales. Devuelve {ok, errors, stats}. */
export function checkWriters() {
  const errors = [];
  if (!existsSync(MANIFEST)) {
    return { ok: false, errors: [`No existe ${rel(MANIFEST)}`], stats: null };
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const guardProtected = new Set(manifest.guardProtected ?? []);
  const isolationProtected = new Set(manifest.isolationProtected ?? []);
  const exceptions = manifest.exceptions ?? {}; // { path: justification }

  // 1) barrido de scripts/ buscando señal de escritor
  const files = walk(SCRIPTS_DIR);
  const detected = [];
  for (const f of files) {
    const r = rel(f);
    if (SKIP_PATH_PATTERNS.some((p) => p.test(r)) || SELF_PATHS.has(r)) continue;
    const src = readFileSync(f, 'utf8');
    const { writer } = hasWriterSignal(src);
    if (!writer) continue;
    detected.push(r);

    const inGuard = guardProtected.has(r);
    const inIso = isolationProtected.has(r);
    const inExc = Object.prototype.hasOwnProperty.call(exceptions, r);

    if (!inGuard && !inIso && !inExc) {
      errors.push(
        `NUEVO ESCRITOR SIN DECLARAR: ${r}\n` +
        `  Tiene señal de endpoint Supabase + operación de escritura. Para añadirlo:\n` +
        `  · protégelo con el guard (assert-not-production con el destino REAL) y ponlo en guardProtected,\n` +
        `  · o protégelo con assert-isolated-db (E2E) y ponlo en isolationProtected,\n` +
        `  · o justifica la excepción en scripts/lib/writers.manifest.json.`
      );
      continue;
    }
    // 2) la clasificación debe ser CIERTA (no vale declarar y no cumplir)
    if (inGuard && !/assert-not-production/.test(src)) {
      errors.push(`guardProtected INCUMPLENTE: ${r} no referencia 'assert-not-production'.`);
    }
    if (inIso && !/assert-isolated-db/.test(src)) {
      errors.push(`isolationProtected INCUMPLENTE: ${r} no referencia 'assert-isolated-db'.`);
    }
    if (inExc && !String(exceptions[r] ?? '').trim()) {
      errors.push(`exception SIN JUSTIFICACIÓN: ${r} necesita 'justification' no vacía.`);
    }
  }

  // 3) entradas del manifiesto obsoletas (archivo desaparecido o sin señal)
  const detectedSet = new Set(detected);
  for (const r of [...guardProtected, ...isolationProtected, ...Object.keys(exceptions)]) {
    if (!detectedSet.has(r)) {
      // ¿existe el archivo? ¿perdió la señal?
      const abs = join(REPO_ROOT, r);
      if (!existsSync(abs)) {
        errors.push(`MANIFIESTO OBSOLETO: ${r} ya no existe — retira su entrada.`);
      } else if (!SKIP_PATH_PATTERNS.some((p) => p.test(r)) && !SELF_PATHS.has(r)) {
        errors.push(`MANIFIESTO OBSOLETO: ${r} ya no tiene señal de escritor — retira su entrada.`);
      }
    }
  }

  const stats = {
    archivosBarridos: files.length,
    escritoresDetectados: detected.length,
    guardProtected: [...guardProtected].filter((r) => detectedSet.has(r)).length,
    isolationProtected: [...isolationProtected].filter((r) => detectedSet.has(r)).length,
    exceptions: Object.keys(exceptions).filter((r) => detectedSet.has(r)).length,
  };
  return { ok: errors.length === 0, errors, stats };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('check-writers.mjs')) {
  const { ok, errors, stats } = checkWriters();
  if (stats) {
    console.log(`Escritores Supabase en scripts/: ${stats.escritoresDetectados} detectados de ${stats.archivosBarridos} archivos`);
    console.log(`  · guard de producción (assert-not-production): ${stats.guardProtected}`);
    console.log(`  · guard de aislamiento E2E (assert-isolated-db): ${stats.isolationProtected}`);
    console.log(`  · excepciones justificadas: ${stats.exceptions}`);
  }
  if (!ok) {
    console.error(`\nCHECK-WRITERS: ${errors.length} problema(s):`);
    for (const e of errors) console.error(`\n✗ ${e}`);
    process.exit(1);
  }
  console.log('\nCHECK-WRITERS OK: todos los escritores declarados y verificados.');
}
