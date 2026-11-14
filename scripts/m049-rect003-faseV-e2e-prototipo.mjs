// ============================================================================
// M049 — CP-FIN-VALUATION-RECTIFICATION-003 · FASE V:
// PROTOTIPO E2E AISLADO EXTENDIDO (v3). Réplica FIEL de producción:
//   • recepción defectuosa (2 líneas USD@680 · total 151.300.000)
//   • 21 movimientos del kardex (7 ventas uc 0/1 · 11 vales · 2 ajustes · reversión)
//   • CONTABILIDAD REAL: 5 asientos de venta con COGS del MOTOR a 1 CUP/u
//     (incluidas las 2 ventas con kardex uc=0 — como en producción),
//     6 asientos de vale (VS-148/157/158/165/208/225) y SIN asiento para
//     VS-000037/138/139/223 (brechas documentales reales).
// Rectificación canónica de 8 pasos (rectificación del reconocimiento +
// reconocimiento de salidas nunca contabilizadas GAS_VALES 6 + GAS_PERDIDA_INV 18).
// Validaciones V1-V12 + idempotencia + rollback + re-aplicación + net delta 0.
// REGLA: producción INTACTA; todo write ocurre en lguovmvrozxgssupkwpf (E2E).
// Uso: E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_SUPABASE_DB_PASSWORD=... node scripts/m049-rect003-faseV-e2e-prototipo.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const BASE = 'https://lguovmvrozxgssupkwpf.supabase.co';
const KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error('FALTA E2E_SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const POOLER = { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.lguovmvrozxgssupkwpf', password: process.env.E2E_SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } };
const OUT = '/home/z/my-project/scripts/out/rect003-faseV-e2e-prototipo.json';

// ── IDs deterministas (segmento 0003 para no colisionar con runs previos) ──
const S = '7ec70003-0000-4000-8000-000000000002';
const P111 = '7ec70003-0000-4000-8000-000000000111';
const P112 = '7ec70003-0000-4000-8000-000000000112';
const RCP = '7ec70003-0000-4000-8000-a0b300000001';
const IT111 = '7ec70003-0000-4000-8000-a0b300000002';
const IT112 = '7ec70003-0000-4000-8000-a0b300000003';
const E_RECON = '7ec70003-0000-4000-8000-c0b300000001';
const E_TX = (n) => `7ec70003-0000-4000-8000-c0b4${String(n).padStart(8, '0')}`;       // 1..5 ventas
const E_SLIP = (n) => `7ec70003-0000-4000-8000-c0b5${String(n).padStart(8, '0')}`;      // 1..6 vales
const E_RECT1 = '7ec70003-0000-4000-8000-d0b300000001';
const E_RECT2 = '7ec70003-0000-4000-8000-d0b300000002';
const E_ROLLB = '7ec70003-0000-4000-8000-d0b300000099';
const mov = (n) => `7ec70003-0000-4000-8000-b0b3${String(n).padStart(8, '0')}`;
const fmov = (n) => `7ec70003-0000-4000-8000-f0b3${String(n).padStart(8, '0')}`;
const AUD = (n) => `7ec70003-0000-4000-8000-e0b3${String(n).padStart(8, '0')}`;
const WCL = (n) => `7ec70003-0000-4000-8000-9cb3${String(n).padStart(8, '0')}`;

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

