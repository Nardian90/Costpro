/**
 * MISIÓN TRANSVERSAL HSAA-SUPERADMIN (2026-10-27) — Aplicación controlada de
 * la migración 20261027120000_has_store_access_as_superadmin_policy.sql.
 *
 * Procedimiento (mismo mecanismo autorizado que la misión PI-SUPERADMIN):
 *   1. DRY-RUN: ejecuta la migración dentro de una transacción con ROLLBACK
 *      — valida sintaxis, el guard de firma y los CREATE OR REPLACE sin
 *      persistir nada.
 *   2. PRE: registra las definiciones y ACL vivas de las 6 funciones.
 *   3. APLICACIÓN real (autocommit).
 *   4. POST: verifica que la definición viva de cada función coincide
 *      byte-exacto (normalizada en espacios) con el cuerpo del archivo.
 *   5. Verifica ACL preservada (postgres + service_role [+ adjuster]).
 *   6. NOTIFY pgrst para refrescar el schema cache de PostgREST.
 *
 * Uso: bun scripts/mision-hsaa-aplicar.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const PROJECT = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '');
const MIGRATION_PATH = resolve(__dirname, '../supabase/migrations/20261027120000_has_store_access_as_superadmin_policy.sql');

const FNS: Array<[string, string]> = [
  ['has_store_access_as', 'p_user_id uuid, p_store_id uuid'],
  ['can_admin_reverse_transaction', 'p_actor uuid, p_store_id uuid'],
  ['can_pos_undo_transaction', 'p_transaction_id uuid, p_actor uuid'],
  ['can_reverse_document', 'p_actor uuid, p_store_id uuid, p_operation text'],
  ['has_management_access_as', 'p_user_id uuid, p_store_id uuid'],
  ['approve_transfer', 'p_transfer_id uuid, p_user_id uuid'],
];

async function q(sql: string): Promise<any[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAIL', r.status, t.slice(0, 400)); process.exit(4); }
  return JSON.parse(t);
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** extrae el bloque CREATE OR REPLACE FUNCTION completo del archivo */
function fileDef(name: string): string {
  const raw = readFileSync(MIGRATION_PATH, 'utf8');
  const start = raw.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`${name}: no encontrado en el archivo`);
  const m = /AS\s+(\$[A-Za-z0-9_]*\$)/.exec(raw.slice(start))!;
  const end = raw.indexOf(m[1], start + m.index + m[0].length) + m[1].length;
  // pg_get_functiondef NO emite el «;» terminal — comparar sin él
  return raw.slice(start, end);
}

async function main() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  console.log('══ 1. DRY-RUN (transacción + ROLLBACK — nada persiste) ══');
  await q(`BEGIN;\n${sql}\nROLLBACK;`);
  console.log('  OK: sintaxis, guard de firma y CREATE OR REPLACE validados sin persistir.');

  console.log('\n══ 2. PRE: estado vivo de las 6 funciones ══');
  for (const [name] of FNS) {
    const rows = await q(`SELECT COALESCE(p.proacl::text,'NULL') AS acl, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='${name}'`);
    console.log(`  ${name}: ACL=${rows[0]?.acl} | is_admin_check=${/public\.is_admin_check\(/.test(rows[0]?.def || '')}`);
  }

  console.log('\n══ 3. APLICACIÓN REAL ══');
  await q(sql);
  console.log('  OK: migración aplicada (autocommit).');

  console.log('\n══ 4. POST: definiciones vivas == archivo (byte-exacto normalizado) ══');
  let allMatch = true;
  for (const [name] of FNS) {
    const rows = await q(`SELECT pg_get_functiondef(p.oid) AS def, COALESCE(p.proacl::text,'NULL') AS acl, p.provolatile
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='${name}'`);
    const liveDef = rows[0].def as string;
    const expected = fileDef(name);
    const match = norm(liveDef) === norm(expected);
    if (!match) allMatch = false;
    console.log(`  ${name}: ${match ? '✓ byte-idéntica' : '✗ DIFIERE'} | volatility=${rows[0].provolatile} | ACL=${rows[0].acl}`);
    if (!match) {
      console.log(`    esperado (primeros 300): ${norm(expected).slice(0, 300)}`);
      console.log(`    vivo     (primeros 300): ${norm(liveDef).slice(0, 300)}`);
    }
  }
  if (!allMatch) { console.error('\n✗ FALLO de verificación byte-exacta'); process.exit(5); }

  console.log('\n══ 5. ACL esperadas (preservadas por CREATE OR REPLACE) ══');
  const aclOk = await q(`SELECT
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_store_access_as') AS hsaa,
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='can_admin_reverse_transaction') AS cart,
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='can_pos_undo_transaction') AS cput,
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='can_reverse_document') AS crd,
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_management_access_as') AS hmaa,
      (SELECT COALESCE(p.proacl::text,'NULL') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_transfer') AS apt`);
  const a = aclOk[0];
  const checks = [
    ['has_store_access_as', a.hsaa, '{postgres=X/postgres,service_role=X/postgres}'],
    ['can_admin_reverse_transaction', a.cart, '{postgres=X/postgres,service_role=X/postgres,costpro_transaction_adjuster=X/postgres}'],
    ['can_pos_undo_transaction', a.cput, '{postgres=X/postgres,service_role=X/postgres}'],
    ['can_reverse_document', a.crd, '{postgres=X/postgres,service_role=X/postgres}'],
    ['has_management_access_as', a.hmaa, '{postgres=X/postgres,service_role=X/postgres}'],
    ['approve_transfer', a.apt, '{postgres=X/postgres,service_role=X/postgres}'],
  ] as Array<[string, string, string]>;
  let aclAllOk = true;
  for (const [name, got, want] of checks) {
    const ok = norm(got) === norm(want);
    if (!ok) aclAllOk = false;
    console.log(`  ${name}: ${ok ? '✓ ACL preservada' : `✗ ACL=${got} (esperada ${want})`}`);
  }
  if (!aclAllOk) process.exit(6);

  console.log('\n══ 6. NOTIFY pgrst (schema cache) ══');
  await q('NOTIFY pgrst, \'reload schema\'');
  console.log('  OK: schema cache de PostgREST refrescado.');

  console.log('\n✅ MIGRACIÓN APLICADA Y VERIFICADA (definiciones byte-idénticas, ACL preservadas).');
}

main().catch(e => { console.error(e); process.exit(1); });
