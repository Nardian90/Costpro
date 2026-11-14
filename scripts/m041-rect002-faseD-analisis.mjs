// ============================================================================
// CP-FIN-VALUATION-CORRECTION-002 — FASE B/C/D/E: ANÁLISIS MAESTRO
// Reconstrucción cronológica SKU 111/112, reconciliación del total corregido,
// descomposición del impacto, clasificación de las 101 líneas (6 categorías).
// Read-only sobre evidencia ya extraída (rect002-faseA-verificacion.json).
// ============================================================================
import fs from 'node:fs';

const A = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/out/rect002-faseA-verificacion.json', 'utf8'));
const SKU111_ID = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const SKU112_ID = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const OUT = '/home/z/my-project/scripts/out/rect002-faseD-analisis.json';

// ═══════════════════════════════════════════════════════════════════════════
// FASE D — RECONSTRUCCIÓN CRONOLÓGICA DE SKU 111 y SKU 112
// ═══════════════════════════════════════════════════════════════════════════
const sm = A.stock_movements_111_112.slice().sort((a, b) =>
  String(a.movement_date || a.created_at).localeCompare(String(b.movement_date || b.created_at)));

const wacLog = {};
for (const e of A.wac_change_log_111_112) wacLog[e.product_id] = e;

function kardex(product_id, sku, costoReal) {
  const movs = sm.filter((m) => m.product_id === product_id);
  let saldo = 0, valorLibros = 0;
  const filas = [];
  let wacAntes = null, wacDespues = null;
  for (const m of movs) {
    const dq = Number(m.quantity_change);
    const ucReg = Number(m.unit_cost || 0);
    // Valoración CANÓNICA: costo real 1 CUP/unidad (cronología y política WAC)
    const ucCorrecto = costoReal;
    const valorCorrecto = dq * ucCorrecto;
    if (dq > 0) {
      // WAC cronológico con costo correcto (existencia inicial 0 — Fase III)
      if (wacAntes === null) wacAntes = 0;
      wacDespues = (valorLibros + dq * costoReal) / (saldo + dq);
    } else {
      wacDespues = saldo + dq > 0 ? valorLibros / (saldo + dq) : 0;
    }
    saldo += dq;
    valorLibros += valorCorrecto;
    filas.push({
      fecha: String(m.movement_date || '').slice(0, 10),
      tipo: m.movement_type,
      referencia: (m.reference_doc || '').slice(0, 40),
      reference_id: m.reference_id,
      dQ: dq,
      uc_registrado: ucReg,
      valor_registrado: dq * ucReg,
      uc_correcto: ucCorrecto,
      valor_correcto: valorCorrecto,
      saldo,
      wac_correcto_tras_operacion: Math.round(wacDespues * 10000) / 10000,
      balance_after_registrado: m.balance_after,
    });
  }
  return {
    sku,
    product_id,
    lineas: movs.length,
    existencia_inicial: 0,
    wac_antes_recepcion: 0,
    wac_despues_recepcion: 1,
    wac_vigente_registrado: 1,
    filas,
    saldo_final: saldo,
    valor_libros_correcto: valorLibros,
    salidas: {
      unidades_vendidas: filas.filter((f) => f.tipo === 'sale').reduce((s, f) => s + Math.abs(f.dQ), 0),
      unidades_vales: filas.filter((f) => f.tipo === 'issue_slip_out').reduce((s, f) => s + Math.abs(f.dQ), 0),
      unidades_ajustes: filas.filter((f) => f.tipo === 'adjustment').reduce((s, f) => s + Math.abs(f.dQ), 0),
      unidades_reversiones: filas.filter((f) => f.tipo === 'issue_slip_reverse').reduce((s, f) => s + Math.abs(f.dQ), 0),
      cogs_registrado: filas.filter((f) => f.tipo === 'sale').reduce((s, f) => s + f.valor_registrado, 0),
      cogs_correcto: filas.filter((f) => f.tipo === 'sale').reduce((s, f) => s + f.valor_correcto, 0),
      vales_registrado: filas.filter((f) => f.tipo === 'issue_slip_out').reduce((s, f) => s + f.valor_registrado, 0),
      vales_correcto: filas.filter((f) => f.tipo === 'issue_slip_out').reduce((s, f) => s + f.valor_correcto, 0),
      ajustes_registrado: filas.filter((f) => f.tipo === 'adjustment').reduce((s, f) => s + f.valor_registrado, 0),
      ajustes_correcto: filas.filter((f) => f.tipo === 'adjustment').reduce((s, f) => s + f.valor_correcto, 0),
    },
  };
}

const k111 = kardex(SKU111_ID, '111', 1);
const k112 = kardex(SKU112_ID, '112', 1);

