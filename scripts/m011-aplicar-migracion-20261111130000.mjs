#!/usr/bin/env node
/**
 * ORDEN DE CIERRE (2026-11-11) §2 — Aplicación CONTROLADA a PRODUCCIÓN de:
 *   supabase/migrations/20261111130000_cp_data_integrity_trigger_acl_normalization.sql
 *
 * Canal habitual y autorizado del repo (Management API + NOTIFY pgrst, patrón
 * m002/m010). Autorización: ORDEN DE EJECUCIÓN del propietario §2.4-5 — paso
 * requerido para que la regeneración de contract-surface sea COHERENTE sin
 * excepciones nuevas: los 4 helpers de trigger de DATA-INTEGRITY-REMEDIATION-001
 * quedaron en producción con EXECUTE para anon/authenticated (default
 * privileges del owner) mientras el replay solo materializa PUBLIC →
 * UNEXPECTED_ACL_DRIFT (CRITICAL) en la Capa C del contrato. Esta migración
 * ENDURECE el estado vivo (retira EXECUTE de anon/authenticated sobre
 * funciones SECURITY DEFINER con escrituras) y deja el replay y el vivo
 * idénticos: {service_role}. Expediente:
 * docs/audits/APLICACION_MIGRACION_20261111120000_PRODUCCION.md (mismo lote).
 *
 * Endurecimiento exclusivo: SOLO REVOKE/GRANT (sin cambios de cuerpos, firmas,
 * triggers ni datos). Idempotente (bloques privilege-guarded).
 */
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm011-aplicar-migracion-20261111130000.mjs' });
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
async function q(sql) {
  const r = await mgmt(sql);
  if (!r.ok) { console.error('QUERY FAILED', r.status, r.text.slice(0, 300)); process.exit(4); }
  return JSON.parse(r.text);
}

const FILE = 'supabase/migrations/20261111130000_cp_data_integrity_trigger_acl_normalization.sql';
const sql = readFileSync(resolve(process.cwd(), FILE), 'utf8');
console.log(`SHA-256: ${createHash('sha256').update(sql).digest('hex')}`);
console.log(`Destino: PRODUCCIÓN (${ref})\n`);

// PRE-VUELO (read-only): las 4 funciones existen; ACL actual (esperado: anon/authenticated con EXECUTE)
const pre = await q(`SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('mark_po_items_on_po_delete','mark_po_items_on_product_delete','mark_rule_versions_on_rule_delete','mark_store_children_on_store_delete')
  ORDER BY p.proname`);
if (pre.length !== 4) { console.error('PRE-VUELO FALLÓ: se esperaban exactamente 4 helpers de trigger'); process.exit(2); }
for (const r of pre) console.log('PRE', r.proname, JSON.stringify({ anon: r.anon_exec, authenticated: r.auth_exec, service_role: r.svc_exec, public: r.pub_exec }));
const already = pre.every(r => r.anon_exec === false && r.auth_exec === false && r.svc_exec === true && r.pub_exec === false);

if (!already) {
  console.log(`\nAplicando ${FILE} a PRODUCCIÓN...`);
  const res = await mgmt(sql);
  console.log('HTTP', res.status);
  if (!res.ok) { console.error('FALLO DE APLICACIÓN:', res.text.slice(0, 2000)); process.exit(1); }
  console.log('resultado:', res.text.slice(0, 300) || '(sin filas)');
  const reload = await mgmt("NOTIFY pgrst, 'reload schema'");
  console.log('pgrst schema-cache reload: HTTP', reload.status);
} else {
  console.log('\nACL ya normalizada (idempotencia): solo verificación.');
}

// VERIFICACIÓN POST (read-only, fail-closed)
console.log('\n── VERIFICACIÓN POST ──');
const post = await q(`SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
  has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('mark_po_items_on_po_delete','mark_po_items_on_product_delete','mark_rule_versions_on_rule_delete','mark_store_children_on_store_delete')
  ORDER BY p.proname`);
let ok = true;
for (const r of post) {
  const pass = r.anon_exec === false && r.auth_exec === false && r.svc_exec === true && r.pub_exec === false;
  console.log(`  ${pass ? '✓' : '✗'} ${r.proname}: anon=${r.anon_exec} authenticated=${r.auth_exec} service_role=${r.svc_exec} public=${r.pub_exec}`);
  if (!pass) ok = false;
}
if (!ok || post.length !== 4) { console.error('VERIFICACIÓN POST FALLÓ'); process.exit(3); }
console.log('\nOK: 4 helpers de trigger con EXECUTE solo para service_role — endurecimiento aplicado y verificado.');
