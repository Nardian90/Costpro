#!/usr/bin/env node
// ============================================================================
// M077 — CP-FIN-RECEIPT-UNIT-COST-1-CUP-011 · EJECUCIÓN EN PRODUCCIÓN (GOBERNADA)
// Ejecuta los lotes A–D (scripts/out/m011/sql-prod/*.sql) contra la BD de
// producción wthkddeleylijmonclxg con la autorización expresa del propietario
// (misión 011 §11). Canal: Management API /database/query — 1 llamada = 1
// transacción atómica (patrón m061/RECT-1, validado por sonda y E2E m075).
//
// Uso:
//   node scripts/m077-receipt-1cup-execute.mjs --execute   (PRODUCCIÓN — escritura)
//   node scripts/m077-receipt-1cup-execute.mjs --verify    (read-only · §13)
// Sin --execute la producción NUNCA se escribe (por defecto --verify).
// Requiere flags explícitos: ALLOW_PROD=read-only (lectura) y además
// ALLOW_PROD_WRITE=I_UNDERSTAND (escritura) — guard CP-INFRA-019.
// ============================================================================
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const MODE = process.argv[2] || '--verify';
const PROD = 'wthkddeleylijmonclxg';
const BASE = 'scripts/out/m011';
const FVC = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const ORIG = '93bb5da9-0afd-4325-baad-a275710062c5';
const E011 = '7ec9000b-0000-4000-8000-d11300000001';
const RECT1 = '7ec90009-0000-4000-8000-d0b300000001';
const RECT2 = '7ec90009-0000-4000-8000-d0b300000002';
const MISION = 'CP-FIN-RECEIPT-UNIT-COST-1-CUP-011';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

async function qProd(sql, label, write) {
  assertNotProduction({ mode: write ? 'write' : 'read', projectRef: PROD, context: `m077-${MODE}:${label}` });
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text || '[]');
}

// ════════════════════════════════ --execute ═════════════════════════════════
if (MODE === '--execute') {
  console.log('RECT-011 — TRANSACCIONES GOBERNADAS (misión 011 · autorización expresa del propietario §11)');
  const an = JSON.parse(readFileSync(resolve(BASE, 'sql-prod/expected.json'), 'utf8'));
  const orden = ['loteA_lineas.sql', 'loteB_capas.sql', 'loteC_wac.sql', 'loteD_asiento.sql'];
  const evid = { mision: MISION, operacion: 'RECT-011 lotes A–D', fecha_inicio_utc: new Date().toISOString(),
    canal: 'Management API /database/query (1 llamada = 1 transacción atómica)',
    proyecto: `${PROD} (producción)`, autorizacion: 'Propietario — misión 011 §1/§11 (regla 1,00 CUP/u)',
    lotes: [] };
  for (const f of orden) {
    const sql = readFileSync(resolve(BASE, 'sql-prod', f), 'utf8');
    const t0 = Date.now();
    const rows = await qProd(sql, f, true);
    evid.lotes.push({ lote: f, ms: Date.now() - t0, resultado: rows });
    console.log(`LOTE ${f} COMMIT OK (${Date.now() - t0} ms):`, JSON.stringify(rows));
  }
  evid.fecha_fin_utc = new Date().toISOString();
  evid.resultado = 'LOTES A–D APLICADOS — verificar con --verify (§13)';
  writeFileSync(resolve(BASE, 'prod-ejecucion.json'), JSON.stringify(evid, null, 2));
  console.log('Evidencia →', resolve(BASE, 'prod-ejecucion.json'));
  process.exit(0);
}

