// ============================================================================
// CP-FIN-VALUATION-CORRECTION-002 — FASE G: PROTOTIPO E2E AISLADO (v2)
// Rectificación de SKU 111/112 (FAC-VITALLCONS-001) en BD E2E aislada.
// Réplica fiel del estado de producción (alcance: 2 SKU) + procedimiento
// canónico de rectificación (transacción atómica vía pooler IPv4, escape
// hatch gobernado app.allow_receipt_item_edit) + validaciones + idempotencia
// + rollback controlado + re-aplicación + cleanup net-delta-0.
// REGLA: producción intocada; TODO write ocurre en lguovmvrozxgssupkwpf (E2E).
// Guard de aislamiento: réplica del contrato e2e/fixtures/assert-isolated-db.ts
// (sentinela e2e_is_isolated_db() verificada por REST y SQL, fail-closed).
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
const KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: process.env.E2E_SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } };
const OUT = '/home/z/my-project/scripts/out/rect002-e2e-prototipo.json';

// ── IDs deterministas ───────────────────────────────────────────────────────
const S = '7ec70002-0000-4000-8000-000000000002';
const P111 = '7ec70002-0000-4000-8000-000000000111';
const P112 = '7ec70002-0000-4000-8000-000000000112';
const RCP = '7ec70002-0000-4000-8000-a0b100000001';
const IT111 = '7ec70002-0000-4000-8000-a0b100000002';
const IT112 = '7ec70002-0000-4000-8000-a0b100000003';
const E_RECON = '7ec70002-0000-4000-8000-c0b100000001';
const E_VENTA = '7ec70002-0000-4000-8000-c0b100000004';
const E_VALES = '7ec70002-0000-4000-8000-c0b100000005';
const E_RECT = '7ec70002-0000-4000-8000-d0b100000001';
const E_REVAL2 = '7ec70002-0000-4000-8000-d0b100000002';
const E_ROLLB = '7ec70002-0000-4000-8000-d0b100000099';
const mov = (n) => `7ec70002-0000-4000-8000-b0b1${String(n).padStart(8, '0')}`;
const fmov = (n) => `7ec70002-0000-4000-8000-f0b1${String(n).padStart(8, '0')}`;
const AUD = (n) => `7ec70002-0000-4000-8000-e0b1${String(n).padStart(8, '0')}`;
const WCL = (n) => `7ec70002-0000-4000-8000-9cb1${String(n).padStart(8, '0')}`;

const sha256 = (s) => createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
const log = (...a) => console.log(...a);
const tz = (regla, metrica, template) => ({ regla, metrica, template });

async function rest(method, path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  return j;
}
const get = (p) => rest('GET', p, null);
const post = (p, b) => rest('POST', p, b);
const del = (p) => rest('DELETE', p, null);

// ── Cronología de producción (réplica del kardex 111/112) ───────────────────
const KARDEX = [
  ['112', '2026-07-01T12:00:00+00:00', 'purchase', 100, 680000, 'Confirmacion recepcion'],
  ['111', '2026-07-01T12:00:00+00:00', 'purchase', 49, 1700000, 'Confirmacion recepcion'],
  ['111', '2026-07-24T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-08-18T12:00:00+00:00', 'adjustment', -17, 0, 'Cuadre importación ENERVIDA'],
  ['111', '2026-08-18T12:00:00+00:00', 'adjustment', -1, 0, 'Cuadre importación ENERVIDA'],
  ['112', '2026-09-19T12:00:00+00:00', 'issue_slip_out', -4, 0, 'Vale de Salida VS-000037-2026'],
  ['111', '2026-10-04T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-10-05T12:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000138-2026'],
  ['112', '2026-10-05T12:00:00+00:00', 'sale', -3, 1, 'Venta POS v2'],
  ['111', '2026-10-05T12:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000139-2026'],
  ['111', '2026-10-09T12:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000148-2026'],
  ['112', '2026-10-10T12:00:00+00:00', 'issue_slip_out', -10, 1, 'Vale de Salida VS-000165-2026'],
  ['112', '2026-10-10T12:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000157-2026'],
  ['111', '2026-10-10T12:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000158-2026'],
  ['111', '2026-10-14T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['111', '2026-10-22T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['112', '2026-10-28T12:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000208-2026'],
  ['111', '2026-10-28T12:00:00+00:00', 'issue_slip_out', -12, 1, 'Vale de Salida VS-000208-2026'],
  ['112', '2026-11-07T12:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T12:00:00+00:00', 'issue_slip_reverse', 1, 1, 'Reversion Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T12:00:00+00:00', 'issue_slip_out', -5, 1, 'Vale de Salida VS-000225-2026'],
];

const EVID = { mision: 'CP-FIN-VALUATION-CORRECTION-002', fase: 'G — prototipo E2E aislado',
  generado: new Date().toISOString(),
  bd: { url: BASE, proyecto: 'lguovmvrozxgssupkwpf (CostproE2E — AISLADA)', sentinela: true,
    canal_escritura: 'pooler IPv4 aws-0-us-east-1:6543 + REST service_role' },
  pasos: {}, validaciones: {}, idempotencia: {}, rollback: {}, cleanup: {} };

async function paso(nombre, fn) {
  const t0 = Date.now();
  const r = await fn();
  EVID.pasos[nombre] = { ms: Date.now() - t0, resumen: typeof r?.resumen === 'string' ? r.resumen : JSON.stringify(r?.resumen ?? 'ok') };
  log(`▸ ${nombre} (${Date.now() - t0}ms) ${r?.log ?? ''}`);
  return r;
}
const DIAG = EVID.diagnostico_productos = [];
async function snapProducts(label) {
  const prods = await get(`products?store_id=eq.${S}&select=sku,stock_current,cost_average,price&order=sku`);
  DIAG.push({ label, prods });
  return prods.map((p) => `${p.sku}:${p.stock_current}`);
}

// ═══ 0. PREFLIGHT ═══════════════════════════════════════════════════════════
const db = new pg.Client(POOLER);
await paso('preflight', async () => {
  const sent = await get('rpc/e2e_is_isolated_db').catch(() => null);
  if (sent !== true) throw new Error('SENTINELA E2E NO CONFIRMA AISLAMIENTO — ABORTAR');
  await db.connect();
  const iso = await db.query('select e2e_is_isolated_db() as iso');
  if (iso.rows[0].iso !== true) { await db.end(); throw new Error('sentinela SQL != true'); }
  await limpiarTodo();
  return { resumen: 'sentinela=true (REST+SQL); residuos previos eliminados' };
});

const TABLAS = ['stores', 'products', 'receipts', 'receipt_items', 'stock_movements',
  'fin_entries', 'fin_movements', 'wac_change_log', 'audit_logs', 'inventory', 'kardex_entries'];
async function conteosGlobales() {
  const c = {};
  for (const t of TABLAS) {
    const r = await fetch(`${BASE}/rest/v1/${t}?select=id`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: '0-0', Prefer: 'count=exact' } });
    c[t] = Number(r.headers.get('content-range')?.split('/')[1] || 0);
  }
  return c;
}
const BASELINE = await conteosGlobales();
EVID.cleanup.baseline_conteos = BASELINE;
log('baseline:', JSON.stringify(BASELINE));

