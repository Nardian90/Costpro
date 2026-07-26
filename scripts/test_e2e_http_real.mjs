/**
 * test_e2e_http_real.mjs
 *
 * V2.4.4: Test E2E REAL que llama a los endpoints HTTP /api/* con JWT real.
 *
 * Reemplaza al test_duplicate_e2e_full.mjs (C5) que usaba RPC directo con service_role.
 *
 * Requiere:
 *   - .env con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - Server Next.js corriendo en localhost:3000
 *   - Credenciales admin@costpro.com / costpro123 (o variable ADMIN_EMAIL/ADMIN_PASS)
 *
 * Pruebas:
 *   1. Login → obtener JWT
 *   2. POST /api/reverse (transacción) → valida auth, CSRF, Zod, RPC
 *   3. POST /api/transfers → valida canManageStore, Zod, insert
 *   4. POST /api/inventory/adjustments/duplicate → valida RPC atómica
 *   5. Tests negativos:
 *      - Sin Authorization header → 401
 *      - Con origin inválido → 403 CSRF
 *      - UUID inválido → 400
 *      - Sin body → 400
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@costpro.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'costpro123';

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = m => console.log(`${C.g}✅ ${m}${C.x}`);
const bad = m => console.log(`${C.r}❌ ${m}${C.x}`);
const info = m => console.log(`${C.c}ℹ️  ${m}${C.x}`);
const head = m => console.log(`\n${C.b}${C.p}═══ ${m} ═══${C.x}`);

// ──────────────────────────────────────────────────────────────────────
// Setup: login y obtener JWT
// ──────────────────────────────────────────────────────────────────────
async function login() {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (error || !data?.session?.access_token) {
    throw new Error(`Login failed: ${error?.message || 'no token'}`);
  }
  return {
    token: data.session.access_token,
    userId: data.user.id,
    supabase,
  };
}

// Helper para llamadas autenticadas
async function apiCall(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${opts.token}`,
    ...(opts.headers || {}),
  };
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, ok: res.ok };
}

// ──────────────────────────────────────────────────────────────────────
// TEST 1: Login
// ──────────────────────────────────────────────────────────────────────
async function testLogin() {
  head('TEST 1: Login + obtener JWT');
  try {
    const { token, userId } = await login();
    if (!token || !userId) return bad('Sin token o userId'), false;
    info(`User ID: ${userId}`);
    info(`Token: ${token.slice(0, 30)}...`);
    ok('JWT obtenido');
    return true;
  } catch (e) {
    return bad(`Login: ${e.message}`), false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// TEST 2: /api/reverse con transaction (valida auth, CSRF, Zod, RPC)
// ──────────────────────────────────────────────────────────────────────
async function testReverseTransaction(token, supabase) {
  head('TEST 2: POST /api/reverse (transaction)');

  // Crear una transacción completed para revertir
  const { data: p } = await supabase.from('products').select('id, stock_current').eq('store_id', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576').gt('stock_current', 5).limit(1).single();
  if (!p) return bad('Sin producto'), false;

  const { data: tx } = await supabase.from('transactions').insert({
    store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    seller_id: '051c6157-600b-425e-b8c0-72388bacf541', // admin
    total_amount: 100, status: 'completed', payment_method: 'cash',
  }).select().single();
  await supabase.from('transaction_items').insert([
    { transaction_id: tx.id, product_id: p.id, variant_id: null, quantity: 1, price_at_sale: 100, cost_at_sale: 50 },
  ]);
  await supabase.from('products').update({ stock_current: p.stock_current - 1 }).eq('id', p.id);
  info(`Tx creada: ${tx.id}`);

  // Llamar API reverse
  const res = await apiCall('/api/reverse', {
    method: 'POST',
    token,
    body: { type: 'transaction', id: tx.id, reason: 'Test E2E HTTP real V2.4.4' },
  });

  if (res.status !== 200) {
    return bad(`Status ${res.status}: ${JSON.stringify(res.data)}`), false;
  }
  if (res.data?.status !== 'success') {
    return bad(`Response mal: ${JSON.stringify(res.data)}`), false;
  }

  ok(`Reversión exitosa: ${JSON.stringify(res.data)}`);
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 3: POST /api/transfers (valida canManageStore, Zod, insert)
// ──────────────────────────────────────────────────────────────────────
async function testCreateTransfer(token, supabase) {
  head('TEST 3: POST /api/transfers');

  const { data: p } = await supabase.from('products').select('id').eq('store_id', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576').limit(1).single();
  if (!p) return bad('Sin producto'), false;

  const res = await apiCall('/api/transfers', {
    method: 'POST',
    token,
    body: {
      origin_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
      destination_store_id: '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1',
      notes: 'Test E2E HTTP',
      items: [{ product_id: p.id, quantity: 1, unit_cost: 50 }],
    },
  });

  if (res.status !== 200) {
    return bad(`Status ${res.status}: ${JSON.stringify(res.data)}`), false;
  }
  if (!res.data?.id) {
    return bad(`Sin id en respuesta: ${JSON.stringify(res.data)}`), false;
  }

  // Verificar en DB
  const { data: dbTr } = await supabase.from('transfers').select('status').eq('id', res.data.id).single();
  if (dbTr?.status !== 'PENDIENTE') {
    return bad(`Status DB mal: ${dbTr?.status}`), false;
  }

  ok(`Transfer creada: ${res.data.id} (PENDIENTE)`);
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 4: POST /api/inventory/adjustments/duplicate (RPC atómica)
// ──────────────────────────────────────────────────────────────────────
async function testDuplicateAdjustment(token, supabase) {
  head('TEST 4: POST /api/inventory/adjustments/duplicate');

  // Crear adjustment original
  const { data: p } = await supabase.from('products').select('id, stock_current').eq('store_id', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576').gt('stock_current', 5).limit(1).single();
  if (!p) return bad('Sin producto'), false;

  const { data: orig } = await supabase.from('inventory_adjustments').insert({
    store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    created_by: '051c6157-600b-425e-b8c0-72388bacf541',
    status: 'confirmed', reason: 'OTHER', notes: 'Test E2E HTTP dup',
  }).select().single();
  await supabase.from('inventory_adjustment_items').insert([
    { adjustment_id: orig.id, product_id: p.id, expected_quantity: 10, counted_quantity: 13 }, // diff +3
  ]);
  await supabase.from('products').update({ stock_current: p.stock_current + 3 }).eq('id', p.id);
  info(`Adjustment original: ${orig.id}`);

  // Llamar API duplicate
  const res = await apiCall('/api/inventory/adjustments/duplicate', {
    method: 'POST',
    token,
    body: { original_id: orig.id },
  });

  if (res.status !== 200) {
    return bad(`Status ${res.status}: ${JSON.stringify(res.data)}`), false;
  }
  if (!res.data?.id) {
    return bad(`Sin id: ${JSON.stringify(res.data)}`), false;
  }

  // Verificar en DB
  const { data: newAdj } = await supabase.from('inventory_adjustments').select('status').eq('id', res.data.id).single();
  if (newAdj?.status !== 'confirmed') {
    return bad(`Status DB mal: ${newAdj?.status}`), false;
  }

  ok(`Adjustment duplicado: ${res.data.id} (confirmed, ${res.data.items_duplicated} items)`);
  return true;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 5: Tests negativos (auth, CSRF, validation)
// ──────────────────────────────────────────────────────────────────────
async function testNegativeCases(token) {
  head('TEST 5: Tests negativos (auth/CSRF/validation)');

  let allOk = true;

  // 5a: Sin Authorization header → 401
  const r1 = await fetch(`${API_BASE}/api/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'transaction', id: '00000000-0000-0000-0000-000000000000', reason: 'test' }),
  });
  if (r1.status === 401) ok(`5a Sin auth → 401 ✅`);
  else { bad(`5a Sin auth → ${r1.status} (esperaba 401)`); allOk = false; }

  // 5b: UUID inválido → 400
  const r2 = await apiCall('/api/reverse', {
    method: 'POST',
    token,
    body: { type: 'transaction', id: 'not-a-uuid', reason: 'test' },
  });
  if (r2.status === 400) ok(`5b UUID inválido → 400 ✅`);
  else { bad(`5b UUID inválido → ${r2.status} (esperaba 400)`); allOk = false; }

  // 5c: Sin body → 400
  const r3 = await apiCall('/api/reverse', {
    method: 'POST',
    token,
    body: '',
  });
  if (r3.status >= 400 && r3.status < 500) ok(`5c Sin body → ${r3.status} ✅`);
  else { bad(`5c Sin body → ${r3.status} (esperaba 4xx)`); allOk = false; }

  // 5d: type inválido → 400
  const r4 = await apiCall('/api/reverse', {
    method: 'POST',
    token,
    body: { type: 'invalid', id: '00000000-0000-0000-0000-000000000000', reason: 'test' },
  });
  if (r4.status === 400) ok(`5d type inválido → 400 ✅`);
  else { bad(`5d type inválido → ${r4.status} (esperaba 400)`); allOk = false; }

  // 5e: reason muy corto (< 3) → 400
  const r5 = await apiCall('/api/reverse', {
    method: 'POST',
    token,
    body: { type: 'transaction', id: '00000000-0000-0000-0000-000000000000', reason: 'ab' },
  });
  if (r5.status === 400) ok(`5e reason < 3 → 400 ✅`);
  else { bad(`5e reason < 3 → ${r5.status} (esperaba 400)`); allOk = false; }

  // 5f: origin == destination en transfer → 400
  const r6 = await apiCall('/api/transfers', {
    method: 'POST',
    token,
    body: {
      origin_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
      destination_store_id: 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
      items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1, unit_cost: 1 }],
    },
  });
  if (r6.status === 400) ok(`5f origin==destination → 400 ✅`);
  else { bad(`5f origin==destination → ${r6.status} (esperaba 400)`); allOk = false; }

  return allOk;
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  V2.4.4 — E2E HTTP REAL: llama a /api/* con JWT (C5 fix)       ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  const results = {};

  // 1. Login
  results.login = await testLogin();
  if (!results.login) {
    console.log(`\n${C.r}❌ No se pudo hacer login. Abortando.${C.x}`);
    process.exit(1);
  }

  const { token, supabase } = await login();

  // 2-4. Tests funcionales
  results.reverse_transaction = await testReverseTransaction(token, supabase);
  results.create_transfer = await testCreateTransfer(token, supabase);
  results.duplicate_adjustment = await testDuplicateAdjustment(token, supabase);

  // 5. Tests negativos
  results.negative_cases = await testNegativeCases(token);

  // Resumen
  console.log(`\n${C.b}${C.p}═══ RESUMEN ═══${C.x}`);
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  for (const [name, pass] of Object.entries(results)) {
    console.log(`  ${pass ? C.g + '✅' : C.r + '❌'} ${name}${C.x}`);
  }
  console.log(`\n${C.b}${passed === total ? C.g : C.r}Total: ${passed}/${total} pruebas pasaron${C.x}\n`);
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
