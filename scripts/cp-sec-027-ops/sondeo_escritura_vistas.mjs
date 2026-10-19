#!/usr/bin/env node
/**
 * CP-SEC-027 — SONDEO READ-ONLY: ¿las vistas public_*_v son escribibles por anon?
 * Motivación: los post-checks de la Fase A revelaron que Supabase (default privileges)
 * otorgó a anon TODOS los privilegios sobre las vistas nuevas, mientras la migración
 * solo GRANTEA SELECT. Este script NO escribe: consulta exclusivamente catálogos.
 *   1. ¿Quién es el owner de cada vista y tiene BYPASSRLS? (semántica security-definer)
 *   2. ¿Son vistas auto-actualizables (is_updatable / is_insertable_into)?
 *   3. ¿Tienen reglas INSTEAD o triggers INSTEAD OF?
 *   4. ¿Qué privilegios efectivos tiene anon/authenticated/service_role sobre cada vista?
 *   5. ¿La definición incluye security_invoker?
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/z/my-project/costpro-recovery';
const REF = 'wthkddeleylijmonclxg';
const env = {};
for (const raw of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function sql(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

const out = { ts: new Date().toISOString(), ref: REF, tipo: 'read-only' };

out.owners = await sql(`SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, r.rolbypassrls, r.rolsuper
  FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
  WHERE c.relkind='v' AND c.relname IN ('public_catalog_v','public_storefronts_v','public_variants_v') ORDER BY c.relname`);

out.auto_actualizables = await sql(`SELECT table_name, is_insertable_into, is_updatable
  FROM information_schema.views
  WHERE table_schema='public' AND table_name IN ('public_catalog_v','public_storefronts_v','public_variants_v') ORDER BY table_name`);

out.reglas = await sql(`SELECT rulename, tablename FROM pg_rules WHERE schemaname='public'
  AND tablename IN ('public_catalog_v','public_storefronts_v','public_variants_v')`);

out.triggers = await sql(`SELECT tgname, tgrelid::regclass AS vista, tgfoid::regproc AS fn
  FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
    'public.public_catalog_v'::regclass, 'public.public_storefronts_v'::regclass, 'public.public_variants_v'::regclass)`);

out.privilegios = await sql(`SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('public_catalog_v','public_storefronts_v','public_variants_v')
    AND grantee IN ('anon','authenticated','service_role')
  GROUP BY grantee, table_name ORDER BY table_name, grantee`);

out.security_invoker = await sql(`SELECT c.relname, coalesce(o.optionsetting,'(no definido)') AS reloptions
  FROM pg_class c LEFT JOIN LATERAL (SELECT unnest(c.reloptions) AS optionsetting) o ON true
  WHERE c.relkind='v' AND c.relname IN ('public_catalog_v','public_storefronts_v','public_variants_v')`);

const dest = '/home/z/my-project/download/cp-sec-027-ejecucion-20261019/raw/sondeo_escritura_vistas_readonly.json';
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
console.log(`\n→ ${dest}`);
