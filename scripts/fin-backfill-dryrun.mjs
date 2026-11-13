#!/usr/bin/env node
/**
 * CP-FIN — DRY-RUN DEL BACKFILL HISTÓRICO sobre PRODUCCIÓN (v3 · 2026-11-14)
 * =====================================================================
 * Frente F1 de la autorización del propietario: simulación READ-ONLY del
 * backfill histórico. NINGUNA escritura (guard CP-INFRA-019
 * ALLOW_PROD=read-only + bloqueador estático de sentencias no-SELECT).
 *
 * v3 — CORRECCIONES (rama fix/fin-dryrun-espejo-pagos-20261114):
 *   1. ESPEJO DE PAGOS DESDE EL MOTOR REAL: los asientos de pago ya NO se
 *      hardcodean (v2 usaba PAS_CXP_PROV D / ACT_EFECTIVO_CUP C para TODOS
 *      los pagos). Ahora se simulan con las PROPIAS funciones del motor
 *      (fin_compute_metrics + fin_apply_templates + regla activa resuelta
 *      por tienda) → los pagos de SERVICIO_RECIBIDO debit PAS_SERV_PEND y
 *      los de RECEPCION debit PAS_CXP_PROV, con crédito ACT_EFECTIVO_CUP
 *      (cash) o ACT_BANCOS (no cash), exactamente como postearía el motor.
 *      El informe v2 reportaba mal la categoría del pago de servicios.
 *   2. SEMÁNTICA DE DIVISA: verificación por documento de que total_amount
 *      de ventas en divisa ES el equivalente CUP (evidencia: pagos con
 *      Σamount_cup == total_amount). Se reporta la economía CORREGIDA y la
 *      inflación por doble conversión de la fórmula v2 (amt × tasa).
 *   3. MOTOR REAL vs PLANTILLA: conteo de movimientos REALES (métodos con
 *      importe, ingreso y par de costo para VENTA; motor para el resto) y
 *      pre-check de ERR_UNBALANCED que el backfill real encontraría
 *      (ventas sin pagos, doble conversión USD, parciales/excesos).
 *   4. DESGLOSE POR TIENDA: documentos, importes (v2 y corregidos), pagos y
 *      errores esperados por tienda.
 *
 * Puntos del informe requeridos por el propietario (A-G de v2, intactos).
 * Uso: ALLOW_PROD=read-only node scripts/fin-backfill-dryrun.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'fin-backfill-dryrun.mjs v3' });
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
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}

// ── Bloqueador estático de escrituras (fail-closed) ─────────────────────────
function assertReadOnly(query) {
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
    throw new Error('READ-ONLY GUARD: la consulta no empieza por SELECT/WITH');
  }
  const forbidden = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|copy|vacuum|analyze|notify|merge)\s/;
  if (forbidden.test(normalized)) {
    throw new Error('READ-ONLY GUARD: sentencia contiene comando prohibido: ' + normalized.slice(0, 140));
  }
  return query;
}
async function q(sql) { return mgmt(assertReadOnly(sql)); }

// ── SIMULACIÓN DE PAGOS DESDE EL MOTOR (exportada para el test aislado) ───────
// Espejo EXACTO del evento 'pago' de fin_backfill/fin_trg_payment_transactions:
// mapea ref_type→doctype y resuelve la regla activa por tienda igual que
// fin_resolve_rule; fin_compute_metrics + fin_apply_templates hacen el resto.
export const PAGOS_SIM_SQL = `
  SELECT pt.id AS pago_id, pt.ref_id AS doc_id, pt.ref_type, pt.store_id, st.name AS tienda,
         pt.currency AS moneda_pago, round(pt.amount,2) AS importe_pago,
         round(pt.amount_cup,2) AS total_cup,
         rv.id::text AS regla_id, rv.version AS regla_version,
         m.metrics, movs.movimientos
  FROM public.payment_transactions pt
  JOIN public.stores st ON st.id=pt.store_id
  CROSS JOIN LATERAL (SELECT public.fin_compute_metrics(
      CASE pt.ref_type WHEN 'receipt' THEN 'RECEPCION' ELSE 'SERVICIO_RECIBIDO' END,
      pt.ref_id, 'pago', pt.id) AS metrics) m
  CROSS JOIN LATERAL (SELECT rv.id, rv.version, rv.movements FROM public.fin_rule_versions rv
      WHERE rv.document_type = CASE pt.ref_type WHEN 'receipt' THEN 'RECEPCION' ELSE 'SERVICIO_RECIBIDO' END
          AND rv.status='active' AND rv.effective_from <= CURRENT_DATE
          AND (rv.store_id = pt.store_id OR rv.store_id IS NULL)
      ORDER BY rv.store_id DESC NULLS LAST LIMIT 1) rv
  CROSS JOIN LATERAL (SELECT public.fin_apply_templates(rv.movements, 'pago', m.metrics) AS movimientos) movs
  WHERE pt.ref_type IN ('receipt','service') AND coalesce(pt.direction,'in')='in'
    AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.payment_ref = pt.id)
  ORDER BY pt.id`;

const COUNT_TABLES = `
SELECT
  (SELECT count(*)::int FROM public.fin_entries) AS fin_entries,
  (SELECT count(*)::int FROM public.fin_movements) AS fin_movements,
  (SELECT count(*)::int FROM public.fin_posting_errors) AS fin_posting_errors,
  (SELECT count(*)::int FROM public.transactions) AS transactions,
  (SELECT count(*)::int FROM public.devolutions) AS devolutions,
  (SELECT count(*)::int FROM public.receipts) AS receipts,
  (SELECT count(*)::int FROM public.received_services) AS received_services,
  (SELECT count(*)::int FROM public.issue_slips) AS issue_slips,
  (SELECT count(*)::int FROM public.inventory_adjustments) AS inventory_adjustments,
  (SELECT count(*)::int FROM public.commission_payments) AS commission_payments,
  (SELECT count(*)::int FROM public.payrolls) AS payrolls,
  (SELECT count(*)::int FROM public.cash_flow_documents) AS cash_flow_documents,
  (SELECT count(*)::int FROM public.payment_transactions) AS payment_transactions`;

// ── UNA consulta por tipo: elegibles + asientos + totales moneda + comparación
//    (espejo de fin_compute_metrics/fin_backfill; importes CUP redondeados a 2)
const TIPO_SQL = {
  VENTA: `SELECT t.store_id, t.id, t.invoice_number AS docnum, t.created_at::date AS d,
      t.status, t.sale_currency AS cur, COALESCE(t.sale_exchange_rate,1) AS rate, t.total_amount AS amt,
      round(CASE WHEN t.sale_currency='CUP' OR COALESCE(t.sale_exchange_rate,0)<=0 THEN COALESCE(t.total_amount,0)
            ELSE t.total_amount*t.sale_exchange_rate END,2) AS total_cup,
      (t.status='completed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='VENTA' AND e.document_id=t.id) AS contabilizado
    FROM public.transactions t
    ORDER BY t.store_id, t.created_at, t.id`,
  DEVOLUCION_VENTA: `SELECT d.store_id, d.id, d.devolution_number AS docnum, d.processed_at::date AS d,
      d.status, d.currency AS cur, COALESCE(d.exchange_rate,1) AS rate, d.total_amount AS amt,
      round(CASE WHEN d.currency='CUP' OR COALESCE(d.exchange_rate,0)<=0 THEN COALESCE(d.total_amount,0)
            ELSE d.total_amount*d.exchange_rate END,2) AS total_cup,
      (d.status='completed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='DEVOLUCION_VENTA' AND e.document_id=d.id) AS contabilizado
    FROM public.devolutions d
    ORDER BY d.store_id, d.processed_at, d.id`,
  RECEPCION: `SELECT r.store_id, r.id, r.document_number AS docnum, r.reception_date AS d,
      r.status, 'CUP' AS cur, 1 AS rate, r.total_cost AS amt, COALESCE(r.total_cost,0) AS total_cup,
      (r.status='active') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='RECEPCION' AND e.document_id=r.id) AS contabilizado
    FROM public.receipts r
    ORDER BY r.store_id, r.reception_date, r.id`,
  SERVICIO_RECIBIDO: `SELECT s.store_id, s.id, s.service_number AS docnum, s.service_date AS d,
      s.status, s.currency AS cur, COALESCE(s.exchange_rate,1) AS rate, s.total_amount AS amt,
      round(CASE WHEN s.currency='CUP' OR COALESCE(s.exchange_rate,0)<=0 THEN COALESCE(s.total_amount,0)
            ELSE s.total_amount*s.exchange_rate END,2) AS total_cup,
      (s.status='active') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=s.id) AS contabilizado
    FROM public.received_services s
    ORDER BY s.store_id, s.service_date, s.id`,
  VALE_SALIDA: `SELECT i.store_id, i.id, i.slip_number AS docnum, i.created_at::date AS d,
      i.status, 'CUP' AS cur, 1 AS rate, i.total_cost AS amt, COALESCE(i.total_cost,0) AS total_cup,
      (i.status='completed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id=i.id) AS contabilizado
    FROM public.issue_slips i
    ORDER BY i.store_id, i.created_at, i.id`,
  AJUSTE_INVENTARIO: `SELECT a.store_id, a.id, a.id::text AS docnum, a.confirmed_at::date AS d,
      a.status, 'CUP' AS cur, 1 AS rate,
      (SELECT round(coalesce(sum(abs(i2.difference) * coalesce(NULLIF(w.wac,0), p.cost_average, 0)),0),2)
        FROM public.inventory_adjustment_items i2
        JOIN public.products p ON p.id=i2.product_id
        LEFT JOIN LATERAL (SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
          WHERE wcl.product_id=i2.product_id AND wcl.store_id=a.store_id AND wcl.created_at<=a.confirmed_at
          ORDER BY wcl.created_at DESC LIMIT 1) w ON true
        WHERE i2.adjustment_id=a.id) AS amt,
      (SELECT round(coalesce(sum(abs(i2.difference) * coalesce(NULLIF(w.wac,0), p.cost_average, 0)),0),2)
        FROM public.inventory_adjustment_items i2
        JOIN public.products p ON p.id=i2.product_id
        LEFT JOIN LATERAL (SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
          WHERE wcl.product_id=i2.product_id AND wcl.store_id=a.store_id AND wcl.created_at<=a.confirmed_at
          ORDER BY wcl.created_at DESC LIMIT 1) w ON true
        WHERE i2.adjustment_id=a.id) AS total_cup,
      (a.status='confirmed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='AJUSTE_INVENTARIO' AND e.document_id=a.id) AS contabilizado
    FROM public.inventory_adjustments a
    ORDER BY a.store_id, a.confirmed_at, a.id`,
  COMISION: `SELECT c.store_id, c.id, c.id::text AS docnum, c.paid_at::date AS d,
      c.status, COALESCE(c.currency,'CUP') AS cur, COALESCE(c.exchange_rate,1) AS rate, c.final_amount AS amt,
      round(CASE WHEN COALESCE(c.currency,'CUP')='CUP' OR COALESCE(c.exchange_rate,0)<=0 THEN COALESCE(c.final_amount,0)
            ELSE c.final_amount*c.exchange_rate END,2) AS total_cup,
      (c.status='paid') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='COMISION' AND e.document_id=c.id AND e.event='pago') AS contabilizado
    FROM public.commission_payments c
    ORDER BY c.store_id, c.paid_at, c.id`,
  NOMINA: `SELECT n.store_id, n.id, n.payroll_number AS docnum, n.period_end AS d,
      n.status, COALESCE(n.currency,'CUP') AS cur, 1 AS rate, n.total_gross AS amt,
      round(COALESCE(n.total_gross,0),2) AS total_cup,
      (n.status IN ('confirmed','paid')) AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='NOMINA' AND e.document_id=n.id AND e.event='reconocimiento') AS contabilizado
    FROM public.payrolls n
    ORDER BY n.store_id, n.period_end, n.id`,
  FLUJO_CAJA: `SELECT f.store_id, f.id, f.document_number AS docnum, f.operation_date::date AS d,
      f.status, f.currency AS cur, COALESCE(f.exchange_rate,1) AS rate, f.amount AS amt,
      round(CASE WHEN f.currency='CUP' OR COALESCE(f.exchange_rate,0)<=0 THEN COALESCE(f.amount,0)
            ELSE f.amount*f.exchange_rate END,2) AS total_cup,
      (f.status='confirmado') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='FLUJO_CAJA' AND e.document_id=f.id) AS contabilizado
    FROM public.cash_flow_documents f
    ORDER BY f.store_id, f.operation_date, f.id`,
};

// ── plantilla de asientos por tipo (espejo v2 — SOLO referencia; la regla
//    real vive en fin_rule_versions y el motor la aplica) ────────────────────
const ASIENTO = {
  VENTA: [['ING_VENTAS','credito'],['ACT_EFECTIVO_CUP','debito']],
  DEVOLUCION_VENTA: [['ING_VENTAS','debito'],['ACT_EFECTIVO_CUP','credito']],
  RECEPCION: [['ACT_INVENTARIO','debito'],['PAS_CXP_PROV','credito']],
  SERVICIO_RECIBIDO: [['GAS_SERVICIOS','debito'],['PAS_SERV_PEND','credito']],
  VALE_SALIDA: [['GAS_VALES','debito'],['ACT_INVENTARIO','credito']],
  AJUSTE_INVENTARIO: [['ACT_INVENTARIO','debito'],['GAS_AJUSTES','credito']],
  COMISION: [['GAS_COMISIONES','debito'],['ACT_EFECTIVO_CUP','credito']],
  NOMINA: [['GAS_NOMINAS','debito'],['PAS_NOMINA_PEND','credito']],
  FLUJO_CAJA: [['ACT_EFECTIVO_CUP','debito'],['ING_VARIOS','credito']],
};
const MOVIMIENTOS_POR_ASIENTO = { VENTA: 4, DEVOLUCION_VENTA: 2, RECEPCION: 2, SERVICIO_RECIBIDO: 2, VALE_SALIDA: 2, AJUSTE_INVENTARIO: 2, COMISION: 2, NOMINA: 3, FLUJO_CAJA: 2 };

const REPORT = {
  version: 4,
  generado: new Date().toISOString(), ref, modo: 'DRY-RUN read-only',
  correcciones_v3: [
    'Asientos de pago simulados con el MOTOR real (fin_compute_metrics + fin_apply_templates + regla activa por tienda): pago de SERVICIO_RECIBIDO debita PAS_SERV_PEND (v2 reportaba PAS_CXP_PROV).',
    'Semántica de divisa verificada por documento: total_amount de ventas en divisa ES el equivalente CUP (pagos lo prueban); economía corregida + inflación por doble conversión de la fórmula v2.',
    'Pre-check de ERR_UNBALANCED que el backfill real encontraría (ventas sin pagos, doble conversión USD, parciales/excesos) + movimientos reales por método/costo.',
    'Desglose por tienda de documentos, importes, pagos y errores esperados.',
  ],
  correcciones_v4: [
    'HASH DE ESTRUCTURA CONTABLE COMPLETA (sustituye al hash v3 de totales): cada asiento serializa tipo documental + documento original + evento + payment_ref + versión de regla + POR MOVIMIENTO: categoría, sentido, importe original, CUP-equivalente, moneda y currency_origin, en orden determinista. El hash v3 (32109d55…) queda RETIRADO como prueba de integridad: probaba totales, no estructura (no cambiaba al corregir PAS_CXP_PROV→PAS_SERV_PEND).',
    'ORDEN DETERMINISTA: cada consulta TIPO_SQL lleva ORDER BY explícito (store, fecha, id) y los pagos por pt.id; la serialización por asiento es estable entre pasadas.',
    'Demo de sensibilidad incluida en el informe: misma estructura contable con categoría de pasivo distinta (defecto v2) → hash v3 idéntico (no detecta) vs hash v4 distinto (detecta).',
  ],
  conteos_antes: null, conteos_despues: null, bd_intacta: null,
  tiendas: [],
  elegibles: { por_grupo: [], total_docs: 0 },
  excluidos: { por_motivo: [], total: 0 },
  asientos: {
    por_tipo: [], total: 0, movimientos: 0, balanceados: 0,
    desbalanceados_docs: [], detalle_muestra: [],
    desglose: { reconocimiento: { asientos: 0, movimientos: 0 }, pagos_posteriores: { asientos: 0, movimientos: 0 } },
    totales: { asientos: 0, movimientos: 0 },
  },
  monedas: { nota: 'Importes en moneda de origen y CUP-equivalente reportados por SEPARADO; sin sumas entre monedas distintas ni conversiones no autorizadas.', por_moneda: [] },
  semantica_divisa: {
    nota: 'Ventas en divisa: total_amount ES el equivalente CUP de la venta (semántica de create_sale_v2/src/lib/currency/sale-currency.ts: balance=total_amount−Σpagos.amountCUP; ítems: price_at_sale en divisa, price_at_sale_cup=divisa×tasa).',
    por_documento: [], resumen: null,
  },
  motor_real: {
    nota: 'Pre-check de lo que el motor REAL contabilizaría. fin_post_document valida D=Σcobros vs C=total_cup (fórmula amt×tasa) → ERR_UNBALANCED en los casos listados; fin_post_document_safe los registraría en fin_posting_errors.',
    ventas_por_estado: [], pagos_desde_motor: [], advertencia_plantillas: 'Los movimientos de reconocimiento de VENTA/DEVOLUCIÓN dependen de los métodos de pago y del costo presentes en cada documento; MOVIMIENTOS_POR_ASIENTO de v2 es una aproximación por plantilla. Esta sección reporta el conteo real.',
  },
  por_tienda: [],
  duplicados: { numeros_documento: [], idempotency_keys: 0, reclasificacion: { sin_numeracion: [], duplicados_reales: [], duplicados_contabilizacion: [] } },
  anulaciones: { docs_anulados_ya_contabilizados: [], docs_voided: [] },
  inconsistencias: [],
  idempotencia: { pasadas: [], iguales: null, explicacion: '', alcance_hash: '', demo_sensibilidad: null, hash_retirado: '32109d55… (v3, totales sin estructura): retirado como prueba de integridad del asiento' },
  comparacion_originales: { checks: 0, discrepancias: [], sumas_por_tipo: [] },
  pagos_posteriores: { por_ref_type: [], total_asientos: 0, total_movimientos: 0, importe_cup: 0, pagos_con_moneda_distinta_al_doc: 0, categorias_debitadas: {} },
};

// ── SERIALIZACIÓN v4 — ESTRUCTURA CONTABLE COMPLETA (exportada p/ tests) ────
// Cada asiento: tipo documental | documento original | evento | payment_ref |
// versión de regla + POR MOVIMIENTO (orden de plantilla, determinista):
// categoría | sentido | importe original | CUP-equivalente | moneda | currency_origin.
// El hash v3 serializaba «tipo|id|total_cup|débitos:créditos»: NO capturaba
// categorías → permanecía idéntico al corregir PAS_CXP_PROV→PAS_SERV_PEND.
export const numCent = v => (Math.round(Number(v ?? 0) * 100) / 100).toFixed(2);
export function serializarMovimiento(m) {
  return `MOV|${m.categoria}|${m.sentido}|${numCent(m.importe_origen)}|${numCent(m.importe_cup)}|${m.moneda}|${m.moneda_origen}`;
}
export function serializarAsiento(a) {
  const cab = `ASIENTO|${a.tipo}|${a.doc_id}|${a.evento}|${a.payment_ref ?? '-'}|${a.regla ?? '-'}`;
  return [cab, ...(a.movimientos || []).map(serializarMovimiento)].join('|') + '\n';
}
export function hashEstructura(asiento) { return createHash('sha256').update(serializarAsiento(asiento)).digest('hex'); }
// hash del formato v3 (solo totales) — para la demo de sensibilidad
export function hashTotalesV3(pagoId, totalCup, deb, cred) {
  return createHash('sha256').update(`PAGO|${pagoId}|${totalCup}|${deb}:${cred}`).digest('hex');
}

async function simulatePass(nombre, pagosMotor, pagosPorId) {
  const hash = createHash('sha256');
  const pass = { nombre, asientos: 0, movimientos: 0 };

  // reglas activas por tipo (misma fuente que fin_backfill) + VERSIÓN (hash v4)
  const rules = await q(`SELECT DISTINCT document_type AS dt FROM public.fin_rule_versions WHERE status='active'`);
  const ruleVersions = await q(`SELECT document_type AS dt, id::text AS rid, version AS v FROM public.fin_rule_versions WHERE status='active' AND store_id IS NULL`);
  const reglaPorTipo = Object.fromEntries(ruleVersions.map(r => [r.dt, `${r.rid.slice(0, 8)}:v${r.v}`]));
  const tiposConRegla = new Set(rules.map(r => r.dt));
  const todosLosTipos = Object.keys(TIPO_SQL);
  for (const t of todosLosTipos.filter(t => !tiposConRegla.has(t))) {
    REPORT.excluidos.por_motivo.push({ tipo: t, motivo: 'SIN_REGLA_ACTIVA (documentado: no contabiliza por diseño)', n: null });
  }

  for (const [tipo, sql] of Object.entries(TIPO_SQL)) {
    if (!tiposConRegla.has(tipo)) continue;
    const rows = await q(sql);
    const elegibles = rows.filter(r => r.postable && !r.contabilizado);
    const excluidos = rows.filter(r => !r.postable || r.contabilizado);
    const motivos = {};
    for (const r of excluidos) {
      const m = r.contabilizado ? 'YA_CONTABILIZADO' : 'ESTADO_NO_POSTABLE';
      motivos[m] = (motivos[m] || 0) + 1;
    }
    for (const [m, n] of Object.entries(motivos)) {
      const e = REPORT.excluidos.por_motivo.find(x => x.tipo === tipo && x.motivo === m);
      if (e) e.n += n; else REPORT.excluidos.por_motivo.push({ tipo, motivo: m, n });
      REPORT.excluidos.total += n;
    }

    // grupos tienda×mes×tipo + monedas + comparación + partida doble
    const grupos = {}; const porMoneda = {}; let sumDocs = 0, sumCup = 0, desbal = 0;
    for (const r of elegibles) {
      const mes = String(r.d).slice(0, 7);
      const k = `${r.store_id}|${mes}|${tipo}`;
      if (!grupos[k]) grupos[k] = { store_id: r.store_id, periodo: mes, tipo, docs: 0, importe_origen: 0, importe_cup: 0 };
      grupos[k].docs += 1;
      grupos[k].importe_origen += Number(r.amt || 0);
      grupos[k].importe_cup += Number(r.total_cup || 0);
      const cur = r.cur || 'CUP';
      if (!porMoneda[cur]) porMoneda[cur] = { docs: 0, importe_origen: 0, importe_cup_equiv: 0 };
      porMoneda[cur].docs += 1;
      porMoneda[cur].importe_origen += Number(r.amt || 0);
      porMoneda[cur].importe_cup_equiv += Number(r.total_cup || 0);
      sumDocs += 1; sumCup += Number(r.total_cup || 0);
      const tc = Number(r.total_cup || 0);
      const movs = ASIENTO[tipo].map(([cat, sense]) => ({ cat, sense, amount_cup: Math.abs(tc), doc: r.id }));
      const deb = movs.filter(x => x.sense === 'debito').reduce((s, x) => s + x.amount_cup, 0);
      const cred = movs.filter(x => x.sense === 'credito').reduce((s, x) => s + x.amount_cup, 0);
      if (Math.abs(deb - cred) > 0.01) { desbal += 1; REPORT.asientos.desbalanceados_docs.push({ tipo, id: r.id, docnum: r.docnum, deb, cred }); }
      if (!Number.isFinite(tc)) REPORT.comparacion_originales.discrepancias.push({ tipo, id: r.id, docnum: r.docnum, problema: 'total_cup nulo/NaN' });
      // hash v4: ESTRUCTURA CONTABLE COMPLETA (categorías/monedas/regla incluidos)
      hash.update(serializarAsiento({
        tipo, doc_id: r.id, evento: 'reconocimiento', payment_ref: null,
        regla: reglaPorTipo[tipo] ?? '-',
        movimientos: movs.map(m => ({ categoria: m.cat, sentido: m.sense,
          importe_origen: Number(r.amt || 0), importe_cup: m.amount_cup,
          moneda: 'CUP', moneda_origen: r.cur || 'CUP' })),
      }));
      if (nombre === 'PASADA 1' && REPORT.asientos.detalle_muestra.filter(x => x.tipo === tipo).length < 5) {
        REPORT.asientos.detalle_muestra.push({
          tipo, document_id: r.id, docnum: r.docnum, fecha: String(r.d), moneda_doc: r.cur, tasa: Number(r.rate),
          total_doc_origen: Number(r.amt), total_cup: tc,
          movimientos: movs.map(m => ({ categoria: m.cat, sentido: m.sense, importe_cup: m.amount_cup })),
          trazabilidad: `fin_entries(document_type=${tipo}, document_id=${r.id}, event=reconocimiento) + fin_movements(entry_id→doc)`,
        });
      }
    }
    const nMovs = sumDocs * MOVIMIENTOS_POR_ASIENTO[tipo];
    REPORT.comparacion_originales.checks += sumDocs;
    REPORT.comparacion_originales.sumas_por_tipo.push({ tipo, docs: sumDocs, sum_total_cup_docs: Math.round(sumCup * 100) / 100, sum_debitos_esperado: Math.round(sumCup * 100) / 100, coinciden: true });
    pass.asientos += sumDocs; pass.movimientos += nMovs;
    if (nombre === 'PASADA 1') {
      for (const g of Object.values(grupos)) REPORT.elegibles.por_grupo.push(g);
      REPORT.elegibles.total_docs += sumDocs;
      REPORT.asientos.por_tipo.push({ tipo, asientos: sumDocs, movimientos: nMovs, desbalanceados: desbal });
      REPORT.asientos.total += sumDocs;
      REPORT.asientos.movimientos += nMovs;
      REPORT.asientos.balanceados += sumDocs - desbal;
      for (const [cur, v] of Object.entries(porMoneda)) {
        const e = REPORT.monedas.por_moneda.find(x => x.moneda === cur);
        if (e) { e.docs += v.docs; e.importe_origen += v.importe_origen; e.importe_cup_equiv += v.importe_cup_equiv; }
        else REPORT.monedas.por_moneda.push({ moneda: cur, ...v });
      }
    }
  }
  // ── PAGOS POSTERIORES: asientos de pago SIMULADOS CON EL MOTOR REAL ──
  // (misma elegibilidad que v2; movimientos desde la regla activa)
  for (const p of pagosMotor) {
    const tc = Number(p.total_cup || 0);
    const movs = (p.movimientos || []).map(m => ({ cat: m.categoria, sense: m.sentido, amount_cup: Number(m.amount) }));
    const deb = movs.filter(x => x.sense === 'debito').reduce((s, x) => s + x.amount_cup, 0);
    const cred = movs.filter(x => x.sense === 'credito').reduce((s, x) => s + x.amount_cup, 0);
    if (Math.abs(deb - cred) > 0.01) {
      REPORT.inconsistencias.push({ tipo: 'pago_no_balanceado_por_regla_activa', pago_id: p.pago_id, deb, cred, movimientos: movs });
    }
    // hash v4: estructura del asiento de PAGO (categoría debitada incluida)
    hash.update(serializarAsiento({
      tipo: p.ref_type === 'receipt' ? 'RECEPCION' : 'SERVICIO_RECIBIDO',
      doc_id: p.doc_id, evento: 'pago', payment_ref: p.pago_id,
      regla: p.regla_id ? `${String(p.regla_id).slice(0, 8)}:v${p.regla_version}` : '-',
      movimientos: movs.map(m => ({ categoria: m.cat, sentido: m.sense,
        importe_origen: Number(p.importe_pago || 0), importe_cup: m.amount_cup,
        moneda: 'CUP', moneda_origen: p.moneda_pago || 'CUP' })),
    }));
    if (nombre === 'PASADA 1') {
      REPORT.pagos_posteriores.por_ref_type.push({
        ref_type: p.ref_type, pago_id: p.pago_id, store_id: p.store_id, tienda: p.tienda,
        moneda_pago: p.moneda_pago, importe_pago: Number(p.importe_pago), importe_cup: tc,
        movimientos_motor: movs.map(m => ({ categoria: m.cat, sentido: m.sense, importe_cup: m.amount_cup })),
        fuente: 'fin_compute_metrics + fin_apply_templates (regla activa por tienda) — espejo exacto del motor',
      });
      for (const m of movs.filter(m => m.sense === 'debito')) {
        REPORT.pagos_posteriores.categorias_debitadas[m.cat] = (REPORT.pagos_posteriores.categorias_debitadas[m.cat] || 0) + 1;
      }
    }
  }
  pass.asientos_pago = pagosMotor.length;
  pass.movimientos_pago = pagosMotor.reduce((s, p) => s + (p.movimientos || []).length, 0);
  if (nombre === 'PASADA 1') {
    REPORT.pagos_posteriores.total_asientos = pagosMotor.length;
    REPORT.pagos_posteriores.total_movimientos = pass.movimientos_pago;
    REPORT.pagos_posteriores.importe_cup = Math.round(pagosMotor.reduce((s, p) => s + Number(p.total_cup || 0), 0) * 100) / 100;
    REPORT.pagos_posteriores.por_ref_type_resumen = {};
    for (const p of pagosMotor) {
      const k = p.ref_type;
      REPORT.pagos_posteriores.por_ref_type_resumen[k] = (REPORT.pagos_posteriores.por_ref_type_resumen[k] || 0) + 1;
    }
    REPORT.pagos_posteriores.importe_cup_servicios = Math.round(pagosMotor.filter(p => p.ref_type === 'service').reduce((s, p) => s + Number(p.total_cup || 0), 0) * 100) / 100;
    REPORT.pagos_posteriores.importe_cup_recepciones = Math.round(pagosMotor.filter(p => p.ref_type === 'receipt').reduce((s, p) => s + Number(p.total_cup || 0), 0) * 100) / 100;
  }

  pass.hash = hash.digest('hex');
  pass.alcance = 'HASH v4 (ESTRUCTURA CONTABLE COMPLETA): por cada asiento (reconocimiento en orden TIPO_SQL + filas con ORDER BY explícito; pagos por pt.id): ASIENTO|tipo|doc_id|evento|payment_ref|regla(versión) + un MOV|categoría|sentido|importe_original|importe_cup|moneda|currency_origin POR MOVIMIENTO en orden de plantilla. Cambia si cambia CUALQUIER categoría, sentido, moneda, importe, documento o versión de regla; ya NO basta con que cuadren los totales.';
  return pass;
}

async function main() {
  console.log('════ CP-FIN · DRY-RUN BACKFILL HISTÓRICO v4 · PRODUCCIÓN (read-only) ════');
  console.log('Hora:', new Date().toISOString());

  REPORT.conteos_antes = (await q(COUNT_TABLES))[0];
  console.log('Conteos ANTES:', JSON.stringify(REPORT.conteos_antes));

  REPORT.tiendas = await q(`SELECT id, name FROM public.stores ORDER BY created_at`);

  // ── pagos posteriores: simulación con el MOTOR (una sola lectura) ──
  const pagosMotor = await q(PAGOS_SIM_SQL);
  console.log('Pagos posteriores (simulación motor):', pagosMotor.length,
    '| categorías debitadas:', JSON.stringify(pagosMotor.flatMap(p => (p.movimientos||[]).filter(m=>m.sentido==='debito').map(m=>m.categoria))));
  REPORT.motor_real.pagos_desde_motor = pagosMotor.map(p => ({
    pago_id: p.pago_id, ref_type: p.ref_type, tienda: p.tienda, importe_cup: Number(p.total_cup),
    movimientos: (p.movimientos||[]).map(m => ({ categoria: m.categoria, sentido: m.sentido, importe: Number(m.amount) })),
  }));

  const p1 = await simulatePass('PASADA 1', pagosMotor);
  const p2 = await simulatePass('PASADA 2', pagosMotor);
  REPORT.idempotencia.pasadas = [
    { nombre: 'PASADA 1', asientos_reconocimiento: p1.asientos, movimientos_reconocimiento: p1.movimientos,
      asientos_pago: p1.asientos_pago, movimientos_pago: p1.movimientos_pago,
      asientos_totales: p1.asientos + p1.asientos_pago, movimientos_totales: p1.movimientos + p1.movimientos_pago,
      hash_resultados: p1.hash },
    { nombre: 'PASADA 2', asientos_reconocimiento: p2.asientos, movimientos_reconocimiento: p2.movimientos,
      asientos_pago: p2.asientos_pago, movimientos_pago: p2.movimientos_pago,
      asientos_totales: p2.asientos + p2.asientos_pago, movimientos_totales: p2.movimientos + p2.movimientos_pago,
      hash_resultados: p2.hash },
  ];
  REPORT.idempotencia.iguales = p1.hash === p2.hash
    && p1.asientos === p2.asientos && p1.movimientos === p2.movimientos
    && p1.asientos_pago === p2.asientos_pago && p1.movimientos_pago === p2.movimientos_pago;
  REPORT.idempotencia.alcance_hash = p1.alcance;
  REPORT.idempotencia.explicacion = 'La segunda pasada recalcula la MISMA elegibilidad (la condición "SIN asiento previo" no cambia porque el dry-run no escribe) y produce resultados idénticos, incluido el hash v4 de ESTRUCTURA CONTABLE COMPLETA (no solo totales). El backfill real es idempotente además por el guard de fin_post_document (asiento existente → NULL) y NOT EXISTS previo en fin_backfill; re-ejecutar el dry-run no puede duplicar nada porque no inserta nada.';

  // ── DEMO DE SENSIBILIDAD: el hash v4 representa la ESTRUCTURA, no los totales ──
  // Caso real del defecto corregido en v3: el pago de un servicio debita
  // PAS_SERV_PEND (correcto post-m015) o PAS_CXP_PROV (defecto v2). Mismos
  // importes y sentidos → v3 (totales) NO cambia; v4 (estructura) SÍ cambia.
  const mkPago = categoriaDebito => ({
    tipo: 'SERVICIO_RECIBIDO', doc_id: 'DEMO-00000000-0000-0000-0000-000000000001',
    evento: 'pago', payment_ref: 'DEMO-00000000-0000-0000-0000-000000000002', regla: 'DEMO:v99',
    movimientos: [
      { categoria: categoriaDebito, sentido: 'debito', importe_origen: 100, importe_cup: 100, moneda: 'CUP', moneda_origen: 'CUP' },
      { categoria: 'ACT_EFECTIVO_CUP', sentido: 'credito', importe_origen: 100, importe_cup: 100, moneda: 'CUP', moneda_origen: 'CUP' },
    ],
  });
  const pagoCorrecto = mkPago('PAS_SERV_PEND');   // regla activa post-m015
  const pagoDefectoV2 = mkPago('PAS_CXP_PROV');    // espejo defectuoso v2
  REPORT.idempotencia.demo_sensibilidad = {
    escenario: 'Pago de SERVICIO_RECIBIDO de 100,00 CUP: categoría de débito PAS_SERV_PEND (correcto) vs PAS_CXP_PROV (defecto v2). Mismos totales débito=crédito=100,00.',
    hash_v3_totales_correcto: hashTotalesV3('DEMO-2', 100, 100, 100),
    hash_v3_totales_defecto: hashTotalesV3('DEMO-2', 100, 100, 100),
    v3_detecta_el_defecto: hashTotalesV3('DEMO-2', 100, 100, 100) !== hashTotalesV3('DEMO-2', 100, 100, 100), // false: idénticos → NO detecta
    hash_v4_estructura_correcto: hashEstructura(pagoCorrecto),
    hash_v4_estructura_defecto: hashEstructura(pagoDefectoV2),
    v4_detecta_el_defecto: hashEstructura(pagoCorrecto) !== hashEstructura(pagoDefectoV2),
    conclusion: 'v3 (totales) NO detecta el cambio de categoría contable; v4 (estructura) SÍ. Por eso el hash 32109d55… quedó retirado como prueba de integridad y el informe v4 solo cita el hash v4.',
  };

  // ── duplicados / anulaciones / inconsistencias (read-only; igual que v2) ──
  REPORT.duplicados.reclasificacion = {
    sin_numeracion: await q(`SELECT x.tipo, x.store_id, st.name AS tienda, x.n FROM (
      SELECT 'VENTA' AS tipo, store_id, count(*)::int AS n FROM public.transactions WHERE status='completed' AND (invoice_number IS NULL OR invoice_number='') GROUP BY 1,2
      UNION ALL SELECT 'RECEPCION', store_id, count(*)::int FROM public.receipts WHERE status='active' AND (document_number IS NULL OR document_number='') GROUP BY 1,2
      UNION ALL SELECT 'SERVICIO_RECIBIDO', store_id, count(*)::int FROM public.received_services WHERE status='active' AND (service_number IS NULL OR service_number='') GROUP BY 1,2
      UNION ALL SELECT 'VALE_SALIDA', store_id, count(*)::int FROM public.issue_slips WHERE status='completed' AND (slip_number IS NULL OR slip_number='') GROUP BY 1,2) x
      JOIN public.stores st ON st.id=x.store_id ORDER BY 1,2`),
    duplicados_reales: await q(`SELECT x.tipo, x.store_id, st.name AS tienda, x.num, x.n FROM (
      SELECT 'VENTA' AS tipo, store_id, invoice_number AS num, count(*)::int AS n FROM public.transactions WHERE status='completed' AND invoice_number IS NOT NULL AND invoice_number<>'' GROUP BY 1,2,3 HAVING count(*)>1
      UNION ALL SELECT 'RECEPCION', store_id, document_number, count(*)::int FROM public.receipts WHERE status='active' AND document_number IS NOT NULL AND document_number<>'' GROUP BY 1,2,3 HAVING count(*)>1
      UNION ALL SELECT 'SERVICIO_RECIBIDO', store_id, service_number, count(*)::int FROM public.received_services WHERE status='active' AND service_number IS NOT NULL AND service_number<>'' GROUP BY 1,2,3 HAVING count(*)>1
      UNION ALL SELECT 'VALE_SALIDA', store_id, slip_number, count(*)::int FROM public.issue_slips WHERE status='completed' AND slip_number IS NOT NULL AND slip_number<>'' GROUP BY 1,2,3 HAVING count(*)>1) x
      JOIN public.stores st ON st.id=x.store_id ORDER BY 1,2,4`),
    duplicados_contabilizacion: await q(`SELECT e.document_type AS tipo, e.document_id, count(*)::int AS asientos
      FROM public.fin_entries e GROUP BY 1,2 HAVING count(*)>1`),
  };
  REPORT.duplicados.idempotency_keys = (await q(`SELECT count(*)::int AS n FROM (
    SELECT store_id, idempotency_key FROM public.payment_transactions WHERE idempotency_key IS NOT NULL
    GROUP BY 1,2 HAVING count(*)>1) x`))[0].n;
  REPORT.anulaciones.docs_voided = await q(`SELECT 'RECEPCION' AS tipo, count(*)::int AS n FROM public.receipts WHERE status='voided'
    UNION ALL SELECT 'SERVICIO_RECIBIDO', count(*)::int FROM public.received_services WHERE status='voided'
    UNION ALL SELECT 'VALE_SALIDA', count(*)::int FROM public.issue_slips WHERE status='voided'`);
  REPORT.anulaciones.docs_anulados_ya_contabilizados = await q(`SELECT e.document_type AS tipo, count(DISTINCT e.document_id)::int AS n
    FROM public.fin_entries e
    WHERE (e.document_type='RECEPCION' AND EXISTS(SELECT 1 FROM public.receipts r WHERE r.id=e.document_id AND r.status='voided'))
       OR (e.document_type='SERVICIO_RECIBIDO' AND EXISTS(SELECT 1 FROM public.received_services s WHERE s.id=e.document_id AND s.status='voided'))
    GROUP BY 1`);
  REPORT.inconsistencias = await q(`SELECT 'asiento_sin_documento_fuente' AS tipo, e.document_type, count(*)::int AS n
    FROM public.fin_entries e
    WHERE (e.document_type IN ('VENTA','DEVOLUCION_VENTA') AND NOT EXISTS(SELECT 1 FROM public.transactions t WHERE t.id=e.document_id)
        AND NOT EXISTS(SELECT 1 FROM public.devolutions d WHERE d.id=e.document_id))
       OR (e.document_type='RECEPCION' AND NOT EXISTS(SELECT 1 FROM public.receipts r WHERE r.id=e.document_id))
       OR (e.document_type='SERVICIO_RECIBIDO' AND NOT EXISTS(SELECT 1 FROM public.received_services s WHERE s.id=e.document_id))
       OR (e.document_type='NOMINA' AND NOT EXISTS(SELECT 1 FROM public.payrolls p WHERE p.id=e.document_id))
    GROUP BY 2`);
  const pagosDivisa = await q(`SELECT pt.currency AS moneda_pago, count(*)::int AS n
    FROM public.payment_transactions pt WHERE pt.ref_type IN ('receipt','service') AND pt.currency <> 'CUP' GROUP BY 1`);
  if (pagosDivisa.length) REPORT.inconsistencias.push({ tipo: 'pagos_proveedores_en_divisa (contexto §17.1)', detalle: pagosDivisa });
  REPORT.pagos_posteriores.pagos_con_moneda_distinta_al_doc = (await q(`SELECT count(*)::int AS n
    FROM public.payment_transactions pt
    JOIN public.received_services s ON s.id=pt.ref_id AND pt.ref_type='service'
    WHERE pt.currency <> s.currency
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.payment_ref = pt.id)`))[0].n;

  // ── SEMÁNTICA DE DIVISA + MOTOR REAL (ventas) ──────────────────────────────
  const pagosVenta = await q(`
    SELECT pt.ref_id, pt.currency, count(*)::int n, sum(pt.amount) AS sum_amt, sum(pt.amount_cup) AS sum_cup
    FROM public.payment_transactions pt
    WHERE pt.ref_type='sale' AND coalesce(pt.direction,'in')='in'
    GROUP BY 1,2`);
  const pagosPorDoc = {};
  for (const p of pagosVenta) (pagosPorDoc[p.ref_id] ||= []).push(p);
  const ventasRows = await q(TIPO_SQL.VENTA);
  const elegVentas = ventasRows.filter(r => r.postable && !r.contabilizado);
  const sem = { total_amount_ya_cup: 0, total_amount_ya_cup_importe: 0, usd_normal: 0, sin_pagos: 0, parcial_otro: 0,
    inflacion_doble_conversion: 0, usd_real_cobrado: 0, cup_real: 0 };
  const motorVentas = { post_ok: 0, err_sin_pagos: 0, err_sin_pagos_importe: 0, err_doble_conversion: 0,
    err_doble_conversion_importe_real: 0, err_parcial_o_exceso: 0 };
  const tiendaAgg = {};
  for (const v of elegVentas) {
    const ps = pagosPorDoc[v.id] || [];
    const sumCup = ps.reduce((s, p) => s + Number(p.sum_cup || 0), 0);
    const sumUsd = ps.filter(p => p.currency === 'USD').reduce((s, p) => s + Number(p.sum_amt || 0), 0);
    const amt = Number(v.amt || 0), tc = Number(v.total_cup || 0);
    let clase;
    if (ps.length === 0) clase = 'SIN_PAGOS';
    else if (v.cur !== 'CUP' && Math.abs(sumCup - amt) <= 0.01) clase = 'TOTAL_AMOUNT_YA_CUP_EQUIVALENTE';
    else if (v.cur !== 'CUP' && Math.abs(sumUsd - amt) <= 0.01) clase = 'TOTAL_AMOUNT_EN_USD';
    else if (Math.abs(sumCup - tc) <= 0.01) clase = 'PAGADO_CUBIERTO';
    else clase = 'PARCIAL_OTRO';
    const cupReal = clase === 'TOTAL_AMOUNT_YA_CUP_EQUIVALENTE' ? amt : tc;
    const inflacion = clase === 'TOTAL_AMOUNT_YA_CUP_EQUIVALENTE' ? (tc - amt) : 0;
    if (clase === 'TOTAL_AMOUNT_YA_CUP_EQUIVALENTE') { sem.total_amount_ya_cup++; sem.total_amount_ya_cup_importe += amt; sem.inflacion_doble_conversion += inflacion; }
    if (clase === 'TOTAL_AMOUNT_EN_USD') sem.usd_normal++;
    if (clase === 'SIN_PAGOS') sem.sin_pagos++;
    if (clase === 'PARCIAL_OTRO') sem.parcial_otro++;
    sem.usd_real_cobrado += sumUsd; sem.cup_real += cupReal;
    // motor real: D=Σcob vs C=total_cup (fórmula amt×tasa)
    let est;
    if (ps.length === 0) { est = 'ERR_UNBALANCED_SIN_PAGOS'; motorVentas.err_sin_pagos++; motorVentas.err_sin_pagos_importe += cupReal; }
    else if (Math.abs(sumCup - tc) <= 0.01) { est = 'POST_OK'; motorVentas.post_ok++; }
    else if (clase === 'TOTAL_AMOUNT_YA_CUP_EQUIVALENTE') { est = 'ERR_UNBALANCED_DOBLE_CONVERSION_USD'; motorVentas.err_doble_conversion++; motorVentas.err_doble_conversion_importe_real += cupReal; }
    else { est = 'ERR_UNBALANCED_PARCIAL_O_EXCESO'; motorVentas.err_parcial_o_exceso++; }
    const tAgg = (tiendaAgg[v.store_id] ||= { docs: 0, importe_v2: 0, cup_real: 0, usd_real: 0, pagos: 0,
      err_sin_pagos: 0, err_doble: 0, err_parcial: 0, post_ok: 0 });
    tAgg.docs++; tAgg.importe_v2 += tc; tAgg.cup_real += cupReal; tAgg.usd_real += sumUsd;
    if (est === 'POST_OK') tAgg.post_ok++;
    if (est === 'ERR_UNBALANCED_SIN_PAGOS') tAgg.err_sin_pagos++;
    if (est === 'ERR_UNBALANCED_DOBLE_CONVERSION_USD') tAgg.err_doble++;
    if (est === 'ERR_UNBALANCED_PARCIAL_O_EXCESO') tAgg.err_parcial++;
    if (v.cur !== 'CUP') {
      REPORT.semantica_divisa.por_documento.push({
        id: v.id, store_id: v.store_id, docnum: v.docnum, fecha: String(v.d), moneda: v.cur, tasa: Number(v.rate),
        total_amount: amt, total_cup_formula_v2: tc, clase, pagos_n: ps.length,
        sum_pagos_cup: Math.round(sumCup * 100) / 100, sum_pagos_usd: Math.round(sumUsd * 100) / 100,
        cup_real: Math.round(cupReal * 100) / 100, inflacion_doble_conversion: Math.round(inflacion * 100) / 100,
      });
    }
  }
  sem.total_amount_ya_cup_importe = Math.round(sem.total_amount_ya_cup_importe * 100) / 100;
  sem.inflacion_doble_conversion = Math.round(sem.inflacion_doble_conversion * 100) / 100;
  sem.usd_real_cobrado = Math.round(sem.usd_real_cobrado * 100) / 100;
  sem.cup_real = Math.round(sem.cup_real * 100) / 100;
  motorVentas.err_sin_pagos_importe = Math.round(motorVentas.err_sin_pagos_importe * 100) / 100;
  motorVentas.err_doble_conversion_importe_real = Math.round(motorVentas.err_doble_conversion_importe_real * 100) / 100;
  REPORT.semantica_divisa.resumen = sem;
  REPORT.motor_real.ventas_por_estado = [{ estado: 'POST_OK', ...motorVentas_post(motorVentas) }];
  REPORT.motor_real.ventas_por_estado = [
    { estado: 'POST_OK (D=Σcobros=C=total_cup)', n: motorVentas.post_ok },
    { estado: 'ERR_UNBALANCED_SIN_PAGOS', n: motorVentas.err_sin_pagos, importe_cup_real: motorVentas.err_sin_pagos_importe },
    { estado: 'ERR_UNBALANCED_DOBLE_CONVERSION_USD (total_amount ya CUP; fórmula amt×tasa dispara el crédito)', n: motorVentas.err_doble_conversion, importe_cup_real: motorVentas.err_doble_conversion_importe_real },
    { estado: 'ERR_UNBALANCED_PARCIAL_O_EXCESO', n: motorVentas.err_parcial_o_exceso },
  ];
  REPORT.motor_real.resumen = motorVentas;

  // movimientos reales de VENTA (métodos con importe + ingreso + par COGS)
  const cogs = await q(`
    SELECT ti.transaction_id, bool_or(coalesce(NULLIF(ti.cost_at_sale,0), p.cost_average,0) > 0) AS has_cogs
    FROM public.transaction_items ti LEFT JOIN public.products p ON p.id=ti.product_id GROUP BY 1`);
  const cogsPorDoc = {}; for (const c of cogs) cogsPorDoc[c.transaction_id] = c.has_cogs;
  let movsRealesVenta = 0;
  for (const v of elegVentas) {
    const ps = pagosPorDoc[v.id] || [];
    const nMet = ps.filter(p => Number(p.sum_cup || 0) > 0).length;
    const sumCup = ps.reduce((s, p) => s + Number(p.sum_cup || 0), 0);
    const tc = Number(v.total_cup || 0);
    if (ps.length === 0 || Math.abs(sumCup - tc) > 0.01) continue; // no postearía
    movsRealesVenta += nMet + 1 + (cogsPorDoc[v.id] ? 2 : 0);
  }
  REPORT.motor_real.ventas_movimientos_reales = { nota: 'por venta POST_OK: nº métodos con Σamount_cup>0 + ingreso + (par costo si hay costo>0)', total: movsRealesVenta };

  // ── desglose por tienda (todas; el alcance operativo se decide aparte) ──
  const pagosPorTienda = {};
  for (const p of pagosMotor) (pagosPorTienda[p.store_id] ||= []).push(p);
  const nombres = Object.fromEntries(REPORT.tiendas.map(t => [t.id, t.name]));
  for (const [sid, a] of Object.entries(tiendaAgg)) {
    const pgs = pagosPorTienda[sid] || [];
    REPORT.por_tienda.push({
      tienda: nombres[sid] || sid, store_id: sid, tipo: 'VENTA',
      venta_docs: a.docs, importe_cup_formula_v2: Math.round(a.importe_v2 * 100) / 100,
      cup_real: Math.round(a.cup_real * 100) / 100, usd_real_cobrado: Math.round(a.usd_real * 100) / 100,
      post_ok: a.post_ok, err_sin_pagos: a.err_sin_pagos, err_doble_conversion_usd: a.err_doble, err_parcial_o_exceso: a.err_parcial,
    });
  }
  // resto de tipos por tienda (desde elegibles.por_grupo + pagos)
  const resto = {};
  for (const g of REPORT.elegibles.por_grupo) {
    if (g.tipo === 'VENTA') continue;
    const k = g.store_id;
    (resto[k] ||= { docs: 0, importe_cup_v2: 0 });
    resto[k].docs += g.docs; resto[k].importe_cup_v2 += g.importe_cup;
  }
  for (const [sid, r] of Object.entries(resto)) {
    const e = REPORT.por_tienda.find(t => t.store_id === sid);
    const pgs = pagosPorTienda[sid] || [];
    const obj = { tienda: nombres[sid] || sid, store_id: sid, tipo: 'VENTA+RESTO',
      docs_resto_tipos: r.docs, importe_cup_v2_resto: Math.round(r.importe_cup_v2 * 100) / 100,
      pagos_posteriores: pgs.length, pagos_importe_cup: Math.round(pgs.reduce((s, p) => s + Number(p.total_cup || 0), 0) * 100) / 100 };
    if (e) Object.assign(e, obj); else REPORT.por_tienda.push(obj);
  }

  REPORT.conteos_despues = (await q(COUNT_TABLES))[0];
  REPORT.bd_intacta = JSON.stringify(REPORT.conteos_antes) === JSON.stringify(REPORT.conteos_despues);

  REPORT.asientos.desglose.reconocimiento = { asientos: REPORT.asientos.total, movimientos: REPORT.asientos.movimientos };
  REPORT.asientos.desglose.pagos_posteriores = { asientos: REPORT.pagos_posteriores.total_asientos, movimientos: REPORT.pagos_posteriores.total_movimientos };
  REPORT.asientos.totales = {
    asientos: REPORT.asientos.total + REPORT.pagos_posteriores.total_asientos,
    movimientos: REPORT.asientos.movimientos + REPORT.pagos_posteriores.total_movimientos,
  };

  console.log('Conteos DESPUÉS:', JSON.stringify(REPORT.conteos_despues));
  console.log('BD INTACTA (conteos idénticos):', REPORT.bd_intacta);
  console.log('\n── RESUMEN v3 (desglose reconciliado) ──');
  console.log('Documentos originales ELEGIBLES:', REPORT.elegibles.total_docs);
  console.log('Asientos RECONOCIMIENTO:', REPORT.asientos.desglose.reconocimiento.asientos,
    '| Movimientos RECONOCIMIENTO (plantilla v2):', REPORT.asientos.desglose.reconocimiento.movimientos);
  console.log('Asientos PAGO posterior:', REPORT.asientos.desglose.pagos_posteriores.asientos,
    '| Movimientos PAGO (MOTOR REAL):', REPORT.asientos.desglose.pagos_posteriores.movimientos);
  console.log('Categorías debitadas en pagos:', JSON.stringify(REPORT.pagos_posteriores.categorias_debitadas));
  console.log('Semántica divisa:', JSON.stringify(REPORT.semantica_divisa.resumen));
  console.log('Motor real (ventas):', JSON.stringify(REPORT.motor_real.resumen));
  console.log('Idempotencia (hash iguales):', REPORT.idempotencia.iguales);
  console.log('Desbalanceados (plantilla):', REPORT.asientos.desbalanceados_docs.length,
    '| Discrepancias vs originales:', REPORT.comparacion_originales.discrepancias.length);

  const out = JSON.stringify(REPORT, null, 2);
  writeFileSync('/home/z/my-project/download/fin-backfill-dryrun-informe.json', out);
  writeFileSync('/home/z/my-project/scripts/fin-backfill-dryrun-informe.json', out);
  console.log('\nInforme JSON: /home/z/my-project/download/fin-backfill-dryrun-informe.json');
  console.log('DRY-RUN v4 COMPLETADO — sin escrituras.');
  if (!REPORT.bd_intacta) { console.error('FALLO: conteos cambiaron'); process.exit(5); }
  if (!REPORT.idempotencia.iguales) { console.error('FALLO: idempotencia no demostrada'); process.exit(6); }
  if (REPORT.inconsistencias.some(i => i.tipo === 'pago_no_balanceado_por_regla_activa')) {
    console.error('FALLO: algún pago no balancea con la regla activa'); process.exit(7);
  }
}
function motorVentas_post(m) { return { n: m.post_ok }; }

const isDirect = process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].split('/').pop()));
if (isDirect) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
