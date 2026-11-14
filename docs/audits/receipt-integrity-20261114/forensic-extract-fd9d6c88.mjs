// ============================================================================
// CP-RECEIPT-INTEGRITY-001 — EXTRACCIÓN FORENSE READ-ONLY
// Recepción fd9d6c88 (FAC-VITALLCONS-001) — producción vía REST (service key)
// REGLA: exclusivamente peticiones GET + 1 POST a RPC de solo lectura
// (calculate_receipt_total_cup es SELECT puro). NUNCA escrituras.
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const BASE = 'https://wthkddeleylijmonclxg.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno (nunca commiteada)');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

const RECEIPT_ID = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63';
const OUT = '/home/z/my-project/scripts/out/forensic-fd9d6c88-raw.json';

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');

async function get(path, label) {
  const url = `${BASE}/rest/v1/${path}`;
  const res = await fetch(url, { headers: H });
  const txt = await res.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  if (!res.ok) {
    console.error(`[WARN] ${label} → HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return { _error: { http: res.status, body: txt.slice(0, 500) }, _url_query: path };
  }
  const n = Array.isArray(body) ? body.length : 1;
  console.log(`[OK] ${label} → ${n} filas`);
  return body;
}

const evidence = {
  mision: 'CP-RECEIPT-INTEGRITY-001',
  objeto: 'Recepción fd9d6c88 / FAC-VITALLCONS-001',
  extraccion: {
    fecha_utc: new Date().toISOString(),
    metodo: 'REST PostgREST (service_role) — SOLO LECTURA (GET + 1 RPC SELECT)',
    origen: 'wthkddeleylijmonclxg.supabase.co (producción)',
    receipt_id: RECEIPT_ID,
  },
  secciones: {},
};

// ── 0. Esquema OpenAPI (provenance de columnas) ─────────────────────────────
const spec = await fetch(`${BASE}/rest/v1/`, { headers: { apikey: KEY } }).then((r) => r.json());
const tabs = ['receipts','receipt_items','products','stores','receipt_tasa_audit','stock_movements',
  'kardex_entries','fin_entries','fin_movements','payment_transactions','audit_logs',
  'exchange_rates','store_exchange_rates','wac_change_log',
  'pr2_backup_receipts_20260810','pr2_backup_receipt_items_20260810'];
evidence.secciones.openapi_columnas = {};
for (const t of tabs) {
  const def = spec.definitions?.[t];
  evidence.secciones.openapi_columnas[t] = def ? Object.keys(def.properties) : 'NO-DEF';
}
// nombre del parámetro del RPC calculate_receipt_total_cup
const rpcCalc = spec.paths?.['/rpc/calculate_receipt_total_cup']?.post?.parameters || [];
evidence.secciones.rpc_calc_params = rpcCalc.map((p) => p.name);
console.log('RPC calc params:', JSON.stringify(evidence.secciones.rpc_calc_params));

// ── 1. Cabecera + líneas + backup PR-2 ──────────────────────────────────────
evidence.secciones.receipt = await get(`receipts?id=eq.${RECEIPT_ID}&select=*`, 'receipt');
evidence.secciones.receipt_items = await get(
  `receipt_items?receipt_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc`, 'receipt_items');

const items = Array.isArray(evidence.secciones.receipt_items) ? evidence.secciones.receipt_items : [];
const itemIds = items.map((i) => i.id);
const productIds = [...new Set(items.map((i) => i.product_id))];

evidence.secciones.pr2_backup_receipt = await get(
  `pr2_backup_receipts_20260810?id=eq.${RECEIPT_ID}&select=*`, 'pr2_backup_receipts');
evidence.secciones.pr2_backup_receipt_items = await get(
  `pr2_backup_receipt_items_20260810?receipt_id=eq.${RECEIPT_ID}&select=*`, 'pr2_backup_receipt_items');

// ── 2. Productos implicados ────────────────────────────────────────────────
if (productIds.length) {
  evidence.secciones.products = await get(
    `products?id=in.(${productIds.join(',')})&select=id,name,sku,code,cost_price,price_currency,cost_average,stock_current,active,updated_at,created_at,store_id`,
    'products');
}

// ── 3. Tienda(s) ───────────────────────────────────────────────────────────
const storeId = evidence.secciones.receipt?.[0]?.store_id;
if (storeId) {
  evidence.secciones.stores = await get(`stores?id=eq.${storeId}&select=*`, 'stores');
  evidence.secciones.store_exchange_rates = await get(
    `store_exchange_rates?store_id=eq.${storeId}&select=*`, 'store_exchange_rates');
}

// ── 4. Auditoría de tasas por línea ────────────────────────────────────────
if (itemIds.length) {
  evidence.secciones.receipt_tasa_audit = await get(
    `receipt_tasa_audit?receipt_item_id=in.(${itemIds.join(',')})&select=*&order=modificado_at.asc`,
    'receipt_tasa_audit');
}

// ── 5. Movimientos de inventario / kardex / WAC ────────────────────────────
evidence.secciones.stock_movements_ref = await get(
  `stock_movements?reference_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc`, 'stock_movements(ref)');
evidence.secciones.stock_movements_notes = await get(
  `stock_movements?notes=eq.${RECEIPT_ID}&select=*&order=created_at.asc`, 'stock_movements(notes)');
evidence.secciones.kardex_entries = await get(
  `kardex_entries?reference_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc`, 'kardex_entries');
if (productIds.length && storeId) {
  evidence.secciones.wac_change_log_products = await get(
    `wac_change_log?store_id=eq.${storeId}&product_id=in.(${productIds.join(',')})&select=*&order=created_at.asc&limit=400`,
    'wac_change_log(productos)');
}

// ── 6. CP-FIN ──────────────────────────────────────────────────────────────
evidence.secciones.fin_entries = await get(
  `fin_entries?document_id=eq.${RECEIPT_ID}&select=*`, 'fin_entries');
const finIds = (Array.isArray(evidence.secciones.fin_entries) ? evidence.secciones.fin_entries : []).map((e) => e.id);
if (finIds.length) {
  evidence.secciones.fin_movements = await get(
    `fin_movements?entry_id=in.(${finIds.join(',')})&select=*&order=line_num.asc`, 'fin_movements');
}
evidence.secciones.fin_posting_errors = await get(
  `fin_posting_errors?document_id=eq.${RECEIPT_ID}&select=*`, 'fin_posting_errors');

// ── 7. Pagos ───────────────────────────────────────────────────────────────
evidence.secciones.payment_transactions = await get(
  `payment_transactions?ref_type=eq.receipt&ref_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc`,
  'payment_transactions');

// ── 8. Audit logs (recepción + líneas + productos) ──────────────────────────
evidence.secciones.audit_logs_receipt = await get(
  `audit_logs?record_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc&limit=200`, 'audit_logs(receipt)');
if (itemIds.length) {
  evidence.secciones.audit_logs_items = await get(
    `audit_logs?record_id=in.(${itemIds.join(',')})&select=*&order=created_at.asc&limit=400`, 'audit_logs(items)');
}
// por table_name (algunos logs usan record_id de otra entidad)
evidence.secciones.audit_logs_receipts_table = await get(
  `audit_logs?table_name=eq.receipts&record_id=eq.${RECEIPT_ID}&select=*&order=created_at.asc`, 'audit_logs(receipts.tbl)');
evidence.secciones.audit_logs_receipt_items_table = await get(
  `audit_logs?table_name=eq.receipt_items&record_id=in.(${itemIds.join(',')})&select=*&order=created_at.asc&limit=400`,
  'audit_logs(receipt_items.tbl)');

// ── 9. Tasas de cambio históricas (USD) alrededor de las fechas críticas ──
evidence.secciones.exchange_rates_jun_aug = await get(
  `exchange_rates?currency=eq.USD&rate_date=gte.2026-06-20&rate_date=lte.2026-08-15&select=*&order=rate_date.asc&limit=200`,
  'exchange_rates USD 20/06-15/08');
evidence.secciones.exchange_rates_reciente = await get(
  `exchange_rates?currency=eq.USD&select=*&order=rate_date.desc&limit=10`, 'exchange_rates USD recientes');

// ── 10. RPC de solo lectura: total autoritario del servidor ────────────────
const calcParam = (evidence.secciones.rpc_calc_params || [])[0] || 'p_receipt_id';
try {
  const res = await fetch(`${BASE}/rest/v1/rpc/calculate_receipt_total_cup`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ [calcParam]: RECEIPT_ID }),
  });
  const txt = await res.text();
  console.log('RPC calculate_receipt_total_cup →', res.status, txt.slice(0, 200));
  evidence.secciones.rpc_calculate_receipt_total_cup = {
    http: res.status, param: calcParam, resultado: txt.slice(0, 500),
  };
} catch (e) {
  evidence.secciones.rpc_calculate_receipt_total_cup = { error: String(e) };
}

// ── 11. Recomputo independiente (client-side, sin usar ninguna función de la app)
const calc = {
  lineas: items.map((i) => {
    const sub = Number(i.quantity) * Number(i.unit_cost);
    const cup = sub * Number(i.tasa_cambio_recepcion ?? 1);
    return {
      id: i.id, product_id: i.product_id,
      quantity: Number(i.quantity), unit_cost: Number(i.unit_cost),
      moneda: i.moneda_recepcion, tasa: Number(i.tasa_cambio_recepcion),
      subtotal_moneda_original: sub, equivalente_cup: cup,
      created_at: i.created_at, updated_at: i.updated_at,
    };
  }),
};
calc.sumatoria_subtotales_por_moneda = {};
calc.sumatoria_subtotales_mixta_sin_convertir = 0;
calc.sumatoria_equivalentes_cup = 0;
for (const l of calc.lineas) {
  calc.sumatoria_subtotales_por_moneda[l.moneda] =
    (calc.sumatoria_subtotales_por_moneda[l.moneda] || 0) + l.subtotal_moneda_original;
  calc.sumatoria_subtotales_mixta_sin_convertir += l.subtotal_moneda_original;
  calc.sumatoria_equivalentes_cup += l.equivalente_cup;
}
calc.total_cabecera = Number(evidence.secciones.receipt?.[0]?.total_cost);
calc.diferencia_cabecera_vs_cup = calc.total_cabecera - calc.sumatoria_equivalentes_cup;
calc.diferencia_cabecera_vs_subtotales = calc.total_cabecera - calc.sumatoria_subtotales_mixta_sin_convertir;
evidence.secciones.recomputo_independiente = calc;

console.log('\n=== RECOMPUTO INDEPENDIENTE ===');
console.log('Líneas:', calc.lineas.length);
console.log('Suma subtotales por moneda:', JSON.stringify(calc.sumatoria_subtotales_por_moneda));
console.log('Suma equivalente CUP:', calc.sumatoria_equivalentes_cup.toFixed(2));
console.log('Total cabecera (DB):', calc.total_cabecera.toFixed(2));
console.log('Dif cabecera vs CUP:', calc.diferencia_cabecera_vs_cup.toFixed(2));
console.log('Dif cabecera vs subtotales sin convertir:', calc.diferencia_cabecera_vs_subtotales.toFixed(2));

// ── 12. Hashes SHA-256 por sección + global ────────────────────────────────
evidence.hashes = {};
for (const [k, v] of Object.entries(evidence.secciones)) {
  evidence.hashes[k] = sha256(v);
}
evidence.hashes.__global_secciones = sha256(evidence.secciones);
evidence.extraccion.fin_utc = new Date().toISOString();

fs.mkdirSync('/home/z/my-project/scripts/out', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
console.log('\nEvidencia escrita en', OUT);
console.log('SHA-256 global secciones:', evidence.hashes.__global_secciones);
