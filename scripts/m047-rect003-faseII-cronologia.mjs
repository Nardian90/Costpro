// ============================================================================
// M047 — CP-FIN-VALUATION-RECTIFICATION-003 · FASE II:
// CRONOLOGÍA COMPLETA DE LAS 119 UNIDADES SALIDAS (SKU 111/112).
// Por unidad de salida: documento, fecha, cantidad, tipo, costo de origen,
// costo contabilizado (kardex), costo correcto (1 CUP), estado contable.
// Ensamblador LOCAL sobre rect003-faseI-snapshot.json + complemento (sin BD).
// Uso: node scripts/m047-rect003-faseII-cronologia.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const A = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/out/rect003-faseI-snapshot.json', 'utf8'));
const C = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/out/rect003-faseI-complemento.json', 'utf8'));
const OUT = '/home/z/my-project/scripts/out/rect003-faseII-cronologia.json';
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const COSTO_REAL = 1; // CUP por unidad (decisión económica del propietario 2026-11-15)

// ── Datos base ──────────────────────────────────────────────────────────────
const kardex = A.kardex_111_112.slice().sort((a, b) =>
  String(a.movement_date).localeCompare(String(b.movement_date)) || String(a.created_at).localeCompare(String(b.created_at)));
const slipMap = new Map(A.issue_slips.map((s) => [s.id, s]));
const slipItemMap = new Map();
for (const it of A.issue_slip_items) {
  slipItemMap.set(it.slip_id + '|' + it.sku, it);
}
const txMap = new Map(A.transactions_ventas.map((t) => [t.id, t]));
const tiMap = new Map(C.transaction_items.map((t) => [t.transaction_id + '|' + t.sku, t]));
// asientos de vales (por document_number)
const valeEntryMap = new Map();
for (const e of C.fin_entries_vales) valeEntryMap.set(e.document_number, e);
const valeMovMap = new Map();
for (const m of C.fin_movements_vales) {
  if (!valeMovMap.has(m.document_number)) valeMovMap.set(m.document_number, []);
  valeMovMap.get(m.document_number).push(m);
}
// asientos de ventas (por entry document_id = tx id)
const ventaEntryMap = new Map();
for (const e of C.fin_entries_ventas) ventaEntryMap.set(String(e.document_id), e);

const linFVC = new Map(A.receipt_items.map((l) => [l.sku, l]));
const COMPRA_UC = { '111': 1700000, '112': 680000 }; // uc registrado en capa de compra (CUP)

