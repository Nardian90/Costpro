#!/usr/bin/env node
/**
 * Aplica una migración SQL directamente a Supabase vía Management API.
 *
 * Uso:
 *   node /home/z/my-project/scripts/apply-sql-migration.js \
 *     /home/z/my-project/supabase/migrations/20260704000001_storefront_config.sql
 *
 * Requiere en .env:
 *   SUPABASE_ACCESS_TOKEN=sbp_...
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN en el entorno');
  process.exit(1);
}

const match = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/);
if (!match) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL no tiene el formato esperado:', SUPABASE_URL);
  process.exit(1);
}
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
