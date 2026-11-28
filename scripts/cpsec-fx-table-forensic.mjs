#!/usr/bin/env node
/**
 * cpsec-fx-table-forensic.mjs — CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001.
 * Sondeo forense READ-ONLY y re-ejecutable de public.exchange_rates_backup_cpfx001
 * en PRODUCCIÓN vía Supabase Management API (endpoint SQL; el sandbox no resuelve
 * db.*.supabase.co). No imprime credenciales. No vuelca las 1.607 filas: solo
 * estadísticas agregadas y muestras de metadatos sanitizadas.
 *
 * Uso: bun scripts/cpsec-fx-table-forensic.mjs   (requiere .env con SUPABASE_ACCESS_TOKEN)
 * Salida: FASE 1 del expediente (columnas/PK/índices/FK/triggers/policies/RLS/
 * grants/dependientes/publicaciones/pg_stat/pg_stat_statements + hash de contenido).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
for (const l of envText.split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN requerida.'); process.exit(2); }
const PROD_REF = 'wthkddeleylijmonclxg';
const T = 'exchange_rates_backup_cpfx001';

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`MGMT SQL [${label}]: HTTP ${res.status} ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

const out = {};
const log = (k, v) => { out[k] = v; console.log(`[${k}]`, typeof v === 'string' ? v : JSON.stringify(v)); };

log('1_columnas', await q(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='${T}' ORDER BY ordinal_position`, 'columnas'));
log('2_pk', await q(
  `SELECT a.attname FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
    WHERE c.relname='${T}' AND i.indisprimary`, 'pk'));
log('3_indices', await q(
  `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${T}'`, 'indices'));
log('4_fks', await q(
  `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='${T}'::regclass AND contype='f'`, 'fks'));
log('5_triggers', await q(
  `SELECT t.tgname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
    WHERE t.tgrelid='${T}'::regclass AND NOT t.tgisinternal`, 'triggers'));
log('7_policies', await q(
  `SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename='${T}'`, 'policies'));
log('8_9_rls', await q(
  `SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner,
          (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='${T}') AS n_policies
    FROM pg_class WHERE relname='${T}'`, 'rls'));
log('10_grants', await q(
  `SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='${T}'
      AND grantee IN ('PUBLIC','public','anon','authenticated','service_role')
    ORDER BY grantee, privilege_type`, 'grants'));
log('11_dependientes', await q(
  `SELECT DISTINCT dependent.relname AS objeto, dependent.relkind FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid=d.objid JOIN pg_class dependent ON dependent.oid=rw.ev_class
    JOIN pg_class source ON source.oid=d.refobjid
    WHERE d.refclassid='pg_class'::regclass AND source.relname='${T}'
      AND dependent.relname <> '${T}'`, 'dependientes'));
log('12_publicaciones', await q(
  `SELECT p.pubname, p.puballtables FROM pg_publication p
    WHERE EXISTS (SELECT 1 FROM pg_publication_tables pt
      WHERE pt.pubname=p.pubname AND pt.tablename='${T}') OR p.puballtables`, 'pubs'));
log('13_stat', await q(
  `SELECT n_live_tup, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum, last_autoanalyze
    FROM pg_stat_all_tables WHERE relname='${T}'`, 'stat'));
log('14a_resumen', await q(
  `SELECT count(*)::int AS filas, min(rate_date) AS min_rate_date, max(rate_date) AS max_rate_date,
          max(captured_at) AS max_captured, max(created_at) AS max_created
    FROM public.${T}`, 'resumen'));
log('14b_fuentes', await q(
  `SELECT source, count(*)::int AS n, max(rate_date) AS ult_fecha
    FROM public.${T} GROUP BY source ORDER BY n DESC`, 'fuentes'));
log('14e_hash', await q(
  `SELECT md5(string_agg(concat_ws('|', rate_date::text, currency, source, segment, rate::text,
        coalesce(capture_method,''), coalesce(import_batch,'')), E'\\n' ORDER BY rate_date, source, segment)) AS content_hash
    FROM public.${T}`, 'hash'));
try {
  log('15_sss', await q(
    `SELECT r.rolname AS ejecutor, s.calls, left(s.query, 90) AS q
      FROM pg_stat_statements s JOIN pg_roles r ON r.oid=s.userid
      WHERE s.query ILIKE '%${T}%' ORDER BY s.total_exec_time DESC LIMIT 12`, 'sss'));
} catch (e) { console.log('[15_sss] no disponible:', String(e.message).slice(0, 100)); }

writeFileSync(resolve(process.cwd(), 'docs/audits/CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001/forensic-latest.json'),
  JSON.stringify(out, null, 2));
console.log('\nEVIDENCIA → docs/audits/CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001/forensic-latest.json');
