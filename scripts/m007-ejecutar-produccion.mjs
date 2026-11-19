/**
 * ADN-SERVICES-RECEIVED-HISTORICAL-SETTLEMENT-007 — ETAPA 4: EJECUCIÓN EN PRODUCCIÓN
 * Guard CP-INFRA-019 doble flag + expediente docs/audits/CP-SRV-LIQUIDACION-HISTORICA-007_2026-11-19.md.
 *
 * Fases (idempotente, re-ejecutable):
 *   A. Pre-verificación read-only de los 21 registros (existencia, estado, importe EXACTO, cero pagos previos).
 *   B. 20 liquidaciones: register_supplier_payment (key M007-<num>, payment_date=fecha servicio 12:00 Habana)
 *      + alineación paid_at (statement separado — los CTE no ven el INSERT).
 *   C. 00139: payment_date del pago → 17/11 12:00 Habana; paid_at → 17/11 12:00 Habana; obs anexada (guard).
 *   D. Verificación inline post-escritura → results JSON.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/m007-ejecutar-produccion.mjs
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

// GUARD CP-INFRA-019: escritura en producción = doble flag explícito.
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm007-ejecutar-produccion.mjs' });
if (ref !== 'wthkddeleylijmonclxg') {
  console.error('FALLO DE GUARD: destino no es producción'); process.exit(2);
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
async function mgmt(query, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await mgmtRaw(query);
    } catch (e) {
      const transient = /40P01|40001|40P03|570|deadlock|timeout/i.test(String(e.message));
      if (!transient || i === tries) throw e;
      console.log(`  (transitorio, reintento ${i}/${tries})`);
      await sleep(1500 * i);
    }
  }
}
const log = (...a) => console.log(...a);
const habanaNoon = (date) => `(DATE '${date}'::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Havana'`;

/* Manifiesto EXACTO de la misión (importe esperado por servicio — la escritura
   usa el total del documento y exige que COINCIDA con este manifiesto). */
const MANIFIESTO = [
  ['SRV-20261010-00095', '2026-10-10', 200.0],
  ['SRV-20261016-00096', '2026-10-16', 6300.0],
  ['SRV-20261017-00097', '2026-10-17', 500.0],
  ['SRV-20261018-00098', '2026-10-18', 22000.0],
  ['SRV-20261019-00099', '2026-10-19', 6200.0],
  ['SRV-20261020-00100', '2026-10-20', 2700.0],
  ['SRV-20261021-00101', '2026-10-21', 3480.0],
  ['SRV-20261022-00102', '2026-10-22', 1740.0],
  ['SRV-20261023-00103', '2026-10-23', 2500.0],
  ['SRV-20261024-00104', '2026-10-24', 2900.0],
  ['SRV-20261025-00105', '2026-10-25', 4900.0],
  ['SRV-20261026-00106', '2026-10-26', 6200.0],
  ['SRV-20261027-00107', '2026-10-27', 3600.0],
  ['SRV-20261028-00108', '2026-10-28', 100.0],
  ['SRV-20261029-00109', '2026-10-29', 2400.0],
  ['SRV-20261030-00110', '2026-10-30', 1800.0],
  ['SRV-20261031-00111', '2026-10-31', 400.0],
  ['SRV-20261102-00112', '2026-11-02', 2100.0],
  ['SRV-20261103-00113', '2026-11-03', 3420.0],
  ['SRV-20261104-00114', '2026-11-04', 800.0],
];
const ESPECIAL = { num: 'SRV-20261116-00139', fechaServicio: '2026-11-16', importe: 300.0, nuevaFechaPago: '2026-11-17' };
const OBS_ESPECIAL = 'Pago de comisión del día 16/11/2026, que no se pagó ese día. Liquidado el 17/11/2026.';
const ACTOR = 'a1111111-1111-1111-1111-111111111111'; // admin@demo.com (cuenta operativa del propietario)

const results = { inicio: new Date().toISOString(), preverificacion: [], liquidaciones: [], especial: null, postverificacion: null, errores: [] };

/* ── FASE A: pre-verificación (read-only) ── */
log('═══ FASE A: pre-verificación ═══');
const pre = await mgmt(`SELECT service_number, id, store_id, service_date::text, status, payment_status,
  total_amount, currency, paid_amount, paid_at::text,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id = received_services.id) AS n_pagos
  FROM received_services WHERE service_number IN (${[...MANIFIESTO.map((m) => m[0]), ESPECIAL.num].map((n) => `'${n}'`).join(',')})
  ORDER BY service_number;`);

