#!/usr/bin/env node
/**
 * Aplica una migración SQL directamente a Supabase vía Management API.
 *
 * CP-INFRA-019 (fix C): este archivo es .js y el package.json NO declara
 * "type": "module" — con `import` es módulo ESM (no puede usar `require`) y
 * el require rompía con "require is not defined in ES module scope".
 * Reescrito en CommonJS puro: el guard se invoca por CLI (mismo contrato,
 * scripts/lib/assert-not-production.mjs) con la URL EXACTA que usará la
 * petición; el ref de la Management API se extrae de esa misma URL.
 *
 * Uso (Node >= 22, engines del proyecto):
 *   node scripts/apply-sql-migration.js supabase/migrations/<migración>.sql
 *
 * Requiere en el entorno:
 *   SUPABASE_ACCESS_TOKEN=sbp_...
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   (o SUPABASE_URL como alternativa)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

// GUARD (CP-INFRA-019): el destino validado es la URL que usará la petición.
// CommonJS no puede importar el .mjs — CLI con el mismo contrato.
try {
  execFileSync('node', [
    path.resolve(__dirname, 'lib', 'assert-not-production.mjs'),
    '--mode', 'write', '--url', SUPABASE_URL, '--context', 'apply-sql-migration.js',
  ], { stdio: 'inherit' });
} catch { process.exit(1); }

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) o SUPABASE_ACCESS_TOKEN en el entorno');
  process.exit(1);
}

const match = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/);
if (!match) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL no tiene el formato esperado:', SUPABASE_URL);
  process.exit(1);
}
// Ref extraído de la MISMA URL que validó el guard (destino comprobado == ejecutado).
const PROJECT_REF = match[1];

const sqlPath = process.argv[2];
if (!sqlPath || !fs.existsSync(sqlPath)) {
  console.error('❌ Uso: node apply-sql-migration.js <path-to-sql-file>');
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

(async () => {
  console.log(`▶ Aplicando: ${path.basename(sqlPath)}`);
  console.log(`  Proyecto: ${PROJECT_REF}`);
  console.log(`  Tamaño SQL: ${sql.length} bytes`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  console.log('✅ Migración aplicada correctamente.');
  if (body && body.trim() && body !== '[]') {
    console.log('Respuesta:', body.slice(0, 500));
  }
})().catch(err => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
