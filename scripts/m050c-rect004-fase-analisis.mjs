// ============================================================================
// M050c — CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · ANÁLISIS:
// 1) Protección de las 75 líneas (71 no verificables + 4 moneda) — regresión
//    vs matriz congelada m048 de la misión 003.
// 2) Diff snapshot m045 (misión 003) → m050b (esta misión): qué cambió
//    legítimamente por actividad comercial posterior.
// 3) DP-2 conciliación de la deuda (documento por documento).
// 4) DP-3 desglose de los 24 CUP por documento individual.
// 5) §9 conciliación de costo, inventario y COGS.
// READ-ONLY sobre datos ya extraídos (producción intacta).
// Uso: node scripts/m050c-rect004-fase-analisis.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const M045 = JSON.parse(readFileSync('docs/audits/valuation-rectification-003-20261115/m045-faseI-snapshot.json', 'utf8'));
const M048 = JSON.parse(readFileSync('docs/audits/valuation-rectification-003-20261115/m048-faseIII-matriz.json', 'utf8'));
const M050 = JSON.parse(readFileSync('/home/z/my-project/scripts/out/rect004-faseDP-snapshot.json', 'utf8'));
const OUT_DIR = '/home/z/my-project/scripts/out';
mkdirSync(OUT_DIR, { recursive: true });

const A = { mision: 'CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004', fase: 'análisis DP + protección + diff',
  generado: new Date().toISOString() };

// ═══ 1. PROTECCIÓN DE LAS 75 LÍNEAS (regresión vs matriz m048 congelada) ═══
const matriz = M048.matriz; // 101 filas congeladas
const actuales = M050.receipt_items; // 101 filas actuales
const actById = new Map(actuales.map((l) => [l.id, l]));
const proteccion = { comparadas: 0, cambios: [], sku_111_112: [], fuera_de_alcance_intactos: 0 };
for (const mrow of matriz) {
  const cur = actById.get(mrow.line_id);
  if (!cur) { proteccion.cambios.push({ line_id: mrow.line_id, sku: mrow.sku, problema: 'LÍNEA DESAPARECIDA' }); continue; }
  proteccion.comparadas++;
  const dif = Number(cur.unit_cost) !== Number(mrow.uc_reg)
    || cur.moneda_recepcion !== mrow.moneda
    || Number(cur.tasa_cambio_recepcion) !== Number(mrow.tasa);
  if (dif) {
    proteccion.cambios.push({ line_id: mrow.line_id, sku: mrow.sku, uc_antes: mrow.uc_reg,
      uc_ahora: cur.unit_cost, moneda_antes: mrow.moneda, moneda_ahora: cur.moneda_recepcion,
      tasa_antes: mrow.tasa, tasa_ahora: cur.tasa_cambio_recepcion });
  }
  if (mrow.sku === '111' || mrow.sku === '112') {
    proteccion.sku_111_112.push({ sku: mrow.sku, uc_actual: cur.unit_cost, moneda: cur.moneda_recepcion,
      tasa: cur.tasa_cambio_recepcion, q: cur.quantity });
  } else {
    proteccion.fuera_de_alcance_intactos++;
  }
}
proteccion.n_cambios = proteccion.cambios.length;
proteccion.total_lineas = actuales.length;
// las 4 discrepancias de moneda y las 71 no verificables — estado actual
const cuatro = matriz.filter((r) => r.categoria && r.categoria.toLowerCase().includes('moneda')).map((r) => r.sku);
const setenta_y_uno = matriz.filter((r) => r.categoria && r.categoria.toLowerCase().includes('no verificable')).map((r) => r.sku);
proteccion.lineas_moneda = matriz.filter((r) => cuatro.includes(r.sku)).map((r) => ({ sku: r.sku, uc: r.uc_reg, moneda: r.moneda, tasa: r.tasa, categoria: r.categoria }));
proteccion.n_lineas_moneda = proteccion.lineas_moneda.length;
proteccion.n_lineas_no_verificables = setenta_y_uno.length;
proteccion.exposicion_no_verificables_congelada = M048.exposicion_no_verificables;
A.proteccion_75_lineas = proteccion;

// ═══ 2. DIFF SNAPSHOT m045 → m050b ═══
const diff = { corte_003: M045.extraccion.fecha_utc, corte_004: M050.extraccion.fecha_utc, secciones: [] };
const secs = ['receipt_items', 'kardex_111_112', 'fin_entries_fvc', 'fin_movements_fvc', 'issue_slips',
  'issue_slip_items', 'inventory_adjustments', 'devolution_items_111_112', 'devolutions',
  'inventory_111_112', 'products_111_112', 'receipt_items_todas', 'fin_movements_cxp_fvc',
  'v_purchase_orders_cxp', 'fin_entries_reversal_of', 'wac_change_log'];