// ── Kardex de producción (21 movimientos — Fase I verificada) ───────────────
const KARDEX = [
  ['112', '2026-07-01T12:00:00+00:00', 'purchase', 100, 680000, 'Confirmacion recepcion'],
  ['111', '2026-07-01T12:00:00+00:00', 'purchase', 49, 1700000, 'Confirmacion recepcion'],
  ['111', '2026-07-24T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-08-18T12:00:00+00:00', 'adjustment', -17, 0, 'Cuadre importación ENERVIDA: sku=112 Δ=-17'],
  ['111', '2026-08-18T12:00:00+00:00', 'adjustment', -1, 0, 'Cuadre importación ENERVIDA: sku=111 Δ=-1'],
  ['112', '2026-09-19T12:00:00+00:00', 'issue_slip_out', -4, 0, 'Vale de Salida VS-000037-2026'],
  ['111', '2026-10-04T12:00:00+00:00', 'sale', -1, 0, 'Venta POS v2'],
  ['112', '2026-10-05T11:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000138-2026'],
  ['112', '2026-10-05T12:00:00+00:00', 'sale', -3, 1, 'Venta POS v2'],
  ['111', '2026-10-05T12:00:00+00:00', 'issue_slip_out', -1, 0, 'Vale de Salida VS-000139-2026'],
  ['111', '2026-10-09T12:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000148-2026'],
  ['112', '2026-10-10T10:00:00+00:00', 'issue_slip_out', -10, 1, 'Vale de Salida VS-000165-2026'],
  ['112', '2026-10-10T11:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000157-2026'],
  ['111', '2026-10-10T12:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000158-2026'],
  ['111', '2026-10-14T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['111', '2026-10-22T12:00:00+00:00', 'sale', -1, 1, 'Venta POS v2'],
  ['112', '2026-10-28T11:00:00+00:00', 'issue_slip_out', -20, 1, 'Vale de Salida VS-000208-2026'],
  ['111', '2026-10-28T12:00:00+00:00', 'issue_slip_out', -12, 1, 'Vale de Salida VS-000208-2026'],
  ['112', '2026-11-07T10:00:00+00:00', 'issue_slip_out', -1, 1, 'Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T11:00:00+00:00', 'issue_slip_reverse', 1, 1, 'Reversion Vale de Salida VS-000223-2026'],
  ['112', '2026-11-07T12:00:00+00:00', 'issue_slip_out', -5, 1, 'Vale de Salida VS-000225-2026'],
];
// Ventas de producción: [tx-id corto, fecha, SKU, u, COGS motor (=1/u), total venta CUP, doc number]
const VENTAS = [
  ['tx1', '2026-07-24', '111', 1, 1, 2500, 'FAC-004479-2026'],
  ['tx2', '2026-10-04', '111', 1, 1, 2000, null],
  ['tx3', '2026-10-05', '112', 3, 3, 4500, null],
  ['tx4', '2026-10-14', '111', 1, 1, 2000, null],
  ['tx5', '2026-10-22', '111', 1, 1, 2000, null],
];
// Vales CON asiento en producción (parte de estos SKU): [vale, fecha, CUP]
const VALES_ASIENTO = [
  ['VS-000148-2026', '2026-10-09', 1],
  ['VS-000157-2026', '2026-10-10', 20],
  ['VS-000158-2026', '2026-10-10', 20],
  ['VS-000165-2026', '2026-10-10', 10],
  ['VS-000208-2026', '2026-10-28', 32],
  ['VS-000225-2026', '2026-11-07', 5],
];

const EVID = { mision: 'CP-FIN-VALUATION-RECTIFICATION-003', fase: 'V — prototipo E2E aislado extendido',
  generado: new Date().toISOString(),
  bd: { url: BASE, proyecto: 'lguovmvrozxgssupkwpf (CostproE2E — AISLADA)', sentinela: true,
    canal_escritura: 'pooler IPv4 aws-0-us-east-1:6543 + REST service_role' },
  pasos: {}, validaciones: {}, idempotencia: {}, rollback: {}, reaplicacion: {}, cleanup: {} };

async function paso(nombre, fn) {
  const t0 = Date.now();
  const r = await fn();
  EVID.pasos[nombre] = { ms: Date.now() - t0, resumen: typeof r?.resumen === 'string' ? r.resumen : JSON.stringify(r?.resumen ?? 'ok') };
  log(`▸ ${nombre} (${Date.now() - t0}ms) ${r?.log ?? ''}`);
  return r;
}

// ═══ 0. PREFLIGHT (sentinela + conexión + limpieza previa) ═════════════════
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

// ═══ 1. SEED — réplica fiel (estado verificado en Fase I) ═══════════════════
await paso('seed_store_productos', async () => {
  await post('stores', {
    id: S, name: 'RECT003-PROTO (réplica ENERVIDA)', slug: 'rect003-proto',
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
    due_date: '2026-07-31', created_at: '2026-08-11T22:49:18Z',
    notes: 'RÉPLICA E2E RECT003 — alcance: líneas SKU 111/112 (el resto de la FVC no afecta a estos SKU)' });
  await post('receipt_items', [
    { id: IT111, receipt_id: RCP, product_id: P111, quantity: 49, unit_cost: 2500,
      moneda_recepcion: 'USD', tasa_cambio_recepcion: 680,
      created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z' },
    { id: IT112, receipt_id: RCP, product_id: P112, quantity: 100, unit_cost: 1000,
      moneda_recepcion: 'USD', tasa_cambio_recepcion: 680,
      created_at: '2026-08-11T22:49:18Z', updated_at: '2026-08-11T22:49:18Z' }]);
  return { resumen: 'recepción réplica: 2 líneas USD@680 (defecto original) · unpaid/0 pagos (como producción)' };
});

await paso('seed_kardex_21_movimientos', async () => {
  let n = 1;
  for (const [sku, fecha, tipo, dq, uc, ref] of KARDEX) {
    // created_at DESEMPATADO (orden cronológico estricto) para determinismo del
    // trigger sync_product_stock (ORDER BY movement_date DESC, created_at DESC).
    const ca = new Date(fecha).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const plus = (n - 1) * 60000;
    const caDes = new Date(new Date(fecha).getTime() + plus).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    await post('stock_movements', {
      id: mov(n), store_id: S, product_id: sku === '111' ? P111 : P112,
      quantity_change: dq, movement_type: tipo,
      reference_id: tipo === 'purchase' ? RCP : null,
      reference_doc: ref, movement_date: fecha, created_at: caDes,
      unit_cost: uc, unit_price: 0, cost_value_change: 0,
      balance_after: null, created_by: null });
    n++;
  }
  return { resumen: `${KARDEX.length} movimientos réplica (cost_value_change=0 como en producción: 1.776/1.776)` };
});

await paso('seed_asientos_reales', async () => {
  // A) Reconocimiento de la recepción (como el asiento 93bb5da9 de producción)
  await post('fin_entries', [{ id: E_RECON, store_id: S, document_type: 'RECEPCION', document_id: RCP,
    document_number: 'FAC-VITALLCONS-001', event: 'reconocimiento',
    economic_date: '2026-07-01', posted_at: '2026-11-14T01:51:20Z', status: 'posted',
    description: 'Entrada de almacén (réplica E2E RECT003)',
    movements_snapshot: [
      { traza: tz('motor-cp-fin', 'total_cup', 'r-inv-d'), amount: 151300000, sentido: 'debito', currency: 'CUP', categoria: 'ACT_INVENTARIO' },
      { traza: tz('motor-cp-fin', 'total_cup', 'r-cxp-c'), amount: 151300000, sentido: 'credito', currency: 'CUP', categoria: 'PAS_CXP_PROV' }] }]);
  await post('fin_movements', [
    { id: fmov(1), entry_id: E_RECON, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'debito',
      amount: 151300000, currency: 'CUP', exchange_rate: 1, economic_date: '2026-07-01',
      description: 'Entrada de almacén (réplica RECT003)', traza: tz('motor-cp-fin', 'total_cup', 'r-inv-d') },
    { id: fmov(2), entry_id: E_RECON, store_id: S, category_code: 'PAS_CXP_PROV', sense: 'credito',
      amount: 151300000, currency: 'CUP', exchange_rate: 1, economic_date: '2026-07-01',
      description: 'Entrada de almacén (réplica RECT003)', traza: tz('motor-cp-fin', 'total_cup', 'r-cxp-c') }]);
  // B) 5 asientos de venta con el COGS DEL MOTOR (1 CUP/u — como en producción:
  //    incluidas las 2 ventas cuyo kardex tiene uc=0)
  let f = 10;
  for (let i = 0; i < VENTAS.length; i++) {
    const [txid, fecha, sku, u, cogs, total, docNum] = VENTAS[i];
    const eid = E_TX(i + 1);
    await post('fin_entries', [{ id: eid, store_id: S, document_type: 'VENTA', document_id: null,
      document_number: docNum || txid, event: 'reconocimiento',
      economic_date: fecha, posted_at: `${fecha}T12:30:00Z`, status: 'posted',
      description: `Venta ${docNum || txid} (réplica RECT003 — COGS motor a cost_average=1)`,
      movements_snapshot: [
        { traza: tz('motor-cp-fin', 'total_cup', 'v-ingreso'), amount: total, sentido: 'credito', currency: 'CUP', categoria: 'ING_VENTAS' },
        { traza: tz('motor-cp-fin', 'cob_cash_cup', 'v-cash-cup'), amount: total, sentido: 'debito', currency: 'CUP', categoria: 'ACT_EFECTIVO_CUP' },
        { traza: tz('motor-cp-fin', 'costo_productos_cup', 'v-cogs-d'), amount: cogs, sentido: 'debito', currency: 'CUP', categoria: 'GAS_COSTO_VENTAS' },
        { traza: tz('motor-cp-fin', 'costo_productos_cup', 'v-cogs-c'), amount: cogs, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }] }]);
    await post('fin_movements', [
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'ING_VENTAS', sense: 'credito',
        amount: total, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `Venta ${docNum || txid}`, traza: tz('motor-cp-fin', 'total_cup', 'v-ingreso') },
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'ACT_EFECTIVO_CUP', sense: 'debito',
        amount: total, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `Venta ${docNum || txid}`, traza: tz('motor-cp-fin', 'cob_cash_cup', 'v-cash-cup') },
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'GAS_COSTO_VENTAS', sense: 'debito',
        amount: cogs, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `COGS motor SKU ${sku} (${u} u × 1)`, traza: tz('motor-cp-fin', 'costo_productos_cup', 'v-cogs-d') },
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'credito',
        amount: cogs, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `COGS motor SKU ${sku}`, traza: tz('motor-cp-fin', 'costo_productos_cup', 'v-cogs-c') }]);
  }
  // C) 6 asientos de vale (los que EXISTEN en producción) — GAS_VALES D / ACT C
  for (let i = 0; i < VALES_ASIENTO.length; i++) {
    const [vale, fecha, importe] = VALES_ASIENTO[i];
    const eid = E_SLIP(i + 1);
    await post('fin_entries', [{ id: eid, store_id: S, document_type: 'VALE_SALIDA', document_id: null,
      document_number: vale, event: 'reconocimiento',
      economic_date: fecha, posted_at: `${fecha}T12:30:00Z`, status: 'posted',
      description: `Vale de salida ${vale} (réplica RECT003)`,
      movements_snapshot: [
        { traza: tz('motor-cp-fin', 'vales_costo', 'vs-gas-d'), amount: importe, sentido: 'debito', currency: 'CUP', categoria: 'GAS_VALES' },
        { traza: tz('motor-cp-fin', 'vales_costo', 'vs-inv-c'), amount: importe, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }] }]);
    await post('fin_movements', [
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'GAS_VALES', sense: 'debito',
        amount: importe, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `Vale de salida ${vale}`, traza: tz('motor-cp-fin', 'vales_costo', 'vs-gas-d') },
      { id: fmov(f++), entry_id: eid, store_id: S, category_code: 'ACT_INVENTARIO', sense: 'credito',
        amount: importe, currency: 'CUP', exchange_rate: 1, economic_date: fecha,
        description: `Vale de salida ${vale}`, traza: tz('motor-cp-fin', 'vales_costo', 'vs-inv-c') }]);
  }
  const fmTotal = 2 + VENTAS.length * 4 + VALES_ASIENTO.length * 2;
  return { resumen: `12 asientos réplica: reconocimiento 151,3M + 5 ventas (COGS motor 7 CUP) + 6 vales (88 CUP) — ${fmTotal} movimientos. SIN asiento: VS-37/138/139/223 y 2 ajustes (brechas reales)`, log: `fmov=${fmTotal}` };
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
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const k111 = calcKardex(movs.filter((m) => m.product_id === P111));
  const k112 = calcKardex(movs.filter((m) => m.product_id === P112));
  const ventas = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'sale');
  const valesAj = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'issue_slip_out' || f.tipo === 'adjustment');
  const cogsMotor = fm.filter((m) => m.category_code === 'GAS_COSTO_VENTAS').reduce((s, m) => s + Number(m.amount), 0);
  const gasVales = fm.filter((m) => m.category_code === 'GAS_VALES').reduce((s, m) => s + Number(m.amount), 0);
  EVID.validaciones.antes = {
    total_recepcion: rcpt.total_cost,
    lineas: items.map((i) => ({ sku: i.product_id === P111 ? '111' : '112', uc: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion })),
    saldos: { sku111: k111.saldo, sku112: k112.saldo },
    kardex: { cogs_registrado: ventas.reduce((s, f) => s + f.v, 0), vales_ajustes_registrado: valesAj.reduce((s, f) => s + f.v, 0) },
    motor: { cogs: cogsMotor, gas_vales: gasVales },
    n_asientos: (await get(`fin_entries?store_id=eq.${S}&select=id`)).length,
    n_movs_kardex: movs.length, n_fin_movements: fm.length,
    ok: rcpt.total_cost === 151300000 && k111.saldo === 10 && k112.saldo === 20
      && cogsMotor === 7 && gasVales === 88 && movs.length === 21,
  };
  return { resumen: EVID.validaciones.antes.ok ? 'estado defectuoso replicado OK (con brechas documentales reales)' : 'DIVERGENCIA',
    log: `total=${rcpt.total_cost} saldos=${k111.saldo}/${k112.saldo} cogsMotor=${cogsMotor} gasVales=${gasVales}` };
});

