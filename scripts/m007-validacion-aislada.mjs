/**
 * ADN-SERVICES-RECEIVED-HISTORICAL-SETTLEMENT-007 — ETAPA 3 (v2)
 * Validación del MECANISMO en la BD AISLADA (CostproE2E, ref lguovmvrozxgssupkwpf).
 * Lecciones v1:
 *  · CTE data-modifying NO ve efectos del INSERT en el mismo statement (snapshot)
 *    → pago y alineación de paid_at son statements SEPARADOS y secuenciales.
 *  · Deadlock transitorio en trigger de auditoría → retry con backoff.
 *  · Pre-limpieza de réplicas de corridas anteriores (idempotente).
 *
 * Uso: node scripts/m007-validacion-aislada.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const REPO = '/home/z/my-project/Costpro';
const OUT = '/home/z/my-project/scripts/out/007-liquidacion';
mkdirSync(OUT, { recursive: true });

const env = {};
for (const l of readFileSync(resolve(REPO, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const E2E_URL = env.E2E_SUPABASE_URL || 'https://lguovmvrozxgssupkwpf.supabase.co';
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = E2E_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];

assertNotProduction({ mode: 'write', url: E2E_URL, context: 'm007-validacion-aislada.mjs' });
if (ref !== 'lguovmvrozxgssupkwpf') {
  console.error('FALLO: destino no es el aislado'); process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mgmtRaw(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}
/** Retry ante deadlocks/timeouts transitorios (40P01/40001/40P03/570xx). */
async function mgmt(query, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await mgmtRaw(query);
    } catch (e) {
      const transient = /40P01|40001|40P03|570|deadlock|timeout/i.test(String(e.message));
      if (!transient || i === tries) throw e;
      console.log(`  (transitorio, reintento ${i}/${tries}: ${String(e.message).slice(0, 120)})`);
      await sleep(1500 * i);
    }
  }
}
const log = (...a) => console.log(...a);
const habanaNoon = (date) => `(DATE '${date}'::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Havana'`;

/* ── 0) Centinela + requisitos ── */
const sentinel = await mgmt(`SELECT public.e2e_is_isolated_db() AS ok;`);
if (sentinel[0].ok !== true) { console.error('FALLO: no es la BD aislada'); process.exit(3); }
log('centinela aislado: OK');

const reqs = await mgmt(`SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='register_supplier_payment'
      AND pg_get_function_arguments(p.oid) LIKE '%p_payment_date%') AS f_rpc_pago_fecha,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN
    ('received_services','payment_transactions','fin_entries','fin_movements')) = 4 AS t_ok;`);
if (!reqs[0].f_rpc_pago_fecha || !reqs[0].t_ok) {
  console.error('FALLO: aislado sin RPC/migraciones CP-FIN necesarias', reqs); process.exit(3);
}

const store = await mgmt(`SELECT id, name FROM stores ORDER BY created_at LIMIT 1;`);
const storeId = store[0].id;
log('tienda aislada:', store[0].name, storeId);

/* ── 1) PRE-LIMPIEZA de réplicas M007 anteriores (idempotencia de la validación) ── */
const pat = "SRV-20261119-990%";
await mgmt(`SELECT set_config('app.restore_mode', 'true', false);`);
await mgmt(`DELETE FROM payment_transactions WHERE ref_type='service' AND ref_id IN
  (SELECT id FROM received_services WHERE service_number LIKE '${pat}');`);
await mgmt(`DELETE FROM fin_movements WHERE entry_id IN (
  SELECT e.id FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO'
  AND e.document_id IN (SELECT id FROM received_services WHERE service_number LIKE '${pat}'));`);
await mgmt(`DELETE FROM fin_entries WHERE document_type='SERVICIO_RECIBIDO'
  AND document_id IN (SELECT id FROM received_services WHERE service_number LIKE '${pat}');`);
await mgmt(`DELETE FROM received_services WHERE service_number LIKE '${pat}';`);
await mgmt(`SELECT set_config('app.restore_mode', 'false', false);`);

const countsBefore = await mgmt(`SELECT
  (SELECT count(*) FROM received_services) AS srv,
  (SELECT count(*) FROM payment_transactions) AS pay,
  (SELECT count(*) FROM fin_entries) AS fin;`);
log('conteos antes:', JSON.stringify(countsBefore[0]));

