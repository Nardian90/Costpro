#!/usr/bin/env node
/**
 * run-sql-test-e2e.mjs — Ejecuta una batería SQL transaccional (supabase/tests/)
 * contra la BD AISLADA CostproE2E vía Management API, con guard canónico.
 *
 * Uso: node scripts/e2e/run-sql-test-e2e.mjs supabase/tests/<archivo>.sql
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_REF = 'lguovmvrozxgssupkwpf';
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

if (!SUPA_TOKEN) {
  console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.');
  process.exit(2);
}

const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
if (typeof assertIsolatedDb !== 'function') {
  console.error('FALLO DE SEGURIDAD: guard canónico no disponible.');
  process.exit(2);
}
await assertIsolatedDb();

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/e2e/run-sql-test-e2e.mjs <archivo.sql>');
  process.exit(2);
}
const sql = readFileSync(join(REPO, file), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${E2E_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPA_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const bodyText = await res.text();
console.log(`HTTP ${res.status}`);
console.log(bodyText.slice(0, 6000));
process.exit(res.ok ? 0 : 1);
