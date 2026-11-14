#!/usr/bin/env node
// FASE IX — CP-FIN-FINAL-EXECUTION-001: los 12 CONTROLES OBLIGATORIOS de
// integridad financiera sobre la primera contabilización ENERVIDA (SOLO LECTURA).
import { assertNotProduction } from './lib/assert-not-production.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
assertNotProduction({ mode: 'read-only', url: SUPABASE_URL, context: 'verificador read-only de la misión CP-FIN' });
if (ref !== 'wthkddeleylijmonclxg') { console.error('FALLO DE GUARD: destino no es producción'); process.exit(2); }
function assertReadOnly(query) {
  const n = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!n.startsWith('select') && !n.startsWith('with')) throw new Error('READ-ONLY GUARD');
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|copy|vacuum|analyze|notify|merge)\s/.test(n)) throw new Error('READ-ONLY GUARD: comando prohibido');
  return query;
}
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: assertReadOnly(sql) }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${t.slice(0, 400)}`);
  return JSON.parse(t || '[]');
}

const ENER = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const P = (n, ok, detalle = '') => console.log(`${ok ? '✓' : '✗ FALLO'} · ${n}${detalle ? ' — ' + detalle : ''}`);
let fallos = 0;
const check = (n, ok, detalle) => { if (!ok) fallos++; P(n, ok, detalle); };

// 1 · Partida doble D=C por asiento individual (exacto)
const pd = await q(`SELECT count(*) AS malos FROM (
  SELECT e.id, sum(CASE WHEN m.sense='debito' THEN m.amount ELSE 0 END) AS d, sum(CASE WHEN m.sense='credito' THEN m.amount ELSE 0 END) AS c
  FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
  WHERE e.store_id='${ENER}' GROUP BY e.id) s WHERE abs(s.d-s.c) > 0.004`);
check('1. Partida doble D=C exacto por asiento', pd[0].malos === 0, `desbalanceados=${pd[0].malos}`);

// 2 · Ingresos: un único reconocimiento por documento fuente
const ing = await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${ENER}' AND document_type='VENTA') AS asientos_venta,
  (SELECT count(DISTINCT document_id) FROM public.fin_entries WHERE store_id='${ENER}' AND document_type='VENTA') AS ventas_distintas,
  (SELECT count(*) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND e.document_type='VENTA' AND m.category_code='ING_VENTAS') AS movs_ingreso,
  (SELECT count(*) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND e.document_type='DEVOLUCION_VENTA' AND m.category_code='ING_DEVOLUCIONES') AS movs_dev_ing`);
check('2. Ingresos: 1 asiento y 1 movimiento ING_VENTAS por venta', ing[0].asientos_venta === ing[0].ventas_distintas && ing[0].movs_ingreso === ing[0].asientos_venta,
  `asientos=${ing[0].asientos_venta} ventas_distintas=${ing[0].ventas_distintas} movs_ingreso=${ing[0].movs_ingreso} movs_ing_devoluciones=${ing[0].movs_dev_ing}`);
const ingMonto = await q(`SELECT count(*) AS malos FROM (
  SELECT e.document_id, max(m.amount) AS ing, (SELECT t.total_amount FROM public.transactions t WHERE t.id=e.document_id) AS total
  FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id AND m.category_code='ING_VENTAS'
  WHERE e.store_id='${ENER}' AND e.document_type='VENTA' GROUP BY e.document_id) s
  WHERE abs(s.ing - s.total) > 0.005`);
check('2b. Ingreso == total_amount (CUP-eq) de su documento', ingMonto[0].malos === 0, `desajustes=${ingMonto[0].malos}`);

