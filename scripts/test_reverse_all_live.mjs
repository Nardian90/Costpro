/**
 * test_reverse_all_live.mjs
 *
 * Pruebas en vivo de los 6 RPCs reverse_* del sistema CostPro.
 *
 * Para cada tipo de documento:
 * 1. Busca un documento reversible (estado válido)
 * 2. Captura stock antes (producto afectado)
 * 3. Llama a la RPC reverse_* correspondiente
 * 4. Verifica: stock invertido, status='reversed', kardex entries creadas
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env
 *
 * Uso:
 *   set -a && source .env && set +a && node scripts/test_reverse_all_live.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  purple: '\x1b[35m',
  bold: '\x1b[1m',
};

function ok(msg)   { console.log(`${COLORS.green}✅ ${msg}${COLORS.reset}`); }
function fail(msg) { console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`); }
function info(msg) { console.log(`${COLORS.cyan}ℹ️  ${msg}${COLORS.reset}`); }
function head(msg) { console.log(`\n${COLORS.bold}${COLORS.purple}═══ ${msg} ═══${COLORS.reset}`); }

async function getStock(productId, storeId) {
  const { data, error } = await supabase
    .from('products')
    .select('stock_current')
    .eq('id', productId)
    .eq('store_id', storeId)
    .single();
  if (error) return null;
  return data.stock_current;
}

async function getKardexCount(referenceId) {
  const { count, error } = await supabase
    .from('kardex_entries')
    .select('*', { count: 'exact', head: true })
    .eq('reference_id', referenceId)
    .eq('reference_type', 'reversal');
  if (error) return 0;
  return count || 0;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 1: reverse_transaction (venta)
// ──────────────────────────────────────────────────────────────────────
async function testReverseTransaction() {
  head('TEST 1: reverse_transaction (Venta)');

  const { data: tx, error } = await supabase
    .from('transactions')
    .select('id, store_id, total_amount, status')
    .eq('status', 'completed')
    .limit(1)
    .single();

  if (error || !tx) { fail(`No hay tx completed: ${error?.message}`); return false; }
  info(`Tx: ${tx.id} | monto: ${tx.total_amount}`);

  const { data: item } = await supabase
    .from('transaction_items')
    .select('product_id, quantity')
    .eq('transaction_id', tx.id)
    .limit(1)
    .single();
  if (!item) { fail('Sin items'); return false; }

  const stockBefore = await getStock(item.product_id, tx.store_id);
  info(`Producto ${item.product_id} | stock antes: ${stockBefore} | vendió: ${item.quantity}`);

  // W9.4.7 H5-B1: V1 retirada — RPC V2 canónica
  const { data: result, error: rpcError } = await supabase.rpc('reverse_transaction_v2', {
    p_transaction_id: tx.id,
    p_reason: 'TEST LIVE — reversión de venta',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  const stockAfter = await getStock(item.product_id, tx.store_id);
  const kardexCount = await getKardexCount(tx.id);

  // V2 marca 'voided' y no escribe reversed_at/reversal_reason (H5-B1)
  const { data: txAfter } = await supabase
    .from('transactions')
    .select('status')
    .eq('id', tx.id)
    .single();

  const stockOk = Math.abs((stockAfter - stockBefore) - item.quantity) < 0.001;
  const statusOk = txAfter?.status === 'voided';
  const kardexOk = kardexCount > 0;

  stockOk ? ok(`Stock: ${stockBefore} → ${stockAfter} (Δ=+${item.quantity})`) : fail(`Stock mal: ${stockBefore} → ${stockAfter}`);
  statusOk ? ok(`Status: voided (v2)`) : fail(`Status mal: ${txAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return stockOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 2: reverse_receipt (recepción)
// ──────────────────────────────────────────────────────────────────────
async function testReverseReceipt() {
  head('TEST 2: reverse_receipt (Recepción)');

  // Buscar receipts con items (la subquery garantiza que tenga items)
  const { data: recs, error } = await supabase
    .from('receipts')
    .select('id, store_id, total_cost, status')
    .in('status', ['active', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !recs || recs.length === 0) { fail(`No hay receipts: ${error?.message}`); return false; }

  // Buscar el primero que tenga items
  let rec = null;
  for (const r of recs) {
    const { count } = await supabase
      .from('receipt_items')
      .select('*', { count: 'exact', head: true })
      .eq('receipt_id', r.id);
    if (count && count > 0) { rec = r; break; }
  }
  if (!rec) { fail('Ningún receipt tiene items'); return false; }
  info(`Receipt: ${rec.id} | costo: ${rec.total_cost} | status: ${rec.status}`);

  const { data: items, error: itemErr } = await supabase
    .from('receipt_items')
    .select('product_id, quantity')
    .eq('receipt_id', rec.id)
    .limit(1);
  const item = items?.[0];
  if (!item) { fail('Sin items'); return false; }

  const stockBefore = await getStock(item.product_id, rec.store_id);
  info(`Producto ${item.product_id} | stock antes: ${stockBefore} | recibió: ${item.quantity}`);

  const { data: result, error: rpcError } = await supabase.rpc('reverse_receipt', {
    p_receipt_id: rec.id,
    p_reason: 'TEST LIVE V2.3 — reversión de recepción',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  const stockAfter = await getStock(item.product_id, rec.store_id);
  const kardexCount = await getKardexCount(rec.id);

  const { data: recAfter } = await supabase
    .from('receipts')
    .select('status, reversed_at, reversal_reason')
    .eq('id', rec.id)
    .single();

  // Stock debería bajar (se descuenta lo que se había añadido).
  // GREATEST(0, ...) puede limitar si stock < qty.
  const expectedDelta = -item.quantity;
  const actualDelta = stockAfter - stockBefore;
  // Aceptar si delta = -qty O si delta = -stock_before (cuando stock<qty y se limita a 0)
  const stockOk = Math.abs(actualDelta - expectedDelta) < 0.001
    || (stockBefore < item.quantity && stockAfter === 0);
  const statusOk = recAfter?.status === 'reversed';
  const kardexOk = kardexCount > 0;

  stockOk ? ok(`Stock: ${stockBefore} → ${stockAfter} (Δ=${actualDelta}, esperado ${expectedDelta})`) : fail(`Stock mal: Δ=${actualDelta}, esperado ${expectedDelta}`);
  statusOk ? ok(`Status: reversed @ ${recAfter.reversed_at}`) : fail(`Status mal: ${recAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return stockOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 3: reverse_transfer (transferencia)
// ──────────────────────────────────────────────────────────────────────
async function testReverseTransfer() {
  head('TEST 3: reverse_transfer (Transferencia)');

  const { data: trs, error } = await supabase
    .from('transfers')
    .select('id, origin_store_id, destination_store_id, status')
    .eq('status', 'CONFIRMADA')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !trs || trs.length === 0) { fail(`No hay transfer CONFIRMADA: ${error?.message}`); return false; }

  // Buscar la primera con items
  let tr = null;
  for (const t of trs) {
    const { count } = await supabase
      .from('transfer_items')
      .select('*', { count: 'exact', head: true })
      .eq('transfer_id', t.id);
    if (count && count > 0) { tr = t; break; }
  }
  if (!tr) { fail('Ninguna transfer tiene items'); return false; }

  info(`Transfer: ${tr.id} | ${tr.origin_store_id} → ${tr.destination_store_id}`);

  const { data: items3 } = await supabase
    .from('transfer_items')
    .select('product_id, quantity')
    .eq('transfer_id', tr.id)
    .limit(1);
  const item = items3?.[0];
  if (!item) { fail('Sin items'); return false; }

  const stockOriginBefore = await getStock(item.product_id, tr.origin_store_id);
  const stockDestBefore = await getStock(item.product_id, tr.destination_store_id);
  info(`Origin stock antes: ${stockOriginBefore} | Dest stock antes: ${stockDestBefore} | qty: ${item.quantity}`);

  const { data: result, error: rpcError } = await supabase.rpc('reverse_transfer', {
    p_transfer_id: tr.id,
    p_reason: 'TEST LIVE V2.3 — reversión de transferencia',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  const stockOriginAfter = await getStock(item.product_id, tr.origin_store_id);
  const stockDestAfter = await getStock(item.product_id, tr.destination_store_id);
  const kardexCount = await getKardexCount(tr.id);

  const { data: trAfter } = await supabase
    .from('transfers')
    .select('status, reversed_at, reversal_reason')
    .eq('id', tr.id)
    .single();

  // Origin +qty (devuelve), Dest -qty (descuenta).
  // Si dest no tenía el producto (stockDestBefore=null), aceptar que delta=0 (no existía).
  const originOk = Math.abs((stockOriginAfter - stockOriginBefore) - item.quantity) < 0.001;
  const destOk = stockDestBefore === null
    ? true  // producto no existía en destino, no se puede descontar
    : Math.abs((stockDestAfter - stockDestBefore) + item.quantity) < 0.001;
  const statusOk = trAfter?.status === 'REVERSADA';
  const kardexOk = kardexCount > 0;

  originOk ? ok(`Origin stock: ${stockOriginBefore} → ${stockOriginAfter} (+${item.quantity})`) : fail(`Origin mal: Δ=${stockOriginAfter - stockOriginBefore}`);
  destOk ? ok(`Dest stock: ${stockDestBefore === null ? 'null (no existía)' : `${stockDestBefore} → ${stockDestAfter}`}`) : fail(`Dest mal: Δ=${stockDestAfter - stockDestBefore}`);
  statusOk ? ok(`Status: REVERSADA @ ${trAfter.reversed_at}`) : fail(`Status mal: ${trAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return originOk && destOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 4: reverse_devolution (devolución)
// ──────────────────────────────────────────────────────────────────────
async function testReverseDevolution() {
  head('TEST 4: reverse_devolution (Devolución)');

  const { data: devs, error } = await supabase
    .from('devolutions')
    .select('id, store_id, total_amount, status, devolution_number')
    .eq('status', 'completed')
    .order('processed_at', { ascending: false })
    .limit(50);

  if (error || !devs || devs.length === 0) { fail(`No hay devolution completed: ${error?.message}`); return false; }

  let dev = null;
  for (const d of devs) {
    const { count } = await supabase
      .from('devolution_items')
      .select('*', { count: 'exact', head: true })
      .eq('devolution_id', d.id);
    if (count && count > 0) { dev = d; break; }
  }
  if (!dev) { fail('Ninguna devolution tiene items'); return false; }

  info(`Devolution: ${dev.devolution_number} | monto: ${dev.total_amount}`);

  const { data: items4 } = await supabase
    .from('devolution_items')
    .select('product_id, quantity')
    .eq('devolution_id', dev.id)
    .limit(1);
  const item = items4?.[0];
  if (!item) { fail('Sin items'); return false; }

  const stockBefore = await getStock(item.product_id, dev.store_id);
  info(`Producto ${item.product_id} | stock antes: ${stockBefore} | devolvió: ${item.quantity}`);

  const { data: result, error: rpcError } = await supabase.rpc('reverse_devolution', {
    p_devolution_id: dev.id,
    p_reason: 'TEST LIVE V2.3 — reversión de devolución',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  const stockAfter = await getStock(item.product_id, dev.store_id);
  const kardexCount = await getKardexCount(dev.id);

  const { data: devAfter } = await supabase
    .from('devolutions')
    .select('status, reversed_at, reversal_reason')
    .eq('id', dev.id)
    .single();

  // Devolución sumó stock al crearla → revertir resta
  const expectedDelta = -item.quantity;
  const actualDelta = stockAfter - stockBefore;
  const stockOk = Math.abs(actualDelta - expectedDelta) < 0.001;
  const statusOk = devAfter?.status === 'reversed';
  const kardexOk = kardexCount > 0;

  stockOk ? ok(`Stock: ${stockBefore} → ${stockAfter} (Δ=${actualDelta}, esperado ${expectedDelta})`) : fail(`Stock mal: Δ=${actualDelta}, esperado ${expectedDelta}`);
  statusOk ? ok(`Status: reversed @ ${devAfter.reversed_at}`) : fail(`Status mal: ${devAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return stockOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 5: reverse_adjustment (ajuste)
// ──────────────────────────────────────────────────────────────────────
async function testReverseAdjustment() {
  head('TEST 5: reverse_adjustment (Ajuste de Inventario)');

  // Buscar adjustments que tengan items
  const { data: adjs, error } = await supabase
    .from('inventory_adjustments')
    .select('id, store_id, status, reason')
    .in('status', ['confirmed', 'pending', 'PENDING'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !adjs || adjs.length === 0) { fail(`No hay adjustments: ${error?.message}`); return false; }

  // Buscar el primero con items
  let adj = null;
  for (const a of adjs) {
    const { count } = await supabase
      .from('inventory_adjustment_items')
      .select('*', { count: 'exact', head: true })
      .eq('adjustment_id', a.id);
    if (count && count > 0) { adj = a; break; }
  }
  if (!adj) { fail('Ningún adjustment tiene items'); return false; }
  info(`Adjustment: ${adj.id} | reason: ${adj.reason} | status: ${adj.status}`);

  const { data: items2 } = await supabase
    .from('inventory_adjustment_items')
    .select('product_id, difference')
    .eq('adjustment_id', adj.id)
    .limit(1);
  const item = items2?.[0];
  if (!item) { fail('Sin items'); return false; }

  const stockBefore = await getStock(item.product_id, adj.store_id);
  info(`Producto ${item.product_id} | stock antes: ${stockBefore} | difference original: ${item.difference}`);

  const { data: result, error: rpcError } = await supabase.rpc('reverse_adjustment', {
    p_adjustment_id: adj.id,
    p_reason: 'TEST LIVE V2.3 — reversión de ajuste',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  const stockAfter = await getStock(item.product_id, adj.store_id);
  const kardexCount = await getKardexCount(adj.id);

  const { data: adjAfter } = await supabase
    .from('inventory_adjustments')
    .select('status, reversed_at, reversal_reason')
    .eq('id', adj.id)
    .single();

  // Reversión invierte el difference: si sumó X, resta X
  const expectedDelta = -item.difference;
  const actualDelta = stockAfter - stockBefore;
  const stockOk = Math.abs(actualDelta - expectedDelta) < 0.001;
  const statusOk = adjAfter?.status === 'reversed';
  const kardexOk = kardexCount > 0;

  stockOk ? ok(`Stock: ${stockBefore} → ${stockAfter} (Δ=${actualDelta}, esperado ${expectedDelta})`) : fail(`Stock mal: Δ=${actualDelta}, esperado ${expectedDelta}`);
  statusOk ? ok(`Status: reversed @ ${adjAfter.reversed_at}`) : fail(`Status mal: ${adjAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return stockOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 6: reverse_production_order (orden de producción)
// ──────────────────────────────────────────────────────────────────────
async function testReverseProductionOrder() {
  head('TEST 6: reverse_production_order (Orden de Producción)');

  // Buscar órdenes con insumos consumidos (actual_qty > 0)
  const { data: orders, error } = await supabase
    .from('production_orders')
    .select('id, store_id, order_number, order_type, status, output_product_id, output_quantity')
    .in('status', ['in_progress', 'paused', 'completed', 'closed'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !orders || orders.length === 0) { fail(`No hay órdenes reversibles: ${error?.message}`); return false; }

  // Buscar la primera con insumos actual_qty > 0
  let order = null;
  let items = null;
  for (const o of orders) {
    const { data: its } = await supabase
      .from('production_order_items')
      .select('product_id, actual_qty')
      .eq('order_id', o.id)
      .gt('actual_qty', 0)
      .limit(1);
    if (its && its.length > 0) { order = o; items = its; break; }
  }
  if (!order) { fail('Ninguna orden tiene insumos consumidos'); return false; }

  info(`Order: ${order.order_number} | type: ${order.order_type} | status: ${order.status}`);
  info(`Insumo: ${items[0].product_id} | actual_qty: ${items[0].actual_qty}`);

  let stockBefore = null;
  // Siempre hay items aquí (lo garantiza el loop anterior)
  stockBefore = await getStock(items[0].product_id, order.store_id);
  info(`Stock insumo antes: ${stockBefore}`);

  const { data: result, error: rpcError } = await supabase.rpc('reverse_production_order', {
    p_order_id: order.id,
    p_reason: 'TEST LIVE V2.3 — reversión de orden de producción',
    p_user_id: null,
  });

  if (rpcError) { fail(`RPC: ${rpcError.message}`); return false; }
  info(`RPC result: ${JSON.stringify(result)}`);

  let stockOk = true;
  const stockAfter = await getStock(items[0].product_id, order.store_id);
  const expectedDelta = items[0].actual_qty; // reabastece
  const actualDelta = stockAfter - stockBefore;
  stockOk = Math.abs(actualDelta - expectedDelta) < 0.001;
  stockOk ? ok(`Stock insumo: ${stockBefore} → ${stockAfter} (+${expectedDelta})`) : fail(`Stock mal: Δ=${actualDelta}, esperado +${expectedDelta}`);

  const kardexCount = await getKardexCount(order.id);

  const { data: orderAfter } = await supabase
    .from('production_orders')
    .select('status, reversed_at, reversal_reason')
    .eq('id', order.id)
    .single();

  const statusOk = orderAfter?.status === 'reversed';
  const kardexOk = kardexCount > 0;

  statusOk ? ok(`Status: reversed @ ${orderAfter.reversed_at}`) : fail(`Status mal: ${orderAfter?.status}`);
  kardexOk ? ok(`Kardex entries: ${kardexCount}`) : fail('Sin kardex entries');

  return stockOk && statusOk && kardexOk;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 7: Validación de transiciones inválidas
// ──────────────────────────────────────────────────────────────────────
async function testInvalidTransitions() {
  head('TEST 7: Trigger de validación (transiciones inválidas)');

  // Buscar tx reversed e intentar pasarla a completed
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, status')
    .eq('status', 'reversed')
    .limit(1)
    .single();

  if (!tx) { info('Sin tx reversed para probar'); return true; }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ status: 'completed' })
    .eq('id', tx.id);

  if (updateError && updateError.message.includes('ERR_INVALID_TRANSITION')) {
    ok(`Trigger rechazó reversed→completed: ${updateError.message}`);
    return true;
  }
  fail(`Trigger dejó pasar transición inválida: ${updateError?.message || 'sin error'}`);
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${COLORS.bold}${COLORS.purple}
╔══════════════════════════════════════════════════════════════════╗
║  AUDITORÍA CONTABLE V2.3 — PRUEBAS EN VIVO DE REVERSE_* (6/6)   ║
╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}`);

  const results = {};

  results.transaction      = await testReverseTransaction();
  results.receipt          = await testReverseReceipt();
  results.transfer         = await testReverseTransfer();
  results.devolution       = await testReverseDevolution();
  results.adjustment       = await testReverseAdjustment();
  results.production_order = await testReverseProductionOrder();
  results.trigger          = await testInvalidTransitions();

  // Resumen
  console.log(`\n${COLORS.bold}${COLORS.purple}═══ RESUMEN ═══${COLORS.reset}`);
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  for (const [name, pass] of Object.entries(results)) {
    console.log(`  ${pass ? COLORS.green + '✅' : COLORS.red + '❌'} ${name}${COLORS.reset}`);
  }
  console.log(`\n${COLORS.bold}${passed === total ? COLORS.green : COLORS.yellow}Total: ${passed}/${total} pruebas pasaron${COLORS.reset}\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