// ── Construcción de la cronología de salidas ────────────────────────────────
const salidas = [];
for (const m of kardex.filter((x) => Number(x.quantity_change) < 0)) {
  const sku = m.sku;
  const lin = linFVC.get(sku);
  const tipo = m.movement_type;
  let documento = null, docId = null, destino = null, contabilizado = null, asiento = null;
  if (tipo === 'sale') {
    const tx = txMap.get(m.reference_id);
    const ti = tiMap.get(m.reference_id + '|' + sku);
    documento = tx && (tx.invoice_number || `Venta POS v2 ${m.reference_id.slice(0, 8)}`);
    docId = m.reference_id;
    destino = 'Venta al cliente' + (tx && tx.customer_name ? ` (${tx.customer_name})` : ' (consumidor final, efectivo)');
    const ent = ventaEntryMap.get(m.reference_id);
    asiento = ent ? `${ent.document_number || ent.document_id.slice(0, 8)} (motor CP-FIN: GAS_COSTO_VENTAS débito ${Math.abs(Number(m.quantity_change))} × 1)` : null;
    contabilizado = ent ? `MOTOR ya contabilizó COGS ${Math.abs(Number(m.quantity_change))} CUP (cost_average=1)` : 'sin asiento';
  } else if (tipo === 'issue_slip_out') {
    const slip = slipMap.get(m.reference_id);
    const item = slipItemMap.get(m.reference_id + '|' + sku);
    documento = slip ? slip.slip_number : 'VALE sin documento';
    docId = m.reference_id;
    destino = slip ? String(slip.notes || '').split('|')[0].trim() : 'desconocido';
    const ent = valeEntryMap.get(documento);
    asiento = ent ? `${documento} (GAS_VALES débito ${Number(item?.total_cost || 0)})` : 'SIN ASIENTO (brecha documental)';
    contabilizado = ent ? `asiento existe por ${Number(item?.total_cost || 0)} CUP (parte del vale)` : 'no contabilizado (0 CUP en mayor)';
  } else if (tipo === 'adjustment') {
    documento = 'SIN DOCUMENTO — Cuadre importación ENERVIDA';
    docId = null;
    destino = `Regularización legacy de la importación (${String(m.reference_doc).match(/sku=\d+/)?.[0] || ''} Δ=${m.quantity_change} «diferencia acumulada pre-corte vs Excel»)`;
    asiento = 'SIN ASIENTO (movimiento sin reference_id)';
    contabilizado = 'no contabilizado (0 CUP en mayor)';
  }
  salidas.push({
    sku,
    fecha: String(m.movement_date).slice(0, 10),
    tipo_salida: tipo === 'sale' ? 'venta' : tipo === 'issue_slip_out' ? 'vale' : 'ajuste',
    documento,
    documento_id: docId,
    destino,
    cantidad: Math.abs(Number(m.quantity_change)),
    costo_origen_registrado_cup: COMPRA_UC[sku],       // uc de la capa de compra (defectuoso)
    costo_origen_correcto_cup: COSTO_REAL,             // 1 CUP (recepción corregida)
    costo_contabilizado_unitario: Number(m.unit_cost), // kardex uc (0 o 1)
    costo_correcto_unitario: COSTO_REAL,
    valor_contabilizado: Math.abs(Number(m.quantity_change)) * Number(m.unit_cost),
    valor_correcto: Math.abs(Number(m.quantity_change)) * COSTO_REAL,
    estado_contable: contabilizado,
    asiento,
    movimiento_id: m.id,
  });
}

// ── Reversión (reingreso) VS-000223 ────────────────────────────────────────
const revers = kardex.filter((x) => x.movement_type === 'issue_slip_reverse');
const reingreso = revers.map((m) => ({
  sku: m.sku, fecha: String(m.movement_date).slice(0, 10), tipo: 'reversión de vale',
  documento: slipMap.get(m.reference_id)?.slip_number, cantidad: Number(m.quantity_change),
  uc_registrado: Number(m.unit_cost), valor: Number(m.quantity_change) * Number(m.unit_cost),
  estado_contable: 'SIN ASIENTO (ni la salida ni el reingreso del vale anulado tienen asiento — se cancelan entre sí)',
  notas: slipMap.get(m.reference_id)?.notes,
}));

// ── Reconciliación por SKU ───────────────────────────────────────────────────
const rec = {};
for (const sku of ['111', '112']) {
  const s = salidas.filter((x) => x.sku === sku);
  const r = reingreso.filter((x) => x.sku === sku);
  const lin = linFVC.get(sku);
  const recibidas = Number(lin.quantity);
  const actuales = Number(A.products_111_112.find((p) => p.sku === sku).stock_current);
  const porTipo = {};
  for (const x of s) {
    porTipo[x.tipo_salida] = porTipo[x.tipo_salida] || { movs: 0, unidades: 0, valor_contabilizado: 0, valor_correcto: 0, uc0: 0 };
    porTipo[x.tipo_salida].movs++;
    porTipo[x.tipo_salida].unidades += x.cantidad;
    porTipo[x.tipo_salida].valor_contabilizado += x.valor_contabilizado;
    porTipo[x.tipo_salida].valor_correcto += x.valor_correcto;
    if (x.costo_contabilizado_unitario === 0) porTipo[x.tipo_salida].uc0 += x.cantidad;
  }
  rec[sku] = {
    recibidas, actuales,
    salidas_brutas: { movs: s.length, unidades: s.reduce((a, x) => a + x.cantidad, 0) },
    reingresos: r.length ? { unidades: r.reduce((a, x) => a + x.cantidad, 0), detalle: r } : { unidades: 0 },
    salidas_netas: s.reduce((a, x) => a + x.cantidad, 0) - r.reduce((a, x) => a + x.cantidad, 0),
    identidad: `${recibidas} − ${s.reduce((a, x) => a + x.cantidad, 0)} brutas + ${r.reduce((a, x) => a + x.cantidad, 0)} reingreso = ${actuales}`,
    identidad_ok: recibidas - s.reduce((a, x) => a + x.cantidad, 0) + r.reduce((a, x) => a + x.cantidad, 0) === actuales,
    por_tipo: porTipo,
    valor_salidas_registrado: s.reduce((a, x) => a + x.valor_contabilizado, 0),
    valor_salidas_correcto: s.reduce((a, x) => a + x.valor_correcto, 0) - r.reduce((a, x) => a + Math.abs(x.valor), 0),
    subvaluacion: s.reduce((a, x) => a + x.valor_correcto - x.valor_contabilizado, 0),
    unidades_uc0: s.filter((x) => x.costo_contabilizado_unitario === 0).reduce((a, x) => a + x.cantidad, 0),
  };
}

