#!/usr/bin/env node
/**
 * CP-CAT-MAESTRO-003 — Aplicador de migraciones vía Management API.
 * Uso:
 *   node scripts/apply-migration.mjs <ruta-migracion.sql> --target e2e
 *   node scripts/apply-migration.mjs <ruta-migracion.sql> --target prod --confirm-prod
 * Regla de oro: validar SIEMPRE primero en e2e; producción una sola vez,
 * con --confirm-prod explícito. Idempotente si la migración lo es.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  ref = PROD_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
} else { console.error('target inválido'); process.exit(1); }

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