/* ── 2) Réplicas ── */
const mkService = (num, date, amount) => `INSERT INTO received_services
  (store_id, service_number, service_date, service_type_name, supplier, currency,
   exchange_rate, total_amount, observations, status, payment_terms_days, due_date)
  VALUES ('${storeId}', '${num}', DATE '${date}', 'Comisión', 'Replica M007', 'CUP', 1, ${amount},
   'Réplica aislada M007', 'active', 1, DATE '${date}' + INTERVAL '1 day')
  RETURNING id, service_number;`;

await mgmt(mkService('SRV-20261119-99001', '2026-10-18', 100));
await mgmt(mkService('SRV-20261119-99002', '2026-10-27', 200));
await mgmt(mkService('SRV-20261119-99003', '2026-11-16', 300));
log('réplicas creadas: 99001/99002 (pendientes) + 99003 (caso 00139)');

/* ── 3) LIQUIDACIÓN HISTÓRICA: statement 1 = pago RPC; statement 2 = alinear paid_at ── */
async function liquidar(num, date) {
  const pid = await mgmt(`SELECT public.register_supplier_payment(
    p_store_id => '${storeId}',
    p_ref_type => 'service',
    p_ref_id => (SELECT id FROM received_services WHERE service_number='${num}'),
    p_amount => (SELECT total_amount FROM received_services WHERE service_number='${num}'),
    p_payment_method => 'cash',
    p_paid_by => NULL,
    p_currency => 'CUP',
    p_exchange_rate => 1,
    p_reference => 'M007 liquidación histórica',
    p_notes => 'Liquidación histórica — fecha de pago = fecha del servicio',
    p_idempotency_key => 'M007-${num}',
    p_payment_date => ${habanaNoon(date)}
  ) AS pid;`);
  const aligned = await mgmt(`UPDATE received_services rs
    SET paid_at = ${habanaNoon(date)}
    WHERE rs.service_number='${num}' AND rs.payment_status='paid'
      AND rs.paid_at IS DISTINCT FROM ${habanaNoon(date)}
    RETURNING rs.service_number, rs.payment_status, rs.paid_amount, rs.payment_method, rs.paid_at::text;`);
  return { pid: pid[0]?.pid, aligned: aligned[0] || null };
}
const liq1 = await liquidar('SRV-20261119-99001', '2026-10-18');
const liq2 = await liquidar('SRV-20261119-99002', '2026-10-27');
log('liquidación 99001:', JSON.stringify(liq1));
log('liquidación 99002:', JSON.stringify(liq2));

/* ── 4) CASO 00139 en réplica ── */
await mgmt(`SELECT public.register_supplier_payment(
  p_store_id => '${storeId}',
  p_ref_type => 'service',
  p_ref_id => (SELECT id FROM received_services WHERE service_number='SRV-20261119-99003'),
  p_amount => (SELECT total_amount FROM received_services WHERE service_number='SRV-20261119-99003'),
  p_payment_method => 'cash',
  p_paid_by => NULL,
  p_currency => 'CUP',
  p_exchange_rate => 1,
  p_reference => NULL, p_notes => NULL,
  p_idempotency_key => 'M007-SRV-20261119-99003',
  p_payment_date => ${habanaNoon('2026-11-16')});`);

const wrongState = await mgmt(`SELECT service_number, payment_status, paid_at::text FROM received_services WHERE service_number='SRV-20261119-99003';`);
log('estado erróneo replicado (paid_at=now):', JSON.stringify(wrongState));

// Corrección (orden real de producción): 1) payment_date del pago; 2) paid_at + observación
await mgmt(`UPDATE payment_transactions pt
  SET payment_date = ${habanaNoon('2026-11-17')}
  WHERE pt.ref_type='service'
    AND pt.ref_id = (SELECT id FROM received_services WHERE service_number='SRV-20261119-99003')
    AND pt.idempotency_key='M007-SRV-20261119-99003'
  RETURNING pt.id, pt.payment_date::text;`);

const obsBefore = wrongState[0] ? null : null; // obs de réplica se define abajo
const fix = await mgmt(`UPDATE received_services rs
  SET paid_at = ${habanaNoon('2026-11-17')},
      observations = CASE WHEN rs.observations LIKE '%Liquidado el 17/11/2026%'
        THEN rs.observations
        ELSE rs.observations || E'\\nPago de comisión del día 16/11/2026, que no se pagó ese día. Liquidado el 17/11/2026.' END
  WHERE rs.service_number='SRV-20261119-99003' AND rs.payment_status='paid'
  RETURNING rs.service_number, rs.paid_at::text, rs.observations;`);