// ── Consolidado 119 unidades ────────────────────────────────────────────────
const totalSalidas = salidas.reduce((a, x) => a + x.cantidad, 0);
const totalReingreso = reingreso.reduce((a, x) => a + x.cantidad, 0);
const consolidado = {
  salidas_brutas: { movs: salidas.length, unidades: totalSalidas },
  reingreso: totalReingreso,
  salidas_netas: totalSalidas - totalReingreso,
  por_tipo: {
    ventas: { movs: salidas.filter((x) => x.tipo_salida === 'venta').length,
      unidades: salidas.filter((x) => x.tipo_salida === 'venta').reduce((a, x) => a + x.cantidad, 0) },
    vales_brutos: { movs: salidas.filter((x) => x.tipo_salida === 'vale').length,
      unidades: salidas.filter((x) => x.tipo_salida === 'vale').reduce((a, x) => a + x.cantidad, 0) },
    vales_netos: salidas.filter((x) => x.tipo_salida === 'vale').reduce((a, x) => a + x.cantidad, 0) - totalReingreso,
    ajustes: { movs: salidas.filter((x) => x.tipo_salida === 'ajuste').length,
      unidades: salidas.filter((x) => x.tipo_salida === 'ajuste').reduce((a, x) => a + x.cantidad, 0) },
  },
  cogs_ventas: {
    correcto: salidas.filter((x) => x.tipo_salida === 'venta').reduce((a, x) => a + x.valor_correcto, 0),
    kardex_registrado: salidas.filter((x) => x.tipo_salida === 'venta').reduce((a, x) => a + x.valor_contabilizado, 0),
    motor_cpfin_atribuido: 7, // verificado en fin_movements (5 ventas × 1 CUP/u)
    diferencia_kardex_vs_motor: salidas.filter((x) => x.tipo_salida === 'venta').reduce((a, x) => a + x.valor_correcto, 0)
      - salidas.filter((x) => x.tipo_salida === 'venta').reduce((a, x) => a + x.valor_contabilizado, 0),
    nota: 'El MOTOR CP-FIN ya contabilizó 7 CUP (COGS a cost_average=1). El kardex registra 5 CUP (2 movimientos uc=0). Subvaluación SOLO en la capa kardex: 2 CUP.',
  },
  vales: {
    valor_correcto_bruto: salidas.filter((x) => x.tipo_salida === 'vale').reduce((a, x) => a + x.valor_correcto, 0),
    kardex_registrado: salidas.filter((x) => x.tipo_salida === 'vale').reduce((a, x) => a + x.valor_contabilizado, 0),
    mayor_contabilizado: 88, // VS-148(1)+157(20)+158(20)+165(10)+208(32 de estos SKU)+225(5)
    sin_asiento: salidas.filter((x) => x.tipo_salida === 'vale' && !x.asiento.startsWith('VS')).reduce((a, x) => a + x.cantidad, 0),
  },
  ajustes: {
    unidades: salidas.filter((x) => x.tipo_salida === 'ajuste').reduce((a, x) => a + x.cantidad, 0),
    valor_correcto: salidas.filter((x) => x.tipo_salida === 'ajuste').reduce((a, x) => a + x.valor_correcto, 0),
    kardex_registrado: salidas.filter((x) => x.tipo_salida === 'ajuste').reduce((a, x) => a + x.valor_contabilizado, 0),
    mayor_contabilizado: 0,
  },
  unidades_uc0: salidas.filter((x) => x.costo_contabilizado_unitario === 0).reduce((a, x) => a + x.cantidad, 0),
  subvaluacion_total_kardex: salidas.reduce((a, x) => a + x.valor_correcto - x.valor_contabilizado, 0),
};