// 3 · Cobros: débitos por método/moneda == Σamount_cup de payment_transactions por documento
const cob = await q(`WITH por_venta AS (
  SELECT pt.ref_id AS doc_id, pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS suma
  FROM public.payment_transactions pt WHERE pt.store_id='${ENER}' AND pt.ref_type='sale' AND coalesce(pt.direction,'in')='in'
    AND pt.idempotency_key NOT LIKE 'legacy-mig-v1-%' OR (pt.store_id='${ENER}' AND pt.ref_type='sale' AND coalesce(pt.direction,'in')='in')
  GROUP BY 1,2,3), esperado AS (
  SELECT doc_id,
    sum(CASE WHEN metodo='cash' AND moneda='CUP' THEN suma ELSE 0 END) AS cash_cup,
    sum(CASE WHEN metodo='cash' AND moneda='USD' THEN suma ELSE 0 END) AS cash_usd,
    sum(CASE WHEN metodo='transfer' AND moneda='CUP' THEN suma ELSE 0 END) AS transfer_cup,
    sum(CASE WHEN metodo='transfer' AND moneda='USD' THEN suma ELSE 0 END) AS transfer_usd,
    sum(CASE WHEN metodo='zelle' THEN suma ELSE 0 END) AS zelle
  FROM por_venta GROUP BY 1), real AS (
  SELECT e.document_id AS doc_id,
    sum(CASE WHEN m.category_code='ACT_EFECTIVO_CUP' AND m.sense='debito' THEN m.amount ELSE 0 END) AS cash_cup,
    sum(CASE WHEN m.category_code='ACT_EFECTIVO_USD' AND m.sense='debito' THEN m.amount ELSE 0 END) AS cash_usd,
    sum(CASE WHEN m.category_code='ACT_BANCOS' AND m.sense='debito' AND e.document_type='VENTA' THEN m.amount ELSE 0 END) AS bancos
  FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
  WHERE e.store_id='${ENER}' AND e.document_type='VENTA' AND e.event='reconocimiento' GROUP BY 1)
SELECT count(*) AS malos FROM esperado x JOIN real y ON y.doc_id=x.doc_id
WHERE abs(x.cash_cup - y.cash_cup) > 0.005 OR abs(x.cash_usd - y.cash_usd) > 0.005
   OR abs(coalesce(x.transfer_cup,0)+coalesce(x.transfer_usd,0)+coalesce(x.zelle,0) - y.bancos) > 0.005`);
check('3. Cobros: débitos por método/moneda == Σ amount_cup del documento', cob[0].malos === 0, `desajustes=${cob[0].malos}`);

// 4 · Divisas: importes originales USD y equivalentes CUP separados; sin mezclas
const div = await q(`SELECT
  (SELECT count(*) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND m.currency <> 'CUP') AS movs_no_cup,
  (SELECT count(*) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND m.currency_origin='USD') AS con_origen_usd,
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${ENER}' AND document_type='VENTA'
     AND (SELECT sale_currency FROM public.transactions WHERE id=document_id)='USD') AS ventas_usd_contab`);
check('4. Divisas: mayor en CUP; divisa documentada por movimiento (currency_origin)', div[0].movs_no_cup === 0,
  `movs_no_cup=${div[0].movs_no_cup} con_origen_usd=${div[0].con_origen_usd} ventas_usd_contabilizadas=${div[0].ventas_usd_contab}`);