// ═══ 1. SEED — réplica del estado de producción (alcance 2 SKU) ═════════════
await paso('seed_store_productos', async () => {
  await post('stores', {
    id: S, name: 'RECT002-PROTO (réplica ENERVIDA)', slug: 'rect002-proto',
    is_active: true, created_at: '2026-11-15T00:00:00Z', backup_restore_protected: false });
  await post('products', [
    { id: P111, store_id: S, sku: '111', name: 'Grapas plásticas con clavo de acero',
      price: 2000, cost_price: 0, cost_average: 1, stock_current: 10, min_stock: 1,
      unit_of_measure: 'unidad', category: 'Ferretería', supplier: 'Vitallcons',
      price_currency: 'CUP', is_active: true, visible_en_tienda: true,
      operational_class: 'venta', created_at: '2026-08-11T22:49:13Z', updated_at: '2026-10-28T16:00:00Z' },
    { id: P112, store_id: S, sku: '112', name: 'Grapas metálicas 3/4 con tornillo roscante',
      price: 1000, cost_price: 0, cost_average: 1, stock_current: 20, min_stock: 1,
      unit_of_measure: 'unidad', category: 'Ferretería', supplier: 'Vitallcons',
      price_currency: 'USD', is_active: true, visible_en_tienda: true,
      operational_class: 'venta', created_at: '2026-08-11T22:49:13Z', updated_at: '2026-11-07T14:23:13Z' }]);
  return { resumen: 'tienda + 2 productos réplica (precios de venta intactos)' };
});

