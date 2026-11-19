/**
 * ADN-SERVICES-RECEIVED-HISTORICAL-SETTLEMENT-007 — ETAPA 5: CONCILIACIÓN OBLIGATORIA (§5)
 * Read-only, repetible. Guard: ALLOW_PROD=read-only.
 * Uso: ALLOW_PROD=read-only node scripts/m007-conciliacion.mjs
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read', url: SUPABASE_URL, context: 'm007-conciliacion.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO: destino no es producción'); process.exit(2); }

async function mgmt(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const log = (...a) => console.log(...a);
const NUMS = ['SRV-20261010-00095','SRV-20261016-00096','SRV-20261017-00097','SRV-20261018-00098',
  'SRV-20261019-00099','SRV-20261020-00100','SRV-20261021-00101','SRV-20261022-00102',
  'SRV-20261023-00103','SRV-20261024-00104','SRV-20261025-00105','SRV-20261026-00106',
  'SRV-20261027-00107','SRV-20261028-00108','SRV-20261029-00109','SRV-20261030-00110',
  'SRV-20261031-00111','SRV-20261102-00112','SRV-20261103-00113','SRV-20261104-00114',
  'SRV-20261116-00139'];
const list = NUMS.map((n) => `'${n}'`).join(',');

const out = {};

/* C1 — documento ↔ pago ↔ asiento por identificador (conciliación por fila) */
out.conciliacion = await mgmt(`SELECT rs.service_number, rs.service_date::text, rs.payment_status,
  rs.paid_amount, rs.payment_method, rs.paid_at::date AS fecha_liquidacion,
  (rs.paid_at AT TIME ZONE 'America/Havana')::date AS fecha_liquidacion_habana,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
  (SELECT pt.id::text FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id ORDER BY pt.payment_date LIMIT 1) AS pago_id,
  (SELECT (pt.payment_date AT TIME ZONE 'America/Havana')::date FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id ORDER BY pt.payment_date LIMIT 1) AS pago_fecha_habana,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago' AND e.status='posted') AS n_asientos_pago,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='reconocimiento' AND e.status='posted') AS n_asientos_recon
  FROM received_services rs WHERE rs.service_number IN (${list}) ORDER BY rs.service_number;`);

/* C2 — totales: importes, duplicaciones */
out.totales = await mgmt(`SELECT
  (SELECT count(*) FROM received_services WHERE service_number IN (${list})) AS docs_21,
  (SELECT count(*) FROM received_services WHERE service_number IN (${list}) AND payment_status='paid') AS docs_pagados,
  (SELECT count(*) FROM received_services rs WHERE service_number IN (${list}) AND rs.paid_at AT TIME ZONE 'America/Havana' = (rs.service_date || ' 12:00:00')::timestamp) AS liquidacion_igual_servicio_20,
  (SELECT count(*) FROM received_services WHERE service_number='SRV-20261116-00139' AND rs_paid.paid = true) AS dummy_omitir
  FROM (SELECT false) s(rs_paid) LIMIT 0;`).catch(async () => {
  // 00139 no debe entrar en el criterio fecha=servicio (17/11 != 16/11) — query separada
  return mgmt(`SELECT
    (SELECT count(*) FROM received_services WHERE service_number IN (${list})) AS docs_21,
    (SELECT count(*) FROM received_services WHERE service_number IN (${list}) AND payment_status='paid') AS docs_pagados,
    (SELECT count(*) FROM received_services WHERE service_number IN (${list}) AND service_number != 'SRV-20261116-00139'
       AND (paid_at AT TIME ZONE 'America/Havana')::date = service_date) AS liquidacion_igual_servicio,
    (SELECT COALESCE(sum(paid_amount),0) FROM received_services WHERE service_number IN (${list}) AND service_number != 'SRV-20261116-00139') AS total_liquidado_20,
    (SELECT count(*) FROM payment_transactions WHERE ref_type='service' AND ref_id IN (SELECT id FROM received_services WHERE service_number IN (${list}))) AS total_pagos,
    (SELECT count(DISTINCT idempotency_key) FROM payment_transactions WHERE ref_type='service' AND ref_id IN (SELECT id FROM received_services WHERE service_number IN (${list}))) AS pagos_con_key_distinta;`);
});

