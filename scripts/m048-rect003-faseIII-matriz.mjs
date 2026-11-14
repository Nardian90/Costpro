// ============================================================================
// M048 — CP-FIN-VALUATION-RECTIFICATION-003 · FASE III:
// MATRIZ ECONÓMICA COMPLETA DE LOS 101 PRODUCTOS DE FAC-VITALLCONS-001.
// Columnas (§5 misión): SKU · cantidad · costo registrado · moneda original ·
// tasa · precio de venta · costo confirmado · fuente de confirmación ·
// total original · total recalculado · clasificación.
// Ensamblador LOCAL sobre rect003-faseI-snapshot.json (sin conexión a BD).
// Uso: node scripts/m048-rect003-faseIII-matriz.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const A = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/out/rect003-faseI-snapshot.json', 'utf8'));
const OUT = '/home/z/my-project/scripts/out/rect003-faseIII-matriz.json';
const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

const prodMap = new Map(A.products.map((p) => [p.id, p]));
const lines = A.receipt_items.map((li) => {
  const p = prodMap.get(li.product_id) || {};
  return { line_id: li.id, sku: p.sku, nombre: p.name || '(sin nombre)', product_id: li.product_id,
    q: Number(li.quantity), uc_reg: Number(li.unit_cost), moneda: li.moneda_recepcion,
    tasa: Number(li.tasa_cambio_recepcion || 1), precio_venta: Number(p.price),
    moneda_producto: p.price_currency, cost_price_maestro: Number(p.cost_price),
    cost_average: Number(p.cost_average), stock_current: Number(p.stock_current) };
});

// ── Clasificación (misma lógica auditora de la misión 002, re-verificada) ────
const matriz = lines.map((l) => {
  const monedaDistinta = l.moneda !== l.moneda_producto;
  const ucEqPrecio = l.uc_reg === l.precio_venta;
  const ucEs1 = l.uc_reg === 1;
  let categoria, fuenteConfirmacion;
  const senales = [];
  if (ucEqPrecio) senales.push('unit_cost == products.price exacto (importado desde campo de venta)');
  if (monedaDistinta) senales.push(`moneda línea ${l.moneda} ≠ moneda maestro ${l.moneda_producto}`);
  if (ucEs1) senales.push('costo unitario 1 — auténtico según decisión previa del propietario');
  if (l.cost_price_maestro === 0) senales.push('products.cost_price = 0 (maestro sin costo poblado)');

  let costoConfirmado = l.uc_reg; // por defecto: se conserva el registrado
  if (l.sku === '111' || l.sku === '112') {
    categoria = 'SKU corregido por decisión del propietario (precio de venta importado como costo)';
    fuenteConfirmacion = 'Decisión económica del propietario 2026-11-15 (CP-FIN-VALUATION-RECTIFICATION-003 §1)';
    costoConfirmado = 1;
    senales.push('2.500/1.000 eran precios de venta CUP; costo real 1 CUP/u');
    if (l.sku === '111') senales.push('auditoría de precios 2026-10-22: moneda corregida USD→CUP');
    if (l.sku === '112') senales.push('GATE16 2026-10-06 documentó la contradicción');
  } else if (monedaDistinta && !ucEs1) {
    categoria = 'Discrepancia de moneda (magnitud idéntica a un precio CUP)';
    fuenteConfirmacion = 'PENDIENTE — requiere decisión del propietario (DP-4)';
  } else if (monedaDistinta && ucEs1) {
    categoria = 'Discrepancia de moneda (costo 1 auténtico, valor trivial)';
    fuenteConfirmacion = 'Decisión previa del propietario: costos 1 CUP auténticos (D3)';
  } else if (ucEs1 && l.moneda === 'CUP') {
    categoria = 'Costo bajo legítimo (1 CUP auténtico)';
    fuenteConfirmacion = 'Decisión previa del propietario (D3): costos bajos 1 CUP/1 USD auténticos';
  } else if (ucEs1 && l.moneda === 'USD') {
    categoria = 'Costo bajo legítimo (1 USD auténtico @680)';
    fuenteConfirmacion = 'Decisión previa del propietario (D3)';
  } else if (ucEqPrecio) {
    categoria = 'Costo no verificable (indistinguible precio/costo)';
    fuenteConfirmacion = 'PENDIENTE — decisión del propietario línea a línea (DP-3)';
  } else {
    categoria = 'Sin problema detectado (costo ≠ precio, moneda consistente)';
    fuenteConfirmacion = 'Evidencia de sistema (costo distinto del precio de venta)';
    if (l.uc_reg > l.precio_venta && l.precio_venta > 0) senales.push(`costo ${l.uc_reg} > precio ${l.precio_venta} (margen negativo) — observación`);
  }

  const totalOriginal = Math.round(l.q * l.uc_reg * l.tasa * 100) / 100;
  const totalRecalculado = Math.round(l.q * costoConfirmado * (l.sku === '111' || l.sku === '112' ? 1 : l.tasa) * 100) / 100;
  return { ...l, categoria, fuente_confirmacion: fuenteConfirmacion, senales,
    costo_confirmado: costoConfirmado,
    total_original: totalOriginal, total_recalculado: totalRecalculado,
    delta: Math.round((totalOriginal - totalRecalculado) * 100) / 100 };
}).sort((a, b) => Number(a.sku) - Number(b.sku));