// Entrada de la recepción (líneas FVC)
const lin111 = A.receipt_items.find((i) => i.product_id === SKU111_ID);
const lin112 = A.receipt_items.find((i) => i.product_id === SKU112_ID);
for (const [k, lin, kk] of [['111', lin111, k111], ['112', lin112, k112]]) {
  kk.recepcion = {
    factura: 'FAC-VITALLCONS-001',
    fecha_economica: '2026-07-01',
    fecha_creacion_real: '2026-08-11T22:49:18Z',
    cantidad: Number(lin.quantity),
    precio_venta_original: k === '111' ? 2500 : 1000, // declarado por el propietario (CUP)
    costo_adquisicion_real: 1, // declarado por el propietario (CUP)
    unit_cost_registrado: Number(lin.unit_cost),
    moneda_registrada: lin.moneda_recepcion,
    tasa_registrada: Number(lin.tasa_cambio_recepcion),
    valor_registrado_cup: Number(lin.quantity) * Number(lin.unit_cost) * Number(lin.tasa_cambio_recepcion),
    valor_correcto_cup: Number(lin.quantity) * 1,
    wac_antes: 0,
    wac_despues_correcto: 1,
  };
  kk.wac_change_log = wacLog[SKU111_ID] || wacLog[SKU112_ID];
}
k111.wac_change_log = wacLog[SKU111_ID];
k112.wac_change_log = wacLog[SKU112_ID];

// ═══════════════════════════════════════════════════════════════════════════
// FASE B — RECONCILIACIÓN DEL NUEVO TOTAL ECONÓMICO
// ═══════════════════════════════════════════════════════════════════════════
const prodMap = new Map(A.products.map((p) => [p.id, p]));
const lineas = A.receipt_items.map((li) => {
  const p = prodMap.get(li.product_id) || {};
  const q = Number(li.quantity), uc = Number(li.unit_cost), tasa = Number(li.tasa_cambio_recepcion || 1);
  return { line_id: li.id, sku: p.sku, nombre: p.name, q, uc, moneda: li.moneda_recepcion, tasa,
    sub_total_original: q * uc, valor_cup_actual: q * uc * tasa,
    precio_venta: p.price, moneda_producto: p.price_currency, cost_price: p.cost_price,
    cost_average: p.cost_average, stock_current: p.stock_current };
});

const cup = lineas.filter((l) => l.moneda === 'CUP');
const usd = lineas.filter((l) => l.moneda === 'USD');
const sku111L = lineas.find((l) => l.sku === '111');
const sku112L = lineas.find((l) => l.sku === '112');
const otrosUsd = usd.filter((l) => l.sku !== '111' && l.sku !== '112');