/* C3 — duplicaciones de gastos/asientos/obligaciones: exactamente 1 pago y 1 asiento pago por doc */
out.duplicaciones = await mgmt(`SELECT rs.service_number,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago') AS n_asientos_pago,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='reconocimiento') AS n_asientos_recon
  FROM received_services rs WHERE rs.service_number IN (${list})
  GROUP BY rs.id, rs.service_number
  HAVING (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) != 1
      OR (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago') != 1
      OR (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='reconocimiento') != 1;`);

/* C4 — balance contable de los 21 (asientos débito=crédito y cancelación PAS_SERV_PEND) */
out.balance = await mgmt(`SELECT rs.service_number, e.event,
  round(sum(m.amount_cup) FILTER (WHERE m.sense='debito'),2) AS deb,
  round(sum(m.amount_cup) FILTER (WHERE m.sense='credito'),2) AS cred,
  round(sum(m.amount_cup) FILTER (WHERE m.sense='debito' AND m.category_code='PAS_SERV_PEND') - sum(m.amount_cup) FILTER (WHERE m.sense='credito' AND m.category_code='PAS_SERV_PEND'),2) AS pas_neto
  FROM fin_entries e
  JOIN received_services rs ON rs.id = e.document_id
  JOIN fin_movements m ON m.entry_id = e.id
  WHERE e.document_type='SERVICIO_RECIBIDO' AND rs.service_number IN (${list})
  GROUP BY rs.service_number, e.event ORDER BY rs.service_number, e.event;`);

/* C5 — asientos 'pago' de los 20: sentidos CORRECTOS (migración fix 20261113120500):
   débito PAS_SERV_PEND (cancela obligación) + crédito ACT_EFECTIVO_CUP (sale efectivo) */
out.asientos_pago = await mgmt(`SELECT rs.service_number, e.economic_date::text, e.status, e.payment_ref::text IS NOT NULL AS con_pago_ref,
  (SELECT m.category_code FROM fin_movements m WHERE m.entry_id=e.id AND m.sense='debito' LIMIT 1) AS debito_cat,
  (SELECT m.category_code FROM fin_movements m WHERE m.entry_id=e.id AND m.sense='credito' LIMIT 1) AS credito_cat,
  round((SELECT m.amount_cup FROM fin_movements m WHERE m.entry_id=e.id AND m.sense='debito' LIMIT 1),2) AS debito_amt
  FROM fin_entries e JOIN received_services rs ON rs.id=e.document_id
  WHERE e.document_type='SERVICIO_RECIBIDO' AND e.event='pago' AND rs.service_number IN (${list})
  ORDER BY rs.service_number;`);

/* C6 — estado especial 00139 completo */
out.especial_00139 = await mgmt(`SELECT rs.service_number, rs.service_date::text, rs.payment_status,
  (rs.paid_at AT TIME ZONE 'America/Havana')::date AS fecha_liquidacion_habana,
  rs.total_amount, rs.supplier, rs.observations,
  (SELECT pt.payment_method FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id LIMIT 1) AS metodo,
  (SELECT (pt.payment_date AT TIME ZONE 'America/Havana')::date FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id LIMIT 1) AS pago_fecha_habana,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
  (SELECT e.id::text FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago') AS asiento_pago_id,
  (SELECT e.status || '/' || e.economic_date::text || '/reversal:' || (e.reversal_of IS NOT NULL)
     FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago') AS asiento_pago_estado
  FROM received_services rs WHERE rs.service_number='SRV-20261116-00139';`);

/* C7 — sin alteraciones fuera de alcance: otros servicios de la tienda escritos DESPUÉS
   del inicio de la ejecución de la misión (2026-11-19T18:51:34Z; la actividad previa
   de ese día — SRV-00129..00138 pagados por el propietario 08:09-12:45 Habana — es
   anterior y ajena a la misión) */
out.alteraciones_externas = await mgmt(`SELECT count(*) AS otros_servicios_actualizados_tras_ejecucion
  FROM received_services
  WHERE store_id='899d2503-d000-41d2-89f0-0827f4ac37ab'
    AND service_number NOT IN (${list})
    AND updated_at >= TIMESTAMPTZ '2026-11-19 18:51:34+00';`);

/* C8 — errores de contabilización nuevos */
out.fin_errors = await mgmt(`SELECT count(*) AS errores_fin
  FROM fin_posting_errors
  WHERE document_type='SERVICIO_RECIBIDO'
    AND document_id IN (SELECT id FROM received_services WHERE service_number IN (${list}))
    AND resolved_at IS NULL;`);