const byNum = Object.fromEntries(pre.map((r) => [r.service_number, r]));
let bloqueados = 0;
for (const [num, fecha, importe] of MANIFIESTO) {
  const r = byNum[num];
  const check = { service_number: num, encontrado: !!r, ok: false };
  if (!r) { check.motivo = 'NO ENCONTRADO'; bloqueados++; }
  else if (r.status !== 'active') { check.motivo = `status=${r.status}`; bloqueados++; }
  else if (r.currency !== 'CUP') { check.motivo = `currency=${r.currency}`; bloqueados++; }
  else if (Number(r.total_amount) !== importe) { check.motivo = `importe ${r.total_amount} != ${importe}`; bloqueados++; }
  else if (r.service_date !== fecha) { check.motivo = `fecha ${r.service_date} != ${fecha}`; bloqueados++; }
  else if (r.payment_status !== 'unpaid' || Number(r.paid_amount) !== 0) { check.motivo = `estado pago ${r.payment_status}/${r.paid_amount} — YA NO PENDIENTE (idempotencia: revisar)`; bloqueados++; }
  else if (r.n_pagos !== 0) { check.motivo = `${r.n_pagos} pagos existentes (§4.2)`; bloqueados++; }
  else { check.ok = true; }
  results.preverificacion.push(check);
}
// 00139: pre-verificación propia
{
  const r = byNum[ESPECIAL.num];
  const check = { service_number: ESPECIAL.num, encontrado: !!r, ok: false };
  if (!r) check.motivo = 'NO ENCONTRADO';
  else if (r.status !== 'active') check.motivo = `status=${r.status}`;
  else if (r.payment_status !== 'paid' || Number(r.total_amount) !== ESPECIAL.importe) check.motivo = `estado ${r.payment_status}/${r.total_amount}`;
  else if (r.n_pagos !== 1) check.motivo = `n_pagos=${r.n_pagos} (debe ser 1)`;
  else check.ok = true;
  results.preverificacion.push(check);
  if (!check.ok) bloqueados++;
}
log(`pre-verificación: ${results.preverificacion.filter((c) => c.ok).length} OK, ${bloqueados} bloqueados`);
if (bloqueados > 0) {
  console.error('REGISTROS BLOQUEADOS:', JSON.stringify(results.preverificacion.filter((c) => !c.ok), null, 2));
  writeFileSync(`${OUT}/ejecucion-results.json`, results);
  // La misión §8: detenerse SOLO en el registro afectado y continuar con los demás.
}

/* ── FASE B: 20 liquidaciones históricas ── */
log('═══ FASE B: liquidaciones ═══');
for (const [num, fecha, importe] of MANIFIESTO) {
  const preOk = results.preverificacion.find((c) => c.service_number === num)?.ok;
  if (!preOk) {
    log(`SKIP ${num} (bloqueado en pre-verificación)`);
    results.liquidaciones.push({ service_number: num, saltado: true });
    continue;
  }
  try {
    const pid = await mgmt(`SELECT public.register_supplier_payment(
      p_store_id => (SELECT store_id FROM received_services WHERE service_number='${num}'),
      p_ref_type => 'service',
      p_ref_id => (SELECT id FROM received_services WHERE service_number='${num}'),
      p_amount => (SELECT total_amount FROM received_services WHERE service_number='${num}'),
      p_payment_method => 'cash',
      p_paid_by => '${ACTOR}',
      p_currency => 'CUP',
      p_exchange_rate => 1,
      p_reference => 'M007 liquidación histórica',
      p_notes => 'Liquidación histórica — fecha de pago = fecha del servicio (misión 007)',
      p_idempotency_key => 'M007-${num}',
      p_payment_date => ${habanaNoon(fecha)}
    ) AS pid;`);
    const aligned = await mgmt(`UPDATE received_services rs
      SET paid_at = ${habanaNoon(fecha)}
      WHERE rs.service_number='${num}' AND rs.payment_status='paid'
        AND rs.paid_at IS DISTINCT FROM ${habanaNoon(fecha)}
      RETURNING rs.service_number, rs.payment_status, rs.paid_amount, rs.payment_method, rs.paid_at::text;`);
    results.liquidaciones.push({
      service_number: num, payment_id: pid[0]?.pid ?? '(idempotente: ya existía)',
      estado: aligned[0] ?? '(paid_at ya alineado — idempotente)',
    });
    log(`OK ${num} → pago ${pid[0]?.pid ?? '(ya existía)'}, ${aligned[0]?.payment_status}/${aligned[0]?.paid_amount} ${aligned[0]?.payment_method} paid_at=${aligned[0]?.paid_at ?? '(ya)'}`);
  } catch (e) {
    log(`ERROR ${num}: ${String(e.message).slice(0, 200)}`);
    results.errores.push({ service_number: num, error: String(e.message).slice(0, 400) });
  }
}