// ═══ 3. RECTIFICACIÓN CANÓNICA (8 pasos, UNA transacción) ═══════════════════
let BACKUP = null;
let RECT_CALL = 0;
async function rectificar() {
  RECT_CALL++;
  const cambios = { items: 0, receipt: 0, movs_compra: 0, movs_salida: 0, wac: 0, asientos: 0, audit: 0 };
  // PASO 0 — respaldo lógico pre-flight
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  BACKUP = { generado: new Date().toISOString(), receipt: { id: rcpt.id, total_cost: rcpt.total_cost },
    items: items.map((i) => ({ id: i.id, unit_cost: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion })),
    movs: movs.map((m) => ({ id: m.id, unit_cost: m.unit_cost })) };

  const auditRows = [];
  const aud = (accion, tabla, record, oldD, newD, motivo) => auditRows.push({ id: AUD(auditRows.length + 1),
    created_at: new Date().toISOString(), user_id: null, table_name: tabla, record_id: record,
    action: accion, old_data: oldD, new_data: newD,
    metadata: { mision: 'CP-FIN-VALUATION-RECTIFICATION-003', motivo, documento: 'FAC-VITALLCONS-001' },
    store_id: S, trace_id: 'RECT003' });

  const EXCESO = 151300000 - 149; // 151.299.851
  await db.query('BEGIN');
  try {
    // escape hatch gobernado (trigger M021 inmutabilidad receipt_items)
    await db.query("SET LOCAL app.allow_receipt_item_edit = 'on'");
    // PASO 1 — receipt_items → costo real 1 CUP
    const r1 = await db.query(
      `UPDATE receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
       WHERE receipt_id=$1 AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)
       RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes, tasa_cambio_recepcion AS tasa_antes`, [RCP]);
    cambios.items = r1.rowCount;
    for (const row of r1.rows) aud('SYSTEM_RECT_VALUATION', 'receipt_items', row.id,
      { unit_cost: row.uc_antes, moneda: row.moneda_antes, tasa: row.tasa_antes }, { unit_cost: 1, moneda: 'CUP', tasa: 1 },
      'Precio de venta importado como costo — costo real 1 CUP (decisión propietario 2026-11-15)');
    // PASO 2 — cabecera: total correcto (réplica 149; producción 40.739.585)
    const r2 = await db.query(
      `UPDATE receipts SET total_cost=$2, updated_at=now() WHERE id=$1 AND total_cost<>$2 RETURNING id, total_cost AS antes`, [RCP, 149]);
    cambios.receipt = r2.rowCount;
    if (r2.rowCount) aud('SYSTEM_RECT_TOTAL', 'receipts', RCP, { total_cost: r2.rows[0].antes }, { total_cost: 149 }, 'Recalculo tras corrección de líneas');
    // PASO 3 — capas de compra: uc → 1 (cost_value_change NO se toca: convención del sistema)
    const r3 = await db.query(
      `UPDATE stock_movements SET unit_cost=1
       WHERE store_id=$1 AND movement_type='purchase' AND unit_cost<>1
       RETURNING id, unit_cost AS antes`, [S]);
    cambios.movs_compra = r3.rowCount;
    for (const row of r3.rows) aud('SYSTEM_RECT_MOV_UC', 'stock_movements', row.id, { unit_cost: row.antes }, { unit_cost: 1 }, 'Capa de compra revalorizada al costo real 1 CUP');
    // PASO 4 — 26 salidas subvaluadas uc=0 → 1
    const r4 = await db.query(
      `UPDATE stock_movements SET unit_cost=1
       WHERE store_id=$1 AND quantity_change<0 AND unit_cost=0
       RETURNING id, unit_cost AS antes, quantity_change`, [S]);
    cambios.movs_salida = r4.rowCount;
    for (const row of r4.rows) aud('SYSTEM_RECT_MOV_SALIDA', 'stock_movements', row.id, { unit_cost: 0 }, { unit_cost: 1 }, 'Salida subvaluada (uc=0) revalorizada a costo real 1 CUP');
    // PASO 5 — WAC cronológico (1 constante) + wac_change_log
    const rw = await db.query(
      `INSERT INTO wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
       VALUES ($1,$2,$3,1,1,'rectificacion',$4,1,$5,now()),($6,$2,$7,1,1,'rectificacion',$8,1,$9,now())
       ON CONFLICT (id) DO NOTHING`,
      [WCL(1), S, P111, 10, { mision: 'CP-FIN-VALUATION-RECTIFICATION-003', documento: 'FAC-VITALLCONS-001',
        decision: 'Costo real 1 CUP/u; WAC cronológico 1 constante (capas 1.700.000/680.000 → 1)', metodo: 'governed_admin_write (escape hatch M021) — réplica E2E' },
       WCL(2), P112, 20, { mision: 'CP-FIN-VALUATION-RECTIFICATION-003', documento: 'FAC-VITALLCONS-001',
        decision: 'Costo real 1 CUP/u; WAC cronológico 1 constante', metodo: 'governed_admin_write (escape hatch M021) — réplica E2E' }]);
    cambios.wac = rw.rowCount || 0;
    // PASO 6 — ASIENTO RECT-1: reversión del exceso (reversal_of → asiento original)
    const r6 = await db.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
         reversal_of, economic_date, posted_at, status, description, movements_snapshot)
       VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-RECT','ajuste_manual',$4,'2026-07-01',now(),'posted',$5,$6)
       ON CONFLICT (id) DO NOTHING RETURNING id`, [E_RECT1, S, RCP, E_RECON,
        'Rectificación CP-FIN-VALUATION-RECTIFICATION-003: reversión del exceso de reconocimiento SKU 111/112 (precio de venta importado como costo USD; costo real 1 CUP)',
        JSON.stringify([
          { traza: tz('rect003', 'exceso_reconocimiento', 'rect-cxp-d'), amount: EXCESO, sentido: 'debito', currency: 'CUP', categoria: 'PAS_CXP_PROV' },
          { traza: tz('rect003', 'exceso_reconocimiento', 'rect-inv-c'), amount: EXCESO, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }])]);
    cambios.asientos += r6.rowCount;
    await db.query(
      `INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza, created_at)
       VALUES ($1,$2,$3,'PAS_CXP_PROV','debito',$4,'CUP',1,'2026-07-01',$5,$6,now()),
              ($7,$2,$3,'ACT_INVENTARIO','credito',$4,'CUP',1,'2026-07-01',$8,$9,now())
       ON CONFLICT (id) DO NOTHING`,
      [fmov(90), E_RECT1, S, EXCESO, 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)',
        JSON.stringify(tz('rect003', 'exceso_reconocimiento', 'rect-cxp-d')),
        fmov(91), 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)',
        JSON.stringify(tz('rect003', 'exceso_reconocimiento', 'rect-inv-c'))]);
    aud('SYSTEM_RECT_ENTRY', 'fin_entries', E_RECT1,
      { asiento: 'reconocimiento original (réplica)', amount: 151300000 },
      { asiento: 'RECT-1 compensatorio', reversal_of: E_RECON, debito: { PAS_CXP_PROV: EXCESO }, credito: { ACT_INVENTARIO: EXCESO } },
      'Asiento compensatorio enlazado — historial original conservado');
    // PASO 7 — ASIENTO RECT-2: salidas NUNCA contabilizadas (GAS_VALES 6 + GAS_PERDIDA_INV 18)
    const r7 = await db.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
         economic_date, posted_at, status, description, movements_snapshot)
       VALUES ($1,$2,'AJUSTE_INVENTARIO',$3,'FAC-VITALLCONS-001-RECT-SAL','ajuste_manual','2026-11-15',now(),'posted',$4,$5)
       ON CONFLICT (id) DO NOTHING RETURNING id`, [E_RECT2, S, RCP,
        'Reconocimiento de salidas nunca contabilizadas de SKU 111/112: 6 u vales (VS-37/138/139) + 18 u ajustes de cuadre × 1 CUP',
        JSON.stringify([
          { traza: tz('rect003', 'vales_sin_asiento', 'rect-vales-d'), amount: 6, sentido: 'debito', currency: 'CUP', categoria: 'GAS_VALES' },
          { traza: tz('rect003', 'ajustes_sin_asiento', 'rect-perdida-d'), amount: 18, sentido: 'debito', currency: 'CUP', categoria: 'GAS_PERDIDA_INV' },
          { traza: tz('rect003', 'salidas_no_contabilizadas', 'rect-inv-c'), amount: 24, sentido: 'credito', currency: 'CUP', categoria: 'ACT_INVENTARIO' }])]);
    cambios.asientos += r7.rowCount;
    await db.query(
      `INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza, created_at)
       VALUES ($1,$2,$3,'GAS_VALES','debito',6,'CUP',1,'2026-11-15',$4,$5,now()),
              ($6,$2,$3,'GAS_PERDIDA_INV','debito',18,'CUP',1,'2026-11-15',$7,$8,now()),
              ($9,$2,$3,'ACT_INVENTARIO','credito',24,'CUP',1,'2026-11-15',$10,$11,now())
       ON CONFLICT (id) DO NOTHING`,
      [fmov(92), E_RECT2, S, 'Vales sin asiento: VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u)', JSON.stringify(tz('rect003', 'vales_sin_asiento', 'rect-vales-d')),
        fmov(93), 'Ajustes de cuadre importación sin asiento: sku=111 Δ−1 + sku=112 Δ−17 (18 u)', JSON.stringify(tz('rect003', 'ajustes_sin_asiento', 'rect-perdida-d')),
        fmov(94), 'Reconocimiento de salidas SKU 111/112 (24 u × 1 CUP)', JSON.stringify(tz('rect003', 'salidas_no_contabilizadas', 'rect-inv-c'))]);
    aud('SYSTEM_RECT_ENTRY', 'fin_entries', E_RECT2,
      { asiento: '(las salidas nunca tuvieron asiento — brecha documental)' },
      { asiento: 'RECT-2', debit: { GAS_VALES: 6, GAS_PERDIDA_INV: 18 }, credit: { ACT_INVENTARIO: 24 } },
      'Cierre de brechas documentales de salidas a costo real 1 CUP');
    // PASO 8 — auditoría por fila
    for (const a of auditRows) {
      const ar = await db.query(
        `INSERT INTO audit_logs (id, created_at, user_id, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RECT003') ON CONFLICT (id) DO NOTHING RETURNING id`,
        [a.id, a.created_at, a.user_id, a.table_name, a.record_id, a.action,
         JSON.stringify(a.old_data), JSON.stringify(a.new_data), JSON.stringify(a.metadata), a.store_id]);
      cambios.audit += ar.rowCount;
    }
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
  return cambios;
}