log('corrección 00139-replica:', JSON.stringify(fix));

/* ── 5) Verificaciones ── */
const verif = await mgmt(`SELECT rs.service_number, rs.payment_status, rs.paid_amount, rs.payment_method,
  rs.paid_at::text AS paid_at,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
  (SELECT pt.payment_date::text FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id LIMIT 1) AS pago_fecha,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id) AS n_asientos,
  (SELECT string_agg(e.event || ':' || e.status || ':' || e.economic_date::text, ' | ' ORDER BY e.event)
     FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id) AS asientos
  FROM received_services rs WHERE rs.service_number LIKE 'SRV-20261119-990%' ORDER BY rs.service_number;`);
log('VERIFICACIÓN RÉPLICAS:');
for (const v of verif) log(JSON.stringify(v));

const bal = await mgmt(`SELECT rs.service_number, e.event, e.status,
  sum(m.amount_cup) FILTER (WHERE m.sense='debito') AS deb,
  sum(m.amount_cup) FILTER (WHERE m.sense='credito') AS cred
  FROM fin_entries e
  JOIN received_services rs ON rs.id = e.document_id
  JOIN fin_movements m ON m.entry_id = e.id
  WHERE e.document_type='SERVICIO_RECIBIDO' AND rs.service_number LIKE 'SRV-20261119-990%'
  GROUP BY rs.service_number, e.event, e.status ORDER BY rs.service_number, e.event;`);
log('BALANCE asientos réplicas:');
for (const b of bal) log(JSON.stringify(b));

/* ── 6) Limpieza + delta=0 ── */
await mgmt(`SELECT set_config('app.restore_mode', 'true', false);`);
await mgmt(`DELETE FROM payment_transactions WHERE ref_type='service' AND ref_id IN
  (SELECT id FROM received_services WHERE service_number LIKE 'SRV-20261119-990%');`);
await mgmt(`DELETE FROM fin_movements WHERE entry_id IN (
  SELECT e.id FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO'
  AND e.document_id IN (SELECT id FROM received_services WHERE service_number LIKE 'SRV-20261119-990%'));`);
await mgmt(`DELETE FROM fin_entries WHERE document_type='SERVICIO_RECIBIDO'
  AND document_id IN (SELECT id FROM received_services WHERE service_number LIKE 'SRV-20261119-990%');`);
await mgmt(`DELETE FROM received_services WHERE service_number LIKE 'SRV-20261119-990%';`);
await mgmt(`SELECT set_config('app.restore_mode', 'false', false);`);

const countsAfter = await mgmt(`SELECT
  (SELECT count(*) FROM received_services) AS srv,
  (SELECT count(*) FROM payment_transactions) AS pay,
  (SELECT count(*) FROM fin_entries) AS fin;`);
log('conteos después:', JSON.stringify(countsAfter[0]));
const clean = countsBefore[0].srv === countsAfter[0].srv
  && countsBefore[0].pay === countsAfter[0].pay
  && countsBefore[0].fin === countsAfter[0].fin;
log(clean ? 'LIMPIEZA OK — delta=0' : 'FALLO DE LIMPIEZA — revisar residuos');

writeFileSync(`${OUT}/validacion-aislada.json`, JSON.stringify({
  storeId, liq1, liq2, wrongState, fix, verif, bal, countsBefore, countsAfter, clean,
}, null, 2));

const okAll =
  liq1.aligned?.payment_status === 'paid' && liq2.aligned?.payment_status === 'paid' &&
  String(liq1.aligned?.paid_at).startsWith('2026-10-18') &&
  String(liq2.aligned?.paid_at).startsWith('2026-10-27') &&
  String(liq1.aligned?.payment_method) === 'cash' &&
  String(fix[0]?.paid_at).startsWith('2026-11-17') &&
  String(fix[0]?.observations).includes('Liquidado el 17/11/2026') &&
  clean;
log(okAll ? 'RESULTADO: VALIDACIÓN AISLADA PASS' : 'RESULTADO: VALIDACIÓN FALLIDA');
process.exit(okAll ? 0 : 1);
