/**
 * CP-CAT-MAESTRO-004 — Aplicación controlada de la migración autorizada (§2.2):
 *   supabase/migrations/20261030143000_cp_catalogo_audit_check_master_products.sql
 * Mecanismo oficial: Management API + NOTIFY pgrst (scripts/apply-migration-mgmt.ts).
 * Pre-vuelo capturado en audit-evidence/MAESTRO-004/pre-migracion-20261030130000.json
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// GUARD (LIMITES-SUPABASE T1b): bloquea producción salvo doble flag explícito.
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
assertNotProduction({ mode: 'write', url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL, context: 'm004-aplicar-migracion-20261030143000.mjs' });
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

const FILE = 'supabase/migrations/20261030143000_cp_catalogo_audit_check_master_products.sql';
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
