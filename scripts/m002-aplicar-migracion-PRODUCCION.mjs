/**
 * CP-CAT-MAESTRO-002 — Aplicación CONTROLADA de la migración a PRODUCCIÓN:
 *   supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql
 * Mecanismo oficial del repo: Management API + NOTIFY pgrst
 * (scripts/apply-migration-mgmt.ts / patrón scripts/m004-aplicar-*.mjs).
 * Guard fail-closed: destino DEBE ser el ref de producción wthkddeleylijmonclxg.
 * Pre-vuelo: existencia de las dependencias (master_products, is_catalog_governor).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción (wthkddeleylijmonclxg)');
  process.exit(2);
}

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// ── PRE-VUELO (read-only): dependencias presentes ─────────────────────────
const pre = await mgmt(`SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='master_products') AS t_master,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_catalog_governor') AS f_gov,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='incorporate_store_products_to_master') AS f_inc;`);
console.log('PRE-VUELO:', pre.text.slice(0, 300));
const preData = JSON.parse(pre.text);
if (preData[0].t_master !== 1 || preData[0].f_gov !== 1) {
  console.error('FALLO PRE-VUELO: dependencias ausentes');
  process.exit(2);
}
if (preData[0].f_inc === 1) {
  console.log('RPC ya presente (idempotente): se re-aplica CREATE OR REPLACE');
}

// ── APLICACIÓN ──────────────────────────────────────────────────────────────
const FILE = 'supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');
console.log(`\nAplicando ${FILE} a PRODUCCIÓN (${ref})...`);
const res = await mgmt(sql);
console.log('HTTP', res.status);
if (!res.ok) {
  console.error('FALLO:', res.text.slice(0, 2000));
  process.exit(1);
}
console.log('resultado:', res.text.slice(0, 400) || '(sin filas)');

// ── POST: recarga de caché de PostgREST (procedimiento oficial) ────────────
const reload = await mgmt("NOTIFY pgrst, 'reload schema'");
console.log('pgrst schema-cache reload: HTTP', reload.status);

// ── VERIFICACIÓN POST (read-only) ───────────────────────────────────────────
const post = await mgmt(`SELECT p.proname, p.prosecdef AS secdef,
  pg_get_userbyid(p.proowner) AS owner,
  COALESCE((SELECT string_agg(rp.grantee,',') FROM information_schema.routine_privileges rp
    WHERE rp.routine_schema='public' AND rp.routine_name=p.proname),'') AS grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='incorporate_store_products_to_master';`);
console.log('\nVERIFICACIÓN POST:', post.text.slice(0, 400));
const postData = JSON.parse(post.text);
const g = String(postData[0]?.grants || '');
if (!postData[0]?.secdef || !g.includes('authenticated') || !g.includes('service_role')) {
  console.error('VERIFICACIÓN FALLÓ: atributos/grants incorrectos');
  process.exit(1);
}
console.log('\nOK: RPC presente, SECURITY DEFINER, grants authenticated+service_role');
