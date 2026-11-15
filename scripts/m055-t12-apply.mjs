// ============================================================================
// M055 — CP-FIN-T12-PRODUCTION-MIGRATION-006 · APLICADOR DE LA MIGRACIÓN T12
// ============================================================================
// Aplica EXCLUSIVAMENTE supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql
// a producción (CostproBD, wthkddeleylijmonclxg) por el canal oficial
// (Management API, mecanismo 'management_api' del libro de migraciones).
//
// Controles fail-closed (todos obligatorios, en este orden):
//  1. Guard oficial CP-INFRA-019 (scripts/lib/assert-not-production.mjs) en modo
//     WRITE contra el ref real de la petición + doble flag del entorno:
//     ALLOW_PROD=read-only y ALLOW_PROD_WRITE=I_UNDERSTAND.
//  2. SHA-256 del archivo = hash aprobado en el manifiesto RECT005_SHA256SUMS.txt.
//  3. Pre-state (m054) existe y sus referencias §6 son las esperadas.
//  4. Ledger: 20261115100000 NO aplicada y última fila = 20261114190300
//     (re-chequeo EN EL MOMENTO de aplicar).
//  5. Un único POST con el contenido EXACTO del archivo (sin reescrituras).
//  6. NOTIFY pgrst 'reload schema' (patrón oficial apply-migration-mgmt.ts).
//  7. INSERT en public.production_migration_ledger (paso 2 del proceso oficial,
//     idempotente por guard previo).
//
// En caso de error: NO reintenta fragmentos, NO borra objetos, NO aplica
// migraciones inversas; guarda la evidencia y termina con exit 1.
//
// Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
//      node scripts/m055-t12-apply.mjs --aplicar [--solo-registrar]
// --solo-registrar: NO re-envía el SQL (ya aplicada y verificada por catálogo);
//   solo re-verifica objetos y completa el registro en el libro (paso 2).
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const APROBADO_SHA256 = '3429613c4bd26e33843be28b8174c336a785189330033433309bec6573e19481';
const MIG_PATH = 'supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql';
const EVID = 'docs/audits/cp-fin-t12-production-migration-006/';

const log = [];
const push = (s) => { console.log(s); log.push(s); };
// Variables de post-verificación (hoisted para que la evidencia siempre pueda escribirse)
let v1 = null, v2 = null, v3 = null, v4 = null, httpStatus = null, bodyText = '';
let soloRegistrar = process.argv.includes('--solo-registrar');

// ── 1. Flags y guard oficial ───────────────────────────────────────────────
if (!process.argv.includes('--aplicar')) {
  console.error('BLOQUEADO: falta el flag explícito --aplicar (intención inequívoca).'); process.exit(1);
}
if (process.env.ALLOW_PROD !== 'read-only' || process.env.ALLOW_PROD_WRITE !== 'I_UNDERSTAND') {
  console.error('BLOQUEADO: faltan los dobles flags ALLOW_PROD=read-only + ALLOW_PROD_WRITE=I_UNDERSTAND.'); process.exit(1);
}

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/(.*?)\.supabase\.co/)?.[1];
if (ref !== 'wthkddeleylijmonclxg') {
  console.error(`BLOQUEADO: NEXT_PUBLIC_SUPABASE_URL no resuelve producción (ref=${ref || 'vacío'}).`); process.exit(1);
}
// El guard recibe el ref EXACTO que usará la petición (identidad por construcción).
assertNotProduction({ mode: 'write', projectRef: ref, context: 'm055-t12-apply.mjs' });
push(`[GUARD] assertNotProduction PASÓ — destino identificado: ${ref} (CostproBD, PRODUCCIÓN).`);

// ── 2. SHA-256 del archivo aprobado ────────────────────────────────────────
const sql = readFileSync(resolve(process.cwd(), MIG_PATH), 'utf8');
const sha = createHash('sha256').update(sql).digest('hex');
if (sha !== APROBADO_SHA256) {
  console.error(`BLOQUEADO: SHA-256 del archivo (${sha}) ≠ aprobado (${APROBADO_SHA256}).`); process.exit(1);
}
push(`[SHA] ${MIG_PATH} = ${sha} — coincide con el manifiesto aprobado (RECT005_SHA256SUMS.txt).`);

// Marcas de las dos protecciones dentro del contenido EXACTO a aplicar
for (const marca of ['fin_entry_reversal_residual', 'ERR_PARTIAL_REVERSAL_PENDING',
  'fin_t12_receipt_annulment_block', 'BEFORE UPDATE OF status ON public.receipts']) {
  if (!sql.includes(marca)) { console.error(`BLOQUEADO: el archivo no contiene la marca esperada «${marca}».`); process.exit(1); }
}
push('[SQL] Contenido contiene las dos protecciones (motor + negocio). Sin reescrituras.');

