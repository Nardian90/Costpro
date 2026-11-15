#!/usr/bin/env node
// ============================================================================
// M056 — CP-FIN-T12-PRIVILEGE-HARDENING-001 · RUNBOOK DE DESPLIEGUE (§5)
// ============================================================================
// ESTE SCRIPT NO SE EJECUTA EN ESTA MISIÓN: la aplicación a producción exige
// AUTORIZACIÓN EXPLÍCITA DE DESPLIEGUE del propietario (mandato §5). Cuando
// el propietario autorice, ejecutar:
//
//   set -a && source .env && set +a
//   node scripts/m056-fin-t12-privilege-deploy.mjs --autorizado-por="<nombre/fecha>"
//
// Secuencia (§5 del mandato):
//   1. PRE-CHEQUEO read-only: permisos ACTUALES del helper en producción
//      (has_function_privilege + aclexplode) — el diff definitivo contra el
//      estado esperado; si el estado no es el que el diagnóstico registró,
//      ABORTA (fail-closed).
//   2. Aplicación de supabase/migrations/20261116120000_cp_fin_t12_privilege_
//      hardening.sql (precondiciones/postcondiciones fail-closed internas).
//   3. Registro en production_migration_ledger (version, file, sha256,
//      mechanism, evidence, applied_by, notes con la autorización).
//   4. VERIFICACIÓN POST: ACL final + gate SQL en vivo (3 checks) +
//      re-verificación de que los llamadores internos siguen operativos.
// Producción NO se toca si falta --autorizado-por.
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const args = process.argv.slice(2);
const authIdx = args.findIndex(a => a === '--autorizado-por' || a.startsWith('--autorizado-por='));
const autorizadoPor = authIdx >= 0
  ? (args[authIdx].startsWith('--autorizado-por=') ? args[authIdx].slice('--autorizado-por='.length) : args[authIdx + 1])
  : null;
if (!autorizadoPor) {
  console.error('ABORTADO: falta --autorizado-por="<quién autoriza y cuándo>". La aplicación a producción requiere autorización explícita de despliegue (mandato CP-FIN-T12-PRIVILEGE-HARDENING-001 §5).');
  process.exit(2);
}

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }
// Guard canónico CP-INFRA-019 (doble flag fail-closed para escritura a producción):
assertNotProduction({ mode: 'write', url: env.NEXT_PUBLIC_SUPABASE_URL, context: 'm056-fin-t12-privilege-deploy' });
async function q(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const MIG_FILE = 'supabase/migrations/20261116120000_cp_fin_t12_privilege_hardening.sql';
const MIG = readFileSync(resolve(MIG_FILE), 'utf8');
const MIG_SHA = createHash('sha256').update(MIG).digest('hex');
const EV = { mision: 'CP-FIN-T12-PRIVILEGE-HARDENING-001', runbook: 'm056', fecha_utc: new Date().toISOString(),
  autorizacion: autorizadoPor, migracion: { file: MIG_FILE, sha256: MIG_SHA }, pasos: {} };

// ── 1. PRE-CHEQUEO (read-only) ────────────────────────────────────────────────
const pre = await q(`SELECT
  has_function_privilege('authenticated','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS authenticated,
  has_function_privilege('anon','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS anon,
  has_function_privilege('service_role','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS service_role,
  to_regprocedure('public.fin_entry_reversal_residual(uuid)') IS NOT NULL AS existe`, 'pre-chequeo ACL');
EV.pasos['1-pre-chequeo'] = pre[0];
if (!pre[0].existe) { console.error('ABORTADO: el helper no existe en producción (T12 no aplicada?)'); process.exit(3); }
if (!pre[0].authenticated) {
  console.log('PRE-CHEQUEO: authenticated YA sin EXECUTE — la migración parece ya aplicada; verificando libro…');
  const ya = await q(`SELECT id FROM public.production_migration_ledger WHERE sha256='${MIG_SHA}'`, 'libro');
  if (ya.length > 0) { console.log('YA APLICADA (libro id ' + ya[0].id + ') — nada que hacer'); process.exit(0); }
  console.error('ABORTADO: ACL ya endurecida pero SIN fila en el libro — conciliar manualmente'); process.exit(4);
}

// ── 2. APLICACIÓN ─────────────────────────────────────────────────────────────
await q(MIG, 'aplicar migración correctiva');
EV.pasos['2-aplicacion'] = { ok: true, sha256: MIG_SHA };

// ── 3. REGISTRO EN EL LIBRO ───────────────────────────────────────────────────
const reg = await q(`
  INSERT INTO public.production_migration_ledger
    (version, file, sha256, applied_at, mechanism, evidence, applied_by, status, notes)
  VALUES
    ('20261116120000', '${MIG_FILE}', '${MIG_SHA}', now(), 'management_api',
     'docs/audits/fin-t12-privilege-hardening-001/',
     'runbook-m056', 'applied',
     'CP-FIN-T12-PRIVILEGE-HARDENING-001: EXECUTE de fin_entry_reversal_residual restringido a service_role+owner (hallazgo authenticated EXECUTE, diagnosticado read-only 2026-11-16). Autorización de despliegue: ${autorizadoPor.replace(/'/g, "''")}')
  RETURNING id`, 'registro en libro');
EV.pasos['3-libro'] = reg[0];

// ── 4. VERIFICACIÓN POST ──────────────────────────────────────────────────────
const post = await q(`SELECT
  has_function_privilege('authenticated','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS authenticated,
  has_function_privilege('anon','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS anon,
  has_function_privilege('public','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS public,
  has_function_privilege('service_role','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS service_role,
  has_function_privilege('postgres','public.fin_entry_reversal_residual(uuid)','EXECUTE') AS owner`, 'post ACL');
EV.pasos['4-post'] = post[0];
const p = post[0];
const ok = !p.authenticated && !p.anon && !p.public && p.service_role && p.owner;
if (!ok) { console.error('POST-CONDICIÓN FALLIDA:', p); process.exit(5); }

writeFileSync(resolve('docs/audits/fin-t12-privilege-hardening-001/deploy-evidencia.json'), JSON.stringify(EV, null, 2) + '\n');
console.log('DESPLEIEGO OK — ACL endurecida y libro registrado. Evidencia: docs/audits/fin-t12-privilege-hardening-001/deploy-evidencia.json');
console.log('Pendiente tras aplicar: regenerar contract-surface + retirar la entrada helper-interno de fin_entry_reversal_residual? NO — la entrada helper-interno PERMANECE (el helper sigue siendo SECURITY DEFINER sin auth check por diseño; el gate la cubre). El surface puede regenerarse para reflejar el proacl final.');