/* ── FASE C: corrección especial 00139 ── */
log('═══ FASE C: SRV-20261116-00139 ═══');
if (results.preverificacion.find((c) => c.service_number === ESPECIAL.num)?.ok) {
  try {
    // C.1 — payment_date del ÚNICO pago → 17/11 12:00 Habana (fecha real del pago)
    const pagoUpd = await mgmt(`UPDATE payment_transactions pt
      SET payment_date = ${habanaNoon(ESPECIAL.nuevaFechaPago)}
      WHERE pt.ref_type='service'
        AND pt.ref_id = (SELECT id FROM received_services WHERE service_number='${ESPECIAL.num}')
        AND pt.payment_date IS DISTINCT FROM ${habanaNoon(ESPECIAL.nuevaFechaPago)}
      RETURNING pt.id, pt.payment_date::text;`);
    // C.2 — paid_at + observación (el trigger tras el UPDATE C.1 pudo resetear paid_at=now())
    const srvUpd = await mgmt(`UPDATE received_services rs
      SET paid_at = ${habanaNoon(ESPECIAL.nuevaFechaPago)},
          observations = CASE WHEN rs.observations LIKE '%Liquidado el 17/11/2026%'
            THEN rs.observations
            ELSE rs.observations || E'\\n${OBS_ESPECIAL}' END
      WHERE rs.service_number='${ESPECIAL.num}' AND rs.payment_status='paid'
      RETURNING rs.service_number, rs.paid_at::text, rs.observations;`);
    results.especial = {
      service_number: ESPECIAL.num,
      pagos_actualizados: pagoUpd.length,
      paid_at: srvUpd[0]?.paid_at,
      observaciones: srvUpd[0]?.observations,
      n_pagos_tras: (await mgmt(`SELECT count(*) n FROM payment_transactions WHERE ref_type='service' AND ref_id=(SELECT id FROM received_services WHERE service_number='${ESPECIAL.num}');`))[0].n,
    };
    log(`OK 00139: pagos_actualizados=${pagoUpd.length} paid_at=${srvUpd[0]?.paid_at}`);
    log(`obs: ${JSON.stringify(srvUpd[0]?.observations)}`);
  } catch (e) {
    log(`ERROR 00139: ${String(e.message).slice(0, 200)}`);
    results.errores.push({ service_number: ESPECIAL.num, error: String(e.message).slice(0, 400) });
  }
} else {
  log('SKIP 00139 (bloqueado en pre-verificación)');
  results.especial = { service_number: ESPECIAL.num, saltado: true };
}

/* ── FASE D: verificación inline ── */
log('═══ FASE D: verificación ═══');
const post = await mgmt(`SELECT rs.service_number, rs.service_date::text, rs.status, rs.payment_status,
  rs.paid_amount, rs.payment_method, rs.paid_at::text, rs.observations,
  (SELECT count(*) FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id) AS n_pagos,
  (SELECT pt.payment_date::text FROM payment_transactions pt WHERE pt.ref_type='service' AND pt.ref_id=rs.id ORDER BY pt.payment_date LIMIT 1) AS pago_fecha,
  (SELECT count(*) FROM fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=rs.id AND e.event='pago') AS n_asientos_pago
  FROM received_services rs WHERE rs.service_number IN (${[...MANIFIESTO.map((m) => m[0]), ESPECIAL.num].map((n) => `'${n}'`).join(',')})
  ORDER BY rs.service_number;`);
results.postverificacion = post;
for (const p of post) log(`${p.service_number} | ${p.payment_status} | ${p.paid_amount} ${p.payment_method} | paid_at=${p.paid_at?.slice(0, 10)} | pagos:${p.n_pagos} asientos_pago:${p.n_asientos_pago}`);

results.fin = new Date().toISOString();
writeFileSync(`${OUT}/ejecucion-results.json`, JSON.stringify(results, null, 2));

/* Resumen */
const ok20 = post.filter((p) => MANIFIESTO.some(([n]) => n === p[0] || n === p.service_number))
  .filter((p) => p.payment_status === 'paid' && p.n_pagos === 1 && p.n_asientos_pago === 1);
const sumLiquidado = post
  .filter((p) => MANIFIESTO.some(([n]) => n === p.service_number))
  .reduce((acc, p) => acc + Number(p.paid_amount), 0);
log(`═══ RESUMEN: ${ok20.length}/20 pagados · suma liquidada=${sumLiquidado.toFixed(2)} CUP · errores=${results.errores.length} ═══`);
log('results → scripts/out/007-liquidacion/ejecucion-results.json');