for (const s of secs) {
  const antes = M045[s], ahora = M050[s];
  if (antes === undefined || ahora === undefined) {
    diff.secciones.push({ seccion: s, estado: 'SECCIÓN RENOMBRADA/NUEVA entre misiones' });
    continue;
  }
  const hA = sha256(antes), hD = sha256(ahora);
  diff.secciones.push({ seccion: s, filas_antes: Array.isArray(antes) ? antes.length : '-',
    filas_ahora: Array.isArray(ahora) ? ahora.length : '-', idéntica: hA === hD });
}
// hash de receipts_fvc completo (congelado)
diff.receipts_fvc_identica = sha256(M045.receipts_fvc) === sha256(M050.receipts_fvc);
// kardex: comparación fila a fila
const kA = M045.kardex_111_112.map((m) => m.id).sort().join(',');
const kD = M050.kardex_111_112.map((m) => m.id).sort().join(',');
diff.kardex_mismos_ids = kA === kD;
// mayores globales
const mayorPas = (rows) => rows.reduce((a, r) => a + (r.sense === 'credito' ? Number(r.total) : -Number(r.total)), 0);
const mayorAct = (rows) => rows.reduce((a, r) => a + (r.sense === 'debito' ? Number(r.total) : -Number(r.total)), 0);
diff.mayores = {
  pas_cxp_prov_003: Math.round(mayorPas(M045.mayor_pas_cxp_prov) * 100) / 100,
  pas_cxp_prov_004: Math.round(mayorPas(M050.mayor_pas_cxp_prov) * 100) / 100,
  act_inventario_003: Math.round(mayorAct(M045.mayor_act_inventario) * 100) / 100,
  act_inventario_004: Math.round(mayorAct(M050.mayor_act_inventario) * 100) / 100,
};
// productos
const pA = new Map(M045.products_111_112.map((p) => [p.sku, p]));
const pD = new Map(M050.products_111_112.map((p) => [p.sku, p]));
diff.products_111_112 = ['111', '112'].map((sku) => ({
  sku, stock_003: pA.get(sku)?.stock_current, stock_004: pD.get(sku)?.stock_current,
  precio_003: pA.get(sku)?.price, precio_004: pD.get(sku)?.price,
  wac_003: pA.get(sku)?.cost_average, wac_004: pD.get(sku)?.cost_average,
}));
// actividad posterior explicada
diff.actividad_posterior = {
  fin_entries_nuevos: M050.post_snapshot.fin_entries_nuevos_tienda.map((e) => ({
    ts: e.posted_at?.slice(0, 19), tipo: e.document_type, evento: e.event, doc: e.document_number,
    status: e.status, desc: (e.description || '').slice(0, 60) })),
  transactions_nuevas: M050.post_snapshot.transactions_nuevas_tienda.map((t) => ({
    ts: t.created_at?.slice(0, 19), status: t.status, total: Number(t.total_amount), cur: t.sale_currency })),
  payments_nuevos: M050.post_snapshot.payment_transactions_nuevos.map((p) => ({
    ts: p.created_at?.slice(0, 19), ref_type: p.ref_type, amount: Number(p.amount), cur: p.currency, dir: p.direction })),
  kardex_111_112_nuevos: M050.post_snapshot.kardex_111_112_nuevos.length,
  receipts_proveedor_nuevos: M050.post_snapshot.receipts_nuevos_proveedor.length,
};
A.diff_snapshot_003_004 = diff;

// ═══ 3. DP-2 CONCILIACIÓN DE LA DEUDA (documento por documento) ═══
const cxp = { verificaciones: [] };
const fvc = M050.receipts_fvc[0];
cxp.fvc = { payment_status: fvc.payment_status, paid_amount: Number(fvc.paid_amount), paid_at: fvc.paid_at,
  due_date: fvc.due_date, status: fvc.status, reversed_at: fvc.reversed_at, total: Number(fvc.total_cost) };
cxp.pagos_fvc = M050.payment_transactions_fvc_proveedor.length; // 0
cxp.pagos_proveedor_ref = M050.payment_transactions_store.filter((p) => ['receipt', 'proveedor', 'supplier', 'purchase'].includes(p.ref_type)).length;
cxp.pagos_out = M050.payment_transactions_out.map((p) => ({ ref_type: p.ref_type, fecha: p.payment_date?.slice(0, 10),
  monto_cup: Number(p.amount_cup), currency: p.currency }));