// ════════════════════════════════ --verify (§13) ═════════════════════════════
if (MODE === '--verify') {
  const an = JSON.parse(readFileSync(resolve('scripts/out/m074-matriz-1cup.json'), 'utf8'));
  const checks = [];
  const chk = (id, cond, detalle) => {
    checks.push({ id, resultado: cond ? 'PASS' : 'FAIL', detalle: String(detalle).slice(0, 300) });
    console.log(`${cond ? 'PASS' : 'FAIL'} — ${id}: ${String(detalle).slice(0, 170)}`);
  };
  // V1 · 101/101 líneas a 1,00 CUP · moneda CUP · tasa 1 · subtotal = qty
  const lin = await qProd(`SELECT count(*)::int AS n,
      count(*) FILTER (WHERE unit_cost=1 AND moneda_recepcion='CUP' AND tasa_cambio_recepcion=1)::int AS ok,
      coalesce(sum(unit_cost*tasa_cambio_recepcion*quantity),0) AS total,
      count(*) FILTER (WHERE unit_cost*tasa_cambio_recepcion*quantity <> quantity)::int AS subtotales_mal
    FROM public.receipt_items WHERE receipt_id='${FVC}'`, 'V1');
  chk('V1_101_lineas_1CUP', lin[0].n === 101 && lin[0].ok === 101 && Number(lin[0].total) === 5861.50 && lin[0].subtotales_mal === 0, JSON.stringify(lin[0]));
  // V2 · cabecera
  const hdr = await qProd(`SELECT total_cost, payment_status, coalesce(paid_amount,0) AS paid, status FROM public.receipts WHERE id='${FVC}'`, 'V2');
  chk('V2_cabecera_5861_50', Number(hdr[0].total_cost) === 5861.50 && hdr[0].payment_status === 'unpaid' && Number(hdr[0].paid) === 0 && hdr[0].status === 'active', JSON.stringify(hdr[0]));
  // V3 · capas de la recepción a 1
  const cap = await qProd(`SELECT count(*)::int AS n, count(*) FILTER (WHERE unit_cost<>1)::int AS sucias,
      coalesce(sum(quantity_change*unit_cost),0) AS total FROM public.stock_movements
    WHERE reference_id='${FVC}' AND movement_type='purchase'`, 'V3');
  chk('V3_capas_a_1', cap[0].n === 101 && cap[0].sucias === 0 && Number(cap[0].total) === 5861.50, JSON.stringify(cap[0]));
  // V4 · WAC de los 25 productos actualizado al objetivo; resto sin cambio
  const wacObj = an['wac_updates'];
  const wacOk = await qProd(`SELECT count(*)::int AS n FROM public.products p JOIN (VALUES ${wacObj.map((w) => `('${w.product_id}'::uuid, ${w.wac_new}::numeric)`).join(', ')}) v(id, w)
    ON p.id=v.id WHERE p.cost_average=v.w`, 'V4');
  chk('V4_wac_25_conformes', wacOk[0].n === wacObj.length, `conformes=${wacOk[0].n}/${wacObj.length}`);
  // V5 · precios de venta intactos (vs matriz congelada)
  const precios = await qProd(`SELECT count(*)::int AS n FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id
    JOIN (VALUES ${an['matriz'].map((m) => `('${m.product_id}'::uuid, ${m.precio_venta ?? 'NULL'}::numeric)`).join(', ')}) v(id, precio) ON ri.product_id=v.id
    WHERE ri.receipt_id='${FVC}' AND (p.price IS DISTINCT FROM v.precio)`, 'V5');
  chk('V5_precios_intactos', precios[0].n === 0, `precios divergentes=${precios[0].n}`);
  // V6 · asiento RECT-011 balanceado e importes exactos
  const bal = await qProd(`SELECT coalesce(sum(CASE WHEN sense='debito' THEN amount ELSE -amount END),0) AS d,
      count(*)::int AS n FROM public.fin_movements WHERE entry_id='${E011}'`, 'V6a');
  const movs = await qProd(`SELECT category_code, sense, amount FROM public.fin_movements WHERE entry_id='${E011}' ORDER BY category_code`, 'V6b');
  const por = Object.fromEntries(movs.map((m) => [m.category_code, Number(m.amount)]));
  const imp = an['asiento']['creditos_centavos'];
  chk('V6_asiento_balance', bal[0].n === 5 && Number(bal[0].d) === 0, JSON.stringify(bal[0]));
  chk('V7_importes_exactos', por.PAS_CXP_PROV === 40733723.50 && por.ACT_INVENTARIO === Number(imp.inv) &&
    por.GAS_COSTO_VENTAS === Number(imp.cogs) && por.GAS_VALES === Number(imp.vales) && por.GAS_PERDIDA_INV === Number(imp.perdida), JSON.stringify(por));
  // V8 · CXP neta del documento = 5.861,50 · RECT-1/RECT-2 intactos
  const cxp = await qProd(`SELECT coalesce(sum(CASE WHEN fm.sense='credito' THEN fm.amount ELSE -fm.amount END),0) AS neta
    FROM public.fin_movements fm JOIN public.fin_entries fe ON fe.id=fm.entry_id
    WHERE fe.document_id='${FVC}' AND fm.category_code='PAS_CXP_PROV'`, 'V8');
  chk('V8_cxp_neta_5861_50', Number(cxp[0].neta) === 5861.50, `cxp_neta=${cxp[0].neta}`);
  const asientos = await qProd(`SELECT id, event, status, reversal_of FROM public.fin_entries WHERE document_id='${FVC}' ORDER BY posted_at`, 'V9');
  const idsAs = asientos.map((e) => e.id);
  chk('V9_asientos_4_intactos', asientos.length === 4 && idsAs[0] === ORIG && idsAs[1] === RECT1 && idsAs[2] === RECT2 && idsAs[3] === E011 &&
    asientos.every((e) => e.status === 'posted'), JSON.stringify(asientos.map((e) => e.event)));
  // V10 · T12 activo · fin_posting_errors sin errores nuevos injustificados
  const t12 = await qProd(`SELECT tgenabled FROM pg_trigger WHERE tgname='fin_t12_receipt_annulment_block'`, 'V10a');
  chk('V10_T12_activo', t12.length === 1 && t12[0].tgenabled === 'O', JSON.stringify(t12));
  const fpe = await qProd(`SELECT count(*)::int AS n FROM public.fin_posting_errors WHERE created_at > now() - interval '4 hours' AND document_id='${FVC}'`, 'V10b');
  chk('V11_posting_errors_0', fpe[0].n === 0, `errores FVC recientes=${fpe[0].n}`);
  // V12 · cero cambios en otras recepciones / otros productos / precios
  const otrasLineas = await qProd(`SELECT count(*)::int AS n FROM public.receipt_items WHERE receipt_id<>'${FVC}' AND updated_at > now() - interval '4 hours'`, 'V12a');
  chk('V12_otras_recepciones_0', otrasLineas[0].n === 0, `líneas ajenas tocadas=${otrasLineas[0].n}`);
  const otrosMovs = await qProd(`SELECT count(*)::int AS n FROM public.stock_movements WHERE (reference_id IS DISTINCT FROM '${FVC}' OR movement_type<>'purchase') AND updated_at > now() - interval '4 hours'`, 'V12b');
  chk('V13_otros_movimientos_0', otrosMovs[0].n === 0, `movimientos ajenos tocados=${otrosMovs[0].n}`);
  const otrosProds = await qProd(`SELECT count(*)::int AS n FROM public.products WHERE updated_at > now() - interval '4 hours'
    AND id NOT IN (${an['matriz'].map((m) => `'${m.product_id}'`).join(',')})`, 'V12c');
  chk('V14_otros_productos_0', otrosProds[0].n === 0, `productos ajenos tocados=${otrosProds[0].n}`);
  const otrasCab = await qProd(`SELECT count(*)::int AS n FROM public.receipts WHERE id<>'${FVC}' AND updated_at > now() - interval '4 hours'`, 'V12d');
  chk('V15_otras_cabeceras_0', otrasCab[0].n === 0, `cabeceras ajenas tocadas=${otrasCab[0].n}`);
  // V16 · SKU111/112/999 intactos (§7/§8)
  const prot = await qProd(`SELECT p.sku, ri.unit_cost, ri.moneda_recepcion, p.price, p.is_service, p.cost_average AS wac
    FROM public.receipt_items ri JOIN public.products p ON p.id=ri.product_id
    WHERE ri.receipt_id='${FVC}' AND p.sku IN ('111','112','999') ORDER BY p.sku`, 'V16');
  const pMap = Object.fromEntries(prot.map((r) => [r.sku, r]));
  chk('V16_protegidos_111_112_999', prot.length === 3 &&
    Number(pMap['111'].unit_cost) === 1 && Number(pMap['112'].unit_cost) === 1 && Number(pMap['999'].unit_cost) === 1 &&
    Number(pMap['111'].wac) === 1 && Number(pMap['112'].wac) === 1 && pMap['999'].is_service === true &&
    Number(pMap['111'].price) === 2000 && Number(pMap['112'].price) === 1000, JSON.stringify(prot.map((r) => `${r.sku}:${r.unit_cost}/${r.wac}/${r.price}`)));
  // V17 · auditoría RECT-011 registrada (78+78+25+1+1 = 183 filas, trace RECT011-PROD)
  const aud = await qProd(`SELECT action, count(*)::int AS n FROM public.audit_logs WHERE trace_id='RECT011-PROD' GROUP BY 1 ORDER BY 1`, 'V17');
  const porAccion = Object.fromEntries(aud.map((r) => [r.action, r.n]));
  chk('V17_auditoria_completa', (porAccion.SYSTEM_RECT011_VALUATION || 0) === 78 && (porAccion.SYSTEM_RECT011_MOV_UC || 0) === 78 &&
    (porAccion.SYSTEM_RECT011_WAC || 0) === 25 && (porAccion.SYSTEM_RECT011_TOTAL || 0) === 1 && (porAccion.SYSTEM_RECT011_ENTRY || 0) === 1,
    JSON.stringify(porAccion));
  // V18 · idempotencia read-only: re-ejecución tocaría 0 filas
  const idem = await qProd(`SELECT
    (SELECT count(*)::int FROM public.receipt_items WHERE receipt_id='${FVC}' AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)) AS s1,
    (SELECT count(*)::int FROM public.receipts WHERE id='${FVC}' AND total_cost<>5861.50) AS s2,
    (SELECT count(*)::int FROM public.stock_movements WHERE reference_id='${FVC}' AND movement_type='purchase' AND unit_cost<>1) AS s3,
    (SELECT count(*)::int FROM public.wac_change_log WHERE id::text LIKE '7ec9000b-%') AS s4,
    (SELECT count(*)::int FROM public.fin_entries WHERE id='${E011}') AS s5`, 'V18');
  chk('V18_idempotencia_cero', idem[0].s1 === 0 && idem[0].s2 === 0 && idem[0].s3 === 0 && idem[0].s4 === 25 && idem[0].s5 === 1, JSON.stringify(idem[0]));
  // V19 · wac_change_log coherente con el asiento (25 entradas de la misión)
  const fails = checks.filter((c) => c.resultado === 'FAIL');
  const veredicto = fails.length === 0 ? 'RECT-011 VERIFICADA — misión cumplida (§13)' : `CON ${fails.length} FALLO(S): ${fails.map((f) => f.id).join(', ')}`;
  writeFileSync(resolve(BASE, 'prod-verificacion.json'), JSON.stringify({ fecha_utc: new Date().toISOString(), modo: '--verify', checks,
    total: { pass: checks.length - fails.length, fail: fails.length }, veredicto }, null, 2));
  console.log(`\n${veredicto}`);
  process.exit(fails.length ? 1 : 0);
}

console.error('Modo no reconocido. Usa --execute | --verify');
process.exit(2);
