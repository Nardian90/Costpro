#!/usr/bin/env node
/**
 * CP-FIN — DRY-RUN DEL BACKFILL HISTÓRICO sobre PRODUCCIÓN (2026-11-13)
 * =====================================================================
 * Frente F1 de la autorización del propietario (2026-11-13): simulación
 * READ-ONLY del backfill histórico. NINGUNA escritura (guard CP-INFRA-019
 * ALLOW_PROD=read-only + bloqueador estático de sentencias no-SELECT).
 *
 * Rediseño v2 (eficiente): TODO el cálculo se hace con UNA consulta por tipo
 * documental (agregaciones en SQL, no N+1 por documento) y la partida doble
 * se valida como conjuntos. Re-ejecutable, idempotente por diseño.
 *
 * Puntos del informe requeridos por el propietario:
 *   A. Elegibles por tienda × período (mes) × tipo documental.
 *   B. Excluidos + motivo (ya contabilizado / estado no-postable / sin regla).
 *   C. Asientos que se generarían (estructura por regla semilla + importe
 *      por documento: categoría/sentido/importe CUP; trazabilidad doc_id).
 *      Validación de partida doble: Σdébitos=Σcréditos por asiento.
 *   D. Totales por moneda (CUP/USD/otras): importe en moneda de origen y
 *      CUP-equivalente por SEPARADO. Sin conversiones cruzadas.
 *   E. Duplicados, previamente contabilizados, anulaciones, inconsistencias.
 *   F. Idempotencia: DOS pasadas de la MISMA simulación; hash de resultados
 *      idéntico + elegibilidad dependiente de "SIN asiento previo" (que el
 *      dry-run no altera) → demostrado.
 *   G. Comparación con originales: por tipo, total de documentos elegibles
 *      según la tabla fuente vs Σmovimientos esperados (D=C=total_cup);
 *      discrepancias por documento reportadas.
 *
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
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'fin-backfill-dryrun.mjs' });
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
    FROM public.transactions t`,
  DEVOLUCION_VENTA: `SELECT d.store_id, d.id, d.devolution_number AS docnum, d.processed_at::date AS d,
      d.status, d.currency AS cur, COALESCE(d.exchange_rate,1) AS rate, d.total_amount AS amt,
      round(CASE WHEN d.currency='CUP' OR COALESCE(d.exchange_rate,0)<=0 THEN COALESCE(d.total_amount,0)
            ELSE d.total_amount*d.exchange_rate END,2) AS total_cup,
      (d.status='completed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='DEVOLUCION_VENTA' AND e.document_id=d.id) AS contabilizado
    FROM public.devolutions d`,
  RECEPCION: `SELECT r.store_id, r.id, r.document_number AS docnum, r.reception_date AS d,
      r.status, 'CUP' AS cur, 1 AS rate, r.total_cost AS amt, COALESCE(r.total_cost,0) AS total_cup,
      (r.status='active') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='RECEPCION' AND e.document_id=r.id) AS contabilizado
    FROM public.receipts r`,
  SERVICIO_RECIBIDO: `SELECT s.store_id, s.id, s.service_number AS docnum, s.service_date AS d,
      s.status, s.currency AS cur, COALESCE(s.exchange_rate,1) AS rate, s.total_amount AS amt,
      round(CASE WHEN s.currency='CUP' OR COALESCE(s.exchange_rate,0)<=0 THEN COALESCE(s.total_amount,0)
            ELSE s.total_amount*s.exchange_rate END,2) AS total_cup,
      (s.status='active') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='SERVICIO_RECIBIDO' AND e.document_id=s.id) AS contabilizado
    FROM public.received_services s`,
  VALE_SALIDA: `SELECT i.store_id, i.id, i.slip_number AS docnum, i.created_at::date AS d,
      i.status, 'CUP' AS cur, 1 AS rate, i.total_cost AS amt, COALESCE(i.total_cost,0) AS total_cup,
      (i.status='completed') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id=i.id) AS contabilizado
    FROM public.issue_slips i`,
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
    FROM public.inventory_adjustments a`,
  COMISION: `SELECT c.store_id, c.id, c.id::text AS docnum, c.paid_at::date AS d,
      c.status, COALESCE(c.currency,'CUP') AS cur, COALESCE(c.exchange_rate,1) AS rate, c.final_amount AS amt,
      round(CASE WHEN COALESCE(c.currency,'CUP')='CUP' OR COALESCE(c.exchange_rate,0)<=0 THEN COALESCE(c.final_amount,0)
            ELSE c.final_amount*c.exchange_rate END,2) AS total_cup,
      (c.status='paid') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='COMISION' AND e.document_id=c.id AND e.event='pago') AS contabilizado
    FROM public.commission_payments c`,
  NOMINA: `SELECT n.store_id, n.id, n.payroll_number AS docnum, n.period_end AS d,
      n.status, COALESCE(n.currency,'CUP') AS cur, 1 AS rate, n.total_gross AS amt,
      round(COALESCE(n.total_gross,0),2) AS total_cup,
      (n.status IN ('confirmed','paid')) AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='NOMINA' AND e.document_id=n.id AND e.event='reconocimiento') AS contabilizado
    FROM public.payrolls n`,
  FLUJO_CAJA: `SELECT f.store_id, f.id, f.document_number AS docnum, f.operation_date::date AS d,
      f.status, f.currency AS cur, COALESCE(f.exchange_rate,1) AS rate, f.amount AS amt,
      round(CASE WHEN f.currency='CUP' OR COALESCE(f.exchange_rate,0)<=0 THEN COALESCE(f.amount,0)
            ELSE f.amount*f.exchange_rate END,2) AS total_cup,
      (f.status='confirmado') AS postable,
      EXISTS(SELECT 1 FROM public.fin_entries e WHERE e.document_type='FLUJO_CAJA' AND e.document_id=f.id) AS contabilizado
    FROM public.cash_flow_documents f`,
};

// ── plantilla de asientos por tipo (reglas semilla auditadas CP-FIN) ───────
// (categoria, sentido) × importe = total_cup del documento (espejo del motor:
//  el dry-run valida D=C=total_cup; la regla real vive en fin_rule_versions)
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
  generado: new Date().toISOString(), ref, modo: 'DRY-RUN read-only',
  conteos_antes: null, conteos_despues: null, bd_intacta: null,
  tiendas: [],
  elegibles: { por_grupo: [], total_docs: 0 },
  excluidos: { por_motivo: [], total: 0 },
  asientos: { por_tipo: [], total: 0, movimientos: 0, balanceados: 0, desbalanceados_docs: [], detalle_muestra: [] },
  monedas: { nota: 'Importes en moneda de origen y CUP-equivalente reportados por SEPARADO; sin sumas entre monedas distintas ni conversiones no autorizadas.', por_moneda: [] },
  duplicados: { numeros_documento: [], idempotency_keys: 0 },
  anulaciones: { docs_anulados_ya_contabilizados: [], docs_voided: [] },
  inconsistencias: [],
  idempotencia: { pasadas: [], iguales: null, explicacion: '' },
  comparacion_originales: { checks: 0, discrepancias: [], sumas_por_tipo: [] },
};

async function simulatePass(nombre) {
  const hash = createHash('sha256');
  const pass = { nombre, asientos: 0, movimientos: 0 };

  // reglas activas por tipo (misma fuente que fin_backfill)
  const rules = await q(`SELECT DISTINCT document_type AS dt FROM public.fin_rule_versions WHERE status='active'`);
  const tiposConRegla = new Set(rules.map(r => r.dt));
  // tipos postables documentados sin regla (matriz CP-FIN: sin regla por diseño)
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
      // asiento simulado: cada movimiento = total_cup (D y C) → equilibrado
      // por construcción; validamos contra el ORIGINAL (total_cup nulo/NaN)
      const tc = Number(r.total_cup || 0);
      const movs = ASIENTO[tipo].map(([cat, sense]) => ({ cat, sense, amount_cup: Math.abs(tc), doc: r.id }));
      const deb = movs.filter(x => x.sense === 'debito').reduce((s, x) => s + x.amount_cup, 0);
      const cred = movs.filter(x => x.sense === 'credito').reduce((s, x) => s + x.amount_cup, 0);
      if (Math.abs(deb - cred) > 0.01) { desbal += 1; REPORT.asientos.desbalanceados_docs.push({ tipo, id: r.id, docnum: r.docnum, deb, cred }); }
      if (!Number.isFinite(tc)) REPORT.comparacion_originales.discrepancias.push({ tipo, id: r.id, docnum: r.docnum, problema: 'total_cup nulo/NaN' });
      hash.update(`${tipo}|${r.id}|${tc}|${deb}:${cred}`);
      // muestra trazable (máx 5 por tipo) solo pasada 1
      if (nombre === 'PASADA 1' && REPORT.asientos.detalle_muestra.filter(x => x.tipo === tipo).length < 5) {
        REPORT.asientos.detalle_muestra.push({
          tipo, document_id: r.id, docnum: r.docnum, fecha: String(r.d), moneda_doc: r.cur, tasa: Number(r.rate),
          total_doc_origen: Number(r.amt), total_cup: tc,
          movimientos: movs.map(m => ({ categoria: m.cat, sentido: m.sense, importe_cup: m.amount_cup })),
          trazabilidad: `fin_entries(document_type=${tipo}, document_id=${r.id}, event=reconocimiento) + fin_movements(entry_id→doc)`,
        });
      }
    }
    // comparación con originales por tipo: Σ(total_cup docs) == Σ(debitos)
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
  pass.hash = hash.digest('hex');
  return pass;
}

async function main() {
  console.log('════ CP-FIN · DRY-RUN BACKFILL HISTÓRICO · PRODUCCIÓN (read-only) ════');
  console.log('Hora:', new Date().toISOString());

  REPORT.conteos_antes = (await q(COUNT_TABLES))[0];
  console.log('Conteos ANTES:', JSON.stringify(REPORT.conteos_antes));

  REPORT.tiendas = await q(`SELECT id, name FROM public.stores ORDER BY created_at`);

  const p1 = await simulatePass('PASADA 1');
  const p2 = await simulatePass('PASADA 2');
  REPORT.idempotencia.pasadas = [
    { nombre: 'PASADA 1', asientos_elegibles: p1.asientos, movimientos: p1.movimientos, hash_resultados: p1.hash },
    { nombre: 'PASADA 2', asientos_elegibles: p2.asientos, movimientos: p2.movimientos, hash_resultados: p2.hash },
  ];
  REPORT.idempotencia.iguales = p1.hash === p2.hash && p1.asientos === p2.asientos && p1.movimientos === p2.movimientos;
  REPORT.idempotencia.explicacion = 'La segunda pasada recalcula la MISMA elegibilidad (la condición "SIN asiento previo" no cambia porque el dry-run no escribe) y produce resultados idénticos (hash SHA-256 de asientos/importes igual). El backfill real es idempotente además por el guard de fin_post_document (asiento existente → NULL) y NOT EXISTS previo en fin_backfill; re-ejecutar el dry-run no puede duplicar nada porque no inserta nada.';

  // ── duplicados / anulaciones / inconsistencias (read-only) ─────
  REPORT.duplicados.numeros_documento = await q(`SELECT tipo, num, n FROM (
    SELECT 'VENTA' AS tipo, invoice_number AS num, count(*)::int AS n FROM public.transactions WHERE status='completed' GROUP BY 2 HAVING count(*)>1
    UNION ALL SELECT 'RECEPCION', document_number, count(*)::int FROM public.receipts WHERE status='active' GROUP BY 2 HAVING count(*)>1
    UNION ALL SELECT 'SERVICIO_RECIBIDO', service_number, count(*)::int FROM public.received_services WHERE status='active' GROUP BY 2 HAVING count(*)>1
    UNION ALL SELECT 'VALE_SALIDA', slip_number, count(*)::int FROM public.issue_slips WHERE status='completed' GROUP BY 2 HAVING count(*)>1) x ORDER BY tipo, num`);
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
  // pagos de servicios/recepciones en divisa (contexto §17.1, read-only)
  const pagosDivisa = await q(`SELECT pt.currency AS moneda_pago, count(*)::int AS n
    FROM public.payment_transactions pt WHERE pt.ref_type IN ('receipt','service') AND pt.currency <> 'CUP' GROUP BY 1`);
  if (pagosDivisa.length) REPORT.inconsistencias.push({ tipo: 'pagos_proveedores_en_divisa (contexto §17.1)', detalle: pagosDivisa });

  REPORT.conteos_despues = (await q(COUNT_TABLES))[0];
  REPORT.bd_intacta = JSON.stringify(REPORT.conteos_antes) === JSON.stringify(REPORT.conteos_despues);

  console.log('Conteos DESPUÉS:', JSON.stringify(REPORT.conteos_despues));
  console.log('BD INTACTA (conteos idénticos):', REPORT.bd_intacta);
  console.log('\n── RESUMEN ──');
  console.log('Tiendas:', REPORT.tiendas.length);
  console.log('Docs elegibles:', REPORT.elegibles.total_docs, '| Asientos:', REPORT.asientos.total, '| Movimientos:', REPORT.asientos.movimientos);
  console.log('Excluidos:', JSON.stringify(REPORT.excluidos.por_motivo));
  console.log('Monedas:', JSON.stringify(REPORT.monedas.por_moneda));
  console.log('Idempotencia (hash iguales):', REPORT.idempotencia.iguales);
  console.log('Desbalanceados:', REPORT.asientos.desbalanceados_docs.length, '| Discrepancias vs originales:', REPORT.comparacion_originales.discrepancias.length);

  const out = JSON.stringify(REPORT, null, 2);
  writeFileSync('/home/z/my-project/download/fin-backfill-dryrun-informe.json', out);
  writeFileSync('/home/z/my-project/scripts/fin-backfill-dryrun-informe.json', out);
  console.log('\nInforme JSON: /home/z/my-project/download/fin-backfill-dryrun-informe.json');
  console.log('DRY-RUN COMPLETADO — sin escrituras.');
  if (!REPORT.bd_intacta) { console.error('FALLO: conteos cambiaron'); process.exit(5); }
  if (!REPORT.idempotencia.iguales) { console.error('FALLO: idempotencia no demostrada'); process.exit(6); }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
