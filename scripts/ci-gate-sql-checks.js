#!/usr/bin/env node
/**
 * CI Gate — SQL Security Checks (generador OFFLINE)
 *
 * Genera scripts/ci-gate-checks.sql con 3 comprobaciones de seguridad contra el
 * estado REAL de una base de datos PostgreSQL (catálogos del sistema, read-only):
 *
 *   1. secdef_no_auth        — funciones SECURITY DEFINER sin verificación de
 *                              identidad (sin auth.uid ni ERR_PERMISSION_DENIED),
 *                              excluyendo funciones disparadoras.
 *   2. secdef_public_grant   — funciones SECURITY DEFINER con grants EXECUTE a
 *                              anon/PUBLIC (ninguna allowlist: hallazgo = fallo).
 *   3. tables_no_rls         — tablas del schema public sin RLS habilitado.
 *
 * Cada query devuelve filas etiquetadas con su check_id en la primera columna y
 * el archivo termina con una fila CANARIO ('__canary__|checks_completed'). El
 * evaluador (scripts/ci-gate-evaluate.js) exige esa fila como prueba de que el
 * archivo se ejecutó COMPLETO: sin canario, el resultado es fallo — nunca verde.
 *
 * Este script NO ejecuta nada contra la base de datos y NO requiere variables de
 * entorno: la conectividad es responsabilidad del workflow
 * (.github/workflows/sql-security-gate.yml), que exige el secret DATABASE_URL
 * (política documentada en .github/PULL_REQUEST_TEST_POLICY.md §3.1).
 *
 * Uso: node scripts/ci-gate-sql-checks.js
 * Consumo en CI: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ci-gate-checks.sql -t -A -F '|'
 *                node scripts/ci-gate-evaluate.js <archivo_resultados>
 */

const fs = require('fs');
const path = require('path');

// ── Cargar y validar la allowlist ───────────────────────────────────────────
const allowlistPath = path.join(__dirname, '..', 'ci-gate-allowlist.json');
let allowlist = { security_definer_without_auth_check: [], tables_without_rls: [] };
if (fs.existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
  } catch (e) {
    console.error('❌ ci-gate-allowlist.json no es JSON válido: ' + e.message);
    process.exit(1);
  }
  if (!allowlist.version ||
      !Array.isArray(allowlist.security_definer_without_auth_check) ||
      !Array.isArray(allowlist.tables_without_rls)) {
    console.error('❌ ci-gate-allowlist.json carece de campos requeridos (version, security_definer_without_auth_check, tables_without_rls)');
    process.exit(1);
  }
} else {
  console.error('❌ ci-gate-allowlist.json no encontrado');
  process.exit(1);
}

const allowedNoAuthFunctions = new Set(
  (allowlist.security_definer_without_auth_check || []).map(item => item.function)
);
const allowedNoRlsTables = new Set(
  (allowlist.tables_without_rls || []).map(item => item.table)
);

// ── Definición de checks (etiquetados para evaluación robusta) ──────────────
const checks = [
  {
    name: 'Check 1: SECURITY DEFINER sin auth check',
    check_id: 'secdef_no_auth',
    sql: `
SELECT 'secdef_no_auth' AS check_id, p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_functiondef(p.oid) NOT LIKE '%auth.uid%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%ERR_PERMISSION_DENIED%'
  AND p.proname NOT IN (
    SELECT p2.proname FROM pg_proc p2
    JOIN pg_trigger t ON t.tgfoid = p2.oid
  )
ORDER BY p.proname;
`,
    allowlist: allowedNoAuthFunctions,
    match_column: 2, // proname
  },
  {
    name: 'Check 2: SECURITY DEFINER con grants anon/PUBLIC',
    check_id: 'secdef_public_grant',
    sql: `
SELECT 'secdef_public_grant' AS check_id, p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants rg
    WHERE rg.routine_schema = 'public'
      AND rg.routine_name = p.proname
      AND rg.grantee IN ('anon', 'PUBLIC')
  )
ORDER BY p.proname;
`,
    allowlist: new Set(),
    match_column: 2, // proname
  },
  {
    name: 'Check 3: Tablas sin RLS',
    check_id: 'tables_no_rls',
    sql: `
SELECT 'tables_no_rls' AS check_id, c.relname
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;
`,
    allowlist: allowedNoRlsTables,
    match_column: 2, // relname
  },
];

// ── Generar el archivo SQL para psql (incluye canario de ejecución completa) ─
const canary = `SELECT '__canary__' AS check_id, 'checks_completed' AS marker;`;
const sqlOutput = checks.map(c => `-- ${c.name}\n${c.sql}`).join('\n')
  + '\n-- Canary: prueba de ejecución completa (el evaluador exige esta fila)\n'
  + canary + '\n';

const outputPath = path.join(__dirname, 'ci-gate-checks.sql');
fs.writeFileSync(outputPath, sqlOutput);

console.log('✅ SQL checks generados: scripts/ci-gate-checks.sql');
console.log('');
console.log('Ejecución en CI (requiere DATABASE_URL):');
console.log('  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ci-gate-checks.sql -t -A -F "|" > results.txt');
console.log('  node scripts/ci-gate-evaluate.js results.txt');
console.log('');
console.log('Checks (cada uno espera 0 filas tras descontar la allowlist):');
for (const check of checks) {
  console.log(`  ${check.name}`);
  console.log(`    check_id: ${check.check_id} — allowlist aplicada: ${check.allowlist.size} ítem(s)`);
}
console.log('  Canary de ejecución completa: __canary__|checks_completed');
console.log('');
console.log('Allowlist:');
console.log(`  Funciones SECURITY DEFINER sin auth aceptadas: ${[...allowedNoAuthFunctions].join(', ') || '(none)'}`);
console.log(`  Tablas sin RLS aceptadas: ${[...allowedNoRlsTables].join(', ') || '(none)'}`);
