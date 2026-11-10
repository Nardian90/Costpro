#!/usr/bin/env node
/**
 * CP-INFRA-020 T2 — Lint de CI: ningún script destructivo sin guard.
 *
 * Recorre los archivos versionados (.sql .sh .py .mjs .cjs .js .ts) buscando
 * patrones destructivos. Cada hallazgo exige protección verificable:
 *
 *   · SQL (por contenido, no por extensión): marcador
 *     `-- COSTPRO-GUARD-DESTRUCTIVO v1` + bloque DO $guard$ que verifique
 *     centinela/ledger ANTES de cualquier sentencia destructiva.
 *   · Scripts (sh/py/mjs/cjs/js/ts): llamada a scripts/lib/assert-not-production.
 *
 * Reglas especiales:
 *   · supabase/migrations: las migraciones EXISTENTES (presentes en la rama
 *     base) no se juzgan (historia). Las NUEVAS del PR (git diff contra la
 *     base) con TRUNCATE / DROP SCHEMA / DISABLE TRIGGER exigen el comentario
 *     `-- DESTRUCTIVE-OK: CP-xxx` en el propio archivo.
 *   · audit-evidence: SOLO ADVERTENCIA (recuentos; nunca falla).
 *   · fixtures de tests y archivos generados: excluidos vía allowlist.
 *
 * Excepciones: scripts/ci/destructive-allowlist.json — entrada por archivo
 * con justificación y vencimiento (máx. 90 días). Sin vencimiento válido →
 * la excepción se IGNORA y el hallazgo falla (fail-closed).
 *
 * Salida: código 0 = limpio; 1 = hallazgos sin guard; 2 = error de uso.
 * Sin credenciales: solo lee archivos del repo y git.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Raíz del árbol a escanear: el directorio de trabajo (el CI corre el lint
// desde la raíz del repo; los tests lo ejecutan contra repos ficticios).
const ROOT = path.resolve(process.cwd());
const EXTS = new Set(['.sql', '.sh', '.py', '.mjs', '.cjs', '.js', '.ts', '.tsx']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.e2e-migrations', 'dist', 'build',
  'coverage', 'test-results', 'playwright-report',
]);
// Directorios de evidencia/fixture: solo advertencia o exclusión.
const EVIDENCE_DIRS = ['audit-evidence'];
const FIXTURE_HINTS = ['fixture', '__tests__', '__fixtures__', '/tests/', 'e2e/'];

// ── Patrones destructivos ──────────────────────────────────────────────────
// [regex, descripción]. Se aplican a archivos de código y SQL versionado.
// OJO falsos positivos evitados: 'truncate' como clase CSS de Tailwind
// (className="truncate") NO matchea — la sentencia SQL exige TRUNCATE seguido
// de TABLE o de un identificador calificado tipo public.x / auth.users, y
// en archivos no-SQL exige además contexto de ejecución SQL (string con
// TRUNCATE TABLE, plantilla SQL, comando psql).
const DESTRUCTIVE_PATTERNS_SQL = [
  [/\btruncate\s+table\b/i, 'TRUNCATE TABLE'],
  [/\btruncate\s+(?:public|auth|storage)\s*\.\s*[\w"]+/i, 'TRUNCATE <schema.tabla>'],
  [/\bdelete\s+from\s+auth\.users\b/i, 'DELETE FROM auth.users'],
  [/\bdelete\s+from\s+(?:public\.)?[\w"]+\s*(?:;|--|$)/im, 'DELETE FROM <tabla> sin WHERE'],
  [/\bdrop\s+schema\b/i, 'DROP SCHEMA'],
  [/\bdrop\s+database\b/i, 'DROP DATABASE'],
  [/\bdrop\s+table\s+[^;]*\bcascade\b/i, 'DROP TABLE ... CASCADE'],
  [/\bdisable\s+trigger\s+(?:all|user)\b/i, 'DISABLE TRIGGER (ALL|USER)'],
  // tras strip de literales, 'replica' queda como ''replica'' — tolerar ambos
  [/\bsession_replication_role\s*(?:=|to)\s*'{0,2}replica'{0,2}/i, "session_replication_role = 'replica'"],
  [/\bsupabase\s+db\s+reset\s+--linked\b/i, 'supabase db reset --linked'],
];

const GUARD_MARKER = '-- COSTPRO-GUARD-DESTRUCTIVO v1';
const GUARD_DO = /DO\s+\$guard\$/i;
// El bloque DO del guard debe aparecer ANTES de la primera sentencia destructiva real.
const ASSERT_NOT_PROD = /assert-not-production/;

function patternByLabel(label) {
  const p = DESTRUCTIVE_PATTERNS_SQL.find(([re, l]) => l === label);
  return p ? p[0] : null;
}

function listFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else if (EXTS.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function stripSqlCommentsAndStrings(sql) {
  // quita comentarios de línea/bloque y literales para no matchearlos como sentencias
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

function isEvidence(relPath) {
  return EVIDENCE_DIRS.some((d) => relPath === d || relPath.startsWith(d + '/'));
}

function isFixtureLike(relPath) {
  return FIXTURE_HINTS.some((h) => relPath.includes(h));
}

function newMigrationSet() {
  // Migraciones NUEVAS en este PR vs la rama base (origin/main o main).
  let base = 'origin/main';
  try {
    execSync(`git rev-parse --verify ${base}`, { cwd: ROOT, stdio: 'pipe' });
  } catch {
    try {
      execSync('git rev-parse --verify main', { cwd: ROOT, stdio: pipeStdio() });
      base = 'main';
    } catch {
      return { has: false, set: new Set() };
    }
  }
  let out = '';
  try {
    out = execSync(`git diff --name-only --diff-filter=A ${base}...HEAD -- supabase/migrations`, { cwd: ROOT, stdio: 'pipe' }).toString();
  } catch {
    return { has: false, set: new Set() };
  }
  return { has: true, set: new Set(out.split('\n').filter(Boolean)) };
}
function pipeStdio() { return 'pipe'; }

function loadAllowlist() {
  // Se lee del ÁRBOL ESCANEADO (ROOT = cwd), no de __dirname: en CI ambos
  // coinciden (se ejecuta desde la raíz del repo); los tests lo ejecutan
  // contra repos ficticios con su propio allowlist.
  const p = path.join(ROOT, 'scripts', 'ci', 'destructive-allowlist.json');
  if (!fs.existsSync(p)) return {};
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const ok = {};
  for (const [file, entry] of Object.entries(raw.exceptions || {})) {
    const expira = entry.expires || '';
    const vigente = /^\d{4}-\d{2}-\d{2}$/.test(expira) && expira >= today && (entry.justification || '').trim().length >= 20;
    ok[file] = { ...entry, vigente };
  }
  return ok;
}

function main() {
  const onlyReport = process.argv.includes('--report');
  const files = listFiles(ROOT);
  const allow = loadAllowlist();
  const newMigrations = newMigrationSet();
  const failures = [];
  const warnings = [];

  for (const abs of files) {
    const rp = rel(abs);
    const ext = path.extname(abs);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }

    const isSqlLike = ext === '.sql';
    const isMigration = rp.startsWith('supabase/migrations/');

    // 1) Migraciones existentes: historia, no se juzgan.
    if (isMigration && !newMigrations.set.has(rp)) continue;

    // 2) Hallar patrones destructivos (en SQL se ignoran comentarios/literales;
    //    en scripts se examina todo el texto pero los patrones son de SQL/shell).
    // Excepción: session_replication_role se busca en el CONTENIDO original
    // porque su valor es un literal ('replica') que el strip de literales
    // eliminaría; el nombre del setting en comentario no colisiona (los
    // comentarios no llevan SET ... = 'replica' ejecutable).
    const scanText = isSqlLike ? stripSqlCommentsAndStrings(content) : content;
    const hits = [];
    for (const [re, label] of DESTRUCTIVE_PATTERNS_SQL) {
      const target = label.startsWith('session_replication_role') && isSqlLike ? content : scanText;
      const m = target.match(re);
      if (m) hits.push({ label, at: m.index });
    }
    if (isSqlLike) {
      // GRANT/REVOKE con privilegio TRUNCATE no son destructivos: cada
      // ocurrencia de "TRUNCATE <schema.tabla>" precedente de GRANT/REVOKE
      // en la misma sentencia se descarta.
      if (hits.some((h) => h.label === 'TRUNCATE <schema.tabla>')) {
        const reT = /\btruncate\s+(?:public|auth|storage)\s*\.\s*[\w"]+/gi;
        let real = false; let mm;
        while ((mm = reT.exec(scanText))) {
          const before = scanText.slice(Math.max(0, mm.index - 200), mm.index);
          const lastSemi = before.lastIndexOf(';');
          const stmt = before.slice(lastSemi + 1) + mm[0];
          if (!/^(grant|revoke)\b/i.test(stmt.trim())) { real = true; break; }
        }
        if (!real) {
          const i = hits.findIndex((h) => h.label === 'TRUNCATE <schema.tabla>');
          hits.splice(i, 1);
        }
      }
    } else {
      // Archivo no-SQL: solo cuenta si además hay señal de EJECUCIÓN de SQL
      // (plantilla SQL, psql/pg client, supabase-js rpc/from, exec). Evita
      // matchear textos/UI que solo mencionan la palabra.
      const hasSqlExecSignal = /sql|psql|postgres|supabase|query|exec|spawn|rpc|db\./i.test(content.slice(0, 8000));
      if (!hasSqlExecSignal) {
        hits.length = 0;
      }
    }
    if (!hits.length) continue;

    // 3) Clasificar por zona.
    if (isEvidence(rp)) {
      warnings.push(`${rp}: ${hits.map((h) => h.label).join(', ')} (audit-evidence: solo advertencia)`);
      continue;
    }
    if (isFixtureLike(rp) && !rp.startsWith('supabase/scripts/')) {
      // fixtures/tests: no se ejecutan contra producción; advertencia informativa.
      warnings.push(`${rp}: ${hits.map((h) => h.label).join(', ')} (fixture/test: informativo)`);
      continue;
    }

    // 4) Excepciones con vencimiento.
    if (allow[rp]) {
      if (allow[rp].vigente) {
        warnings.push(`${rp}: ${hits.map((h) => h.label).join(', ')} (EXCEPCIÓN hasta ${allow[rp].expires}: ${String(allow[rp].justification).slice(0, 60)}…)`);
        continue;
      }
      failures.push(`${rp}: excepción de allowlist VENCIDA o inválida (expira=${allow[rp].expires || 'sin fecha'}) — regenerar o justificar de nuevo. Patrones: ${hits.map((h) => h.label).join(', ')}`);
      continue;
    }

    // 5) Migración NUEVA: exige -- DESTRUCTIVE-OK: CP-xxx
    if (isMigration) {
      const ok = /--\s*DESTRUCTIVE-OK:\s*CP-[A-Za-z0-9-]+/.test(content);
      if (ok) { warnings.push(`${rp}: destructivo declarado con DESTRUCTIVE-OK (migración nueva)`); continue; }
      failures.push(`${rp}: migración NUEVA con patrones destructivos (${hits.map((h) => h.label).join(', ')}) sin comentario '-- DESTRUCTIVE-OK: CP-xxx'`);
      continue;
    }

    // 6) Archivo SQL destructivo: exige marcador + DO $guard$ ANTES del primer patrón.
    if (isSqlLike) {
      const markerIdx = content.indexOf(GUARD_MARKER);
      const doIdx = content.search(GUARD_DO);
      if (markerIdx === -1 || doIdx === -1) {
        failures.push(`${rp}: SQL destructivo (${hits.map((h) => h.label).join(', ')}) sin guard — falta ${markerIdx === -1 ? 'marcador ' + GUARD_MARKER : 'bloque DO $guard$'}`);
        continue;
      }
      // firstHit viene de scanText (sin comentarios/literales); los índices del
      // contenido real solo pueden ser ANTES o IGUAL (los comentarios colapsan
      // a espacios, nunca alargan). Para comparar contra content, recalcular
      // la primera posición REAL de cada patrón sobre content.
      let firstHit = Infinity;
      for (const h of hits) {
        const re = patternByLabel(h.label);
        const m = re && content.match(re);
        if (m) firstHit = Math.min(firstHit, m.index);
      }
      const beginIdx = content.indexOf('BEGIN;', markerIdx);
      if (beginIdx === -1 || beginIdx > firstHit || doIdx > firstHit || markerIdx > firstHit) {
        failures.push(`${rp}: guard presente pero NO precede a la primera sentencia destructiva (D1.1)`);
        continue;
      }
      // el guard debe verificar las dos cerraduras
      const guardBlock = content.slice(doIdx, doIdx + 4000);
      const checksOk = /e2e_is_isolated_db/.test(guardBlock) && /production_migration_ledger/.test(guardBlock) && /GUARD_DESTRUCTIVO/.test(guardBlock);
      if (!checksOk) {
        failures.push(`${rp}: el bloque DO no verifica centinela+ledger (guard incompleto)`);
        continue;
      }
      warnings.push(`${rp}: destructivo con guard OK (${hits.map((h) => h.label).join(', ')})`);
      continue;
    }

    // 7) Script (sh/py/mjs/cjs/js/ts) con señal destructiva de SQL integrado:
    //    exige llamada a assert-not-production.
    if (ASSERT_NOT_PROD.test(content)) {
      warnings.push(`${rp}: destructivo con assert-not-production OK (${hits.map((h) => h.label).join(', ')})`);
      continue;
    }
    // heurística: si el script SOLO define patrones (regex/lint/parser), no es escritor.
    const definesPatternOnly = /(DESTRUCTIVE_PATTERNS|DANGEROUS_RLS_PATTERNS|regex|RegExp|patrones)/i.test(content.slice(0, 4000)) && !/exec|spawn|query\(/i.test(content);
    if (definesPatternOnly) {
      warnings.push(`${rp}: menciona patrones destructivos como DATOS (regex/lint) — no ejecuta SQL`);
      continue;
    }
    failures.push(`${rp}: script con patrones destructivos (${hits.map((h) => h.label).join(', ')}) sin llamada a scripts/lib/assert-not-production`);
  }

  // ── Salida ──
  console.log(`CP-INFRA-020 check-destructive-guard: ${files.length} archivos escaneados`);
  for (const w of warnings) console.log(`  [warn] ${w}`);
  for (const f of failures) console.log(`  [FAIL] ${f}`);

  if (onlyReport) { console.log(`--report: ${failures.length} fallos (no bloqueantes)`); return 0; }
  if (failures.length) {
    console.error(`\nCP-INFRA-020: ${failures.length} archivo(s) destructivo(s) sin guard. ` +
      `Corrige añadiendo el guard (supabase/scripts/README.md) o una excepción justificada con vencimiento en scripts/ci/destructive-allowlist.json.`);
    process.exit(1);
  }
  console.log('CP-INFRA-020: sin destructivos sin guard.');
  return 0;
}

process.exit(main());
