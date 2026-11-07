#!/usr/bin/env node
/**
 * CP-CAT-MAESTRO-003 — Aplicador de migraciones vía Management API.
 *
 * Uso:
 *   node scripts/apply-migration.mjs <ruta-migracion.sql> --target e2e
 *   node scripts/apply-migration.mjs <ruta-migracion.sql> --target prod --confirm-prod
 *
 * Guard de producción (CP-INFRA-019): toda escritura pasa por
 * assertNotProduction con el projectRef REAL resuelto. La BD aislada E2E
 * (ref conocido del proyecto) pasa libre; producción exige el doble flag
 * explícito del guard (ALLOW_PROD_WRITE=I_UNDERSTAND) además de --confirm-prod.
 * Regla de oro de la misión: validar SIEMPRE primero en e2e; producción una
 * sola vez, documentada. Idempotente si la migración lo es.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const args = process.argv.slice(2);
const file = args[0];
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'e2e';
const confirmProd = args.includes('--confirm-prod');

if (!file) { console.error('Uso: node scripts/apply-migration.mjs <file.sql> --target e2e|prod'); process.exit(1); }

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}

const E2E_URL = 'https://lguovmvrozxgssupkwpf.supabase.co';
const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

let ref;
if (target === 'e2e') ref = E2E_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
else if (target === 'prod') {
  if (!confirmProd) { console.error('BLOQUEADO: producción exige --confirm-prod (regla de oro).'); process.exit(1); }
  if (!PROD_URL) { console.error('BLOQUEADO: NEXT_PUBLIC_SUPABASE_URL ausente — destino de producción no identificable.'); process.exit(1); }
  ref = PROD_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
} else { console.error('target inválido'); process.exit(1); }

// Guard oficial fail-closed (CP-INFRA-019): el ref resuelto es el destino REAL
// de la escritura; E2E conocido pasa libre, producción exige ALLOW_PROD_WRITE.
assertNotProduction({ mode: 'write', projectRef: ref, context: 'scripts/apply-migration.mjs' });

const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
console.log(`Aplicando ${file} → ${target} (${ref}) …`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
if (!res.ok) { console.error('FALLO:', text.slice(0, 3000)); process.exit(1); }
console.log('resultado:', text.slice(0, 800) || '(sin filas)');

// Recargar caché de esquema de PostgREST (procedimiento oficial del repo)
const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" }),
});
console.log('pgrst reload: HTTP', reload.status);