// ── Resumen de clasificación ────────────────────────────────────────────────
const resumen = {};
for (const m of matriz) resumen[m.categoria] = (resumen[m.categoria] || 0) + 1;
const noVerificables = matriz.filter((m) => m.categoria.startsWith('Costo no verificable'));
const exposicion = {
  lineas: noVerificables.length,
  valor_conjunto_cup: noVerificables.reduce((s, l) => s + l.total_original, 0),
  usd_lineas: noVerificables.filter((l) => l.moneda === 'USD').length,
  usd_valor: noVerificables.filter((l) => l.moneda === 'USD').reduce((s, l) => s + l.total_original, 0),
  cup_lineas: noVerificables.filter((l) => l.moneda === 'CUP').length,
  cup_valor: noVerificables.filter((l) => l.moneda === 'CUP').reduce((s, l) => s + l.total_original, 0),
  nota: 'Exposición CONTINGENTE si el propietario declarara el mismo defecto en más líneas. NO corregir por inferencia.',
};

// ── Verificación de totales ──────────────────────────────────────────────────
const totalOriginal = matriz.reduce((s, l) => s + l.total_original, 0);
const totalRecalculado = matriz.reduce((s, l) => s + l.total_recalculado, 0);
const verificacion = {
  n_lineas: matriz.length,
  total_original_suma: Math.round(totalOriginal * 100) / 100,
  total_cabecera_actual: Number(A.receipts_fvc[0].total_cost),
  cuadra_cabecera: Math.abs(totalOriginal - Number(A.receipts_fvc[0].total_cost)) < 0.01,
  total_recalculado_suma: Math.round(totalRecalculado * 100) / 100,
  reduccion: Math.round((totalOriginal - totalRecalculado) * 100) / 100,
  identidades: {
    sku111: '49 u × 2.500 USD × 680 = 83.300.000 → 49 × 1 CUP = 49 (Δ −83.299.951)',
    sku112: '100 u × 1.000 USD × 680 = 68.000.000 → 100 × 1 CUP = 100 (Δ −67.999.900)',
  },
  provisionalidad: 'El total recalculado 40.739.585 CUP es PRELIMINAR: persisten 71 líneas no verificables + 4 discrepancias de moneda pendientes de decisión del propietario.',
};

const salida = {
  mision: 'CP-FIN-VALUATION-RECTIFICATION-003',
  fase: 'III — matriz económica de los 101 productos',
  generado: new Date().toISOString(),
  fuente: 'rect003-faseI-snapshot.json (producción read-only 2026-11-15)',
  recepcion: { id: 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63', documento: 'FAC-VITALLCONS-001' },
  matriz,
  resumen_clasificacion: resumen,
  exposicion_no_verificables: exposicion,
  verificacion_totales: verificacion,
};
salida.hashes = { matriz: sha256(matriz) };
fs.writeFileSync(OUT, JSON.stringify(salida, null, 1));

console.log('═══ CLASIFICACIÓN (101 líneas) ═══');
console.log(JSON.stringify(resumen, null, 1));
console.log('\n═══ VERIFICACIÓN TOTALES ═══');
console.log(JSON.stringify(verificacion, null, 1));
console.log('\n═══ EXPOSICIÓN NO VERIFICABLES ═══');
console.log(JSON.stringify(exposicion, null, 1));
console.log('\nGuardado en', OUT, fs.statSync(OUT).size, 'bytes');