// ── Salidas sin documental / sin asiento (exigencia §4) ──────────────────────
const sinDocumento = salidas.filter((x) => x.tipo_salida === 'ajuste');
const sinAsiento = salidas.filter((x) => String(x.asiento).startsWith('SIN ASIENTO'));
const explicacion_sin_documento = {
  n_movimientos: sinDocumento.length, unidades: sinDocumento.reduce((a, x) => a + x.cantidad, 0),
  detalle: sinDocumento.map((x) => ({ sku: x.sku, fecha: x.fecha, cantidad: x.cantidad, motivo: x.destino })),
  explicacion: 'Los 2 movimientos de ajuste (18 unidades) provienen de la importación legacy del 2026-08-18 («Cuadre importación ENERVIDA ... diferencia acumulada pre-corte vs Excel»): regularización de existencias al migrar el kardex histórico al sistema. NO tienen documento ni reference_id — son ajustes de cuadre de migración, no salidas operativas. Se contabilizan (tras rectificación) como GAS_PERDIDA_INV siguiendo el patrón del asiento AJUSTE_INVENTARIO existente.',
};

const salida = {
  mision: 'CP-FIN-VALUATION-RECTIFICATION-003',
  fase: 'II — cronología de las 119 unidades salidas',
  generado: new Date().toISOString(),
  fuente: 'rect003-faseI-snapshot.json + rect003-faseI-complemento.json (producción read-only 2026-11-15)',
  cronologia_salidas: salidas,
  reingreso_vs000223: reingreso,
  reconciliacion_por_sku: rec,
  consolidado,
  salidas_sin_documento: explicacion_sin_documento,
  salidas_sin_asiento: {
    movs: sinAsiento.length, unidades: sinAsiento.reduce((a, x) => a + x.cantidad, 0),
    valor_correcto: sinAsiento.reduce((a, x) => a + x.valor_correcto, 0),
    detalle: sinAsiento.map((x) => ({ sku: x.sku, doc: x.documento, fecha: x.fecha, u: x.cantidad })),
  },
};
salida.hashes = { cronologia: sha256(salidas), reconciliacion: sha256(rec), consolidado: sha256(consolidado) };
fs.writeFileSync(OUT, JSON.stringify(salida, null, 1));

console.log('═══ RECONCILIACIÓN POR SKU ═══');
for (const sku of ['111', '112']) {
  const r = rec[sku];
  console.log(`SKU ${sku}: ${r.identidad} ${r.identidad_ok ? '✓' : '✗ FALLO'}`);
  console.log(`  por tipo: ${JSON.stringify(Object.fromEntries(Object.entries(r.por_tipo).map(([k, v]) => [k, `${v.unidades} u / ${v.valor_contabilizado}→${v.valor_correcto} CUP`])))}`);
}
console.log('\n═══ CONSOLIDADO ═══');
console.log(JSON.stringify({ ...consolidado, por_tipo: consolidado.por_tipo }, null, 1).slice(0, 1600));
console.log('\n═══ SIN ASIENTO ═══', JSON.stringify(salida.salidas_sin_asiento.detalle));
console.log('\nGuardado en', OUT, fs.statSync(OUT).size, 'bytes');
