/**
 * Aplica la migración PI-SUPERADMIN (20261027030000) al proyecto Supabase
 * usando el mecanismo oficial del repo (Management API /database/query —
 * mismo canal que scripts/apply-migration-mgmt.ts) + NOTIFY pgrst reload.
 *
 * Verificación pre/post:
 *   PRE:  las 12 funciones vivas aún tienen el gate solo-memberships
 *         (has_store_role SIN is_admin_check) — si alguna ya lo tiene, la
 *         migración es idempotente y el gate post lo confirmará.
 *   POST: cada función viva contiene is_admin_check(v_caller_uid) OR
 *         has_store_role/has_store_access_as, y NINGUNA quedó con gate
 *         solo-memberships.
 *
 * Uso: bun scripts/mision-pi-aplicar-migracion.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)![1];

const MIGRATION_FILE = 'supabase/migrations/20261027030000_pi_superadmin_rpc_authorization.sql';
const FUNCS = [
  'create_physical_inventory',
  'prepare_physical_inventory',
  'start_physical_inventory_count',
  'record_physical_inventory_counts',
  'complete_physical_inventory_count',
  'submit_physical_inventory_reconciliation',
  'review_physical_inventory_item',
  'submit_physical_inventory_authorization',
  'generate_adjustments_from_physical_inventory',
  'close_physical_inventory',
  'void_physical_inventory',
  'confirm_inventory_adjustment',
];

async function q(sql: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  console.log(`══ Aplicando ${MIGRATION_FILE} al proyecto ${ref} ══`);

  // PRE: estado actual de los gates
  const pre = await q(`
    SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (${FUNCS.map(f => `'${f}'`).join(', ')})
  `);
  let preAdminGates = 0, preLegacyGates = 0;
  for (const r of pre) {
    if (/is_admin_check\(v_caller_uid\)/.test(r.def)) preAdminGates++;
    else preLegacyGates++;
  }
  console.log(`PRE: ${preAdminGates}/12 con gate administrativo | ${preLegacyGates}/12 solo-memberships`);
  if (pre.length !== 12) throw new Error(`Se esperaban 12 funciones, hay ${pre.length}`);
  if (preAdminGates === 12) {
    console.log('Ya aplicada (12/12) — nada que hacer. Idempotente.');
    return;
  }

  // APLICAR
  const sql = readFileSync(resolve(__dirname, '..', MIGRATION_FILE), 'utf8');
  const apply = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const applyText = await apply.text();
  console.log('APPLY status:', apply.status);
  if (!apply.ok) { console.error(applyText.slice(0, 1000)); process.exit(1); }

  // Reload de caché de PostgREST (la Management API no envía el NOTIFY)
  const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema'" }),
  });
  console.log('pgrst schema-cache reload notify: HTTP', reload.status);

  // POST: verificación
  const post = await q(`
    SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (${FUNCS.map(f => `'${f}'`).join(', ')})
  `);
  let ok = 0; const bad: string[] = [];
  for (const r of post) {
    const hasAdmin = /is_admin_check\(v_caller_uid\)/.test(r.def);
    const hasLegacySolo = /IF NOT public\.has_store_role\(v_caller_uid/.test(r.def)
      || /IF NOT public\.has_store_access_as\(v_caller_uid/.test(r.def);
    if (hasAdmin && !hasLegacySolo) ok++;
    else bad.push(`${r.proname}: admin=${hasAdmin} legacySolo=${hasLegacySolo}`);
  }
  console.log(`POST: ${ok}/12 funciones con gate administrativo correcto`);
  if (bad.length) { console.error('FALLAS:', bad); process.exit(2); }
  if (ok !== 12) { console.error(`Se esperaban 12, hay ${ok}`); process.exit(2); }
  console.log('✓ Migración aplicada y verificada (12/12 gates administrativos).');
}

main().catch(e => { console.error(e); process.exit(1); });
