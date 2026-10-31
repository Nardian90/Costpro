/**
 * CP-CAT-MAESTRO-002 — Aplicación controlada de la migración de incorporación:
 *   supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql
 * Mecanismo oficial: Management API + NOTIFY pgrst (scripts/apply-migration-mgmt.ts).
 * Destino: proyecto indicado por E2E_SUPABASE_URL (base AISLADA — guard fail-closed).
 * Pre-vuelo: la URL debe ser el proyecto E2E (lguovmvrozxgssupkwpf), JAMÁS producción.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: './.env.local' });   // E2E_SUPABASE_URL + keys
loadEnv({ path: './.env' });         // SUPABASE_ACCESS_TOKEN (Management API)

const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ALLOWED_REF = process.env.E2E_ALLOWED_REMOTE_REF;
const m = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/);
const ref = m && m[1];

if (!ref || ref !== ALLOWED_REF) {
  console.error('FALLO DE GUARD: destino no coincide con E2E_ALLOWED_REMOTE_REF');
  process.exit(2);
}
if (ref === 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: ¡destino es PRODUCCIÓN!');
  process.exit(2);
}

const FILE = 'supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');

console.log(`Aplicando ${FILE} a proyecto E2E ${ref}...`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
if (!res.ok) {
  console.error('FALLO:', text.slice(0, 2000));
  process.exit(1);
}
console.log('resultado:', text.slice(0, 600) || '(sin filas)');

// Recargar caché de esquema de PostgREST (procedimiento oficial del repo)
const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" }),
});
console.log('pgrst schema-cache reload: HTTP', reload.status);
