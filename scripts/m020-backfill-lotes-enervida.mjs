#!/usr/bin/env node
/**
 * M020 — CP-FIN-FINAL-EXECUTION-001 (FASE VIII): PRIMERA CONTABILIZACIÓN
 * HISTÓRICA DE ENERVIDA por LOTES INDEPENDIENTES (A–G).
 *
 * Por cada lote (secuencia de la misión):
 *   1. DRY-RUN/PLAN motor-exacto: para cada documento del lote se computan las
 *      métricas (fin_compute_metrics) y los movimientos (fin_apply_templates)
 *      con la regla activa (fin_resolve_rule) — el MISMO camino que
 *      fin_post_document. Se verifica D=C por asiento y se calcula el
 *      HASH v4 del conjunto planificado (estructura completa).
 *   2. CONT EOS Y TOTALES esperados del plan.
 *   3. EJECUCIÓN por documento: SELECT public.fin_post_document(tipo, id,
 *      evento, payment_ref, actor) — asiento+movimientos atómicos por
 *      documento; idempotente por diseño. Parada inmediata ante error
 *      inesperado (el lote se detiene; lotes independientes pueden seguir).
 *   4. CONCILIACIÓN: se leen los asientos/movimientos REALES del lote y se
 *      recalcula el hash v4 de lo CONTABILIZADO — debe coincidir con el
 *      plan (control #12). D=C por asiento, fin_posting_errors=0.
 *   5. IDEMPOTENCIA: re-publicación de una muestra → NULL, sin asientos nuevos.
 *
 * Actor (created_by de los asientos): propietario del sistema (superadmin
 * a1111111-1111-1111-1111-111111111111), en delegación expresa de la misión.
 *
 * Exclusiones de diseño (documentadas): tienda COSTPRO (prueba) y PUERTO PADRE
 * (fase independiente, sin valoración confiable); 3 ventas inconsistentes; 34
 * vales con costo cero; ventas con total<=0; devoluciones anuladas.
 *
 * Uso: ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node \
 *   scripts/m020-backfill-lotes-enervida.mjs [--lote A] [--solo-plan] [--solo-verificar]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'node:crypto';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const ACTOR = 'a1111111-1111-1111-1111-111111111111';
const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const INCONSISTENTES = ['1df5d727-e6ee-402a-aa51-6c44a0768c5a', '8ab7becf-8598-4779-b3e4-dbee2b67ee98', '28e94349-0a3e-499c-935f-c4a25c9db3fe'];
const ZELLE_BLOQUEADAS = ['c5965c77-1025-4f3f-9f9c-7298108d8ad7', 'cb3052c3-a4b3-4a65-8bbb-62e2340c7da0', '119a4f5e-bfa1-45c1-9784-cb2ff88bb0ce', '1558287f-6c91-4f8c-afb3-d1d5c6be8001'];
const EXCLUIDAS = [...INCONSISTENTES, ...ZELLE_BLOQUEADAS];
const OUT = resolve('docs/audits/2026-11-14-primera-contabilizacion-enervida');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const soloLote = (argv.includes('--lote') ? argv[argv.indexOf('--lote') + 1] : null);
const soloPlan = argv.includes('--solo-plan');
const soloVerificar = argv.includes('--solo-verificar');

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'write', url: SUPABASE_URL, context: 'm020-backfill-lotes-enervida.mjs' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino no es producción'); process.exit(2); }

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
  if (!r.ok) throw new Error(`(HTTP ${r.status}) ${r.text.slice(0, 400)}`);
  return JSON.parse(r.text || '[]');
}

// ── Serialización hash v4 (formato del dry-run oficial, estructura completa) ──
// Orden canónico de movimientos: los id de fin_movements son UUID aleatorios
// (no codifican el orden de plantilla) → se ordena por estructura en AMBOS lados.
const numCent = (v) => (Math.round(Number(v ?? 0) * 100) / 100).toFixed(2);
const ordenCanonico = (a, b) => `${a.categoria}|${a.sentido}|${numCent(a.importe_cup)}|${a.moneda}|${a.moneda_origen ?? '-'}`
  .localeCompare(`${b.categoria}|${b.sentido}|${numCent(b.importe_cup)}|${b.moneda}|${b.moneda_origen ?? '-'}`);
const serializarMovimiento = (m) => `MOV|${m.categoria}|${m.sentido}|${numCent(m.importe_origen)}|${numCent(m.importe_cup)}|${m.moneda}|${m.moneda_origen}`;
const serializarAsiento = (a) => [`ASIENTO|${a.tipo}|${a.doc_id}|${a.evento}|${a.payment_ref ?? '-'}|${a.regla ?? '-'}`,
  ...(a.movimientos || []).slice().sort(ordenCanonico).map(serializarMovimiento)].join('|') + '\n';
const hashConjunto = (asientos) => {
  const h = createHash('sha256');
  const orden = [...asientos].sort((x, y) =>
    `${x.tipo}|${x.doc_id}|${x.evento}|${x.payment_ref ?? '-'}`.localeCompare(`${y.tipo}|${y.doc_id}|${y.evento}|${y.payment_ref ?? '-'}`));
  for (const a of orden) h.update(serializarAsiento(a));
  return h.digest('hex');
};

// ── Definición de lotes (alcone ENERVIDA; exclusiones de diseño) ──
const NOPOST = (dt) => `NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='${dt}' AND e.document_id=DOC.id)`;
const LOTES = {
  A: { nombre: 'Servicios recibidos ENERVIDA', docs:
    `SELECT s.id, s.service_number AS docnum FROM public.received_services s
     WHERE s.store_id='${ENER}' AND s.status='active' AND ${NOPOST('SERVICIO_RECIBIDO').replace(/DOC\.id/g, 's.id')}
     ORDER BY s.service_date, s.id`,
    tipo: 'SERVICIO_RECIBIDO', evento: 'reconocimiento', pagos: { ref_type: 'service' } },
  B: { nombre: 'Docs autocontenidos (FLUJO_CAJA + COMISION + AJUSTE_INVENTARIO)', sublotes: [
    { tipo: 'FLUJO_CAJA', evento: 'reconocimiento', docs:
      `SELECT f.id, f.id::text AS docnum FROM public.cash_flow_documents f
       WHERE f.store_id='${ENER}' AND f.status='confirmado' AND ${NOPOST('FLUJO_CAJA').replace(/DOC\.id/g, 'f.id')} ORDER BY f.operation_date, f.id` },
    { tipo: 'COMISION', evento: 'pago', docs:
      `SELECT c.id, c.id::text AS docnum FROM public.commission_payments c
       WHERE c.store_id='${ENER}' AND c.status='paid' AND ${NOPOST('COMISION').replace(/DOC\.id/g, 'c.id')} ORDER BY c.paid_at, c.id` },
    { tipo: 'AJUSTE_INVENTARIO', evento: 'reconocimiento', docs:
      `SELECT a.id, a.id::text AS docnum FROM public.inventory_adjustments a
       WHERE a.store_id='${ENER}' AND a.status='confirmed' AND ${NOPOST('AJUSTE_INVENTARIO').replace(/DOC\.id/g, 'a.id')} ORDER BY a.confirmed_at, a.id` } ] },
  C: { nombre: 'Vales de salida con costo documental válido', docs:
    `SELECT i.id, i.slip_number AS docnum FROM public.issue_slips i
     WHERE i.store_id='${ENER}' AND i.status='completed' AND coalesce(i.total_cost,0) > 0
       AND ${NOPOST('VALE_SALIDA').replace(/DOC\.id/g, 'i.id')} ORDER BY i.created_at, i.id`,
    tipo: 'VALE_SALIDA', evento: 'reconocimiento' },
  D: { nombre: 'Recepciones ENERVIDA (reconocimiento)', docs:
    `SELECT r.id, r.document_number AS docnum FROM public.receipts r
     WHERE r.store_id='${ENER}' AND r.status='active' AND ${NOPOST('RECEPCION').replace(/DOC\.id/g, 'r.id')}
     ORDER BY r.reception_date, r.id`,
    tipo: 'RECEPCION', evento: 'reconocimiento', pagos: { ref_type: 'receipt' } },
  E: { nombre: 'Ventas CUP íntegramente cobradas (incluye 161 migradas)', docs:
    `SELECT t.id, t.invoice_number AS docnum FROM public.transactions t
     WHERE t.store_id='${ENER}' AND t.status='completed' AND t.total_amount > 0
       AND t.sale_currency='CUP' AND t.id NOT IN ('${EXCLUIDAS.join("','")}')
       AND ${NOPOST('VENTA').replace(/DOC\.id/g, 't.id')} ORDER BY t.created_at, t.id`,
    tipo: 'VENTA', evento: 'reconocimiento' },
  F: { nombre: 'Ventas USD (semántica total_amount=CUP-eq aplicada)', docs:
    `SELECT t.id, t.invoice_number AS docnum FROM public.transactions t
     WHERE t.store_id='${ENER}' AND t.status='completed' AND t.total_amount > 0
       AND t.sale_currency='USD' AND t.id NOT IN ('${EXCLUIDAS.join("','")}')
       AND ${NOPOST('VENTA').replace(/DOC\.id/g, 't.id')} ORDER BY t.created_at, t.id`,
    tipo: 'VENTA', evento: 'reconocimiento' },
  G: { nombre: 'Devoluciones de venta', docs:
    `SELECT d.id, d.devolution_number AS docnum FROM public.devolutions d
     WHERE d.store_id='${ENER}' AND d.status='completed' AND ${NOPOST('DEVOLUCION_VENTA').replace(/DOC\.id/g, 'd.id')}
     ORDER BY d.processed_at, d.id`,
    tipo: 'DEVOLUCION_VENTA', evento: 'reconocimiento' },
};

async function reglasActivas(tipo) {
  return q(`SELECT id::text AS rid, version, movements FROM public.fin_rule_versions
    WHERE document_type='${tipo}' AND status='active' ORDER BY store_id NULLS LAST LIMIT 1`);
}

// PLAN motor-exacto BULK de un sublote (docs + evento) — UNA consulta con LATERAL
async function planBulk(tipo, docsSql, evento, regla, pagos) {
  const tpl = JSON.stringify(regla.movements).replace(/'/g, "''");
  if (!pagos) {
    return q(`SELECT d.id AS doc_id, mm.metrics AS metrics,
        public.fin_apply_templates('${tpl}'::jsonb, '${evento}', mm.metrics) AS movs
      FROM (${docsSql}) d
      CROSS JOIN LATERAL (SELECT public.fin_compute_metrics('${tipo}', d.id, '${evento}', NULL) AS metrics) mm
      ORDER BY d.id`);
  }
  return q(`SELECT pt.pago_id AS pago_id, pt.doc_id AS doc_id, mm.metrics AS metrics,
      public.fin_apply_templates('${tpl}'::jsonb, '${evento}', mm.metrics) AS movs
    FROM (${docsSql}) pt
    CROSS JOIN LATERAL (SELECT public.fin_compute_metrics('${tipo}', pt.doc_id, '${evento}', pt.pago_id) AS metrics) mm
    ORDER BY pt.pago_id`);
}

const asientoDesdeFila = (r, tipo, evento, regla) => ({
  tipo, doc_id: r.doc_id, evento, payment_ref: r.pago_id || null,
  regla: `${regla.rid.slice(0, 8)}:v${regla.version}`,
  movimientos: (r.movs || []).map(m => ({
    categoria: m.categoria, sentido: m.sentido,
    importe_origen: Number(m.amount), importe_cup: Number(m.amount),
    moneda: 'CUP', moneda_origen: m.currency_origin || null,
  })),
  metrics: r.metrics,
});

const balanceOk = (a) => {
  const d = a.movimientos.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.importe_cup, 0);
  const c = a.movimientos.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.importe_cup, 0);
  return Math.abs(d - c) <= 0.01;
};
const derivaCent = (a) => {
  const d = a.movimientos.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.importe_cup, 0);
  const c = a.movimientos.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.importe_cup, 0);
  const diff = Math.round((d - c) * 100) / 100;
  return diff !== 0 ? diff : null; // deriva ≠ 0 pero ≤ 0.01 (tolerancia del motor)
};

async function pagosPosteriores(refType, tipo) {
  return q(`SELECT pt.id AS pago_id, pt.ref_id AS doc_id, pt.amount, pt.currency AS moneda_pago, pt.payment_date
    FROM public.payment_transactions pt
    WHERE pt.store_id='${ENER}' AND pt.ref_type='${refType}' AND coalesce(pt.direction,'in')='in'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='${tipo}'
        AND e.document_id=pt.ref_id AND e.event='pago' AND e.payment_ref=pt.id)
    ORDER BY pt.payment_date, pt.id`);
}

async function ejecutarLote(key) {
  const def = LOTES[key];
  const resultado = { lote: key, nombre: def.nombre, inicio: new Date().toISOString() };
  const sublotes = def.sublotes || [{ tipo: def.tipo, evento: def.evento, docs: def.docs }];
  const plan = [];
  const fuentes = [];

  for (const sl of sublotes) {
    const regla = (await reglasActivas(sl.tipo))[0];
    if (!regla) { console.error(`  [${key}] SIN REGLA ACTIVA para ${sl.tipo} — sublote omitido`); continue; }
    const filas = await planBulk(sl.tipo, sl.docs, sl.evento, regla, false);
    let okPlan = 0, desbalanceados = [], centesimos = [];
    for (const r of filas) {
      const a = asientoDesdeFila(r, sl.tipo, sl.evento, regla);
      if (a.movimientos.length === 0) { fuentes.push({ tipo: sl.tipo, id: r.doc_id, motivo: 'PLANTILLA_SIN_EFECTOS' }); continue; }
      const der = derivaCent(a);
      if (!balanceOk(a)) desbalanceados.push({ tipo: sl.tipo, id: r.doc_id, docnum: (r.metrics || {}).doc_number });
      else { okPlan++; if (der !== null) centesimos.push({ tipo: sl.tipo, id: r.doc_id, deriva: der }); }
      plan.push(a);
    }
    resultado[sl.tipo] = { docs: filas.length, plan_ok: okPlan, sin_efectos: filas.length - okPlan - desbalanceados.length, desbalanceados: desbalanceados.length, deriva_centimos: centesimos };
    if (desbalanceados.length) resultado.desbalanceados = desbalanceados;
    console.log(`  [${key}/${sl.tipo}] docs=${filas.length} plan_ok=${okPlan} desbalanceados=${desbalanceados.length}`);
  }

  // pagos posteriores (A: servicios; D: recepciones) — BULK
  if (def.pagos) {
    const regla = (await reglasActivas(def.tipo))[0];
    const pagosSql = `SELECT pt.id AS pago_id, pt.ref_id AS doc_id FROM public.payment_transactions pt
      WHERE pt.store_id='${ENER}' AND pt.ref_type='${def.pagos.ref_type}' AND coalesce(pt.direction,'in')='in'
        AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='${def.tipo}'
          AND e.document_id=pt.ref_id AND e.event='pago' AND e.payment_ref=pt.id)
      ORDER BY pt.id`;
    const filas = await planBulk(def.tipo, pagosSql, 'pago', regla, true);
    let okPlan = 0, errores = [];
    for (const r of filas) {
      const a = asientoDesdeFila(r, def.tipo, 'pago', regla);
      if (a.movimientos.length === 0) { errores.push({ pago: r.pago_id, motivo: 'PLANTILLA_SIN_EFECTOS' }); continue; }
      if (!balanceOk(a)) errores.push({ pago: r.pago_id, motivo: 'DESBALANCEADO' });
      else okPlan++;
      plan.push(a);
    }
    resultado.pagos = { filas: filas.length, plan_ok: okPlan, errores };
    console.log(`  [${key}/pagos] filas=${filas.length} plan_ok=${okPlan} errores=${errores.length}`);
  }

  // Conjunto EJECUTABLE: balanceado y SIN deriva de céntimos (D=C exacto).
  // El hash/plan de referencia corresponde a lo que se publicará (mismo conjunto
  // de documentos que la conciliación compara — control #12).
  const ejecutable = plan.filter(a => balanceOk(a) && derivaCent(a) === null);
  resultado.bloqueados = {
    desbalanceados: (resultado.desbalanceados || []).length,
    centimos: plan.filter(a => balanceOk(a) && derivaCent(a) !== null).map(a => ({ tipo: a.tipo, doc: a.doc_id, deriva: derivaCent(a) })),
    sin_efectos: fuentes,
  };
  resultado.hash_plan = hashConjunto(ejecutable);
  resultado.asientos_plan = ejecutable.length;
  resultado.movimientos_plan = ejecutable.reduce((s, a) => s + a.movimientos.length, 0);
  resultado.suma_debitos = Math.round(ejecutable.reduce((s, a) => s + a.movimientos.filter(m => m.sentido === 'debito').reduce((x, m) => x + m.importe_cup, 0), 0) * 100) / 100;
  resultado.suma_creditos = Math.round(ejecutable.reduce((s, a) => s + a.movimientos.filter(m => m.sentido === 'credito').reduce((x, m) => x + m.importe_cup, 0), 0) * 100) / 100;
  resultado.plan_total = plan.length;
  console.log(`  [${key}] PLAN: asientos=${resultado.asientos_plan} movimientos=${resultado.movimientos_plan} ΣD=${resultado.suma_debitos} ΣC=${resultado.suma_creditos}`);
  console.log(`  [${key}] HASH v4 plan: ${resultado.hash_plan}`);

  if (soloPlan) { resultado.solo_plan = true; return resultado; }

  // EJECUCIÓN por documento (solo asientos con D=C EXACTO: deriva de céntimos
  // → bloqueado documentado, preferible incidencia a asiento descuadrado)
  if (!soloVerificar) {
    let ejecutados = 0, fallidos = [], bloqueadosCent = [];
    for (const a of ejecutable) {
      if (!balanceOk(a)) continue;
      if (derivaCent(a) !== null) { bloqueadosCent.push({ tipo: a.tipo, doc: a.doc_id, deriva: derivaCent(a) }); continue; }
      const r = await mgmt(`SELECT public.fin_post_document('${a.tipo}', '${a.doc_id}'::uuid, '${a.evento}', ${a.payment_ref ? `'${a.payment_ref}'::uuid` : 'NULL'}, '${ACTOR}'::uuid) AS entry_id`);
      if (!r.ok) {
        fallidos.push({ tipo: a.tipo, doc: a.doc_id, evento: a.evento, error: r.text.slice(0, 200) });
        console.error(`  [${key}] FALLO en ${a.tipo} ${a.doc_id} (${a.evento}): ${r.text.slice(0, 150)}`);
        if (r.status >= 500 || /ERR_UNBALANCED|ERR_RULE|ERR_DOC/.test(r.text)) {
          console.error(`  [${key}] LOTE DETENIDO por error inesperado — se conservan los asientos ya publicados (${ejecutados}); conciliación a continuación.`);
          break;
        }
      } else ejecutados++;
    }
    resultado.ejecutados = ejecutados;
    resultado.fallidos = fallidos;
    resultado.bloqueados_centimos = bloqueadosCent;
    console.log(`  [${key}] EJECUCIÓN: publicados=${ejecutados} fallidos=${fallidos.length} bloqueados_por_centimos=${bloqueadosCent.length}`);
  }

  // CONCILIACIÓN: asientos reales del conjunto planificado (con los que existan)
  const ids = [...new Set(ejecutable.map(a => a.doc_id))];
  const paresTipoEvento = [...new Set(plan.map(a => `('${a.tipo}','${a.evento}')`))];
  const reales = await q(`SELECT e.id AS entry_id, e.document_type AS tipo, e.document_id AS doc_id, e.event AS evento,
      e.payment_ref, (rv.id::text) AS rule_id, rv.version,
      (SELECT jsonb_agg(jsonb_build_object('categoria', m.category_code, 'sentido', m.sense,
        'importe_origen', m.amount, 'importe_cup', m.amount_cup, 'moneda', m.currency, 'moneda_origen', m.currency_origin)
        ORDER BY m.id) FROM public.fin_movements m WHERE m.entry_id = e.id) AS movimientos
    FROM public.fin_entries e
    LEFT JOIN public.fin_rule_versions rv ON rv.id = e.rule_version_id
    WHERE e.store_id='${ENER}' AND e.document_id IN ('${ids.join("','")}')
      AND (e.document_type, e.event) IN (${paresTipoEvento.join(',') || "('x','x')"})
    ORDER BY e.document_id, e.event, e.payment_ref NULLS LAST`);
  const conjuntoReal = reales.map(e => ({
    tipo: e.tipo, doc_id: e.doc_id, evento: e.evento, payment_ref: e.payment_ref,
    regla: e.rule_id ? `${e.rule_id.slice(0, 8)}:v${e.version}` : '-',
    movimientos: (e.movimientos || []).map(m => ({
      categoria: m.categoria, sentido: m.sentido,
      importe_origen: Number(m.importe_origen), importe_cup: Number(m.importe_cup),
      moneda: m.moneda, moneda_origen: m.moneda_origen,
    })),
  }));
  resultado.asientos_reales = conjuntoReal.length;
  resultado.movimientos_reales = conjuntoReal.reduce((s, a) => s + a.movimientos.length, 0);
  resultado.hash_real = hashConjunto(conjuntoReal);
  resultado.hash_coincide = resultado.hash_plan === resultado.hash_real;
  console.log(`  [${key}] REAL: asientos=${resultado.asientos_reales} movimientos=${resultado.movimientos_reales}`);
  console.log(`  [${key}] HASH v4 real: ${resultado.hash_real} → ${resultado.hash_coincide ? 'COINCIDE con el plan ✓' : 'NO COINCIDE ✗'}`);

  // D=C por asiento real + errores del lote
  const partidaDoble = await q(`SELECT count(*) AS desbalanceados FROM (
    SELECT e.id, sum(CASE WHEN m.sense='debito' THEN m.amount ELSE 0 END) AS d, sum(CASE WHEN m.sense='credito' THEN m.amount ELSE 0 END) AS c
    FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
    WHERE e.store_id='${ENER}' AND e.document_id IN ('${ids.join("','")}') GROUP BY e.id) s
    WHERE abs(s.d - s.c) > 0.01`);
  resultado.partida_doble_desbalanceados = partidaDoble[0].desbalanceados;
  const errLote = await q(`SELECT count(*) AS n FROM public.fin_posting_errors
    WHERE store_id='${ENER}' AND document_id IN ('${ids.join("','")}')`);
  resultado.fin_posting_errors_lote = errLote[0].n;
  console.log(`  [${key}] partida doble desbalanceados=${resultado.partida_doble_desbalanceados} · fin_posting_errors=${resultado.fin_posting_errors_lote}`);

  // IDEMPOTENCIA: muestra de 3
  if (!soloPlan && !soloVerificar && plan.length > 0) {
    const muestra = plan.filter(a => balanceOk(a)).slice(0, 3);
    let nulos = 0;
    for (const a of muestra) {
      const r = await mgmt(`SELECT public.fin_post_document('${a.tipo}', '${a.doc_id}'::uuid, '${a.evento}', ${a.payment_ref ? `'${a.payment_ref}'::uuid` : 'NULL'}, '${ACTOR}'::uuid) AS entry_id`);
      if (r.ok) { const rows = JSON.parse(r.text); if (rows[0].entry_id === null) nulos++; }
    }
    const tras = await q(`SELECT count(*) AS n FROM public.fin_entries e WHERE e.store_id='${ENER}' AND e.document_id IN ('${ids.join("','")}')`);
    resultado.idempotencia = { muestra: muestra.length, devolvieron_null: nulos, asientos_tras_muestra: tras[0].n };
    console.log(`  [${key}] idempotencia: muestra=${muestra.length} null=${nulos} asientos totales=${tras[0].n}`);
  }
  resultado.fin = new Date().toISOString();
  return resultado;
}

// ── MAIN ──
console.log('M020 · PRIMERA CONTABILIZACIÓN HISTÓRICA ENERVIDA — LOTES A–G');
console.log('Actor: propietario (superadmin) · Exclusiones: PP/COSTPRO, 3 inconsistentes, 34 vales cero, total<=0\n');
const resumen = { generado: new Date().toISOString(), actor: ACTOR, lotes: {} };
const antes = await q(`SELECT (SELECT count(*) FROM public.fin_entries) AS entries, (SELECT count(*) FROM public.fin_movements) AS movements, (SELECT count(*) FROM public.fin_posting_errors) AS errores`);
resumen.antes = antes[0];
console.log('ANTES:', JSON.stringify(antes[0]));

for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
  if (soloLote && key !== soloLote) continue;
  console.log(`\n════ LOTE ${key} — ${LOTES[key].nombre} ════`);
  try {
    resumen.lotes[key] = await ejecutarLote(key);
  } catch (e) {
    console.error(`  [${key}] ERROR: ${String(e).slice(0, 300)}`);
    resumen.lotes[key] = { lote: key, error: String(e).slice(0, 300) };
    if (key === 'E') { console.error('  Lote E falló — F y G no se ejecutan (dependientes del mismo motor de ventas).'); break; }
  }
}

const despues = await q(`SELECT (SELECT count(*) FROM public.fin_entries) AS entries, (SELECT count(*) FROM public.fin_movements) AS movements, (SELECT count(*) FROM public.fin_posting_errors) AS errores`);
resumen.despues = despues[0];
resumen.delta = { entries: despues[0].entries - antes[0].entries, movements: despues[0].movements - antes[0].movements, errores: despues[0].errores - antes[0].errores };
console.log('\nDESPUÉS:', JSON.stringify(despues[0]));
console.log('DELTA:', JSON.stringify(resumen.delta));
writeFileSync(resolve(OUT, 'lotes.json'), JSON.stringify(resumen, null, 2));
console.log('Evidencia →', resolve(OUT, 'lotes.json'));
