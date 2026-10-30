/**
 * CP-CAT-MAESTRO-003 — Aplicación controlada de la migración autorizada:
 *   supabase/migrations/20261030120000_cp_catalogo_master_image_propagation.sql
 * Mecanismo oficial: Management API (scripts/apply-migration-mgmt.ts) + NOTIFY pgrst.
 * El script de prueba previa (9/9) y el pre-vuelo deben haber pasado antes de correr esto.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

const FILE = 'supabase/migrations/20261030120000_cp_catalogo_master_image_propagation.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');

console.log(`Aplicando ${FILE} a proyecto ${ref}...`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
if (!res.ok) {
  console.error('FALLO:', text.slice(0, 1500));
  process.exit(1);
}
console.log('resultado:', text.slice(0, 300) || '(sin filas)');

// Recargar caché de esquema de PostgREST (procedimiento oficial del repo)
const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" }),
});
console.log('pgrst schema-cache reload: HTTP', reload.status);
