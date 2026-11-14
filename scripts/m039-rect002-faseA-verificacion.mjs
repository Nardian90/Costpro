// ============================================================================
// CP-FIN-VALUATION-CORRECTION-002 — FASE A: VERIFICACIÓN READ-ONLY (producción)
// SKU 111 y SKU 112 de FAC-VITALLCONS-001 + alcance completo de la recepción.
// REGLA: exclusivamente peticiones GET. NUNCA escrituras. Producción intacta.
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const BASE = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || (() => { throw new Error('FALTA SUPABASE_SERVICE_ROLE_KEY (leer de .env local — NUNCA commitear)'); })();
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const RECEIPT_ID = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const SKU111_ID = '4afef9a7-28b7-4a5e-b134-13a9e0ffea16';
const SKU112_ID = '14aeb370-7e00-4889-b29b-ef2bc778f4c4';
const OUT = '/home/z/my-project/scripts/out/rect002-faseA-verificacion.json';

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

async function get(path, label) {
  const url = `${BASE}/rest/v1/${path}`;
  const res = await fetch(url, { headers: H });
  const txt = await res.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) {
    console.error(`[WARN] ${label} → HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return { _error: { http: res.status, body: txt.slice(0, 500) } };
  }
  const n = Array.isArray(body) ? body.length : 1;
  console.log(`[OK] ${label} → ${n} filas`);
  return body;
}

const evidence = {
  mision: 'CP-FIN-VALUATION-CORRECTION-002',
  fase: 'A — verificación read-only SKU 111/112 y alcance FVC',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'REST PostgREST (service_role) — SOLO LECTURA (GET)',
    origen: 'wthkddeleylijmonclxg.supabase.co (producción)',
  },
  secciones: {},
};

// ── 0. Columnas exactas desde filas reales (select=* limit=1) ───────────────
async function columnasDe(tabla, filtro = '') {
  const fila = await get(`${tabla}?${filtro}${filtro ? '&' : ''}select=*&limit=1`, `cols ${tabla}`);
  return Array.isArray(fila) && fila.length ? Object.keys(fila[0]) : [];
}
const prodCols = await columnasDe('products');
const smCols = await columnasDe('stock_movements');
console.log('products cols:', prodCols.join(','));
console.log('stock_movements cols:', smCols.join(','));

// ── 1. Estado vigente de la recepción ──────────────────────────────────────
evidence.receipt = await get(
  `receipts?id=eq.${RECEIPT_ID}&select=*`, 'receipt');

// ── 2. Las 101 líneas vigentes ─────────────────────────────────────────────
evidence.receipt_items = await get(
  `receipt_items?receipt_id=eq.${RECEIPT_ID}&select=id,product_id,quantity,unit_cost,moneda_recepcion,tasa_cambio_recepcion,created_at,updated_at&order=product_id`,
  'receipt_items');

// ── 3. Maestro de productos de las 101 líneas (precio venta vs costo) ───────
const ids = [...new Set(evidence.receipt_items.map((i) => i.product_id))];
const idList = `(${ids.join(',')})`;
const prodSel = prodCols.filter((c) => !['image_url', 'images', 'description', 'barcode_data', 'qr_data', 'metadata'].includes(c)).join(',');
evidence.products = await get(
  `products?id=in.${idList}&select=${prodSel}&order=sku`, 'products');

// ── 4. Cronología COMPLETA de movimientos SKU 111/112 ──────────────────────
const smSel = smCols.join(',');
evidence.stock_movements_111_112 = await get(
  `stock_movements?product_id=in.(${SKU111_ID},${SKU112_ID})&select=${smSel}&order=created_at`,
  'stock_movements 111/112');

// ── 5. WAC change log de ambos productos ───────────────────────────────────
evidence.wac_change_log_111_112 = await get(
  `wac_change_log?product_id=in.(${SKU111_ID},${SKU112_ID})&select=*&order=created_at`,
  'wac_change_log 111/112');

// ── 6. Asiento CP-FIN de la recepción y sus movimientos ────────────────────
evidence.fin_entries_fvc = await get(
  `fin_entries?document_id=eq.${RECEIPT_ID}&select=*`, 'fin_entries FVC');
if (Array.isArray(evidence.fin_entries_fvc) && evidence.fin_entries_fvc.length) {
  const fmCols = await columnasDe('fin_movements');
  const fk = fmCols.find((c) => /entry_id|fin_entry|asiento/i.test(c)) || 'entry_id';
  const entryIds = evidence.fin_entries_fvc.map((e) => e.id).join(',');
  evidence.fin_movements_fvc = await get(
    `fin_movements?${fk}=in.(${entryIds})&select=*&order=id`, 'fin_movements FVC');
  console.log('fin_movements FK usada:', fk);
}

// ── 7. Inventario registrado (per store) de ambos SKU ───────────────────────
evidence.inventory_111_112 = await get(
  `inventory?product_id=in.(${SKU111_ID},${SKU112_ID})&select=*`, 'inventory 111/112');

// ── 8. Doble conversión: TODAS las líneas de recepción de ambos productos ───
evidence.receipt_items_todas_111_112 = await get(
  `receipt_items?product_id=in.(${SKU111_ID},${SKU112_ID})&select=id,product_id,quantity,unit_cost,moneda_recepcion,tasa_cambio_recepcion,receipt_id,created_at,updated_at&order=created_at`,
  'receipt_items todas 111/112');

// ── 9. PR-2 backups: qué contienen (importación original) ───────────────────
evidence.pr2_backup_receipts = await get(
  `pr2_backup_receipts_20260810?select=*&limit=200`, 'pr2_backup_receipts');
evidence.pr2_backup_receipt_items = await get(
  `pr2_backup_receipt_items_20260810?select=*&limit=2000`, 'pr2_backup_receipt_items');
const bkp111 = (evidence.pr2_backup_receipt_items || []).filter((b) => b.product_id === SKU111_ID || b.product_id === SKU112_ID);
console.log('PR-2 backup: líneas de SKU 111/112 →', bkp111.length);

// ── 10. Sale items de ambos productos (COGS real de ventas) ─────────────────
evidence.sale_items_111_112 = await get(
  `sale_items?product_id=in.(${SKU111_ID},${SKU112_ID})&select=*&limit=500`,
  'sale_items 111/112');

// ── 11. Auditoría de tasas sobre líneas de la FVC ──────────────────────────
evidence.receipt_tasa_audit_fvc = await get(
  `receipt_tasa_audit?select=*&order=modificado_at&limit=200`, 'receipt_tasa_audit');

// ── 12. Verificación aritmética independiente ──────────────────────────────
const lines = evidence.receipt_items;
const prodMap = new Map((evidence.products || []).map((p) => [p.id, p]));
let suma = 0, suma_raw = 0;
const detalle = [];
for (const li of lines) {
  const q = Number(li.quantity);
  const uc = Number(li.unit_cost);
  const tasa = Number(li.tasa_cambio_recepcion || 1);
  const vCup = q * uc * tasa;
  suma += vCup;
  suma_raw += q * uc;
  const p = prodMap.get(li.product_id) || {};
  detalle.push({ line_id: li.id, sku: p.sku, producto: p.name, qty: q, unit_cost: uc,
    moneda: li.moneda_recepcion, tasa, valor_cup: vCup,
    precio_venta: p.price, costo_producto: p.cost, moneda_producto: p.moneda || p.currency,
    cost_average: p.cost_average, stock_current: p.stock_current });
}
evidence.verificacion_aritmetica = {
  n_lineas: lines.length,
  suma_equivalentes_cup: Math.round(suma * 100) / 100,
  suma_subtotales_mezclados: Math.round(suma_raw * 100) / 100,
  total_cabecera: evidence.receipt[0]?.total_cost,
  diferencia_cabecera_vs_recomputo: Math.round((evidence.receipt[0]?.total_cost - suma) * 100) / 100,
};

// ── 13. Recomputo del total CORREGIDO (escenario propietario) ────────────────
let sumaCorregida = 0;
const correcciones = [];
for (const d of detalle) {
  let v = d.valor_cup;
  if (d.sku === '111') {
    const nuevo = d.qty * 1; // costo real 1 CUP/unidad
    correcciones.push({ sku: '111', antes: v, despues: nuevo, delta: v - nuevo,
      motivo: 'precio de venta 2.500 CUP importado como costo USD — costo real 1 CUP' });
    v = nuevo;
  } else if (d.sku === '112') {
    const nuevo = d.qty * 1;
    correcciones.push({ sku: '112', antes: v, despues: nuevo, delta: v - nuevo,
      motivo: 'precio de venta 1.000 CUP importado como costo USD — costo real 1 CUP' });
    v = nuevo;
  }
  sumaCorregida += v;
}
evidence.recomputo_corregido = {
  escenario: 'SKU 111/112 a costo real 1 CUP; demás líneas USD conservan tasa 680; CUP tasa 1',
  total_corregido: Math.round(sumaCorregida * 100) / 100,
  total_actual: evidence.receipt[0]?.total_cost,
  delta_total: Math.round(((evidence.receipt[0]?.total_cost || 0) - sumaCorregida) * 100) / 100,
  correcciones,
};

// ── 14. Hashes de cada sección ──────────────────────────────────────────────
evidence.hashes = {};
for (const s of Object.keys(evidence.secciones)) {
  evidence.hashes[s] = sha256(evidence.secciones[s]);
}
for (const s of ['receipt', 'receipt_items', 'products', 'stock_movements_111_112',
  'wac_change_log_111_112', 'fin_entries_fvc', 'inventory_111_112',
  'receipt_items_todas_111_112', 'pr2_backup_receipts', 'pr2_backup_receipt_items',
  'sale_items_111_112', 'receipt_tasa_audit_fvc']) {
  if (evidence[s] !== undefined) evidence.hashes[s] = sha256(evidence[s]);
}

fs.writeFileSync(OUT, JSON.stringify(evidence, null, 1));
console.log('\n=== VERIFICACIÓN ARITMÉTICA ===');
console.log(JSON.stringify(evidence.verificacion_aritmetica, null, 1));
console.log('=== RECOMPUTO CORREGIDO ===');
console.log(JSON.stringify(evidence.recomputo_corregido, null, 1));
console.log('\nGuardado en', OUT, '(' + fs.statSync(OUT).size + ' bytes)');
