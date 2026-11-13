#!/usr/bin/env node
/**
 * FIX dry-run v3 — VALIDACIÓN EN BD AISLADA del espejo de pagos
 * (rama fix/fin-dryrun-espejo-pagos-20261114).
 *
 * Ejecuta contra la BD E2E AISLADA (lguovmvrozxgssupkwpf — JAMÁS producción):
 *   1. Crea un SERVICIO_RECIBIDO (CUP, 100,00) y su PAGO posterior (cash, CUP,
 *      100,00) con documentos reales → los triggers del motor CP-FIN
 *      contabilizan reconocimiento y pago DE VERDAD (fin_entries/fin_movements).
 *   2. Verifica TRES niveles coinciden:
 *      a) ESPEJO del dry-run v3 (PAGOS_SIM_SQL de fin-backfill-dryrun.mjs):
 *         pago → D PAS_SERV_PEND / C ACT_EFECTIVO_CUP, importe amount_cup;
 *      b) REGLA ACTIVA (fin_rule_versions): evento pago del doc service debita
 *         PAS_SERV_PEND (post-m015);
 *      c) ASIENTO REAL insertado por el motor (fin_movements del entry con
 *         payment_ref): mismas categorías/sentidos/importes.
 *      → v2 habría reportado PAS_CXP_PROV (defecto reparado).
 *   3. Limpieza TOTAL (net delta 0): borra TODO lo creado (asientos incluidos)
 *      y verifica conteos idénticos al snapshot inicial.
 *
 * Uso: ALLOW_PROD=read-only node scripts/validar-fix-dryrun-pagos.mjs
 * (ALLOW_PROD=read-only es necesario para importar el módulo del dry-run,
 *  cuyo guard CP-INFRA-019 se evalúa en la carga; este script NO escribe
 *  producción: su único destino de escritura es la ref aislada del guard.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// GUARD CANÓNICO (CP-INFRA-019): destino de escritura = BD E2E aislada,
// verificado ANTES de cualquier operación (mismo patrón que validar-fix-17-1).
import { assertNotProduction } from './lib/assert-not-production.mjs';
import { PAGOS_SIM_SQL } from './fin-backfill-dryrun.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'lguovmvrozxgssupkwpf'; // BD E2E aislada — verificada por el guard
assertNotProduction({ mode: 'write', projectRef: REF, context: 'validar-fix-dryrun-pagos.mjs' });

const E = process.env;
if (!E.SUPABASE_ACCESS_TOKEN) {
  const envFile = readFileSync(`${REPO}/.env`, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !E[m[1]]) E[m[1]] = m[2].trim();
  }
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${E.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2500)); return sql(query); }
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 800)}`);
  return JSON.parse(text || '[]');
}

const N = v => Number(v ?? 0);
const r2 = v => Math.round(N(v) * 100) / 100;
let FALLAS = 0;
const chk = (nombre, ok, detalle = '') => {
  if (!ok) FALLAS++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} · ${nombre}${detalle ? ' — ' + detalle : ''}`);
};

console.log('════ VALIDACIÓN FIX DRY-RUN v3 (ESPEJO DE PAGOS) · BD AISLADA ' + REF + ' ════');
console.log('Hora:', new Date().toISOString());

const store = (await sql(`SELECT id, name FROM public.stores ORDER BY created_at LIMIT 1`))[0];
if (!store) { console.error('FATAL: sin tiendas en la BD aislada'); process.exit(1); }
console.log('Tienda de prueba:', store.name, store.id);

// pre-limpieza de residuos de ejecuciones interrumpidas (idempotente).
// PT007 prohíbe DELETE de payment_transactions (by design) → se usa el patrón
// canónico del repo (validar-fix-17-1): deshabilitar SOLO el trigger de
// invariantes DENTRO de una transacción y reactivarlo antes del COMMIT.
await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries e WHERE e.document_id IN
       (SELECT id FROM public.received_services WHERE service_number LIKE 'TEST-FIXDRY3-%')
       OR e.payment_ref IN (SELECT pt.id FROM public.payment_transactions pt
          WHERE pt.reference = 'validacion-fix-dryrun-v3'));
  DELETE FROM public.fin_entries WHERE document_id IN
       (SELECT id FROM public.received_services WHERE service_number LIKE 'TEST-FIXDRY3-%')
    OR payment_ref IN (SELECT pt.id FROM public.payment_transactions pt
       WHERE pt.reference = 'validacion-fix-dryrun-v3');
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE reference = 'validacion-fix-dryrun-v3';
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.received_services WHERE service_number LIKE 'TEST-FIXDRY3-%';
  DELETE FROM public.fin_posting_errors WHERE document_id IN
    (SELECT id FROM public.received_services WHERE service_number LIKE 'TEST-FIXDRY3-%');
  COMMIT;`);

// ── 0. pre-limpieza (auto-reparable) + snapshot del estado limpio ─────────────────────────────
const snap = (await sql(`SELECT
  (SELECT count(*)::int FROM public.received_services) AS servicios,
  (SELECT count(*)::int FROM public.payment_transactions) AS pagos,
  (SELECT count(*)::int FROM public.fin_entries) AS entries,
  (SELECT count(*)::int FROM public.fin_movements) AS movements,
  (SELECT count(*)::int FROM public.fin_posting_errors) AS errors`))[0];
console.log('Snapshot ANTES:', JSON.stringify(snap));

// ── 1. regla activa (nivel b) ───────────────────────────────────────────────
const regla = (await sql(`SELECT rv.movements FROM public.fin_rule_versions rv
  WHERE rv.document_type='SERVICIO_RECIBIDO' AND rv.status='active' AND rv.store_id IS NULL
  ORDER BY rv.version DESC LIMIT 1`))[0];
const pagoRule = (regla?.movements || []).filter(m => m.evento === 'pago');
const pasDebitRule = pagoRule.find(m => m.sentido === 'debito' && m.categoria === 'PAS_SERV_PEND');
chk('Regla activa SERVICIO_RECIBIDO: evento pago debita PAS_SERV_PEND', !!pasDebitRule,
  JSON.stringify(pagoRule.map(m => `${m.categoria}:${m.sentido}`)));

// ── 2. crear servicio + pago (documentos reales) ────────────────────────────
const SVC_NUM = 'TEST-FIXDRY3-' + Date.now();
const svc = (await sql(`INSERT INTO public.received_services
  (store_id, service_number, service_date, service_type_name, supplier, reference_doc, currency, exchange_rate, total_amount, status, observations)
  VALUES ('${store.id}', '${SVC_NUM}', CURRENT_DATE, 'Prueba validación espejo', 'Proveedor Prueba FixDRY3', 'REF-FIXDRY3',
   'CUP', 1, 100.00, 'active',
   'VALIDACIÓN fix/fin-dryrun-espejo-pagos-20261114 — se elimina al final')
  RETURNING id`))[0].id;
// amount_cup es columna GENERADA (amount×tasa) → no se inserta
const pay = (await sql(`INSERT INTO public.payment_transactions
  (store_id, ref_type, ref_id, amount, payment_method, currency, exchange_rate, direction, payment_date, reference)
  VALUES ('${store.id}', 'service', '${svc}', 100.00, 'cash', 'CUP', 1, 'in', now(),
   'validacion-fix-dryrun-v3')
  RETURNING id`))[0].id;
console.log('Creados: servicio', SVC_NUM, svc, '| pago', pay);

// ── 3. verificaciones (niveles a/c) ────────────────────────────────────────
// El INSERT del pago dispara el trigger → el asiento REAL se crea ya. Se lee
// el asiento REAL contabilizado (nivel c), se guardan sus movimientos y luego
// se ELIMINAN los asientos para que el pago vuelva al estado «sin asiento»
// que el dry-run simula (en producción fin_entries=0); entonces el ESPEJO
// (PAGOS_SIM_SQL) debe reproducir EXACTAMENTE los movimientos reales.
const entry = (await sql(`SELECT e.id, e.event, e.payment_ref FROM public.fin_entries e
  WHERE e.payment_ref = '${pay}' AND e.document_type='SERVICIO_RECIBIDO' AND e.event='pago' LIMIT 1`))[0];
chk('El motor contabilizó el asiento de pago (trigger fin_trg_payment_transactions)', !!entry);
let reales = [];
if (entry) {
  const movs = await sql(`SELECT m.category_code, m.sense, m.amount FROM public.fin_movements m WHERE m.entry_id='${entry.id}'`);
  reales = movs.map(m => ({ categoria: m.category_code, sentido: m.sense, importe: N(m.amount) }));
  chk('Asiento REAL: débito PAS_SERV_PEND 100,00',
    reales.some(m => m.categoria === 'PAS_SERV_PEND' && m.sentido === 'debito' && Math.abs(m.importe - 100) <= 0.01),
    JSON.stringify(reales));
  chk('Asiento REAL: crédito ACT_EFECTIVO_CUP 100,00',
    reales.some(m => m.categoria === 'ACT_EFECTIVO_CUP' && m.sentido === 'credito' && Math.abs(m.importe - 100) <= 0.01));
  const dR = r2(reales.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.importe, 0));
  const cR = r2(reales.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.importe, 0));
  chk('Asiento REAL equilibrado', Math.abs(dR - cR) <= 0.01, `D=${dR} C=${cR}`);
}
const entryRec = (await sql(`SELECT e.id FROM public.fin_entries e
  WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id='${svc}' AND e.event='reconocimiento' LIMIT 1`))[0];
chk('El motor contabilizó el reconocimiento (GAS_SERVICIOS D / PAS_SERV_PEND C)', !!entryRec);
if (entryRec) {
  const movs = await sql(`SELECT m.category_code, m.sense, m.amount FROM public.fin_movements m WHERE m.entry_id='${entryRec.id}'`);
  chk('Reconocimiento: crédito PAS_SERV_PEND (misma cuenta que el pago debita)',
    movs.some(m => m.category_code === 'PAS_SERV_PEND' && m.sense === 'credito' && Math.abs(N(m.amount) - 100) <= 0.01));
}

// eliminar los asientos reales → el pago queda «sin asiento» (estado dry-run)
await sql(`DELETE FROM public.fin_movements WHERE entry_id IN
  (SELECT id FROM public.fin_entries WHERE document_id='${svc}' OR payment_ref='${pay}')`);
await sql(`DELETE FROM public.fin_entries WHERE document_id='${svc}' OR payment_ref='${pay}'`);

// a) ESPEJO del dry-run v3 sobre el pago creado (ahora pendiente de asiento)
const simRows = (await sql(PAGOS_SIM_SQL)).filter(p => p.pago_id === pay);
chk('Espejo dry-run v3 (PAGOS_SIM_SQL) incluye el pago creado', simRows.length === 1);
const simMovs = (simRows[0]?.movimientos || []).map(m => ({ categoria: m.categoria, sentido: m.sentido, importe: N(m.amount) }));
chk('Espejo: débito PAS_SERV_PEND por el importe del pago',
  simMovs.some(m => m.categoria === 'PAS_SERV_PEND' && m.sentido === 'debito' && Math.abs(m.importe - 100) <= 0.01),
  JSON.stringify(simMovs));
chk('Espejo: crédito ACT_EFECTIVO_CUP por el importe del pago',
  simMovs.some(m => m.categoria === 'ACT_EFECTIVO_CUP' && m.sentido === 'credito' && Math.abs(m.importe - 100) <= 0.01));
const dSim = r2(simMovs.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.importe, 0));
const cSim = r2(simMovs.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.importe, 0));
chk('Espejo: asiento de pago equilibrado (D=C)', Math.abs(dSim - cSim) <= 0.01, `D=${dSim} C=${cSim}`);
chk('Espejo: NO reporta PAS_CXP_PROV en el pago de un servicio',
  !simMovs.some(m => m.categoria === 'PAS_CXP_PROV'), 'v2 habría puesto PAS_CXP_PROV aquí');
chk('Espejo == ASIENTO REAL contabilizado por el motor (mismas categorías/sentidos/importes)',
  JSON.stringify(simMovs) === JSON.stringify(reales), `espejo=${JSON.stringify(simMovs)} real=${JSON.stringify(reales)}`);
chk('Espejo == REGLA ACTIVA (PAS_SERV_PEND débito en evento pago)',
  !!pasDebitRule && simMovs.some(m => m.categoria === 'PAS_SERV_PEND' && m.sentido === 'debito'));

// ── 4. limpieza total (net delta 0) ──────────────────────────────────────────
await sql(`BEGIN;
  DELETE FROM public.fin_movements WHERE entry_id IN
    (SELECT id FROM public.fin_entries WHERE document_id='${svc}' OR payment_ref='${pay}');
  DELETE FROM public.fin_entries WHERE document_id='${svc}' OR payment_ref='${pay}';
  DELETE FROM public.fin_posting_errors WHERE document_id='${svc}';
  ALTER TABLE public.payment_transactions DISABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.payment_transactions WHERE id='${pay}';
  ALTER TABLE public.payment_transactions ENABLE TRIGGER trg_validate_payment_invariants;
  DELETE FROM public.received_services WHERE id='${svc}';
  COMMIT;`);

const fin = (await sql(`SELECT
  (SELECT count(*)::int FROM public.received_services) AS servicios,
  (SELECT count(*)::int FROM public.payment_transactions) AS pagos,
  (SELECT count(*)::int FROM public.fin_entries) AS entries,
  (SELECT count(*)::int FROM public.fin_movements) AS movements,
  (SELECT count(*)::int FROM public.fin_posting_errors) AS errors`))[0];
console.log('Snapshot DESPUÉS:', JSON.stringify(fin));
const net0 = JSON.stringify(snap) === JSON.stringify(fin);
chk('NET DELTA 0 (limpieza total)', net0, 'antes=' + JSON.stringify(snap) + ' después=' + JSON.stringify(fin));

console.log('\n════ RESULTADO: ' + (FALLAS === 0 && net0 ? 'PASS TOTAL (espejo==regla==motor==asiento real)' : 'FAIL: ' + FALLAS + ' comprobaciones') + ' ════');
process.exit(FALLAS === 0 && net0 ? 0 : 1);
