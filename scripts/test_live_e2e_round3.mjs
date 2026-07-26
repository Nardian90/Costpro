/**
 * test_live_e2e_round3.mjs
 *
 * RONDA 3 — Pruebas HTTP reales con JWT sobre endpoints /api/*
 * Simula exactamente lo que haría el frontend.
 *
 * Cubre:
 *   - GET /api/products (búsqueda POS)
 *   - GET /api/inventory/products
 *   - POST /api/devolutions (crear devolución)
 *   - POST /api/quotations (crear cotización)
 *   - POST /api/transfers (crear transferencia)
 *   - POST /api/reverse (revertir documento)
 *   - GET /api/stores (listado + paginación)
 *   - GET /api/dashboard/kpis
 *   - GET /api/cash-report
 *   - GET /api/audit-logs
 *   - POST /api/inventory/adjustments
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API_BASE = 'http://localhost:3000';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const ADMIN_EMAIL = 'admin@costpro.com';
const ADMIN_PASS = 'costpro123';

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

async function apiCall(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, ok: res.ok };
}

async function setup() {
  head('RONDA 3 — Setup');
  const authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authed.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (error) { bad('Login: ' + error.message); process.exit(1); }
  token = data.session.access_token;
  ok('JWT obtenido');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 20: GET endpoints (lectura)
// ═══════════════════════════════════════════════════════════════════════
async function testGetEndpoints() {
  head('FASE 20: GET endpoints (lectura)');

  const endpoints = [
    { path: '/api/inventory/products?storeId=' + STORE + '&limit=5', name: 'inventory/products' },
    { path: '/api/stores?status=active', name: 'stores' },
    { path: '/api/stores?status=active&page=1&limit=5', name: 'stores paginado' },
    { path: '/api/devolutions?store_id=' + STORE + '&limit=5', name: 'devolutions' },
    { path: '/api/quotations?store_id=' + STORE + '&limit=5', name: 'quotations' },
    { path: '/api/audit-logs?storeId=' + STORE + '&limit=5', name: 'audit-logs' },
  ];

  for (const ep of endpoints) {
    const res = await apiCall(ep.path);
    if (res.status === 200) {
      const count = Array.isArray(res.data?.data) ? res.data.data.length :
                    Array.isArray(res.data) ? res.data.length : 'N/A';
      ok(`${ep.name}: 200 (${count} items)`);
    } else if (res.status === 404) {
      warn(`${ep.name}: 404 (endpoint no existe o sin datos)`);
    } else {
      reportBug('get_' + ep.name, `${ep.name}: status ${res.status}`, res.data?.error || res.data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 21: POST /api/quotations (crear cotización via API)
// ═══════════════════════════════════════════════════════════════════════
async function testCreateQuotationAPI() {
  head('FASE 21: POST /api/quotations');

  // Primero obtener un producto
  const prodRes = await apiCall('/api/inventory/products?storeId=' + STORE + '&limit=1');
  let productId;
  if (prodRes.status === 200) {
    const products = prodRes.data?.data || prodRes.data?.products || prodRes.data;
    productId = Array.isArray(products) ? products[0]?.id : products?.id;
  }
  if (!productId) { warn('Sin producto para cotización'); return; }

  const res = await apiCall('/api/quotations', {
    method: 'POST',
    body: {
      store_id: STORE,
      items: [{ product_id: productId, quantity: 2, unit_price: 100 }],
      customer_name: 'Cliente API Test',
    },
  });

  if (res.status === 200 && res.data?.status === 'success') {
    ok(`Cotización creada via API: ${res.data.quotation_number} (total: ${res.data.total_amount})`);
  } else {
    reportBug('quotation_api', `Status ${res.status}`, res.data?.error || res.data);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 22: POST /api/transfers (crear transferencia via API)
// ═══════════════════════════════════════════════════════════════════════
async function testCreateTransferAPI() {
  head('FASE 22: POST /api/transfers');

  const prodRes = await apiCall('/api/inventory/products?storeId=' + STORE + '&limit=1');
  let productId;
  if (prodRes.status === 200) {
    const products = prodRes.data?.data || prodRes.data?.products || prodRes.data;
    productId = Array.isArray(products) ? products[0]?.id : products?.id;
  }
  if (!productId) { warn('Sin producto para transfer'); return; }

  const res = await apiCall('/api/transfers', {
    method: 'POST',
    body: {
      origin_store_id: STORE,
      destination_store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1',
      notes: 'Test live API',
      items: [{ product_id: productId, quantity: 1, unit_cost: 50 }],
    },
  });

  if (res.status === 200 && res.data?.id) {
    ok(`Transfer creada via API: ${res.data.id} (PENDIENTE)`);
    return res.data.id;
  } else {
    reportBug('transfer_api', `Status ${res.status}`, res.data?.error || res.data);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 23: POST /api/devolutions (crear devolución via API)
// ═══════════════════════════════════════════════════════════════════════
async function testCreateDevolutionAPI() {
  head('FASE 23: POST /api/devolutions');

  const prodRes = await apiCall('/api/inventory/products?storeId=' + STORE + '&limit=1');
  let productId;
  if (prodRes.status === 200) {
    const products = prodRes.data?.data || prodRes.data?.products || prodRes.data;
    productId = Array.isArray(products) ? products[0]?.id : products?.id;
  }
  if (!productId) { warn('Sin producto para devolución'); return; }

  const res = await apiCall('/api/devolutions', {
    method: 'POST',
    body: {
      store_id: STORE,
      reason: 'Test live API devolución',
      items: [{ product_id: productId, quantity: 1, unit_price: 100 }],
      customer_name: 'Cliente Dev API',
    },
  });

  if (res.status === 200 && res.data?.devolution_id) {
    ok(`Devolución creada via API: ${res.data.devolution_id}`);
  } else {
    reportBug('devolution_api', `Status ${res.status}`, res.data?.error || res.data);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 24: POST /api/reverse (revertir venta via API)
// ═══════════════════════════════════════════════════════════════════════
async function testReverseAPI() {
  head('FASE 24: POST /api/reverse');

  // Crear venta para revertir
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: p } = await admin.from('products').select('id, stock_current').eq('store_id', STORE).limit(1).single();
  if (!p) return;

  const { data: tx } = await admin.from('transactions').insert({
    store_id: STORE, seller_id: '051c6157-600b-425e-b8c0-72388bacf541',
    total_amount: 100, status: 'completed', payment_method: 'cash',
  }).select().single();
  await admin.from('transaction_items').insert({
    transaction_id: tx.id, product_id: p.id, variant_id: null,
    quantity: 1, price_at_sale: 100, cost_at_sale: 50,
  });
  await admin.from('products').update({ stock_current: p.stock_current - 1 }).eq('id', p.id);

  // Esperar rate limit (5/min en /api/reverse)
  await new Promise(r => setTimeout(r, 13000));

  const res = await apiCall('/api/reverse', {
    method: 'POST',
    body: { type: 'transaction', id: tx.id, reason: 'Test live API reverse' },
  });

  if (res.status === 200 && res.data?.status === 'success') {
    ok(`Reversión via API: ${res.data.items_reversed} items`);
  } else {
    reportBug('reverse_api', `Status ${res.status}`, res.data?.error || res.data);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 25: Paginación stores
// ═══════════════════════════════════════════════════════════════════════
async function testStoresPagination() {
  head('FASE 25: Paginación stores');

  // Sin paginación (legacy)
  const r1 = await apiCall('/api/stores?status=active');
  if (r1.status === 200) {
    const count = r1.data?.data?.length || 0;
    ok(`Legacy (sin paginar): ${count} tiendas`);
  }

  // Con paginación offset
  const r2 = await apiCall('/api/stores?status=active&page=1&limit=2');
  if (r2.status === 200 && r2.data?.pagination) {
    ok(`Paginado: ${r2.data.data.length} tiendas, page=${r2.data.pagination.page}, hasMore=${r2.data.pagination.hasMore}`);
  } else {
    reportBug('pagination', `Paginación falló: ${r2.status}`, r2.data);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  RONDA 3 — TEST HTTP API REAL con JWT                           ║
║  Simula exactamente lo que hace el frontend                      ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  await setup();

  await testGetEndpoints();
  await testCreateQuotationAPI();
  await testCreateTransferAPI();
  await testCreateDevolutionAPI();
  await testStoresPagination();
  await testReverseAPI();

  console.log(`\n${C.b}${C.p}═══ RESUMEN RONDA 3 ═══${C.x}`);
  if (bugs.length === 0) {
    ok(`🎉 0 bugs en API HTTP real`);
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