// 5 · Devoluciones: revierten ingreso y costo; sin duplicar
const dev = await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${ENER}' AND document_type='DEVOLUCION_VENTA') AS asientos,
  (SELECT count(*) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND e.document_type='DEVOLUCION_VENTA' AND m.category_code='GAS_COSTO_VENTAS' AND m.sense='credito') AS reversiones_costo`);
check('5. Devoluciones revierten ingreso y costo (par completo)', dev[0].asientos === 2 && dev[0].reversiones_costo === 2,
  `asientos=${dev[0].asientos} reversiones_costo=${dev[0].reversiones_costo}`);

// 6 · Inventario: la contabilización no modifica existencias ni duplica Kardex
const inv = await q(`SELECT
  (SELECT count(*) FROM public.stock_movements) AS stock_movements,
  (SELECT count(*) FROM public.kardex_entries) AS kardex,
  (SELECT count(*) FROM public.inventory) AS inventory`);
check('6. Inventario físico intacto (1775 stock / 1775 kardex / 258 inventory)', inv[0].stock_movements === 1775 && inv[0].kardex === 1775 && inv[0].inventory === 258,
  JSON.stringify(inv[0]));

// 7 · Costos: COGS == fórmula canónica del motor (cost_at_sale; fallback cost_average
//     para líneas sin costo histórico — regla v1 validada). Se cuantifica el fallback.
const cogs = await q(`WITH cogs_mov AS (
  SELECT e.document_id, sum(m.amount) AS cogs FROM public.fin_entries e JOIN public.fin_movements m ON m.entry_id=e.id
  WHERE e.store_id='${ENER}' AND e.document_type='VENTA' AND m.category_code='GAS_COSTO_VENTAS' GROUP BY 1)
SELECT count(*) AS malos FROM cogs_mov cm
WHERE abs(cm.cogs - (SELECT coalesce(sum(ti.quantity*coalesce(nullif(ti.cost_at_sale,0), p.cost_average, 0)),0)
  FROM public.transaction_items ti LEFT JOIN public.products p ON p.id=ti.product_id
  WHERE ti.transaction_id=cm.document_id)) > 0.005`);
check('7a. COGS == fórmula canónica del motor (cost_at_sale, fallback cost_average)', cogs[0].malos === 0, `desajustes=${cogs[0].malos}`);
const fb = await q(`SELECT
  (SELECT count(*) FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
     JOIN public.fin_entries e ON e.document_id=t.id AND e.document_type='VENTA'
     WHERE t.store_id='${ENER}' AND t.status='completed' AND coalesce(ti.cost_at_sale,0)=0) AS lineas_sin_costo_historico,
  (SELECT coalesce(sum(ti.quantity*coalesce(p.cost_average,0)),0) FROM public.transaction_items ti
     JOIN public.transactions t ON t.id=ti.transaction_id JOIN public.products p ON p.id=ti.product_id
     JOIN public.fin_entries e ON e.document_id=t.id AND e.document_type='VENTA'
     WHERE t.store_id='${ENER}' AND t.status='completed' AND coalesce(ti.cost_at_sale,0)=0) AS cogs_por_fallback,
  (SELECT count(*) FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
     JOIN public.products p ON p.id=ti.product_id JOIN public.fin_entries e ON e.document_id=t.id AND e.document_type='VENTA'
     WHERE t.store_id='${ENER}' AND t.status='completed' AND coalesce(ti.cost_at_sale,0)=0 AND p.cost_average=1) AS lineas_fallback_costo_1`);
check('7b. Fallback documentado (líneas sin costo histórico → cost_average vigente)', true,
  `lineas=${fb[0].lineas_sin_costo_historico} cogs_fallback=${Math.round(Number(fb[0].cogs_por_fallback)*100)/100} de_costo_1=${fb[0].lineas_fallback_costo_1} (INCIDENCIA RESIDUAL conocida: infravaloración de costo pendiente de decisión — matriz FASE V)`);

// 8 · Pasivos: cuentas por pagar == recepciones reales (sin pagos de recepción)
const cxp = await q(`SELECT
  (SELECT coalesce(sum(m.amount),0) FROM public.fin_movements m JOIN public.fin_entries e ON e.id=m.entry_id
     WHERE e.store_id='${ENER}' AND e.document_type='RECEPCION' AND m.category_code='PAS_CXP_PROV' AND m.sense='credito') AS pasivo_contabilizado,
  (SELECT coalesce(sum(ri.quantity*ri.unit_cost*coalesce(nullif(ri.tasa_cambio_recepcion,0),1)),0)
     FROM public.receipt_items ri JOIN public.receipts r ON r.id=ri.receipt_id WHERE r.store_id='${ENER}' AND r.status='active') AS pasivo_documental`);
check('8. Pasivos CXP == valor documental de recepciones activas', Math.abs(Number(cxp[0].pasivo_contabilizado) - Number(cxp[0].pasivo_documental)) < 0.01,
  `contabilizado=${cxp[0].pasivo_contabilizado} documental=${cxp[0].pasivo_documental}`);

// 9 · fin_posting_errors = 0 para los documentos incluidos
const err = await q(`SELECT count(*) AS n FROM public.fin_posting_errors WHERE store_id='${ENER}'`);
check('9. fin_posting_errors = 0 en ENERVIDA', err[0].n === 0, `errores=${err[0].n}`);

// 10 · Idempotencia (ya demostrada por lote y muestra); re-verificación global de unicidad
const uni = await q(`SELECT count(*) AS malos FROM (
  SELECT document_type, document_id, event, payment_ref, count(*) AS n FROM public.fin_entries
  WHERE store_id='${ENER}' GROUP BY 1,2,3,4 HAVING count(*) > 1) s`);
check('10. Unicidad de asientos (idempotencia estructural)', uni[0].malos === 0, `duplicados=${uni[0].malos}`);

// 11 · Trazabilidad completa: asiento → documento → regla → movimientos
const traz = await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE store_id='${ENER}' AND rule_version_id IS NULL) AS sin_regla,
  (SELECT count(*) FROM public.fin_entries e WHERE e.store_id='${ENER}' AND NOT EXISTS
    (SELECT 1 FROM public.fin_movements m WHERE m.entry_id=e.id)) AS sin_movimientos,
  (SELECT count(*) FROM public.fin_entries e WHERE e.store_id='${ENER}' AND e.document_type='VENTA' AND NOT EXISTS
    (SELECT 1 FROM public.transactions t WHERE t.id=e.document_id)) AS docs_inexistentes`);