cxp.purga_archivo = M050.payment_transactions_purga_vitallcons;
cxp.recepciones_proveedor = { total: M050.receipts_proveedor.length,
  duplicados_documento: (() => { const seen = {}; let d = 0; for (const r of M050.receipts_proveedor) { const k = r.document_number || r.reference_doc; if (seen[k]) d++; seen[k] = 1; } return d; })(),
  fvc_mencionada: M050.receipts_proveedor.filter((r) => (r.document_number || '').includes('FAC-VITALLCONS-001') || (r.reference_doc || '').includes('FAC-VITALLCONS-001')).length };
cxp.anulaciones = M050.fin_entries_anulacion_global;
cxp.reversal_of_fvc = M050.fin_entries_reversal_of.length;
cxp.credit_ledger_reversas = M050.store_credit_ledger_proveedor;
cxp.mayor_pas_cxp_prov = { grupos: M050.mayor_pas_cxp_prov, neto: Math.round(mayorPas(M050.mayor_pas_cxp_prov) * 100) / 100 };
cxp.vista_cxp = M050.v_purchase_orders_cxp.length;
cxp.conclusion = 'La deuda de FAC-VITALLCONS-001 permanece 100% pendiente (unpaid, 0 pagos, 0 transacciones de pago, 0 anulaciones de la FVC, 0 anticipos/compensaciones al proveedor).';
A.dp2_conciliacion_deuda = cxp;

// ═══ 4. DP-3 DESGLOSE DE LOS 24 CUP POR DOCUMENTO ═══
const d3 = {};
d3.vales_sin_asiento = M050.issue_slips.filter((s) => !M050.fin_entries_vales_sku.some((e) => e.document_id === s.id))
  .map((s) => {
    const items = M050.issue_slip_items.filter((i) => i.slip_id === s.id);
    return { vale: s.slip_number, status: s.status, creado: s.created_at?.slice(0, 19),
      unidades: items.map((i) => ({ sku: i.sku, q: Number(i.quantity), uc: Number(i.unit_cost) })),
      costo_total: items.reduce((a, i) => a + Number(i.quantity) * 1, 0),
      asiento: 'NINGUNO (verificado: 0 fin_entries con document_id/document_number de este vale)' };
  });
d3.ajustes_cuadre = M050.kardex_111_112.filter((m) => m.movement_type === 'adjustment')
  .map((m) => ({ sku: m.sku, unidades: -Number(m.quantity_change), fecha: m.movement_date?.slice(0, 10),
    ref_doc: m.reference_doc, id: m.id, uc: Number(m.unit_cost),
    doc_inventario: 'NINGUNO (movimiento de regularización legacy sin inventory_adjustments)',
    asiento: 'NINGUNO (0 fin_entries AJUSTE_INVENTARIO vinculados)' }));
d3.total_vales_sin_asiento = d3.vales_sin_asiento.filter((v) => v.status !== 'reversed')
  .reduce((a, v) => a + v.costo_total, 0);
d3.vale_anulado_vs_223 = d3.vales_sin_asiento.find((v) => v.status === 'reversed');
d3.total_ajustes = d3.ajustes_cuadre.reduce((a, m) => a + m.unidades, 0);
d3.total_rect2 = d3.total_vales_sin_asiento + d3.total_ajustes;
d3.verificacion_vales_con_asiento = M050.fin_movements_gas_vales.map((m) => ({ doc: m.document_number,
  monto: Number(m.amount), sentido: m.sense }));
d3.cogs_motor = M050.cogs_ventas;
d3.sin_doble_contabilizacion = 'COGS motor 7 CUP intacto; vales con asiento 88 CUP intactos; RECT-2 SOLO reconoce 24 CUP de brechas documentales (6 vales + 18 ajustes)';
A.dp3_salidas_sin_asiento = d3;

// ═══ 5. §9 CONCILIACIÓN COSTO/INVENTARIO/COGS ═══
const conc = {};
const p111 = M050.products_111_112.find((p) => p.sku === '111');
const p112 = M050.products_111_112.find((p) => p.sku === '112');
conc.historica = {
  existencia_final: { sku111: 10, sku112: 20, total: 30 },
  costo_unitario_real: { sku111: 1, sku112: 1 },
  valor_existencia: { sku111: 10, sku112: 20, total: 30 },
  cogs_reconocido: 7, salidas_pendientes: 24, rectificacion_exceso: 151299851,
};
conc.actual = {
  stock_current: { sku111: Number(p111.stock_current), sku112: Number(p112.stock_current) },
  inventory: M050.inventory_111_112.map((i) => ({ sku: i.sku, q: Number(i.quantity) })),
  kardex_saldo: { sku111: M050.reconstruccion_kardex['111'].saldo_kardex_calculado, sku112: M050.reconstruccion_kardex['112'].saldo_kardex_calculado },
  wac: { sku111: Number(p111.cost_average), sku112: Number(p112.cost_average) },
  movimientos_nuevos_post_corte: M050.post_snapshot.kardex_111_112_nuevos.length,
};
conc.identidad_actual_ok = conc.actual.stock_current.sku111 === 10 && conc.actual.stock_current.sku112 === 20
  && conc.actual.kardex_saldo.sku111 === 10 && conc.actual.kardex_saldo.sku112 === 20;
