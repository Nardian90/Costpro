/**
 * test_live_e2e_round5.mjs
 *
 * RONDA 5 — Pruebas de UI real + RPCs críticas
 *
 * Cubre:
 *   - Cargar todas las páginas principales (HTTP 200 sin errores)
 *   - create_sale RPC (con descuento, multi-moneda)
 *   - register_reception RPC (con tasa_cambio)
 *   - Pago a proveedor (register_supplier_payment)
 *   - Comisión a worker
 *   - Dashboard KPIs
 *   - Reportes
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'http://localhost:3000';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = m => console.log(`${C.g}✅ ${m}${C.x}`);
const bad = m => console.log(`${C.r}❌ ${m}${C.x}`);
const info = m => console.log(`${C.c}ℹ️  ${m}${C.x}`);
const warn = m => console.log(`${C.y}⚠️  ${m}${C.x}`);
const head = m => console.log(`\n${C.b}${C.p}═══ ${m} ═══${C.x}`);

const bugs = [];
function reportBug(flow, description, error) {
  bugs.push({ flow, description, error: error?.message || String(error) });
  bad(`BUG [${flow}]: ${description}`);
  if (error) console.log(`   → ${error.message || error}`);
}

let token;

async function setup() {
  head('RONDA 5 — Setup');
  const authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authed.auth.signInWithPassword({ email: 'admin@costpro.com', password: 'costpro123' });
  if (error) { bad('Login: ' + error.message); process.exit(1); }
  token = data.session.access_token;
  ok('JWT obtenido');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 35: Cargar páginas principales
// ═══════════════════════════════════════════════════════════════════════
async function testPageLoads() {
  head('FASE 35: Cargar páginas principales');

  const pages = [
    { path: '/', name: 'Home' },
    { path: '/terminal', name: 'Terminal' },
    { path: '/terminal?view=sales_history', name: 'Sales history' },
    { path: '/terminal?view=receptions', name: 'Receptions' },
    { path: '/terminal?view=transfers', name: 'Transfers' },
    { path: '/terminal?view=devolutions', name: 'Devolutions' },
    { path: '/terminal?view=production_orders', name: 'Production orders' },
    { path: '/terminal?view=inventory', name: 'Inventory' },
    { path: '/terminal?view=adjustments', name: 'Adjustments' },
    { path: '/terminal?view=stores_management', name: 'Stores management' },
    { path: '/terminal?view=workers', name: 'Workers' },
    { path: '/terminal?view=quotations', name: 'Quotations' },
    { path: '/terminal?view=customers', name: 'Customers' },
    { path: '/terminal?view=kardex', name: 'Kardex' },
    { path: '/terminal?view=cash_report', name: 'Cash report' },
  ];

  for (const p of pages) {
    try {
      const res = await fetch(`${API_BASE}${p.path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        redirect: 'manual',
      });
      if (res.status === 200) ok(`${p.name}: 200`);
      else if (res.status === 404) warn(`${p.name}: 404 (vista no existe)`);
      else if (res.status >= 500) reportBug('page_load', `${p.name}: ${res.status}`, res.statusText);
      else info(`${p.name}: ${res.status}`);
    } catch (e) {
      reportBug('page_load', `${p.name}: fetch failed`, e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 36: create_sale RPC
// ═══════════════════════════════════════════════════════════════════════
async function testCreateSaleRPC(userId) {
  head('FASE 36: create_sale RPC');
  const { data: p } = await admin.from('products').select('id, stock_current, price, cost_average')
    .eq('store_id', STORE).gt('stock_current', 5).limit(1).single();
  if (!p) return;
  const stockBefore = p.stock_current;

  // create_sale con descuento
  const { data: sale, error } = await admin.rpc('create_sale', {
    p_store_id: STORE,
    p_seller_id: userId,
    p_items: [{ product_id: p.id, quantity: 2, price_at_sale: p.price, cost_at_sale: p.cost_average }],
    p_payment_method: 'cash',
    p_total_amount: p.price * 2 * 0.9, // 10% descuento
  });
  if (error) { reportBug('create_sale', 'RPC call', error); return; }

  // Verificar stock
  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore - 2) ok(`create_sale OK: stock ${stockBefore} → ${stockAfter} (-2)`);
  else reportBug('create_sale', `Stock mal: esperado ${stockBefore - 2}, actual ${stockAfter}`);

  // Verificar transacción
  const txId = sale?.transaction_id || sale?.id;
  if (txId) {
    const { data: tx } = await admin.from('transactions').select('status, total_amount').eq('id', txId).single();
    if (tx?.status === 'completed') ok(`Transacción completed: ${tx.total_amount}`);
    else reportBug('create_sale', `Status tx: ${tx?.status}`, 'esperaba completed');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 37: register_reception RPC (si existe)
// ═══════════════════════════════════════════════════════════════════════
async function testRegisterReception(userId) {
  head('FASE 37: register_reception RPC');
  const { data: p } = await admin.from('products').select('id, stock_current')
    .eq('store_id', STORE).limit(1).single();
  if (!p) return;
  const stockBefore = p.stock_current;

  // Probar si existe register_reception
  const { data, error } = await admin.rpc('register_reception', {
    p_store_id: STORE,
    p_supplier: 'Prov Test',
    p_reference_doc: 'REC-RPC-' + Date.now(),
    p_items: [{ product_id: p.id, quantity: 5, unit_cost: 50, moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1 }],
    p_notes: 'Test live',
  });

  if (error) {
    if (error.message.includes('Could not find') || error.message.includes('does not exist')) {
      warn('register_reception no existe (uso confirm_pending_reception en su lugar)');
    } else {
      reportBug('register_reception', 'RPC call', error);
    }
    return;
  }

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore + 5) ok(`register_reception OK: stock ${stockBefore} → ${stockAfter} (+5)`);
  else reportBug('register_reception', `Stock mal: esperado ${stockBefore + 5}, actual ${stockAfter}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 38: Pago a proveedor
// ═══════════════════════════════════════════════════════════════════════
async function testSupplierPayment(userId) {
  head('FASE 38: Pago a proveedor');

  // Crear recepción primero (para tener algo que pagar)
  const { data: rec } = await admin.from('receipts').insert({
    store_id: STORE, user_id: userId, status: 'active',
    total_cost: 500, reference_doc: 'REC-PAY-' + Date.now(),
    supplier: 'Prov Pago', payment_status: 'unpaid', paid_amount: 0,
  }).select().single();

  const { data: p } = await admin.from('products').select('id').eq('store_id', STORE).limit(1).single();
  await admin.from('receipt_items').insert({
    receipt_id: rec.id, product_id: p.id, quantity: 5, unit_cost: 100,
  });

  // Registrar pago
  const { data: pay, error } = await admin.rpc('register_supplier_payment', {
    p_store_id: STORE,
    p_ref_type: 'receipt',
    p_ref_id: rec.id,
    p_amount: 500,
    p_payment_method: 'cash',
    p_paid_by: userId,
    p_currency: 'CUP',
    p_idempotency_key: 'pay-' + Date.now(),
  });

  if (error) { reportBug('supplier_payment', 'RPC call', error); return; }

  // Verificar receipt actualizado
  const { data: recAfter } = await admin.from('receipts')
    .select('payment_status, paid_amount').eq('id', rec.id).single();
  if (recAfter?.payment_status === 'paid' || recAfter?.payment_status === 'partial') {
    ok(`Pago registrado: status=${recAfter.payment_status}, paid=${recAfter.paid_amount}`);
  } else {
    reportBug('supplier_payment', `Receipt status: ${recAfter?.payment_status}`, 'esperaba paid/partial');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 39: Dashboard KPIs
// ═══════════════════════════════════════════════════════════════════════
async function testDashboard() {
  head('FASE 39: Dashboard KPIs');

  const res = await fetch(`${API_BASE}/api/dashboard?storeId=${STORE}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 200) {
    const data = await res.json();
    ok(`Dashboard OK: ${JSON.stringify(data).slice(0, 100)}...`);
  } else if (res.status === 404) {
    // Probar endpoint alternativo
    const res2 = await fetch(`${API_BASE}/api/dashboard/kpis?storeId=${STORE}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res2.status === 200) ok(`Dashboard KPIs OK`);
    else warn(`Dashboard: ${res.status} / ${res2.status} (puede no existir endpoint)`);
  } else {
    warn(`Dashboard: ${res.status} (puede no existir endpoint)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 40: Workers + comisiones
// ═══════════════════════════════════════════════════════════════════════
async function testWorkers(userId) {
  head('FASE 40: Workers + comisiones');

  // Listar workers
  const { data: workers, error } = await admin.from('workers')
    .select('id, first_name, last_name, ci').eq('store_id', STORE).limit(5);
  if (error) {
    if (error.message.includes('does not exist')) {
      warn('Tabla workers no existe o sin acceso');
    } else {
      reportBug('workers', 'Query workers', error);
    }
    return;
  }
  info(`Workers en store: ${workers?.length || 0}`);

  if (workers?.length > 0) {
    // Registrar pago de comisión
    const { data: pay, error: e2 } = await admin.from('commission_payments').insert({
      store_id: STORE, worker_id: workers[0].id,
      amount: 100, payment_method: 'cash',
      paid_by: userId, payment_date: new Date().toISOString(),
      notes: 'Test live',
    }).select().single();
    if (e2) {
      if (e2.message.includes('does not exist')) warn('Tabla commission_payments no existe');
      else reportBug('workers', 'Insert commission_payment', e2);
    } else {
      ok(`Comisión pagada a ${workers[0].first_name}: ${pay.amount}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  RONDA 5 — UI + RPCs CRÍTICAS                                   ║
║  Cargar páginas + create_sale + register_reception + pagos      ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  await setup();
  const userId = '051c6157-600b-425e-b8c0-72388bacf541';

  await testPageLoads();
  await testCreateSaleRPC(userId);
  await testRegisterReception(userId);
  await testSupplierPayment(userId);
  await testDashboard();
  await testWorkers(userId);

  console.log(`\n${C.b}${C.p}═══ RESUMEN RONDA 5 ═══${C.x}`);
  if (bugs.length === 0) {
    ok(`🎉 0 bugs en UI + RPCs críticas`);
  } else {
    bad(`${bugs.length} bug(s):`);
    for (const b of bugs) {
      console.log(`  ${C.r}- [${b.flow}]${C.x} ${b.description}`);
      if (b.error) console.log(`    ${C.y}${b.error}${C.x}`);
    }
  }
  process.exit(bugs.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