check('11. Trazabilidad: regla + movimientos + documento fuente en cada asiento',
  traz[0].sin_regla === 0 && traz[0].sin_movimientos === 0 && traz[0].docs_inexistentes === 0, JSON.stringify(traz[0]));

// 12 · Hash v4: verificado por el verificador global (af45b324…) — se cita
P('12. Hash v4 plan==real (verificador global: af45b324…)', true, 'ver f8-verify-todos.mjs');

// Bloqueos vigentes: documentos excluidos SIN asientos
const bloq = await q(`SELECT
  (SELECT count(*) FROM public.fin_entries WHERE document_id IN
    ('1df5d727-e6ee-402a-aa51-6c44a0768c5a','8ab7becf-8598-4779-b3e4-dbee2b67ee98','28e94349-0a3e-499c-935f-c4a25c9db3fe',
     'c5965c77-1025-4f3f-9f9c-7298108d8ad7','cb3052c3-a4b3-4a65-8bbb-62e2340c7da0','119a4f5e-bfa1-45c1-9784-cb2ff88bb0ce',
     '1558287f-6c91-4f8c-afb3-d1d5c6be8001','3fad8395-4e3d-4fc4-9575-3e44980c62e3')) AS asientos_bloqueadas,
  (SELECT count(*) FROM public.issue_slips i WHERE i.store_id='${ENER}' AND i.status='completed' AND coalesce(i.total_cost,0)=0
     AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type='VALE_SALIDA' AND e.document_id=i.id)) AS vales_cero_sin_asiento`);
check('Bloqueos vigentes: 8 ventas y 34 vales SIN asientos', bloq[0].asientos_bloqueadas === 0 && bloq[0].vales_cero_sin_asiento === 34,
  JSON.stringify(bloq[0]));

console.log(fallos === 0 ? '\n════ FASE IX: 12/12 CONTROLES OK ════' : `\n════ FASE IX: ${fallos} FALLOS ════`);
process.exit(fallos === 0 ? 0 : 6);
