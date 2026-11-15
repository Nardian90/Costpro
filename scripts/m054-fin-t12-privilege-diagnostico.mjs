#!/usr/bin/env node
// ============================================================================
// M054 — CP-FIN-T12-PRIVILEGE-HARDENING-001 · DIAGNÓSTICO DE PRIVILEGIOS (§1)
// ============================================================================
// READ-ONLY ESTRICTO sobre producción (Management API /database/query, SELECT).
// Inspecciona el privilegio EXECUTE sobre public.fin_entry_reversal_residual
// (helper T12, migración 20261115100000) y su contexto:
//   Q1  libro de migraciones (¿T12 aplicada en producción?)
//   Q2  definición completa + owner + prosecdef + search_path del helper
//   Q3  ACL efectiva (aclexplode) de helper y llamadores internos
//   Q4  has_function_privilege para anon / authenticated / service_role / PUBLIC
//   Q5  invocadores reales dentro de la BD (pg_proc bodies + triggers)
//   Q6  RLS de fin_entries / fin_movements (lo que el SECURITY DEFINER elude)
//   Q7  superficie RPC visible para authenticated (p.postgrest-visible)
// Producción INTACTA — ninguna escritura.
// Uso: node scripts/m054-fin-t12-privilege-diagnostico.mjs
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 400)}`);
  const rows = JSON.parse(text || '[]');
  console.log(`[OK] ${label} → ${rows.length} fila(s)`);
  return rows;
}

const OUT_DIR = resolve('docs/audits/fin-t12-privilege-hardening-001');
mkdirSync(OUT_DIR, { recursive: true });

const diag = {
  mision: 'CP-FIN-T12-PRIVILEGE-HARDENING-001',
  script: 'm054-fin-t12-privilege-diagnostico.mjs',
  fecha_utc: new Date().toISOString(),
  modo: 'READ-ONLY — Management API /database/query, SOLO SELECT',
  origen: `${ref} (producción) · guard ref OK`,
};

// ── Q1: libro de migraciones (¿T12 aplicada?) ────────────────────────────────
diag.libro_migraciones = await q(`
  SELECT *
  FROM public.production_migration_ledger
  ORDER BY id DESC LIMIT 6`, 'Q1 libro de migraciones (últimas 6)');

// ── Q2: definición completa del helper ───────────────────────────────────────
diag.helper_definicion = await q(`
  SELECT p.oid::regprocedure::text AS firma,
         pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer,
         p.provolatile,
         p.proconfig AS search_path,
         p.proacl AS proacl_bruta,
         pg_get_functiondef(p.oid) AS definicion
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_entry_reversal_residual'`,
  'Q2 definición del helper');

// ── Q3: ACL efectiva de helper y llamadores internos ─────────────────────────
diag.acl_efectiva = await q(`
  SELECT p.oid::regprocedure::text AS firma,
         pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer,
         coalesce(a.grantee::text, 'PUBLIC') AS grantee,
         a.privilege_type,
         a.is_grantable
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a ON true
  WHERE n.nspname = 'public'
    AND p.proname IN ('fin_entry_reversal_residual','fin_post_document_annulment','fin_t12_block_receipt_annulment')
  ORDER BY p.proname, grantee`, 'Q3 ACL efectiva (3 funciones T12)');

// ── Q4: capacidad efectiva por rol ───────────────────────────────────────────
diag.has_function_privilege = await q(`
  SELECT 'anon' AS rol,
         has_function_privilege('anon', 'public.fin_entry_reversal_residual(uuid)', 'EXECUTE') AS helper,
         has_function_privilege('anon', 'public.fin_post_document_annulment(text,uuid)', 'EXECUTE') AS motor
  UNION ALL
  SELECT 'authenticated',
         has_function_privilege('authenticated', 'public.fin_entry_reversal_residual(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.fin_post_document_annulment(text,uuid)', 'EXECUTE')
  UNION ALL
  SELECT 'service_role',
         has_function_privilege('service_role', 'public.fin_entry_reversal_residual(uuid)', 'EXECUTE'),
         has_function_privilege('service_role', 'public.fin_post_document_annulment(text,uuid)', 'EXECUTE')`,
  'Q4 has_function_privilege (helper / motor)');

// ── Q5: invocadores reales dentro de la BD ───────────────────────────────────
diag.invocadores_en_bd = await q(`
  SELECT p.oid::regprocedure::text AS firma,
         p.prosecdef AS security_definer,
         pg_get_userbyid(p.proowner) AS owner,
         (EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)) AS es_trigger,
         (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid = p.oid) AS n_triggers,
         CASE WHEN p.prosrc ILIKE '%fin_entry_reversal_residual%' THEN 'invoca al helper' ELSE '' END AS relacion
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.prosrc ILIKE '%fin_entry_reversal_residual%'
         OR EXISTS (SELECT 1 FROM pg_trigger t2 WHERE t2.tgfoid = p.oid AND p.proname = 'fin_t12_block_receipt_annulment'))
  ORDER BY p.proname`, 'Q5 invocadores del helper en la BD');

// ── Q6: RLS de las tablas financieras que el helper lee ──────────────────────
diag.rls_fin = await q(`
  SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
         (SELECT count(*) FROM pg_policies pol WHERE pol.tablename = c.relname AND pol.schemaname='public') AS n_politicas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('fin_entries','fin_movements','fin_posting_errors')
  ORDER BY c.relname`, 'Q6 RLS fin_entries/fin_movements/fin_posting_errors');

// ── Q7: superficie RPC visible desde PostgREST para authenticated ────────────
diag.superficie_rpc_fin = await q(`
  SELECT p.oid::regprocedure::text AS firma,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS ejecutable_por_authenticated,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS ejecutable_por_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'fin_%'
  ORDER BY p.proname`, 'Q7 superficie RPC fin_* para anon/authenticated');

diag.veredicto_diagnostico = {
  helper_en_produccion: diag.helper_definicion.length > 0,
  t12_aplicada: diag.libro_migraciones.some(r => String(r.migration_name || '').includes('20261115100000')),
};

writeFileSync(resolve(OUT_DIR, 'diagnostico-privilegios.json'),
  JSON.stringify(diag, null, 2) + '\n');
console.log(`\nVeredicto: ${JSON.stringify(diag.veredicto_diagnostico)}`);
console.log(`Evidencia: ${OUT_DIR}/diagnostico-privilegios.json`);
