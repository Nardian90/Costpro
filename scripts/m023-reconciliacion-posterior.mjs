#!/usr/bin/env node
/**
 * M023 — CP-RECEIPT-INTEGRITY-001 (CIERRE): RECONCILIACIÓN POSTERIOR A LA
 * CONTABILIZACIÓN DE LAS NUEVE RECEPCIONES (misión §7). READ-ONLY.
 *
 * A. Recepciones: 98 identificadas, estados finales, total de cabeceras vs suma
 *    independiente de líneas, monedas y tasas.
 * B. CP-FIN: asientos/movimientos de RECEPCION (los 99 + anulaciones), débitos
 *    y créditos, categorías contables, regla aplicada, fin_posting_errors,
 *    idempotencia (duplicados por document_id+type+event+payment_ref).
 * C. Inventario: movimientos de entrada por recepción, correspondencia
 *    recepción→movimiento→existencia, WAC SIN recalcular (los costos 1 CUP/1 USD
 *    se conservan — decisión expresa del propietario).
 * D. FAC-VITALLCONS-001: 192.039.436 CUP vinculados a su recepción, asiento
 *    único, y sus salidas posteriores representadas SIN duplicación.
 *
 * Uso: node scripts/m023-reconciliacion-posterior.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: no es producción'); process.exit(2); }

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}

const ev = { generado: new Date().toISOString() };
const fmt = (n) => Number(n).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ═══ A. RECEPCIONES ═══════════════════════════════════════════════════════════
console.log('\n═══ A. RECEPCIONES ═══');
const recepciones = await q(`SELECT
    rc.id::text, s.name AS tienda, rc.status,
    rc.total_cost::float8 AS total_cost,
    (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion,0),1)),0)::float8
       FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS suma_lineas,
    (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS n_lineas,
    (SELECT count(*)::int FROM public.fin_entries e WHERE e.document_type='RECEPCION' AND e.document_id=rc.id) AS n_asientos,
    (SELECT string_agg(DISTINCT e.event, ',') FROM public.fin_entries e
       WHERE e.document_type='RECEPCION' AND e.document_id=rc.id) AS eventos,
    (SELECT count(*)::int FROM public.fin_entries e WHERE e.document_type='RECEPCION'
       AND e.document_id=rc.id AND e.event='reconocimiento') AS n_reconocimientos
  FROM public.receipts rc JOIN public.stores s ON s.id=rc.store_id
  ORDER BY s.name, rc.reception_date`);
ev.A_recepciones = {
  total: recepciones.length,
  por_estado: {},
  tiendas: {},
};
for (const r of recepciones) {
  ev.A_recepciones.por_estado[r.status] = (ev.A_recepciones.por_estado[r.status] || 0) + 1;
  const key = `${r.tienda}|${r.status}`;
  ev.A_recepciones.tiendas[key] = (ev.A_recepciones.tiendas[key] || 0) + 1;
}
let sinAsiento = [];
let cuadran = 0;
let noCuadran = [];
let sinReconocimiento = [];
for (const r of recepciones) {
  const dif = Math.abs(r.total_cost - r.suma_lineas);
  if (dif <= 0.01) cuadran++; else noCuadran.push({ id: r.id, tienda: r.tienda, dif: dif.toFixed(2) });
  if (r.n_asientos === 0) sinAsiento.push({ id: r.id, tienda: r.tienda, estado: r.status });
  if (r.n_reconocimientos !== 1) sinReconocimiento.push({ id: r.id, tienda: r.tienda, estado: r.status, n: r.n_reconocimientos, eventos: r.eventos });
}
console.log(`  total=${recepciones.length} por_estado=${JSON.stringify(ev.A_recepciones.por_estado)}`);
console.log(`  cabecera vs Σ líneas (±0,01): ${cuadran}/${recepciones.length} cuadran; desviados: ${noCuadran.length}`);
console.log(`  sin asiento CP-FIN: ${sinAsiento.length} → ${JSON.stringify(sinAsiento)}`);
console.log(`  reconocimientos ≠ 1: ${sinReconocimiento.length} → ${JSON.stringify(sinReconocimiento.map(x => ({ tienda: x.tienda, id: x.id.slice(0, 8), n: x.n, eventos: x.eventos })))}`);
ev.A_recepciones.cuadran = cuadran;
ev.A_recepciones.no_cuadran = noCuadran;
ev.A_recepciones.sin_asiento = sinAsiento;
ev.A_recepciones.reconocimientos_distintos_de_1 = sinReconocimiento;

// ═══ B. CP-FIN ════════════════════════════════════════════════════════════════
console.log('\n═══ B. CP-FIN (RECEPCION) ═══');
const cpfin = await q(`SELECT
    e.id::text, e.store_id::text, s.name AS tienda, e.document_id::text, e.event, e.status,
    e.payment_ref::text, e.economic_date::text, e.posted_at::text, e.rule_version_id::text,
    (SELECT count(*)::int FROM public.fin_movements m WHERE m.entry_id=e.id) AS n_movs,
    (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='debito') AS debitos,
    (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='credito') AS creditos
  FROM public.fin_entries e LEFT JOIN public.stores s ON s.id=e.store_id
  WHERE e.document_type='RECEPCION' ORDER BY e.posted_at`);
const b = {
  asientos: cpfin.length,
  por_evento: {}, por_estado: {}, por_tienda: {},
  desbalanceados: cpfin.filter((e) => Math.abs(e.debitos - e.creditos) > 0.01).length,
  reglas: [...new Set(cpfin.map((e) => e.rule_version_id))],
};
for (const e of cpfin) {
  b.por_evento[e.event] = (b.por_evento[e.event] || 0) + 1;
  b.por_estado[e.status] = (b.por_estado[e.status] || 0) + 1;
  b.por_tienda[e.tienda] = (b.por_tienda[e.tienda] || 0) + 1;
}
// duplicados por (document_id + document_type + event + payment_ref)
const vistos = new Map();
b.duplicados = [];
for (const e of cpfin) {
  const k = `${e.document_id}|RECEPCION|${e.event}|${e.payment_ref || 'NULL'}`;
  if (vistos.has(k)) b.duplicados.push(k);
  vistos.set(k, (vistos.get(k) || 0) + 1);
}
// anulaciones enlazadas
const enlaces = await q(`SELECT e.document_id::text, e.reversal_of::text FROM public.fin_entries e
  WHERE e.document_type='RECEPCION' AND e.event='anulacion'`);
const anulaciones = await q(`SELECT e.document_id::text, rc.status AS estado_recepcion
  FROM public.fin_entries e JOIN public.receipts rc ON rc.id=e.document_id
  WHERE e.document_type='RECEPCION' AND e.event='anulacion'`);
b.anulaciones = { total: enlaces.length, enlazadas: enlaces.filter((x) => x.reversal_of).length, estados_recepcion: anulaciones.map((x) => x.estado_recepcion) };
// errores de contabilización
const errores = await q(`SELECT document_type, document_id::text, event, error_code FROM public.fin_posting_errors ORDER BY created_at DESC LIMIT 50`);
b.fin_posting_errors = errores.length;
b.fin_posting_errors_recepcion = errores.filter((e) => e.document_type === 'RECEPCION').length;
// totales por tienda (neto de anulaciones)
const porTiendaNeto = await q(`SELECT s.name AS tienda,
    coalesce(sum(CASE WHEN e.event='reconocimiento' THEN e.debito ELSE 0 END),0) AS bruto,
    coalesce(sum(CASE WHEN e.event='anulacion' THEN e.debito ELSE 0 END),0) AS anulaciones
  FROM (
    SELECT e.store_id, e.event,
      (SELECT coalesce(sum(m.amount),0) FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='debito') AS debito
    FROM public.fin_entries e WHERE e.document_type='RECEPCION'
  ) e JOIN public.stores s ON s.id=e.store_id GROUP BY s.name ORDER BY s.name`);
b.por_tienda_neto = porTiendaNeto.map((x) => ({ tienda: x.tienda, bruto: Number(x.bruto), anulaciones: Number(x.anulaciones), neto: Number(x.bruto) - Number(x.anulaciones) }));
ev.B_cpfin = b;
console.log(`  asientos=${b.asientos} por_evento=${JSON.stringify(b.por_evento)} por_estado=${JSON.stringify(b.por_estado)}`);
console.log(`  desbalanceados=${b.desbalanceados} duplicados=${b.duplicados.length} reglas=${JSON.stringify(b.reglas)}`);
console.log(`  anulaciones=${JSON.stringify(b.anulaciones)}`);
console.log(`  fin_posting_errors=${b.fin_posting_errors} (RECEPCION: ${b.fin_posting_errors_recepcion})`);
for (const t of b.por_tienda_neto) console.log(`  ${t.tienda.padEnd(20)} bruto=${fmt(t.bruto).padStart(15)} anulaciones=${fmt(t.anulaciones).padStart(11)} neto=${fmt(t.neto).padStart(15)}`);

// ═══ C. INVENTARIO ════════════════════════════════════════════════════════════
console.log('\n═══ C. INVENTARIO ═══');
const inv = await q(`SELECT
    sm.movement_type, count(*)::int AS n_movs,
    coalesce(sum(sm.quantity_change),0)::float8 AS unidades,
    coalesce(sum(sm.quantity_change * sm.unit_cost),0)::float8 AS valor
  FROM public.stock_movements sm WHERE sm.movement_type IN ('purchase','purchase_reverse') GROUP BY sm.movement_type`);
const sinRef = await q(`SELECT count(*)::int AS n FROM public.stock_movements sm
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NULL`);
const conRef = await q(`SELECT count(*)::int AS n FROM public.stock_movements sm
  WHERE sm.movement_type='purchase' AND sm.reference_id IS NOT NULL`);
// correspondencia recepción→movimiento (las 9 nuevas + FAC-VITALLCONS-001)
const nueve = ['0a133757-48e3-47c5-8055-9e2f45b02b1a','2e393c20-e8e4-40a0-ba72-14f5dbfe805f','5e1b6b87-4123-4b60-8c76-5c9bb09d2a38','646be7c5-9d74-47a2-871f-0f1c1f790424','351fa9fe-dec7-4fcb-8497-9663aadc7349','b7f5df9f-e80c-4f7b-9f15-a0878567b66c','6fb4548d-2277-4652-a164-1aabc6de0727','a57bd2c1-460b-4877-ab3d-64643bd7e10f','a3fe3e76-5ac8-4bf3-b25b-5451e4ea2d8e'];
const corr = await q(`SELECT
    rc.id::text, s.name AS tienda, rc.total_cost::float8 AS total_cost,
    (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS n_lineas,
    (SELECT count(*)::int FROM public.stock_movements sm
       WHERE sm.movement_type='purchase'
         AND (sm.reference_id::text=rc.id::text OR sm.notes LIKE '%'||rc.id::text||'%')) AS n_movs_ref,
    (SELECT count(*)::int FROM public.stock_movements sm
       WHERE sm.movement_type='purchase_reverse'
         AND (sm.reference_id::text=rc.id::text OR sm.notes LIKE '%'||rc.id::text||'%')) AS n_movs_reverse
  FROM public.receipts rc JOIN public.stores s ON s.id=rc.store_id
  WHERE rc.id IN ('${nueve.join("','")}','fd9d6c88-5db8-49ea-b185-8bc96cc93e63')
  ORDER BY s.name, rc.reception_date`);
const c = {
  movs_compra: inv, sin_reference_id: sinRef[0].n, con_reference_id: conRef[0].n,
  correspondencia: corr.map((x) => ({ tienda: x.tienda, id: x.id.slice(0, 8), lineas: x.n_lineas, movs: x.n_movs_ref, reversas: x.n_movs_reverse, total: x.total_cost })),
  todos_vinculados: corr.every((x) => x.n_movs_ref === x.n_lineas || x.n_lineas === 0),
};
ev.C_inventario = c;
console.log(`  movs compra: ${JSON.stringify(inv)}`);
console.log(`  purchase con reference_id: ${conRef[0].n} | sin: ${sinRef[0].n}`);
console.log(`  correspondencia (9+FVC): ${JSON.stringify(c.correspondencia)}`);
console.log(`  todas las líneas con movimiento: ${c.todos_vinculados ? 'SÍ' : 'NO — revisar'}`);

// WAC: verificación de presencia SIN recalcular (los costos originales se conservan)
const wac = await q(`SELECT p.name,
    p.cost_average::float8 AS wac,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.product_id=p.id AND sm.movement_type='purchase') AS movs_compra
  FROM public.products p
  WHERE p.id IN (SELECT DISTINCT product_id FROM public.receipt_items
    WHERE receipt_id IN ('${nueve.join("','")}','fd9d6c88-5db8-49ea-b185-8bc96cc93e63'))
  ORDER BY p.name LIMIT 15`);
ev.C_inventario.wac_sample = wac;
console.log(`  WAC sample (SIN recalcular): ${wac.length} productos`);

// ═══ D. FAC-VITALLCONS-001 ════════════════════════════════════════════════════
console.log('\n═══ D. FAC-VITALLCONS-001 ═══');
const fvc = await q(`SELECT
    rc.id::text, rc.status, rc.total_cost::float8 AS total_cost,
    (SELECT count(*)::int FROM public.receipt_items ri WHERE ri.receipt_id=rc.id) AS n_lineas,
    (SELECT count(*)::int FROM public.fin_entries e WHERE e.document_type='RECEPCION' AND e.document_id=rc.id) AS n_asientos,
    (SELECT count(*)::int FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
       WHERE e.document_type='RECEPCION' AND e.document_id=rc.id) AS n_movs_fin,
    (SELECT count(*)::int FROM public.stock_movements sm WHERE sm.movement_type='purchase'
       AND (sm.reference_id::text=rc.id::text OR sm.notes LIKE '%'||rc.id::text||'%')) AS n_movs_inv
  FROM public.receipts rc WHERE rc.id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`);
const fvcEntry = await q(`SELECT
    e.id::text, e.event, e.status, e.economic_date::text, e.posted_at::text,
    (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='debito') AS d,
    (SELECT coalesce(sum(m.amount),0)::float8 FROM public.fin_movements m WHERE m.entry_id=e.id AND m.sense='credito') AS c,
    (SELECT jsonb_agg(jsonb_build_object('cat', m.category_code, 'sen', m.sense, 'imp', m.amount))
       FROM public.fin_movements m WHERE m.entry_id=e.id) AS movs
  FROM public.fin_entries e
  WHERE e.document_type='RECEPCION' AND e.document_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'`);
// salidas posteriores de ENERVIDA sin duplicación (ventas+devoluciones+vales cuentan una vez)
const salidas = await q(`SELECT
    (SELECT count(*)::int FROM public.transactions t WHERE t.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND t.status='completed') AS ventas,
    (SELECT count(*)::int FROM public.devolutions d WHERE d.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND d.status='completed') AS devoluciones,
    (SELECT count(*)::int FROM public.issue_slips i WHERE i.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND i.status='completed') AS vales,
    (SELECT count(*)::int FROM public.fin_entries e WHERE e.store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38') AS asientos_tienda`);
ev.D_fac_vitallcons = { recepcion: fvc[0], asiento: fvcEntry, salidas_posteriores: salidas[0] };
console.log(`  recepción: ${JSON.stringify(fvc[0])}`);
for (const e of fvcEntry) console.log(`  asiento ${e.event}(${e.status}): D=${fmt(e.d)} C=${fmt(e.c)} → ${JSON.stringify(e.movs)}`);
console.log(`  salidas ENERVIDA posteriores: ${JSON.stringify(salidas[0])}`);

// ═══ RESUMEN ══════════════════════════════════════════════════════════════════
const resumen = {
  recepciones_98: recepciones.length === 98,
  todas_cuadran: noCuadran.length === 0,
  sin_asiento_cero: sinAsiento.length === 0,
  un_reconocimiento_por_doc: sinReconocimiento.length === 0,
  cpfin_balanceado: b.desbalanceados === 0,
  cpfin_sin_duplicados: b.duplicados.length === 0,
  cpfin_sin_errores: b.fin_posting_errors_recepcion === 0,
  anulacion_enlazada_una: b.anulaciones.total === 1 && b.anulaciones.enlazadas === 1,
  inventario_vinculado: c.todos_vinculados,
  fvc_total_ok: fvc[0].total_cost === 192039436,
  fvc_un_asiento: fvc[0].n_asientos === 1,
};
ev.resumen = resumen;
console.log('\n═══ RESUMEN ═══');
console.log(JSON.stringify(resumen, null, 1));
writeFileSync(resolve('docs/audits/receipt-integrity-20261114/m023-reconciliacion-posterior.json'), JSON.stringify(ev, null, 2));
console.log('\nevidencia → docs/audits/receipt-integrity-20261114/m023-reconciliacion-posterior.json');
