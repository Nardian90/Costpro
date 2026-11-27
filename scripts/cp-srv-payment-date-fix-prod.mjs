#!/usr/bin/env node
/**
 * cp-srv-payment-date-fix-prod.mjs — MISIÓN COSTPRO-SRV-PAYMENT-DATE-AND-DELIVERY-REPORT-FILTERS-001
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * FASE 1 · corrección de FECHA DE PAGO de 2 servicios recibidos de la tienda
 * ENERVIDA-VITALLCONS (proveedor Tienda Pueblo), UNA SOLA VEZ (§11g), por el
 * canal gobernado (patrón cpbra-tp-apply-prod.mjs):
 *
 *   · guard scripts/lib/assert-not-production.mjs con doble flag explícito;
 *   · verificación PREVIA de precondiciones EXACTAS (si ya está corregido,
 *     se SALTA — idempotente);
 *   · UPDATE dirigido y acotado (por id + ref_type + valor previo esperado);
 *   · verificación post-aplicación re-ejecutable (--check).
 *
 * Alcance EXCLUSIVO (no hay actualización masiva):
 *   payment_transactions 9dec69da-… (SRV-20261126-00152, 10,200 CUP)
 *   payment_transactions 8796e6ee-… (SRV-20261126-00153,  8,300 CUP)
 *   received_services    d7c398fc-… (SRV-20261126-00152) → paid_at
 *   received_services    c36d86f0-… (SRV-20261126-00153) → paid_at
 *
 * Valor nuevo: '2026-11-26T17:00:00.000Z' = mediodía Habana (EST, UTC−5) del
 * día de negocio 2026-11-26 — dentro de businessDayWindow('2026-11-26')
 * [2026-11-26T05:00Z, 2026-11-27T04:59:59.999Z], convención «mediodía Habana»
 * (movement-types.ts). No toca asientos fin_entries (economic_date ya es
 * 2026-11-26); no toca importes, estados, códigos, ni otros registros.
 *
 * NOTA de honestidad: la misión textual dice «27/07/2026 → 26/07/2026»; los
 * valores REALES en BD son 27/11/2026 (noviembre) — typo de mes confirmado
 * por service_date=2026-11-26, due_date=2026-12-26 y fin_entries
 * economic_date=2026-11-26. El objetivo corregido es 26/11/2026.
 *
 *   Check producción: node scripts/cp-srv-payment-date-fix-prod.mjs --check
 *   Aplicación:       ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND \
 *                     node scripts/cp-srv-payment-date-fix-prod.mjs
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Alcance exacto y valores esperados (pre-estado verificado 2026-11-27) ──
const TXS = [
  { id: '9dec69da-e47c-4106-a779-45e8f27d2e94', ref_id: 'd7c398fc-414d-4eab-9da0-aad1fb2651c8', srv: 'SRV-20261126-00152', old: '2026-11-27T17:54:42.425389+00:00' },
  { id: '8796e6ee-11fb-4cf5-88fc-dbfd58ef8d00', ref_id: 'c36d86f0-cc19-4a88-818d-c81a988752d1', srv: 'SRV-20261126-00153', old: '2026-11-27T17:56:25.892736+00:00' },
];
const SRV = [
  { id: 'd7c398fc-414d-4eab-9da0-aad1fb2651c8', srv: 'SRV-20261126-00152' },
  { id: 'c36d86f0-cc19-4a88-818d-c81a988752d1', srv: 'SRV-20261126-00153' },
];
const NEW_TS = '2026-11-26T17:00:00+00:00'; // mediodía Habana (EST) del 26/11/2026

if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido.'); process.exit(2); }
const checkOnly = process.argv.includes('--check');
assertNotProduction({ mode: checkOnly ? 'read' : 'write', projectRef: PROD_REF, context: 'cp-srv-payment-date-fix-prod.mjs' });

const apiBase = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`;
async function runSql(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function fmt(r) { return JSON.stringify(r); }

// ── 1) PRE-estado ──────────────────────────────────────────────────────────
const txIds = TXS.map(t => `'${t.id}'`).join(',');
const srvIds = SRV.map(s => `'${s.id}'`).join(',');
const preTx = await runSql(`SELECT id, ref_id, amount, currency, payment_date, payment_method, created_at FROM payment_transactions WHERE id IN (${txIds}) ORDER BY id;`);
const preSrv = await runSql(`SELECT id, service_number, service_date, total_amount, status, payment_status, paid_amount, paid_at, due_date FROM received_services WHERE id IN (${srvIds}) ORDER BY id;`);
console.log('[PRE] payment_transactions:');
preTx.forEach(r => console.log('  ' + fmt(r)));
console.log('[PRE] received_services:');
preSrv.forEach(r => console.log('  ' + fmt(r)));

// Conciliación de alcance: los ref_id deben coincidir con los servicios.
for (const t of preTx) {
  if (!SRV.some(s => s.id === t.ref_id)) {
    console.error(`FALLO de alcance: pago ${t.id} ref_id=${t.ref_id} no pertenece al alcance autorizado.`); process.exit(3);
  }
}
if (preTx.length !== TXS.length) { console.error(`FALLO: se esperaban ${TXS.length} pagos, hay ${preTx.length}.`); process.exit(3); }

// ── 2) ¿Ya está corregido? (idempotencia) ─────────────────────────────────
const already = preTx.every(r => new Date(r.payment_date).toISOString() === new Date(NEW_TS).toISOString());
const srvAlready = preSrv.every(r => r.paid_at && new Date(r.paid_at).toISOString() === new Date(NEW_TS).toISOString());
if (checkOnly) {
  if (already && srvAlready) {
    console.log('\n[CHECK] YA CORREGIDO — payment_date y paid_at = ' + NEW_TS + ' (26/11/2026 mediodía Habana).');
  } else {
    console.log('\n[CHECK] PENDIENTE de corrección — payment_date actual ≠ ' + NEW_TS);
  }
  console.log('[CHECK] Asientos fin_entries (solo lectura, no se modifican):');
  const fin = await runSql(`SELECT document_number, event, payment_ref, economic_date, status FROM fin_entries WHERE document_type='SERVICIO_RECIBIDO' AND document_id IN (${srvIds}) ORDER BY document_number, event;`);
  fin.forEach(r => console.log('  ' + fmt(r)));
  process.exit(0);
}

if (already && srvAlready) {
  console.log('\nYA CORREGIDO — nada que hacer (idempotencia §11e).');
  process.exit(0);
}

// Precondiciones EXACTAS: los valores previos deben coincidir con lo registrado.
for (const t of TXS) {
  const row = preTx.find(r => r.id === t.id);
  if (!row) { console.error(`FALLO: pago ${t.id} no encontrado.`); process.exit(3); }
  if (new Date(row.payment_date).toISOString() !== new Date(t.old).toISOString()) {
    console.error(`FALLO precondición: pago ${t.srv} payment_date=${row.payment_date} ≠ esperado ${t.old}. El estado cambió — NO se actualiza (revisar manualmente).`);
    process.exit(3);
  }
  if (Number(row.amount) !== (t.srv === 'SRV-20261126-00152' ? 10200 : 8300) || row.currency !== 'CUP') {
    console.error(`FALLO precondición: importe/moneda del pago ${t.srv} inesperados (${row.amount} ${row.currency}).`);
    process.exit(3);
  }
}

console.log('\n[APPLY] UPDATE payment_transactions (2 filas, valor previo verificado en WHERE)...');
const updTx = await runSql(`
  UPDATE payment_transactions
     SET payment_date = TIMESTAMPTZ '${NEW_TS}', updated_at = now()
   WHERE id IN (${txIds})
     AND ref_type = 'service'
     AND payment_date IN ('${TXS.map(t => t.old).join("','")}')
  RETURNING id, payment_date;`);
console.log('  filas actualizadas:', updTx.length, updTx.map(r => r.id.slice(0, 8)).join(', '));
if (updTx.length !== TXS.length) { console.error('FALLO: no se actualizaron todas las filas de pago.'); process.exit(4); }

console.log('[APPLY] UPDATE received_services.paid_at (2 filas; el trigger trg_update_payment_status pudo estampar now() al actualizar los pagos — se normaliza AHORA al valor canónico)...');
const updSrv = await runSql(`
  UPDATE received_services
     SET paid_at = TIMESTAMPTZ '${NEW_TS}', updated_at = now()
   WHERE id IN (${srvIds})
  RETURNING id, service_number, paid_at;`);
console.log('  filas actualizadas:', updSrv.length, updSrv.map(r => r.service_number).join(', '));
if (updSrv.length !== SRV.length) { console.error('FALLO: no se actualizaron todas las filas de servicio.'); process.exit(4); }

// ── 3) POST-estado + conciliación ──────────────────────────────────────────
const postTx = await runSql(`SELECT id, payment_date FROM payment_transactions WHERE id IN (${txIds}) ORDER BY id;`);
const postSrv = await runSql(`SELECT id, service_number, paid_at, payment_status, paid_amount, total_amount, status, service_date, due_date FROM received_services WHERE id IN (${srvIds}) ORDER BY id;`);
console.log('\n[POST] payment_transactions:');
postTx.forEach(r => console.log('  ' + fmt(r)));
console.log('[POST] received_services:');
postSrv.forEach(r => console.log('  ' + fmt(r)));

const okTx = postTx.every(r => new Date(r.payment_date).toISOString() === new Date(NEW_TS).toISOString());
const okSrv = postSrv.every(r => new Date(r.paid_at).toISOString() === new Date(NEW_TS).toISOString()
  && r.payment_status === 'paid' && r.status === 'active'
  && r.service_date === '2026-11-26' && r.due_date === '2026-12-26'
  && ((r.service_number === 'SRV-20261126-00152' && Number(r.total_amount) === 10200 && Number(r.paid_amount) === 10200)
   || (r.service_number === 'SRV-20261126-00153' && Number(r.total_amount) === 8300 && Number(r.paid_amount) === 8300)));
console.log(`\n[VERIFICACIÓN] payment_date 26/11: ${okTx ? 'OK' : 'FALLO'} · paid_at 26/11 + integridad (estados/importes/fechas intactos): ${okSrv ? 'OK' : 'FALLO'}`);
if (!okTx || !okSrv) process.exit(5);
console.log('CORRECCIÓN APLICADA Y VERIFICADA — fecha de pago = 26/11/2026 (mediodía Habana). Resto de campos intactos.');
