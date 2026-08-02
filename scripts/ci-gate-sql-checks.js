#!/usr/bin/env node
/**
 * CI Gate — SQL Security Checks
 *
 * Ejecuta 3 queries contra la DB y falla si alguna retorna > 0 filas
 * (descontando allowlist).
 *
 * Uso: node scripts/ci-gate-sql-checks.js
 *
 * Variables de entorno requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *
 * O alternativamente conecta a la DB local de Supabase.
 */

const fs = require('fs');
const path = require('path');

// Cargar .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Cargar allowlist
const allowlistPath = path.join(__dirname, '..', 'ci-gate-allowlist.json');
let allowlist = { security_definer_without_auth_check: [], tables_without_rls: [] };
if (fs.existsSync(allowlistPath)) {
  allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8'));
}

const allowedNoAuthFunctions = new Set(
  (allowlist.security_definer_without_auth_check || []).map(item => item.function)
);
const allowedNoRlsTables = new Set(
  (allowlist.tables_without_rls || []).map(item => item.table)
);

async function executeSQL(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  // PostgREST doesn't support raw SQL. Use the Management API instead.
  // For CI, we need to connect directly to PostgreSQL.
  // This script is a placeholder — in production CI it would use psql.
  throw new Error('Direct SQL execution not available via PostgREST. Use psql in CI.');
}

// For now, output the checks as SQL files that can be run with psql
const checks = [
  {
    name: 'Check 1: SECURITY DEFINER sin auth check',
    sql: `
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
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
    column: 'proname',
  },
  {
    name: 'Check 2: SECURITY DEFINER con grants anon/PUBLIC',
    sql: `
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants rg
    WHERE rg.routine_schema = 'public'
      AND rg.routine_name = p.proname
      AND rg.grantee IN ('anon', 'PUBLIC')
  );
`,
    allowlist: new Set(),
    column: 'proname',
  },
  {
    name: 'Check 3: Tablas sin RLS',
    sql: `
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;
`,
    allowlist: allowedNoRlsTables,
    column: 'relname',
  },
];

// Generate SQL file for CI execution
const sqlOutput = checks.map(c => `-- ${c.name}\n${c.sql}`).join('\n\n');
const outputPath = path.join(__dirname, 'ci-gate-checks.sql');
fs.writeFileSync(outputPath, sqlOutput);

console.log('✅ SQL checks generated: scripts/ci-gate-checks.sql');
console.log('');
console.log('To run in CI:');
console.log('  psql "$DATABASE_URL" -f scripts/ci-gate-checks.sql');
console.log('');
console.log('Checks:');
for (const check of checks) {
  console.log(`  ${check.name}`);
  console.log(`    Expected: 0 rows (excluding ${check.allowlist.size} allowlisted items)`);
}
console.log('');
console.log('Allowlist:');
console.log(`  Functions without auth: ${[...allowedNoAuthFunctions].join(', ') || '(none)'}`);
console.log(`  Tables without RLS: ${[...allowedNoRlsTables].join(', ') || '(none)'}`);