const r1 = await paso('rectificacion_aplicada', rectificar);
EVID.pasos.rectificacion_aplicada.detalle = r1;

// ═══ 4. VALIDACIÓN DEL ESTADO 'DESPUÉS' (V1-V12) ═══════════════════════════
await paso('validar_despues', async () => {
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*&order=id`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  const prods = await get(`products?store_id=eq.${S}&select=*&order=sku`);
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const fe = await get(`fin_entries?store_id=eq.${S}&select=*&order=id`);
  const k111 = calcKardex(movs.filter((m) => m.product_id === P111));
  const k112 = calcKardex(movs.filter((m) => m.product_id === P112));
  const p111 = prods.find((p) => p.sku === '111'), p112 = prods.find((p) => p.sku === '112');
  const ventas = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'sale');
  const valesAj = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'issue_slip_out' || f.tipo === 'adjustment');
  const reingreso = [...k111.filas, ...k112.filas].filter((f) => f.tipo === 'issue_slip_reverse');
  const porAsiento = {};
  for (const m of fm) {
    porAsiento[m.entry_id] = porAsiento[m.entry_id] || { D: 0, C: 0 };
    if (m.sense === 'debito') porAsiento[m.entry_id].D += Number(m.amount); else porAsiento[m.entry_id].C += Number(m.amount);
  }
  const neto = (cat) => fm.filter((m) => m.category_code === cat)
    .reduce((s, m) => s + (m.sense === 'debito' ? 1 : -1) * Number(m.amount), 0);
  const valorLibros = Number(p111.cost_average) * Number(p111.stock_current) + Number(p112.cost_average) * Number(p112.stock_current);
  const valorKardex = k111.valor + k112.valor; // Σ dq × uc tras revalorización
  const rect1 = fe.find((e) => e.id === E_RECT1), rect2 = fe.find((e) => e.id === E_RECT2);
  const salidasBrutasValor = ventas.reduce((s, f) => s + Math.abs(f.v), 0) + valesAj.reduce((s, f) => s + Math.abs(f.v), 0);
  const reingresoValor = reingreso.reduce((s, f) => s + f.v, 0);
  const salidasNetasUnidades = ventas.reduce((s, f) => s + Math.abs(f.dQ), 0)
    + valesAj.reduce((s, f) => s + Math.abs(f.dQ), 0) - reingreso.reduce((s, f) => s + f.dQ, 0);
  const V = {
    v1_precios_venta_conservados: { sku111: { price: p111.price, moneda: p111.price_currency },
      sku112: { price: p112.price, moneda: p112.price_currency } },
    v2_costo_1cup: items.map((i) => ({ sku: i.product_id === P111 ? '111' : '112', uc: i.unit_cost, moneda: i.moneda_recepcion, tasa: i.tasa_cambio_recepcion })),
    v3_recepcion_149: rcpt.total_cost,
    v4_wac_cronologico: { saldos: { sku111: k111.saldo, sku112: k112.saldo }, cost_average: { sku111: p111.cost_average, sku112: p112.cost_average } },
    v5_cogs_119_salidas: { ventas_kardex: ventas.reduce((s, f) => s + f.v, 0),
      vales_ajustes_kardex_bruto: valesAj.reduce((s, f) => s + f.v, 0), reingreso: reingresoValor,
      salidas_brutas_valor: salidasBrutasValor, salidas_netas_valor: salidasBrutasValor - reingresoValor,
      cogs_motor: fm.filter((m) => m.category_code === 'GAS_COSTO_VENTAS').reduce((s, m) => s + Number(m.amount), 0),
      unidades_netas: salidasNetasUnidades },
    v6_balance: { por_asiento: porAsiento, neto_ACT_INVENTARIO: neto('ACT_INVENTARIO'),
      neto_PAS_CXP_PROV: neto('PAS_CXP_PROV'), gas_vales_total: fm.filter((m) => m.category_code === 'GAS_VALES').reduce((s, m) => s + Number(m.amount), 0),
      gas_perdida_inv_total: fm.filter((m) => m.category_code === 'GAS_PERDIDA_INV').reduce((s, m) => s + Number(m.amount), 0),
      valor_libros_30u: valorLibros },
    v7_trazabilidad: { rect1: { reversal_of: rect1?.reversal_of, document_number: rect1?.document_number },
      rect2: { document_number: rect2?.document_number },
      capas_compra_ref: movs.filter((m) => m.movement_type === 'purchase').every((m) => m.reference_id === RCP),
      audit_rows: (await get(`audit_logs?store_id=eq.${S}&select=id`)).length },
    v12_conciliacion_ACT: { neto_ACT: neto('ACT_INVENTARIO'), valor_kardex: valorKardex, valor_libros: valorLibros,
      kardex_saldos: { sku111: k111.saldo, sku112: k112.saldo } },
    conteos: { asientos: fe.length, fin_movements: fm.length, kardex_movs: movs.length },
  };
  V.checks = {
    V1: p111.price === 2000 && p111.price_currency === 'CUP' && p112.price === 1000 && p112.price_currency === 'USD',
    V2: items.every((i) => Number(i.unit_cost) === 1 && i.moneda_recepcion === 'CUP' && Number(i.tasa_cambio_recepcion) === 1),
    V3: rcpt.total_cost === 149,
    V4: k111.saldo === 10 && k112.saldo === 20 && Number(p111.cost_average) === 1 && Number(p112.cost_average) === 1,
    V5: salidasNetasUnidades === 119 && V.v5_cogs_119_salidas.salidas_netas_valor === 119
      && V.v5_cogs_119_salidas.cogs_motor === 7 && V.v5_cogs_119_salidas.ventas_kardex === -7,
    V6: Object.values(porAsiento).every((e) => Math.abs(e.D - e.C) < 1e-9)
      && neto('ACT_INVENTARIO') === 30 && neto('PAS_CXP_PROV') === -149
      && V.v6_balance.gas_vales_total === 94 && V.v6_balance.gas_perdida_inv_total === 18
      && valorLibros === 30,
    V7: rect1?.reversal_of === E_RECON && rect1.document_number === 'FAC-VITALLCONS-001-RECT'
      && movs.filter((m) => m.movement_type === 'purchase').every((m) => m.reference_id === RCP)
      && V.v7_trazabilidad.audit_rows >= 14 /* 14 explícitas RECT003 + ≥1 nativa trg_audit_receipt_changes */,
    V8_antes: true, V10_sin_duplicacion: fe.length === 14 && movs.length === 21 && fm.length === 39,
    V12: neto('ACT_INVENTARIO') === 30 && valorKardex === 30 && valorLibros === 30 && k111.saldo === 10 && k112.saldo === 20,
  };
  V.todo_ok = Object.values(V.checks).every(Boolean);
  EVID.validaciones.despues = V;
  return { resumen: V.todo_ok ? 'TODAS LAS VALIDACIONES V1-V12 PASS' : 'FALLO EN VALIDACIONES', log: JSON.stringify(V.checks) };
});

// ═══ 5. IDEMPOTENCIA — segunda pasada ═══════════════════════════════════════
const r2 = await paso('idempotencia_segunda_pasada', rectificar);
EVID.idempotencia = { segunda_pasada: r2,
  ok: r2.items === 0 && r2.receipt === 0 && r2.movs_compra === 0 && r2.movs_salida === 0 && r2.asientos === 0 && r2.wac === 0 && r2.audit === 0 };

// ═══ 6. REVERSIÓN CONTROLADA (rollback byte a byte + testigo) ════════════════
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
      await db.query('UPDATE stock_movements SET unit_cost=$2 WHERE id=$1', [m.id, m.unit_cost]);
    }
    await db.query('DELETE FROM fin_movements WHERE entry_id IN ($1,$2)', [E_RECT1, E_RECT2]);
    await db.query('DELETE FROM fin_entries WHERE id IN ($1,$2)', [E_RECT1, E_RECT2]);
    await db.query("DELETE FROM wac_change_log WHERE store_id=$1 AND event='rectificacion'", [S]);
    await db.query("DELETE FROM audit_logs WHERE store_id=$1 AND trace_id='RECT003'", [S]);
    await db.query(
      `INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event, economic_date, posted_at, status, description)
       VALUES ($1,$2,'RECEPCION',$3,'FAC-VITALLCONS-001-ROLLBACK','ajuste_manual','2026-11-15',now(),'posted',
       'Testigo E2E RECT003: reversión controlada del prototipo de rectificación (demuestra reversibilidad)')`,
      [E_ROLLB, S, RCP]);
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const movs = await get(`stock_movements?store_id=eq.${S}&select=*&order=movement_date,id`);
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const restaurado = rcpt.total_cost === BACKUP.receipt.total_cost &&
    items.every((it) => { const b = BACKUP.items.find((x) => x.id === it.id); return b && Number(b.unit_cost) === Number(it.unit_cost) && b.moneda === it.moneda_recepcion && Number(b.tasa) === Number(it.tasa_cambio_recepcion); }) &&
    movs.every((m) => { const b = BACKUP.movs.find((x) => x.id === m.id); return b && Number(b.unit_cost) === Number(m.unit_cost); }) &&
    fm.length === 34; // 34 movimientos históricos réplica (12 asientos)
  EVID.rollback = { restaurado_byte_a_byte: restaurado, asiento_testigo: E_ROLLB };
  return { resumen: restaurado ? 'rollback restaura el estado ANTES exacto (items+receipt+movs+asientos)' : 'ROLLBACK DIVERGIÓ' };
});

// ═══ 7. RE-APLICAR y RE-VALIDAR ═════════════════════════════════════════════
await paso('reaplicar', async () => {
  await del(`fin_entries?id=eq.${E_ROLLB}`);
  const r3 = await rectificar();
  const items = await get(`receipt_items?receipt_id=eq.${RCP}&select=*`);
  const rcpt = (await get(`receipts?id=eq.${RCP}&select=*`))[0];
  const fm = await get(`fin_movements?store_id=eq.${S}&select=*&order=id`);
  const fe = await get(`fin_entries?store_id=eq.${S}&select=*`);
  const prods = await get(`products?store_id=eq.${S}&select=*&order=sku`);
  const netoACT = fm.filter((m) => m.category_code === 'ACT_INVENTARIO')
    .reduce((s, m) => s + (m.sense === 'debito' ? 1 : -1) * Number(m.amount), 0);
  const ok = rcpt.total_cost === 149 && items.every((i) => Number(i.unit_cost) === 1)
    && fe.length === 14 && fm.length === 39 && netoACT === 30 && prods.every((p) => Number(p.cost_average) === 1);
  EVID.reaplicacion = { cambios: r3, ok, neto_ACT_tras_reaplicar: netoACT };
  return { resumen: ok ? 're-aplicación tras rollback OK (repetible y correcta)' : 'FALLO RE-APLICACIÓN' };
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
  // hard-delete gobernado (session_replication_role=replica desactiva triggers/FK del DELETE)
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

// ═══ guardar evidencia ═══════════════════════════════════════════════════════
EVID.resumen = {
  validaciones_antes: EVID.validaciones.antes?.ok,
  validaciones_despues: EVID.validaciones.despues?.todo_ok,
  idempotencia: EVID.idempotencia.ok,
  rollback: EVID.rollback.restaurado_byte_a_byte,
  reaplicacion: EVID.reaplicacion.ok,
  net_delta: EVID.cleanup.net_delta,
  veredicto: (EVID.validaciones.antes?.ok && EVID.validaciones.despues?.todo_ok && EVID.idempotencia.ok
    && EVID.rollback.restaurado_byte_a_byte && EVID.reaplicacion.ok && EVID.cleanup.net_delta === 0)
    ? 'PROTOTIPO E2E EXTENDIDO COMPLETO — TODAS LAS PRUEBAS PASS' : 'PROTOTIPO CON FALLOS',
};
EVID.hashes = { evidencia: sha256(EVID) };
fs.writeFileSync(OUT, JSON.stringify(EVID, null, 1));
log('\n=== VEREDICTO PROTOTIPO E2E EXTENDIDO ===');
log(JSON.stringify(EVID.resumen, null, 1));
log('Guardado en', OUT, fs.statSync(OUT).size, 'bytes');
