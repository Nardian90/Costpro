#!/usr/bin/env node
/**
 * CI Gate — Evaluador de resultados de las SQL Security Checks
 *
 * Lee el archivo de resultados producido por:
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ci-gate-checks.sql -t -A -F '|'
 *
 * Formato por línea: check_id|valor[|args]
 * La ÚLTIMA sentencia del archivo genera la fila canario '__canary__|checks_completed',
 * cuya presencia es PRUEBA de que psql ejecutó el archivo completo (con
 * ON_ERROR_STOP=1 cualquier error aborta antes del canario). Sin canario → fallo:
 * nunca se declara "cubierto" un control que no consta como ejecutado.
 *
 * Veredicto: exit 0 solo si (a) el canario está presente, (b) todos los check_id
 * son conocidos y (c) todas las filas de hallazgo están cubiertas por la
 * allowlist de ci-gate-allowlist.json. Cualquier otra situación → exit 1 con
 * detalle exacto de los hallazgos no permitidos.
 *
 * Uso: node scripts/ci-gate-evaluate.js <archivo_resultados>
 */

const fs = require('fs');
const path = require('path');

const CANARY_ID = '__canary__';
const CANARY_MARKER = 'checks_completed';

// Definición de checks conocidos: columna usada para buscar el valor en la
// allowlist y clave de la allowlist que le corresponde.
const CHECK_DEFS = {
  secdef_no_auth:      { allowlist_key: 'security_definer_without_auth_check', value_field: 'function' },
  secdef_public_grant: { allowlist_key: null, value_field: 'function' }, // sin allowlist: hallazgo = fallo
  tables_no_rls:       { allowlist_key: 'tables_without_rls', value_field: 'table' },
};

// ── Args ────────────────────────────────────────────────────────────────────
const resultsFile = process.argv[2];
if (!resultsFile) {
  console.error('❌ Uso: node scripts/ci-gate-evaluate.js <archivo_resultados>');
  process.exit(1);
}
if (!fs.existsSync(resultsFile)) {
  console.error(`❌ El archivo de resultados no existe: ${resultsFile} — los checks SQL no se ejecutaron`);
  process.exit(1);
}

// ── Allowlist (JSON estricto; corrupta = fallo, nunca verde) ────────────────
const allowlistPath = path.join(__dirname, '..', 'ci-gate-allowlist.json');
let allowlist = {};
try {
  allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
} catch (e) {
  console.error('❌ ci-gate-allowlist.json no es JSON válido: ' + e.message);
  process.exit(1);
}
const allowSets = {};
for (const [id, def] of Object.entries(CHECK_DEFS)) {
  allowSets[id] = def.allowlist_key
    ? new Set((allowlist[def.allowlist_key] || []).map(i => i[def.value_field]))
    : new Set();
}

// ── Parseo de resultados ────────────────────────────────────────────────────
const lines = fs.readFileSync(resultsFile, 'utf-8').split('\n').map(l => l.trim()).filter(l => l.length > 0);
if (lines.length === 0) {
  console.error(`❌ El archivo de resultados está VACÍO (${resultsFile}): ni un solo check consta como ejecutado`);
  process.exit(1);
}

const parsed = [];
let canaryPresent = false;
const unknownIds = new Set();
for (const line of lines) {
  const fields = line.split('|');
  const checkId = fields[0];
  if (checkId === CANARY_ID) {
    if (fields[1] === CANARY_MARKER) canaryPresent = true;
    continue;
  }
  if (!(checkId in CHECK_DEFS)) { unknownIds.add(checkId); continue; }
  parsed.push({ checkId, value: fields[1] || '', extra: fields.slice(2).join('|') });
}

// ── Veredicto ───────────────────────────────────────────────────────────────
let exitCode = 0;
const summary = [];

if (!canaryPresent) {
  console.error('❌ FALLO: fila canario ausente — el archivo de checks SQL NO se ejecutó completo (psql abortó o el resultado está truncado). Ningún control puede declararse cubierto.');
  exitCode = 1;
}
if (unknownIds.size > 0) {
  console.error('❌ FALLO: check_id desconocidos en los resultados: ' + [...unknownIds].join(', '));
  exitCode = 1;
}

console.log('🔒 SQL Security Checks — evaluación de resultados');
console.log('');
const ids = Object.keys(CHECK_DEFS);
for (const id of ids) {
  const rows = parsed.filter(r => r.checkId === id);
  const inAllow = rows.filter(r => allowSets[id].has(r.value));
  const failing = rows.filter(r => !allowSets[id].has(r.value));
  const status = failing.length === 0 ? '✅' : '❌';
  console.log(`${status} ${id}: ${rows.length} hallazgo(s), ${inAllow.length} en allowlist, ${failing.length} NO permitidos`);
  if (failing.length > 0) {
    exitCode = 1;
    for (const f of failing) {
      console.log(`     ❌ ${f.value}${f.extra ? ' (' + f.extra + ')' : ''}`);
    }
  }
}

console.log('');
if (exitCode === 0) {
  console.log('✅ Resultado: TODO PASS — 3 checks ejecutados completos, 0 hallazgos fuera de allowlist');
} else {
  console.log('❌ Resultado: FALLO — ver hallazgos arriba (o canario/check_id inválidos)');
}
process.exit(exitCode);
