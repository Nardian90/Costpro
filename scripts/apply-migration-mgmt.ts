/**
 * Applies a SQL migration to the Supabase project via the Management API.
 * Usage: bun scripts/apply-migration-mgmt.ts <migration-file>
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)![1];

const file = process.argv[2];
if (!file) { console.error('Usage: bun scripts/apply-migration-mgmt.ts <file.sql>'); process.exit(1); }
const sql = readFileSync(resolve(__dirname, '..', file), 'utf8');

async function main() {
  console.log(`Applying ${file} to project ${ref}...`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  console.log('status:', res.status);
  if (!res.ok) { console.error(text.slice(0, 800)); process.exit(1); }
  console.log('OK ✓ (result sample):', text.slice(0, 200) || '(empty)');

  // MISIÓN 2026-10-22 (Parte A): recargar la caché de esquema de PostgREST
  // tras aplicar cualquier migración. La Management API NO envía el NOTIFY
  // que el SQL editor envía automáticamente; sin él, migraciones que
  // crean/recreean constraints dejan la caché desincronizada y los embeds
  // con hint por constraint fallan con PGRST200 (causa raíz demostrada del
  // defecto de Ingresos/Egresos). Si este NOTIFY no llega al listener (ver
  // scripts/pgrst-reload-schema.mjs), ejecutarlo desde el SQL editor.
  try {
    const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" }),
    });
    console.log(`pgrst schema-cache reload notify: HTTP ${reload.status}`);
  } catch (e) {
    console.warn('pgrst reload notify falló (ejecutarlo desde el SQL editor):', e);
  }

  // Post-verify: the email check must exclude v_user_id
  const verify = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "SELECT prosrc FROM pg_proc WHERE proname='managed_create_user_v2'" }),
  });
  const j = await verify.json();
  const src = j[0]?.prosrc || '';
  const hasExclusion = src.includes('id <> v_user_id');
  console.log(`post-verify: exclusion present in remote function: ${hasExclusion ? 'YES ✓' : 'NO ✗'}`);
  if (!hasExclusion) process.exit(2);
}

main().catch(e => { console.error('APPLY FAILED:', e); process.exit(1); });