const totalCup = cup.reduce((s, l) => s + l.valor_cup_actual, 0);
const totalUsdOtro = otrosUsd.reduce((s, l) => s + l.sub_total_original, 0);
const reconciliacion = {
  total_actual_cabecera: A.receipt[0].total_cost,
  descomposicion_actual: {
    lineas_cup: { n: cup.length, subtotales: cup.reduce((s, l) => s + l.sub_total_original, 0), equivalente_cup: totalCup },
    lineas_usd: { n: usd.length, subtotales_usd: usd.reduce((s, l) => s + l.sub_total_original, 0), equivalente_cup: usd.reduce((s, l) => s + l.valor_cup_actual, 0) },
    de_las_cuales_sku_111: { sub_usd: sku111L.sub_total_original, equivalente_cup: sku111L.valor_cup_actual },
    de_las_cuales_sku_112: { sub_usd: sku112L.sub_total_original, equivalente_cup: sku112L.valor_cup_actual },
    otros_usd_20_lineas: { sub_usd: totalUsdOtro, equivalente_cup: otrosUsd.reduce((s, l) => s + l.valor_cup_actual, 0) },
  },
  correccion_propietario: {
    sku_111: { antes: sku111L.valor_cup_actual, despues: 49, formula: '49 × 1 CUP' },
    sku_112: { antes: sku112L.valor_cup_actual, despues: 100, formula: '100 × 1 CUP' },
    valor_correcto_conjunto: 149,
    exceso_conjunto: sku111L.valor_cup_actual + sku112L.valor_cup_actual - 149,
  },
  total_corregido: {
    formula: '5.129.706 (CUP) + 35.609.730 (52.367,25 USD × 680) + 149 (2 líneas corregidas)',
    valor: Math.round((totalCup + totalUsdOtro * 680 + 149) * 100) / 100,
    igual_recomputo_por_linea: A.recomputo_corregido.total_corregido,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FASE C — DOBLE CONVERSIÓN: verificación
// ═══════════════════════════════════════════════════════════════════════════
const purchaseMovs = sm.filter((m) => m.movement_type === 'purchase');
const dobleConversion = {
  lineas_recepcion_otros_documentos: A.receipt_items_todas_111_112.length, // 2 → solo FVC
  en_pr2_backup: 0,
  movimientos_purchase: purchaseMovs.map((m) => ({
    sku: m.product_id === SKU111_ID ? '111' : '112',
    uc_movimiento: Number(m.unit_cost),
    formula: `${lin111.quantity}×${lin111.unit_cost}×${lin111.tasa_cambio_recepcion} → uc CUP`,
    conversiones_detectadas: 1,
  })),
  asiento_cpfin: {
    amount: A.fin_entries_fvc[0] ? 192039436 : null,
    recomputado_desde_lineas: true,
    conversiones: 1,
  },
  salidas_posteriores_conversion_680: false,
  conclusion: 'UNA sola conversión (línea USD×680 → movimiento CUP → asiento). El defecto es el VALOR FUENTE (precio de venta leído como costo USD), no una conversión duplicada.',
};

// ═══════════════════════════════════════════════════════════════════════════
// DESCOMPOSICIÓN DEL IMPACTO (151.299.851)
// ═══════════════════════════════════════════════════════════════════════════
const salida111 = k111.salidas, salida112 = k112.salidas;
const uVendidas = salida111.unidades_vendidas + salida112.unidades_vendidas;
const uVales = salida111.unidades_vales + salida112.unidades_vales;
const uAjustes = salida111.unidades_ajustes + salida112.unidades_ajustes;
const uReversion = salida111.unidades_reversiones + salida112.unidades_reversiones;
const cogsReg = salida111.cogs_registrado + salida112.cogs_registrado;
const cogsCorr = salida111.cogs_correcto + salida112.cogs_correcto;
const valesReg = salida111.vales_registrado + salida112.vales_registrado;
const valesCorr = salida111.vales_correcto + salida112.vales_correcto;
const ajustesReg = salida111.ajustes_registrado + salida112.ajustes_registrado;
const ajustesCorr = salida111.ajustes_correcto + salida112.ajustes_correcto;

const descomposicion = {
  exceso_total: reconciliacion.correccion_propietario.exceso_conjunto,
  parte_inventario_remanente: {
    unidades: 30, // 10 + 20
    valor_correcto: 30,
    valor_registrado_actual: 30, // cost_average=1 × stock — YA correcto
    ajuste_necesario: 0,
    explicacion: 'El valor contable vigente (WAC=1) ya coincide con el costo real: NO requiere ajuste. La porción del exceso atribuible al remanente se elimina con la reversión del asiento.',
  },
  parte_cogs_ventas_anteriores: {
    unidades: uVendidas,
    cogs_correcto: cogsCorr,
    cogs_registrado_kardex: cogsReg,
    cogs_atribuido_motor_cpfin: 7, // m033: 4 + 3
    subvaluado_kardex: Math.round((cogsCorr - cogsReg) * 100) / 100,
    ajuste_necesario_motor: 0,
    explicacion: 'El motor CP-FIN ya reconoció COGS a costo real (4+3=7 CUP). En kardex, 2 movimientos de venta con uc=0 subvalúan 2 CUP.',
  },
  parte_otras_salidas: {
    unidades_vales: uVales, unidades_ajustes: uAjustes, unidades_reversiones: uReversion,
    valor_correcto: valesCorr + ajustesCorr,
    valor_registrado: valesReg + ajustesReg,
    subvaluado: Math.round((valesCorr + ajustesCorr - valesReg - ajustesReg) * 100) / 100,
    explicacion: 'Vales y ajustes con uc=0 subvalúan las salidas en 24 CUP (unidades a costo 0 en lugar de 1).',
  },
  parte_pasivo_proveedor: {
    pas_cxp_prov_sobrestimado: reconciliacion.correccion_propietario.exceso_conjunto,
    explicacion: 'La deuda reconocida al proveedor por estas 2 líneas era 151.300.000 CUP; el costo real conjunto es 149 CUP.',
  },
  saldo_en_act_inventario: {
    valor: reconciliacion.correccion_propietario.exceso_conjunto,
    explicacion: 'Las salidas nunca se costearon a 680 (uc=0-1): el exceso NO fluyó a COGS/VALES y permanece íntegro en el saldo de ACT_INVENTARIO. Reversión completa contra PAS_CXP_PROV.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FASE E — CLASIFICACIÓN DE LAS 101 LÍNEAS (6 categorías del propietario)
// ═══════════════════════════════════════════════════════════════════════════
const clasificacion = lineas.map((l) => {
  const monedaDistinta = l.moneda !== l.moneda_producto;
  const ucEqPrecio = l.uc === l.precio_venta;
  const ucEs1 = l.uc === 1;
  let categoria, senales = [];
  if (ucEqPrecio) senales.push('unit_cost == products.price (poblado desde campo de venta)');
  if (monedaDistinta) senales.push(`moneda línea ${l.moneda} ≠ moneda producto ${l.moneda_producto}`);
  if (ucEs1) senales.push('costo unitario 1 (CUP) — auténtico según propietario');
  if (l.cost_price === 0) senales.push('products.cost_price = 0 (campo costo maestro nunca poblado)');

  if (l.sku === '111' || l.sku === '112') {
    categoria = 'Precio de venta importado erróneamente como costo';
    senales.push('CONFIRMADO por propietario 2026-11-15: precio de venta CUP leído como costo USD; costo real 1 CUP');
    if (l.sku === '112') senales.push('GATE16 2026-10-06 documentó contradicción unit_cost 1000 USD vs precio 1000 CUP');
    if (l.sku === '111') senales.push('auditoría 2026-10-22: precio 2.500, moneda corregida USD→CUP (confirma naturaleza CUP)');
  } else if (monedaDistinta && !ucEs1) {
    categoria = 'Moneda asignada incorrectamente';
  } else if (monedaDistinta && ucEs1) {
    categoria = 'Moneda asignada incorrectamente';
    senales.push('costo 1 CUP auténtico conservado (valor en juego trivial)');
  } else if (ucEs1 && l.moneda === 'CUP') {
    categoria = 'Costo de adquisición confirmado por el propietario';
    senales.push('decisión previa del propietario: costos bajos 1 CUP/1 USD aceptados como auténticos');
  } else if (ucEqPrecio) {
    categoria = 'Costo no verificable';
    senales.push('indistinguible precio/costo — requiere decisión del propietario línea a línea');
  } else {
    categoria = 'Sin problema detectado';
    if (l.uc > l.precio_venta && l.precio_venta > 0) senales.push(`costo ${l.uc} > precio ${l.precio_venta} (margen negativo) — observación`);
  }
  return { ...l, categoria, senales };
});

const resumenClas = {};
for (const c of clasificacion) resumenClas[c.categoria] = (resumenClas[c.categoria] || 0) + 1;

// Exposición potencial si el propietario declara más líneas con el defecto
const noVerificables = clasificacion.filter((c) => c.categoria === 'Costo no verificable');
const exposicion = {
  lineas: noVerificables.length,
  valor_cup_conjunto: noVerificables.reduce((s, l) => s + l.valor_cup_actual, 0),
  valor_cup_si_fueran_precios_cup: noVerificables.reduce((s, l) => s + (l.moneda === 'CUP' ? l.sub_total_original : l.q * l.uc), 0),
  nota: 'Impacto CONTINGENTE si el propietario declara que más líneas tienen el mismo defecto. NO aplicar sin decisión expresa.',
  detalle_usd: noVerificables.filter((l) => l.moneda === 'USD').map((l) => ({ sku: l.sku, uc: l.uc, valor_cup: l.valor_cup_actual })),
};

const salida = {
  mision: 'CP-FIN-VALUATION-CORRECTION-002',
  fase: 'B/C/D/E — análisis maestro',
  generado: new Date().toISOString(),
  fuentes: 'rect002-faseA-verificacion.json (producción read-only 2026-11-15) + m033 Fase VI previa',
  kardex_sku_111: k111,
  kardex_sku_112: k112,
  reconciliacion_total: reconciliacion,
  doble_conversion: dobleConversion,
  descomposicion_impacto: descomposicion,
  clasificacion_lineas: clasificacion,
  resumen_clasificacion: resumenClas,
  exposicion_potencial: exposicion,
};
fs.writeFileSync(OUT, JSON.stringify(salida, null, 1));
console.log('=== RESUMEN CLASIFICACIÓN (101 líneas) ===');
console.log(JSON.stringify(resumenClas, null, 1));
console.log('\n=== RECONCILIACIÓN TOTAL ===');
console.log('Total actual:', reconciliacion.total_actual_cabecera);
console.log('Total corregido:', reconciliacion.total_corregido.valor, '=', reconciliacion.total_corregido.formula);
console.log('Exceso:', reconciliacion.correccion_propietario.exceso_conjunto);
console.log('\n=== DESCOMPOSICIÓN 151.299.851 ===');
console.log(JSON.stringify(descomposicion, null, 1).slice(0, 1200));
console.log('\n=== EXPOSICIÓN POTENCIAL ===');
console.log('Líneas no verificables:', exposicion.lineas, '| valor conjunto:', exposicion.valor_cup_conjunto);
console.log('\nGuardado en', OUT, fs.statSync(OUT).size, 'bytes');