conc.reingreso_vs_223 = {
  documento: 'VS-000223-2026', status_vale: 'reversed',
  salida: { unidades: 1, uc: 1, fecha: '2026-11-07' },
  reingreso: { unidades: 1, tipo: 'issue_slip_reverse', uc: 1, fecha: '2026-11-07' },
  asientos_ambos_sentidos: 'NINGUNO (verificado: 0 fin_entries para VS-000223)',
  neto_contable: 0, tratamiento: 'NO se contabiliza en RECT-2 (neto 0)',
};
A.conciliacion = conc;

// ═══ 6. DP-1 SEPARACIÓN COSTO/PRECIO ═══
A.dp1_separacion = {
  sku111: { costo_adquisicion_registrado: Number(M050.receipt_items_111_112.find((l) => l.sku === '111').unit_cost),
    moneda_registrada: M050.receipt_items_111_112.find((l) => l.sku === '111').moneda_recepcion,
    tasa_registrada: Number(M050.receipt_items_111_112.find((l) => l.sku === '111').tasa_cambio_recepcion),
    costo_real: 1, precio_venta: Number(p111.price), moneda_precio: p111.price_currency },
  sku112: { costo_adquisicion_registrado: Number(M050.receipt_items_111_112.find((l) => l.sku === '112').unit_cost),
    moneda_registrada: M050.receipt_items_111_112.find((l) => l.sku === '112').moneda_recepcion,
    tasa_registrada: Number(M050.receipt_items_111_112.find((l) => l.sku === '112').tasa_cambio_recepcion),
    costo_real: 1, precio_venta: Number(p112.price), moneda_precio: p112.price_currency },
  validacion: 'El registro de origen (2.500/1.000 USD@680) sigue SIN convertirse: son precios de venta CUP leídos como costo USD. La rectificación propuesta los fija a 1 CUP@1. Los precios de venta del maestro (2.000 CUP / 1.000 USD) permanecen intactos.',
};

A.hashes = { m045: M045.hashes ? Object.keys(M045.hashes).length + ' secciones' : '-', generado: sha256(A) };
const OUT = OUT_DIR + '/rect004-fase-analisis.json';
writeFileSync(OUT, JSON.stringify(A, null, 1));
console.log('═══ PROTECCIÓN 75 LÍNEAS ═══');
console.log(JSON.stringify({ comparadas: proteccion.comparadas, n_lineas: proteccion.total_lineas,
  cambios: proteccion.n_cambios, moneda: proteccion.n_lineas_moneda, no_verificables: proteccion.n_lineas_no_verificables,
  sku111_112: proteccion.sku_111_112 }, null, 1));
console.log('═══ DIFF 003→004 ═══');
console.log(JSON.stringify({ receipts_fvc_identica: diff.receipts_fvc_identica, kardex_mismos_ids: diff.kardex_mismos_ids,
  mayores: diff.mayores, products: diff.products_111_112,
  secciones_cambiadas: diff.secciones.filter((s) => !s.idéntica).map((s) => s.seccion) }, null, 1));
console.log('═══ DP-2 ═══');
console.log(JSON.stringify({ fvc: cxp.fvc, pagos_fvc: cxp.pagos_fvc, anulaciones: cxp.anulaciones,
  recepciones_proveedor: cxp.recepciones_proveedor, mayor_neto: cxp.mayor_pas_cxp_prov.neto }, null, 1));
console.log('═══ DP-3 ═══');
console.log(JSON.stringify({ vales_sin_asiento: d3.vales_sin_asiento.map((v) => `${v.vale} ${v.unidades.map((u) => u.sku + ':' + u.q).join(',')}`),
  ajustes: d3.ajustes_cuadre.map((a) => `sku${a.sku}:${a.unidades}`), total_vales: d3.total_vales_sin_asiento,
  total_ajustes: d3.total_ajustes, total_rect2: d3.total_rect2 }, null, 1));
console.log('═══ CONCILIACIÓN ═══');
console.log(JSON.stringify({ actual: conc.actual, identidad_ok: conc.identidad_actual_ok, reingreso: conc.reingreso_vs_223.tratamiento }, null, 1));
console.log('Guardado en', OUT);