await paso('seed_recepcion_defectuosa', async () => {
  await post('receipts', {
    id: RCP, store_id: S, status: 'active', total_cost: 151300000,
    reference_doc: 'FAC-VITALLCONS-001', supplier: 'Vitallcons',
    reception_date: '2026-07-01', payment_status: 'unpaid', paid_amount: 0,
    created_at: '2026-08-11T22:49:18Z', updated_at: '2026-07-01T12:00:00Z',
    notes: 'RÉPLICA E2E CP-FIN-VALUATION-CORRECTION-002 — alcance: líneas SKU 111/112' });
  await post('receipt_items', [
    { id: IT111, receipt_id: RCP, product_id: P111, quantity: 49, unit_cost: 2500,
      moneda_recepcion: 'USD', tasa_cambio_recepcion: 680,
      created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z' },
    { id: IT112, receipt_id: RCP, product_id: P112, quantity: 100, unit_cost: 1000,
      moneda_recepcion: 'USD', tasa_cambio_recepcion: 680,
      created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z' }]);
  return { resumen: 'recepción réplica: 2 líneas USD@680 (defecto original)' };
});

await paso('seed_kardex', async () => {
  let n = 1;
  for (const [sku, fecha, tipo, dq, uc, ref] of KARDEX) {
    // created_at DESEMPATADO (± n minutos) para determinismo del trigger
    // sync_product_stock (ORDER BY movement_date DESC, created_at DESC LIMIT 1);
    // movement_date conserva la fecha económica real de producción.
    const ca = new Date(new Date(fecha).getTime() + (n - 1) * 60000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    await post('stock_movements', {
      id: mov(n), store_id: S, product_id: sku === '111' ? P111 : P112,
      quantity_change: dq, movement_type: tipo,
      reference_id: tipo === 'purchase' ? RCP : null,
      reference_doc: ref, movement_date: fecha, created_at: ca,
      unit_cost: uc, unit_price: 0, cost_value_change: dq * uc,
      balance_after: null, created_by: null });
    n++;
  }
  return { resumen: `${KARDEX.length} movimientos réplica insertados (created_at desempatado)`, log: JSON.stringify(await snapProducts('tras_seed_kardex')) };
});

await paso('seed_asientos_historicos', async () => {
  await post('fin_entries', [
    { id: E_RECON, store_id: S, document_type: 'RECEPCION', document_id: RCP,
      document_number: 'FAC-VITALLCONS-001', event: 'reconocimiento',
      economic_date: '2026-07-01', posted_at: '2026-11-14T01:51:20Z', status: 'posted',
      description: 'Entrada de almacén (réplica E2E RECT002)',
      movements_snapshot: [
        { traza: tz('motor-cp-fin', 'total_cup', 'r-inv-d'), amount: 151300000, sentido: 'debito', currency: 'CUP', categoria: 'ACT_INVENTARIO', exchange_rate: 1, currency_origin: 'CUP' },
        { traza: tz('motor-cp-fin', 'total_cup', 'r-cxp-c'), amount: 151300000, sentido: 'credito', currency: 'CUP', categoria: 'PAS_CXP_PROV', exchange_rate: 1, currency_origin: 'CUP' }] },
    { id: E_VENTA, store_id: S, document_type: 'VENTA', document_id: null, document_number: null, event: 'reconocimiento',
      economic_date: '2026-10-14', posted_at: '2026-10-14T12:30:00Z', status: 'posted',
      description: 'COGS histórico ventas SKU 111/112 (réplica, valores registrados)',
      movements_snapshot: [
        { traza: tz('rect002-h', 'cogs_registrado', 'hist-d'), amount: 5, sentido: 'debito', currency: 'CUP', categoria: 'GAS_COSTO_VENTAS', exchange_rate: 1, currency_origin: 'CUP' },
        { traza: tz('rect002-h', 'cogs_registrado', 'hist-c'), amount: 5, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO', exchange_rate: 1, currency_origin: 'CUP' }] },
    { id: E_VALES, store_id: S, document_type: 'VALE_SALIDA', document_id: null, document_number: null, event: 'reconocimiento',
      economic_date: '2026-11-07', posted_at: '2026-11-07T12:30:00Z', status: 'posted',
      description: 'Vales/ajustes/reversión SKU 111/112 (réplica, valores registrados)',
      movements_snapshot: [
        { traza: tz('rect002-h', 'vales_registrado', 'hist-d'), amount: 88, sentido: 'debito', currency: 'CUP', categoria: 'GAS_VALES', exchange_rate: 1, currency_origin: 'CUP' },
        { traza: tz('rect002-h', 'vales_registrado', 'hist-c'), amount: 88, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO', exchange_rate: 1, currency_origin: 'CUP' }] }]);
  await post('fin_movements', [
    { id: fmov(1), entry_id: E_RECON, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'debito',
      amount: 151300000, currency: 'CUP', exchange_rate: 1, economic_date: '2026-07-01',
      description: 'Entrada de almacén (réplica RECT002)', traza: tz('motor-cp-fin', 'total_cup', 'r-inv-d'),
      currency_origin: 'CUP', created_at: '2026-11-14T01:51:20Z' },
    { id: fmov(2), entry_id: E_RECON, store_id: S, category_code: 'PAS_CXP_PROV', sense: 'credito',
      amount: 151300000, currency: 'CUP', exchange_rate: 1, economic_date: '2026-07-01',
      description: 'Entrada de almacén (réplica RECT002)', traza: tz('motor-cp-fin', 'total_cup', 'r-cxp-c'),
      currency_origin: 'CUP', created_at: '2026-11-14T01:51:20Z' },
    { id: fmov(3), entry_id: E_VENTA, store_id: S, category_code: 'GAS_COSTO_VENTAS', sense: 'debito',
      amount: 5, currency: 'CUP', exchange_rate: 1, economic_date: '2026-10-14',
      description: 'COGS ventas 111/112 registrado (2 con uc=0)', traza: tz('rect002-h', 'cogs_registrado', 'hist-d'),
      currency_origin: 'CUP', created_at: '2026-10-14T12:30:00Z' },
    { id: fmov(4), entry_id: E_VENTA, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'credito',
      amount: 5, currency: 'CUP', exchange_rate: 1, economic_date: '2026-10-14',
      description: 'COGS ventas 111/112 registrado', traza: tz('rect002-h', 'cogs_registrado', 'hist-c'),
      currency_origin: 'CUP', created_at: '2026-10-14T12:30:00Z' },
    { id: fmov(5), entry_id: E_VALES, store_id: S, category_code: 'GAS_VALES', sense: 'debito',
      amount: 88, currency: 'CUP', exchange_rate: 1, economic_date: '2026-11-07',
      description: 'Vales netos 111/112 registrados (89 salidas − 1 reversión)', traza: tz('rect002-h', 'vales_registrado', 'hist-d'),
      currency_origin: 'CUP', created_at: '2026-11-07T12:30:00Z' },
    { id: fmov(6), entry_id: E_VALES, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'credito',
      amount: 88, currency: 'CUP', exchange_rate: 1, economic_date: '2026-11-07',
      description: 'Vales netos 111/112 registrados', traza: tz('rect002-h', 'vales_registrado', 'hist-c'),
      currency_origin: 'CUP', created_at: '2026-11-07T12:30:00Z' }]);
  return { resumen: '3 asientos réplica: reconocimiento 151,3M + COGS 5 + vales 88' };
});

// ═══ 2. VALIDACIÓN DEL ESTADO 'ANTES' ═══════════════════════════════════════
function calcKardex(movs) {
  let saldo = 0, valor = 0; const filas = [];
  for (const m of movs) {
    const dq = Number(m.quantity_change), uc = Number(m.unit_cost || 0);
    saldo += dq; valor += dq * uc;
    filas.push({ fecha: String(m.movement_date).slice(0, 10), tipo: m.movement_type, dQ: dq, uc, v: dq * uc, saldo });
  }
  return { filas, saldo, valor };
}
await paso('validar_antes', async () => {
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*&order=id`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  const prods = await get(`products?store_id=eq.${S}&select=*&order=sku`);
  const k111 = calcKardex(movs.filter((m) => m.product_id === P111));
  const k112 = calcKardex(movs.filter((m) => m.product_id === P112));
  const cogs = k111.filas.filter((f) => f.tipo === 'sale').reduce((s, f) => s + f.v, 0)
    + k112.filas.filter((f) => f.tipo === 'sale').reduce((s, f) => s + f.v, 0);
  const vales = k111.filas.filter((f) => f.tipo === 'issue_slip_out' || f.tipo === 'adjustment').reduce((s, f) => s + f.v, 0)
    + k112.filas.filter((f) => f.tipo === 'issue_slip_out' || f.tipo === 'adjustment').reduce((s, f) => s + f.v, 0);
  EVID.validaciones.antes = {
    total_recepcion: rcpt.total_cost, lineas: items.map((i) => ({ sku: i.product_id === P111 ? '111' : '112', uc: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion })),
    precios: prods.map((p) => ({ sku: p.sku, price: p.price, moneda: p.price_currency })),
    saldos: { sku111: k111.saldo, sku112: k112.saldo }, cogs_registrado: cogs, vales_registrados: vales,
    ok: rcpt.total_cost === 151300000 && k111.saldo === 10 && k112.saldo === 20 };
  return { resumen: EVID.validaciones.antes.ok ? 'estado defectuoso replicado OK' : 'DIVERGENCIA', log: `total=${rcpt.total_cost} saldos=${k111.saldo}/${k112.saldo} cogs=${cogs} vales=${vales}` };
});

// ═══ 3. RECTIFICACIÓN CANÓNICA (transacción atómica vía pooler) ════════════
let BACKUP = null;
let RECT_CALL = 0;
async function rectificar() {
  RECT_CALL++;
  const cambios = { items: 0, receipt: 0, movs_compra: 0, movs_salida: 0, wac: 0, asientos: 0, audit: 0 };
  // S0 — respaldo lógico pre-flight
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  BACKUP = { generado: new Date().toISOString(), receipt: { id: rcpt.id, total_cost: rcpt.total_cost },
    items: items.map((i) => ({ id: i.id, unit_cost: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion })),
    movs: movs.map((m) => ({ id: m.id, unit_cost: m.unit_cost, cost_value_change: m.cost_value_change })) };

  const auditRows = [];
  const aud = (accion, tabla, record, oldD, newD, motivo) => auditRows.push({ id: AUD(auditRows.length + 1),
    created_at: new Date().toISOString(), user_id: null, table_name: tabla, record_id: record,
    action: accion, old_data: oldD, new_data: newD,
    metadata: { mision: 'CP-FIN-VALUATION-CORRECTION-002', motivo, documento: 'FAC-VITALLCONS-001' },
    store_id: S, trace_id: 'RECT002' });

  const exceso = 151300000 - 149;
  const client = db;
  const snapSql = async (label) => {
    const r = await client.query('SELECT sku, stock_current, cost_average FROM products WHERE store_id=$1 ORDER BY sku', [S]);
    DIAG.push({ label, prods: r.rows });
  };
  await client.query('BEGIN');
  try {
    // escape hatch gobernado (trigger M021 inmutabilidad receipt_items)
    await client.query("SET LOCAL app.allow_receipt_item_edit = 'on'");
    await snapSql('inicio_tx');
    // S1 — receipt_items → costo real 1 CUP
    const r1 = await client.query(
      `UPDATE receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
       WHERE receipt_id=$1 AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)
       RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes, tasa_cambio_recepcion AS tasa_antes`, [RCP]);
    cambios.items = r1.rowCount;
    for (const row of r1.rows) aud('SYSTEM_RECT_VALUATION', 'receipt_items', row.id,
      { unit_cost: row.uc_antes, moneda: row.moneda_antes, tasa: row.tasa_antes },
      { unit_cost: 1, moneda: 'CUP', tasa: 1 },
      'Precio de venta importado como costo — costo real 1 CUP (declarado por propietario 2026-11-15)');
    // S2 — cabecera: total correcto (réplica 149; producción 40.739.585)
    const r2 = await client.query(
      `UPDATE receipts SET total_cost=$2, updated_at=now()
       WHERE id=$1 AND total_cost<>$2 RETURNING id, total_cost AS antes`, [RCP, 149]);
    cambios.receipt = r2.rowCount;
    if (r2.rowCount) aud('SYSTEM_RECT_TOTAL', 'receipts', RCP, { total_cost: r2.rows[0].antes }, { total_cost: 149 }, 'Recalculo tras corrección de líneas');
    // S3 — capas de compra: uc → 1
    const r3 = await client.query(
      `UPDATE stock_movements SET unit_cost=1, cost_value_change=quantity_change*1
       WHERE store_id=$1 AND movement_type='purchase' AND unit_cost<>1
       RETURNING id, unit_cost AS antes`, [S]);
    cambios.movs_compra = r3.rowCount;
    for (const row of r3.rows) aud('SYSTEM_RECT_MOV_UC', 'stock_movements', row.id, { unit_cost: row.antes }, { unit_cost: 1 }, 'Capa de compra revalorizada al costo real 1 CUP');
    await snapSql('tras_S3_compras');
    // S4 — salidas subvaluadas uc=0 → 1
    const r4 = await client.query(
      `UPDATE stock_movements SET unit_cost=1, cost_value_change=quantity_change*1
       WHERE store_id=$1 AND quantity_change<0 AND unit_cost=0
       RETURNING id, unit_cost AS antes, quantity_change`, [S]);
    cambios.movs_salida = r4.rowCount;
    for (const row of r4.rows) aud('SYSTEM_RECT_MOV_SALIDA', 'stock_movements', row.id, { unit_cost: 0 }, { unit_cost: 1 }, 'Salida subvaluada (uc=0) revalorizada a costo real 1 CUP');
    await snapSql('tras_S4_salidas');
    // S5 — WAC cronológico (1 CUP constante) + wac_change_log
    const rw = await client.query(
      `INSERT INTO wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
       VALUES ($1,$2,$3,1,1,'rectificacion',$4,1,$5,now()),($6,$2,$7,1,1,'rectificacion',$8,1,$9,now())
       ON CONFLICT (id) DO NOTHING`,
      [WCL(1), S, P111, 10, { mision: 'CP-FIN-VALUATION-CORRECTION-002', documento: 'FAC-VITALLCONS-001',
        decision: 'Costo real 1 CUP/unidad declarado por propietario; WAC cronológico recalculado: 1 CUP constante (capas revalorizadas 1.700.000/680.000 → 1)', metodo: 'governed_admin_write (escape hatch M021) — réplica E2E' },
       WCL(2), P112, 20, { mision: 'CP-FIN-VALUATION-CORRECTION-002', documento: 'FAC-VITALLCONS-001',
        decision: 'Costo real 1 CUP/unidad declarado por propietario; WAC cronológico recalculado: 1 CUP constante', metodo: 'governed_admin_write (escape hatch M021) — réplica E2E' }]);
    cambios.wac = rw.rowCount || 0;
    // S6 — asiento de rectificación del reconocimiento (idempotente por id)
    const r6 = await client.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
         reversal_of, economic_date, posted_at, status, description, movements_snapshot)
       VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-RECT','ajuste_manual',$4,'2026-07-01',now(),'posted',$5,$6)
       ON CONFLICT (id) DO NOTHING RETURNING id`, [E_RECT, S, RCP, E_RECON,
        'Rectificación CP-FIN-VALUATION-CORRECTION-002: reversión del exceso de reconocimiento de SKU 111/112 (precio de venta importado como costo USD; costo real 1 CUP)',
        JSON.stringify([
          { traza: tz('rect002', 'exceso_reconocimiento', 'rect-cxp-d'), amount: exceso, sentido: 'debito', currency: 'CUP', categoria: 'PAS_CXP_PROV', exchange_rate: 1, currency_origin: 'CUP' },
          { traza: tz('rect002', 'exceso_reconocimiento', 'rect-inv-c'), amount: exceso, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO', exchange_rate: 1, currency_origin: 'CUP' }])]);
    cambios.asientos += r6.rowCount;
    await client.query(
      `INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza, currency_origin, created_at)
       VALUES ($1,$2,$3,'PAS_CXP_PROV','debito',$4,'CUP',1,'2026-07-01',$5,$6,'CUP',now()),
              ($7,$2,$3,'ACT_INVENTARIO','credito',$4,'CUP',1,'2026-07-01',$8,$9,'CUP',now())
       ON CONFLICT (id) DO NOTHING`,
      [fmov(10), E_RECT, S, exceso, 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)',
        JSON.stringify(tz('rect002', 'exceso_reconocimiento', 'rect-cxp-d')),
        fmov(11), 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)',
        JSON.stringify(tz('rect002', 'exceso_reconocimiento', 'rect-inv-c'))]);
    // S7 — asiento de revalorización de salidas subvaluadas (2 COGS + 24 vales)
    const r7 = await client.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
         economic_date, posted_at, status, description, movements_snapshot)
       VALUES ($1,$2,'AJUSTE_INVENTARIO',$3,'FAC-VITALLCONS-001-RECT-SAL','ajuste_manual','2026-11-15',now(),'posted',$4,$5)
       ON CONFLICT (id) DO NOTHING RETURNING id`, [E_REVAL2, S, RCP,
        'Revalorización de salidas subvaluadas (uc=0→1) de SKU 111/112: 26 unidades × 1 CUP',
        JSON.stringify([
          { traza: tz('rect002', 'cogs_subvaluado', 'rect-cogs-d'), amount: 2, sentido: 'debito', currency: 'CUP', categoria: 'GAS_COSTO_VENTAS', exchange_rate: 1, currency_origin: 'CUP' },
          { traza: tz('rect002', 'vales_subvaluado', 'rect-vales-d'), amount: 24, sentido: 'debito', currency: 'CUP', categoria: 'GAS_VALES', exchange_rate: 1, currency_origin: 'CUP' },
          { traza: tz('rect002', 'salidas_subvaluadas', 'rect-inv-c'), amount: 26, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO', exchange_rate: 1, currency_origin: 'CUP' }])]);
    cambios.asientos += r7.rowCount;
    await client.query(
      `INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza, currency_origin, created_at)
       VALUES ($1,$2,$3,'GAS_COSTO_VENTAS','debito',2,'CUP',1,'2026-11-15',$4,$5,'CUP',now()),
              ($6,$2,$3,'GAS_VALES','debito',24,'CUP',1,'2026-11-15',$7,$8,'CUP',now()),
              ($9,$2,$3,'ACT_INVENTARIO','credito',26,'CUP',1,'2026-11-15',$10,$11,'CUP',now())
       ON CONFLICT (id) DO NOTHING`,
      [fmov(12), E_REVAL2, S, 'COGS subvaluado 2 CUP (2 ventas uc=0)', JSON.stringify(tz('rect002', 'cogs_subvaluado', 'rect-cogs-d')),
        fmov(13), 'Vales/ajustes subvaluados 24 CUP (24 unidades uc=0)', JSON.stringify(tz('rect002', 'vales_subvaluado', 'rect-vales-d')),
        fmov(14), 'Revalorización salidas SKU 111/112', JSON.stringify(tz('rect002', 'salidas_subvaluadas', 'rect-inv-c'))]);
    // auditoría de todos los pasos (append)
    for (const a of auditRows) {
      await client.query(
        `INSERT INTO audit_logs (id, created_at, user_id, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RECT002') ON CONFLICT (id) DO NOTHING`,
        [a.id, a.created_at, a.user_id, a.table_name, a.record_id, a.action,
         JSON.stringify(a.old_data), JSON.stringify(a.new_data), JSON.stringify(a.metadata), a.store_id]);
    }
    cambios.audit = auditRows.length;
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await snapProducts('tras_rectificacion_' + RECT_CALL);
  return cambios;
}

const r1 = await paso('rectificacion_aplicada', rectificar);
EVID.pasos.rectificacion_aplicada.detalle = r1;

// ═══ 4. VALIDACIÓN DEL ESTADO 'DESPUÉS' ═════════════════════════════════════
await paso('validar_despues', async () => {
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*&order=id`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  const prods = await get(`products?store_id=eq.${S}&select=*&order=sku`);
  const inv = await get(`inventory?store_id=eq.${S}&select=*&order=product_id`);
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const k111 = calcKardex(movs.filter((m) => m.product_id === P111));
  const k112 = calcKardex(movs.filter((m) => m.product_id === P112));
  const p111 = prods.find((p) => p.sku === '111'), p112 = prods.find((p) => p.sku === '112');
  const ventas = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'sale');
  const vales = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'issue_slip_out' || f.tipo === 'adjustment');
  const porAsiento = {};
  for (const m of fm) {
    porAsiento[m.entry_id] = porAsiento[m.entry_id] || { D: 0, C: 0 };
    if (m.sense === 'debito') porAsiento[m.entry_id].D += Number(m.amount); else porAsiento[m.entry_id].C += Number(m.amount);
  }
  const netoACT = fm.filter((m) => m.category_code === 'ACT_INVENTARIO')
    .reduce((s, m) => s + (m.sense === 'debito' ? 1 : -1) * Number(m.amount), 0);
  const netoPAS = fm.filter((m) => m.category_code === 'PAS_CXP_PROV')
    .reduce((s, m) => s + (m.sense === 'debito' ? 1 : -1) * Number(m.amount), 0);
  const valorLibros = Number(p111.cost_average) * Number(p111.stock_current) + Number(p112.cost_average) * Number(p112.stock_current);
  const rectEntry = (await get(`fin_entries?id=eq.${E_RECT}&select=*`))[0];
  const V = {
    precios_venta: { sku111: { price: p111.price, moneda: p111.price_currency }, sku112: { price: p112.price, moneda: p112.price_currency } },
    productos_detalle: { sku111: { stock_current: p111.stock_current, cost_average: p111.cost_average }, sku112: { stock_current: p112.stock_current, cost_average: p112.cost_average } },
    lineas: items.map((i) => ({ sku: i.product_id === P111 ? '111' : '112', uc: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion, valor: Number(i.quantity) * Number(i.unit_cost) })),
    total_recepcion: rcpt.total_cost,
    kardex_final: { sku111: { saldo: k111.saldo, valor: k111.valor }, sku112: { saldo: k112.saldo, valor: k112.valor } },
    cogs_ventas: ventas.reduce((s, f) => s + f.v, 0), vales_ajustes: vales.reduce((s, f) => s + f.v, 0),
    por_asiento: porAsiento, neto_ACT_INVENTARIO: netoACT, neto_PAS_CXP_PROV: netoPAS, valor_libros: valorLibros,
    inventario_tabla: inv.map((i) => ({ product_id: i.product_id, qty: i.quantity })),
    reversal_of: rectEntry?.reversal_of, checks: {} };
  V.checks = {
    V1_precios_conservados: p111.price === 2000 && p111.price_currency === 'CUP' && p112.price === 1000 && p112.price_currency === 'USD',
    V2_costo_1cup: items.every((i) => Number(i.unit_cost) === 1 && i.moneda_recepcion === 'CUP' && Number(i.tasa_cambio_recepcion) === 1),
    V3_valoracion_149: rcpt.total_cost === 149,
    V4_wac_cronologico: k111.saldo === 10 && k112.saldo === 20 && Math.abs(k111.valor / k111.saldo - 1) < 1e-9 && Math.abs(k112.valor / k112.saldo - 1) < 1e-9 && Number(p111.cost_average) === 1 && Number(p112.cost_average) === 1,
    V5_cogs_correcto: ventas.reduce((s, f) => s + f.v, 0) === -7 && vales.reduce((s, f) => s + f.v, 0) === -113,
    V6_balance_equilibrado: Object.values(porAsiento).every((e) => Math.abs(e.D - e.C) < 1e-9) && netoACT === 30 && netoPAS === -149 && valorLibros === 30,
    V7_trazabilidad: rectEntry?.reversal_of === E_RECON && rectEntry.document_number === 'FAC-VITALLCONS-001-RECT' && movs.filter((m) => m.movement_type === 'purchase').every((m) => m.reference_id === RCP),
    V10_sin_duplicacion: fm.length === 11 && movs.length === 21 };
  V.todo_ok = Object.values(V.checks).every(Boolean);
  EVID.validaciones.despues = V;
  return { resumen: V.todo_ok ? 'TODAS LAS VALIDACIONES PASS' : 'FALLO EN VALIDACIONES', log: JSON.stringify(V.checks) };
});

// ═══ 5. IDEMPOTENCIA — segunda pasada ═══════════════════════════════════════
const r2 = await paso('idempotencia_segunda_pasada', rectificar);
EVID.idempotencia = { segunda_pasada: r2,
  ok: r2.items === 0 && r2.receipt === 0 && r2.movs_compra === 0 && r2.movs_salida === 0 && r2.asientos === 0 && r2.wac === 0 };

// ═══ 6. REVERSIÓN CONTROLADA (rollback) ══════════════════════════════════════
await paso('rollback_controlado', async () => {
  if (!BACKUP) throw new Error('sin backup');
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL app.allow_receipt_item_edit = 'on'");
    for (const it of BACKUP.items) {
      await db.query('UPDATE receipt_items SET unit_cost=$2, moneda_recepcion=$3, tasa_cambio_recepcion=$4 WHERE id=$1',
        [it.id, it.unit_cost, it.moneda, it.tasa]);
    }
    await db.query('UPDATE receipts SET total_cost=$2 WHERE id=$1', [RCP, BACKUP.receipt.total_cost]);
    for (const m of BACKUP.movs) {
      await db.query('UPDATE stock_movements SET unit_cost=$2, cost_value_change=$3 WHERE id=$1', [m.id, m.unit_cost, m.cost_value_change]);
    }
    await db.query('DELETE FROM fin_movements WHERE entry_id IN ($1,$2)', [E_RECT, E_REVAL2]);
    await db.query('DELETE FROM fin_entries WHERE id IN ($1,$2)', [E_RECT, E_REVAL2]);
    await db.query("DELETE FROM wac_change_log WHERE store_id=$1 AND event='rectificacion'", [S]);
    await db.query("DELETE FROM audit_logs WHERE store_id=$1 AND trace_id='RECT002'", [S]);
    await db.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, posted_at, status, description)
       VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-ROLLBACK','ajuste_manual','2026-11-15',now(),'posted',
       'Testigo E2E: reversión controlada del prototipo de rectificación (demuestra reversibilidad)')`,
      [E_ROLLB, S, RCP]);
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  const restaurado = rcpt.total_cost === BACKUP.receipt.total_cost &&
    items.every((it) => { const b = BACKUP.items.find((x) => x.id === it.id); return b && Number(b.unit_cost) === Number(it.unit_cost) && b.moneda === it.moneda_recepcion && Number(b.tasa) === Number(it.tasa_cambio_recepcion); }) &&
    movs.every((m) => { const b = BACKUP.movs.find((x) => x.id === m.id); return b && Number(b.unit_cost) === Number(m.unit_cost); });
  EVID.rollback = { restaurado_byte_a_byte: restaurado, asiento_testigo: E_ROLLB };
  return { resumen: restaurado ? 'rollback restaura el estado ANTES exacto' : 'ROLLBACK DIVERGIÓ' };
});

// ═══ 7. RE-APLICAR y RE-VALIDAR ═════════════════════════════════════════════
await paso('reaplicar', async () => {
  await del(`fin_entries?id=eq.${E_ROLLB}`);
  const r3 = await rectificar();
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const prods = await get(`products?store_id=eq.${S}&select=*&order=sku`);
  const ok = rcpt.total_cost === 149 && items.every((i) => Number(i.unit_cost) === 1) && fm.length === 11 && prods.every((p) => Number(p.cost_average) === 1);
  EVID.reaplicacion = { cambios: r3, ok };
  return { resumen: ok ? 're-aplicación tras rollback OK (repetible)' : 'FALLO RE-APLICACIÓN' };
});

// ═══ 8. CLEANUP TOTAL (net delta = 0) ═══════════════════════════════════════
await paso('cleanup', async () => {
  await limpiarTodo();
  const finales = await conteosGlobales();
  const delta = {};
  let neto = 0;
  for (const t of TABLAS) { delta[t] = finales[t] - BASELINE[t]; neto += Math.abs(delta[t]); }
  EVID.cleanup.conteos_finales = finales; EVID.cleanup.delta_por_tabla = delta; EVID.cleanup.net_delta = neto;
  return { resumen: neto === 0 ? 'NET DELTA = 0 — cero residuos' : 'RESIDUOS: ' + JSON.stringify(delta) };
});

async function limpiarTodo() {
  // hard-delete gobernado (patrón repo: session_replication_role=replica desactiva
  // triggers de auditoría/FK del DELETE de stores — mismo canal que hard-cleanup)
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL session_replication_role = 'replica'");
    await db.query('DELETE FROM fin_movements WHERE store_id=$1', [S]);
    await db.query('DELETE FROM fin_entries WHERE store_id=$1', [S]);
    await db.query('DELETE FROM kardex_entries WHERE product_id IN ($1,$2)', [P111, P112]);
    await db.query('DELETE FROM stock_movements WHERE store_id=$1', [S]);
    await db.query('DELETE FROM receipt_items WHERE receipt_id=$1', [RCP]);
    await db.query('DELETE FROM receipts WHERE id=$1', [RCP]);
    await db.query('DELETE FROM inventory WHERE store_id=$1', [S]);
    await db.query('DELETE FROM wac_change_log WHERE store_id=$1', [S]);
    await db.query('DELETE FROM products WHERE id IN ($1,$2)', [P111, P112]);
    await db.query('DELETE FROM audit_logs WHERE store_id=$1', [S]);
    await db.query('DELETE FROM stores WHERE id=$1', [S]);
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    log('limpieza SQL fallo (continúa por REST):', e.message.slice(0, 120));
    await limpiarTodoRest();
  }
}
async function limpiarTodoRest() {
  await del(`fin_movements?store_id=eq.${S}`);
  await del(`fin_entries?store_id=eq.${S}`);
  await del(`kardex_entries?product_id=in.(${P111},${P112})`).catch(() => {});
  await del(`stock_movements?store_id=eq.${S}`);
  await del(`receipt_items?receipt_id=eq.${RCP}`);
  await del(`receipts?id=eq.${RCP}`);
  await del(`inventory?store_id=eq.${S}`).catch(() => {});
  await del(`wac_change_log?store_id=eq.${S}`);
  await del(`products?id=in.(${P111},${P112})`);
  await del(`audit_logs?store_id=eq.${S}`).catch(() => {});
  for (let i = 0; i < 3; i++) {
    try { await del(`stores?id=eq.${S}`); break; }
    catch { await del(`audit_logs?store_id=eq.${S}`).catch(() => {}); }
  }
}

await db.end();

// ═══ guardar evidencia ══════════════════════════════════════════════════════
EVID.resumen = {
  validaciones_antes: EVID.validaciones.antes?.ok,
  validaciones_despues: EVID.validaciones.despues?.todo_ok,
  idempotencia: EVID.idempotencia.ok,
  rollback: EVID.rollback.restaurado_byte_a_byte,
  reaplicacion: EVID.reaplicacion.ok,
  net_delta: EVID.cleanup.net_delta,
  veredicto: (EVID.validaciones.antes?.ok && EVID.validaciones.despues?.todo_ok && EVID.idempotencia.ok
    && EVID.rollback.restaurado_byte_a_byte && EVID.reaplicacion.ok && EVID.cleanup.net_delta === 0)
    ? 'PROTOTIPO E2E COMPLETO — TODAS LAS PRUEBAS PASS' : 'PROTOTIPO CON FALLOS' };
EVID.hashes = { evidencia: sha256(EVID) };
fs.writeFileSync(OUT, JSON.stringify(EVID, null, 1));
log('\n=== VEREDICTO PROTOTIPO ===');
log(JSON.stringify(EVID.resumen, null, 1));
log('Guardado en', OUT, fs.statSync(OUT).size, 'bytes');