// ── 3. Pre-state §6 ────────────────────────────────────────────────────────
const pre = JSON.parse(readFileSync(resolve('docs/audits/cp-fin-t12-production-migration-006/prestate-snapshot.json'), 'utf8'));
const fvc = pre.fvc_cabecera?.[0];
if (!fvc || fvc.status !== 'active' || Number(fvc.total_cost) !== 192039436) {
  console.error('BLOQUEADO: pre-state FVC no coincide (status/total).'); process.exit(1);
}
if (pre.fvc_lineas?.n !== 101) { console.error('BLOQUEADO: pre-state líneas ≠ 101.'); process.exit(1); }
if (pre.reversiones_asiento?.[0]?.n !== 0) { console.error('BLOQUEADO: pre-state reversiones ≠ 0.'); process.exit(1); }
if (Number(pre.cogs_ventas?.[0]?.total) !== 7) { console.error('BLOQUEADO: pre-state COGS ≠ 7.'); process.exit(1); }
push('[PRE-STATE] Referencias §6 congeladas y coincidentes (FVC activa 192.039.436; 101 líneas; 0 reversiones; COGS 7).');

async function q(sqlText, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sqlText }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] (HTTP ${res.status}) ${text.slice(0, 500)}`);
  return JSON.parse(text || '[]');
}

// ── 4. Ledger en el momento de aplicar ─────────────────────────────────────
const t12 = (await q(`SELECT count(*)::int AS n FROM public.production_migration_ledger WHERE version='20261115100000'`, 'ledger T12 pre-aplicación'))[0];
if (t12.n !== 0) { console.error(`BLOQUEADO: 20261115100000 ya figura en el ledger (filas=${t12.n}) — no re-aplicar.`); process.exit(1); }
const ultima = (await q(`SELECT version, status FROM public.production_migration_ledger ORDER BY applied_at DESC LIMIT 1`, 'ledger última pre'))[0];
if (ultima.version !== '20261114190300') {
  console.error(`BLOQUEADO: la última fila del ledger cambió (${ultima.version}) — historial divergió durante la misión. Detener y re-verificar.`); process.exit(1);
}
push(`[LEDGER] 20261115100000 no aplicada; última fila = ${ultima.version} (${ultima.status}). Única pendiente autorizada.`);

// ── 5. Aplicación: UN solo POST con el contenido EXACTO ────────────────────
const t0 = new Date().toISOString();
if (soloRegistrar) {
  push('[SOLO-REGISTRAR] NO se re-envía el SQL: aplicada previamente (HTTP 201) y verificada por catálogo. Solo re-verifica y completa el libro.');
} else {
  push(`[APLICANDO] ${t0} — POST Management API (transacción implícita única)…`);
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }) });
    httpStatus = res.status;
    bodyText = (await res.text()).slice(0, 4000);
  } catch (e) {
    console.error(`FALLO DE TRANSPORTE: ${e.message} — estado desconocido; NO reintentar fragmentos. Verificar catálogo.`);
    writeEvidence('TRANSPORT_ERROR', e.message); process.exit(1);
  }
  push(`[APLICADO] HTTP ${httpStatus} — respuesta: ${bodyText.slice(0, 300) || '(sin filas)'}`);
  // La Management API responde HTTP 201 (Created) con cuerpo [] en éxito sin filas.
  if (httpStatus !== 200 && httpStatus !== 201) {
    console.error('FALLO: la migración NO se aplicó (transacción implícita revertida por el servidor). NO ejecutar fragmentos sueltos.');
    writeEvidence('HTTP_ERROR', bodyText); process.exit(1);
  }
}

// ── 6. NOTIFY pgrst (patrón oficial) ─────────────────────────────────────
if (!soloRegistrar) {
  await q(`NOTIFY pgrst, 'reload schema'`, 'notify pgrst');
  push('[POSTGREST] Caché de esquema notificada (NOTIFY pgrst reload schema).');
}

// ── 7. Verificación mínima inmediata (catálogo) ────────────────────────────
v1 = (await q(`SELECT to_regprocedure('public.fin_entry_reversal_residual(uuid)') IS NOT NULL AS existe`, 'post residual'))[0];
v2 = (await q(`SELECT to_regprocedure('public.fin_t12_block_receipt_annulment()') IS NOT NULL AS existe`, 'post t12block'))[0];
v3 = (await q(`SELECT tgname, tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='receipts' AND t.tgname='fin_t12_receipt_annulment_block'`, 'post trigger'))[0];
v4 = (await q(`SELECT position('ERR_PARTIAL_REVERSAL_PENDING' in pg_get_functiondef('public.fin_post_document_annulment(text,uuid)'::regprocedure))::int AS pos`, 'post motor'))[0];
if (!v1.existe || !v2.existe || !v3 || v3.tgenabled === 'D' || !v4.pos) {
  console.error('FALLO POST-APLICACIÓN: objetos T12 incompletos — NO improvisar; conservar evidencia.');
  writeEvidence('POST_VERIFY_FAIL', JSON.stringify({ v1, v2, v3, v4 })); process.exit(1);
}
push('[POST] Motor redefine fin_post_document_annulment (ERR_PARTIAL_REVERSAL_PENDING presente), helper y función de trigger creados, trigger habilitado.');

// ── 8. Registro en el libro (paso 2 del proceso oficial) ───────────────────
const dup = (await q(`SELECT count(*)::int AS n FROM public.production_migration_ledger WHERE version='20261115100000'`, 'ledger pre-insert'))[0];
if (dup.n === 0) {
  await q(`INSERT INTO public.production_migration_ledger
    (version, file, sha256, mechanism, evidence, applied_by, status, notes)
   VALUES ('20261115100000', '${MIG_PATH}', '${sha}', 'management_api', '${EVID}', 'agent', 'applied',
    'CP-FIN-T12-PRODUCTION-MIGRATION-006: salvaguarda T12 (guard de reversión parcial). Autorización específica del propietario (misión 006). Una única migración aplicada por canal oficial; sin RECT-1/RECT-2 ni cambios de datos financieros.')`, 'ledger insert');
  push('[LEDGER] Fila insertada: 20261115100000 · management_api · applied · sha256 aprobado.');
} else {
  push('[LEDGER] La fila ya existía (no duplicar).');
}

writeEvidence('OK', null);
push('MIGRACIÓN T12 APLICADA Y REGISTRADA. Ejecutar m056 (certificación post).');

function writeEvidence(status, errDetail) {
  const ev = {
    mision: 'CP-FIN-T12-PRODUCTION-MIGRATION-006',
    script: 'm055-t12-apply.mjs',
    resultado: status,
    modo: soloRegistrar ? 'solo-registrar (SQL ya aplicado HTTP 201, verificado por catálogo; sin re-envío)' : 'aplicar (POST único del archivo exacto)',
    iniciado_utc: t0,
    finalizado_utc: new Date().toISOString(),
    destino: { proyecto_ref: ref, etiqueta: 'CostproBD (PRODUCCIÓN)', guard: 'assertNotProduction mode=write projectRef (CP-INFRA-019)' },
    flags_autorizacion: { ALLOW_PROD: 'read-only', ALLOW_PROD_WRITE: 'I_UNDERSTAND', cli: '--aplicar' },
    migracion: { archivo: MIG_PATH, sha256_aplicado: sha, sha256_aprobado: APROBADO_SHA256, bytes: sql.length },
    transporte: { canal: 'Management API POST /v1/projects/<ref>/database/query', http_status: httpStatus, transaccion_implicita_unica: true, respuesta: bodyText || null, nota: 'HTTP 201 con cuerpo [] = éxito sin filas en la Management API. La primera ejecución (12:23:15.983Z) clasificó 201 como fallo (falso negativo del script); el estado real fue verificado inmediatamente por catálogo en solo lectura: helper + fin_t12_block_receipt_annulment + motor presentes y trigger habilitado (tgenabled O). No se re-envió el SQL.' },
    error_detalle: errDetail || null,
    ledger: { version: '20261115100000', mechanism: 'management_api', applied_by: 'agent', status: 'applied', evidence_path: EVID },
    post_verificacion_inmediata: { helper_creado: v1?.existe ?? null, t12block_creado: v2?.existe ?? null, trigger: v3 || null, motor_marcador: v4 || null },
    declaraciones: {
      solo_esta_migracion: true,
      sin_fragmentos_manuales: true,
      sin_migracion_inversa: true,
      sin_RECT1_RECT2: true,
      sin_cambios_datos_financieros: true,
    },
    bitacora: log,
  };
  writeFileSync(resolve('docs/audits/cp-fin-t12-production-migration-006/MIGRATION_EXECUTION_EVIDENCE.json'), JSON.stringify(ev, null, 2));
  console.log('Evidencia: docs/audits/cp-fin-t12-production-migration-006/MIGRATION_EXECUTION_EVIDENCE.json');
}