/* C9 — cierres de caja de la tienda (impacto: ninguno si vacío) */
out.cierres_caja = await mgmt(`SELECT count(*) AS cierres FROM cash_closures WHERE store_id='899d2503-d000-41d2-89f0-0827f4ac37ab';`);

/* C10 — formas de pago usadas y medio de pago del documento */
out.medios = await mgmt(`SELECT rs.payment_method AS metodo_doc,
  (SELECT array_agg(DISTINCT pt.payment_method::text) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS metodos_pago
  FROM received_services rs WHERE rs.service_number IN (${list}) GROUP BY rs.id, rs.payment_method;`);

writeFileSync(`${OUT}/conciliacion.json`, JSON.stringify(out, null, 2));

/* ── Evaluación ── */
const c = out.conciliacion;
const v20 = c.filter((r) => r.service_number !== 'SRV-20261116-00139');
const espec = c.find((r) => r.service_number === 'SRV-20261116-00139');
const checks = {
  '20 de 20 procesados (paid)': v20.every((r) => r.payment_status === 'paid') && v20.length === 20,
  '20 de 20 con 1 pago y 1 asiento pago': v20.every((r) => r.n_pagos === 1 && r.n_asientos_pago === 1 && r.n_asientos_recon === 1),
  '20 de 20 liquidación = fecha servicio (Habana)': v20.every((r) => String(r.fecha_liquidacion_habana) === String(r.service_date)),
  'pago con fecha = fecha servicio (Habana)': v20.every((r) => String(r.pago_fecha_habana) === String(r.service_date)),
  'suma 20 = 74.240,00': Math.abs(v20.reduce((a, r) => a + Number(r.paid_amount), 0) - 74240) < 0.01,
  'sin duplicaciones (HAVING vacío)': out.duplicaciones.length === 0,
  'balance contable por asiento (deb=cred y PAS cancelada)': out.balance.every((b) => Math.abs(Number(b.deb) - Number(b.cred)) < 0.01 && Math.abs(Number(b.pas_neto)) < 0.01),
  'asientos pago: D PAS_SERV_PEND + C ACT_EFECTIVO_CUP (regla corregida 20261113120500)': out.asientos_pago.every((a) => a.debito_cat === 'PAS_SERV_PEND' && a.credito_cat === 'ACT_EFECTIVO_CUP'),
  '00139: paid + fecha 17/11 + obs + 1 pago + asiento intacto': espec &&
    espec.payment_status === 'paid' && String(espec.fecha_liquidacion_habana) === '2026-11-17' &&
    espec.n_pagos === 1 && espec.n_asientos_pago === 1,
  '00139 obs incorporada': (out.especial_00139[0]?.observations || '').includes('Liquidado el 17/11/2026'),
  '00139 asiento pago posted/eco16-11/sin reversal': (out.especial_00139[0]?.asiento_pago_estado || '').startsWith('posted/2026-11-16/reversal:false'),
  'sin alteraciones fuera de alcance (0 otros docs tras el inicio de ejecución)': Number(out.alteraciones_externas[0].otros_servicios_actualizados_tras_ejecucion) === 0,
  '0 errores de contabilización pendientes': Number(out.fin_errors[0].errores_fin) === 0,
  'cierres de caja de la tienda (0 — sin impacto)': Number(out.cierres_caja[0].cierres) === 0,
};
let fails = 0;
log('═══ CONCILIACIÓN OBLIGATORIA (§5) ═══');
for (const [k, v] of Object.entries(checks)) { log(`${v ? '✓' : '✗ FALLO'} — ${k}`); if (!v) fails++; }
log(`\nIdentificadores (muestra):`);
for (const r of c.slice(0, 4)) log(`  ${r.service_number}: serv=${r.service_date} liq_hab=${r.fecha_liquidacion_habana} pago_hab=${r.pago_fecha_habana} ${r.paid_amount} ${r.payment_method} asientos(pago/recon)=${r.n_asientos_pago}/${r.n_asientos_recon}`);
log(`  SRV-20261116-00139: serv=${espec.service_date} liq_hab=${espec.fecha_liquidacion_habana} ${espec.paid_amount} metodo=${espec.payment_method}`);
log(fails === 0 ? '\nRESULTADO: CONCILIACIÓN 100% PASS' : `\nRESULTADO: ${fails} CONTROLES EN FALLO`);
process.exit(fails === 0 ? 0 : 1);
