/**
 * test_reverse_e2e_full.mjs
 *
 * Prueba E2E completa: para CADA tipo de documento, crea uno nuevo + lo revierte.
 * No destructivo con datos existentes (siempre crea documentos nuevos).
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STORE_ID = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const DEST_STORE_ID = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';
const USER_ID = '8c90b7b8-3e6a-449e-84e0-ac19ff6c3945';

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', x: '\x1b[0m' };
const ok = m => console.log(`${C.g}✅ ${m}${C.x}`);
const bad = m => console.log(`${C.r}❌ ${m}${C.x}`);
const info = m => console.log(`${C.c}ℹ️  ${m}${C.x}`);
const head = m => console.log(`\n${C.b}${C.p}═══ ${m} ═══${C.x}`);

async function getStock(productId, storeId) {
  const { data } = await supabase.from('products').select('stock_current').eq('id', productId).eq('store_id', storeId).single();
  return data?.stock_current ?? null;
}

async function getProduct() {
  const { data } = await supabase.from('products').select('id, name, stock_current').eq('store_id', STORE_ID).gt('stock_current', 5).limit(1).single();
  return data;
}

async function getKardexCount(refId) {
  const { count } = await supabase.from('kardex_entries').select('*', { count: 'exact', head: true }).eq('reference_id', refId).eq('reference_type', 'reversal');
  return count || 0;
}

// ──────────────────────────────────────────────────────────────────────
// 1. TRANSACTION (venta)
// ──────────────────────────────────────────────────────────────────────
async function testTransaction() {
  head('TEST 1: TRANSACTION — crear venta + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  // Insert directo (service_role bypassa RLS)
  const { data: tx, error: e1 } = await supabase.from('transactions').insert({
    store_id: STORE_ID, seller_id: USER_ID, total_amount: 200,
    status: 'completed', payment_method: 'cash', completed_at: new Date().toISOString(),
  }).select().single();
  if (e1) return bad(`transaction insert: ${e1.message}`);
  const txId = tx.id;
  info(`Venta creada: ${txId}`);

  const { error: e1b } = await supabase.from('transaction_items').insert([
    { transaction_id: txId, product_id: p.id, variant_id: null, quantity: 2, price_at_sale: 100, cost_at_sale: 50 },
  ]);
  if (e1b) return bad(`items: ${e1b.message}`);

  // Descontar stock (simular venta)
  await supabase.from('products').update({ stock_current: stockBefore - 2 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock después de venta: ${stockMid} (esperado ${stockBefore - 2})`);

  // Revertir
  const { data: rev, error: e2 } = await supabase.rpc('reverse_transaction', {
    p_transaction_id: txId, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e2) return bad(`reverse: ${e2.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(txId);
  const { data: txAfter } = await supabase.from('transactions').select('status').eq('id', txId).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  txAfter?.status === 'reversed' ? ok('Status: reversed') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex} entries`) : bad('Sin kardex');
  return stockOk && txAfter?.status === 'reversed' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 2. RECEIPT
// ──────────────────────────────────────────────────────────────────────
async function testReceipt() {
  head('TEST 2: RECEIPT — crear recepción + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: rec, error: e1 } = await supabase.from('receipts').insert({
    store_id: STORE_ID, user_id: USER_ID, status: 'active', total_cost: 500,
    reference_doc: 'REC-E2E-' + Date.now(), supplier: 'Prov Test', notes: 'E2E',
    payment_status: 'paid', paid_amount: 500,
  }).select().single();
  if (e1) return bad(`receipt: ${e1.message}`);
  info(`Receipt creado: ${rec.id}`);

  const { error: e2 } = await supabase.from('receipt_items').insert([
    { receipt_id: rec.id, product_id: p.id, quantity: 10, unit_cost: 50 },
  ]);
  if (e2) return bad(`items: ${e2.message}`);

  // Sumar al stock
  await supabase.from('products').update({ stock_current: stockBefore + 10 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock tras recepción: ${stockMid} (esperado ${stockBefore + 10})`);

  // Revertir
  const { data: rev, error: e3 } = await supabase.rpc('reverse_receipt', {
    p_receipt_id: rec.id, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e3) return bad(`reverse: ${e3.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(rec.id);
  const { data: recAfter } = await supabase.from('receipts').select('status').eq('id', rec.id).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  recAfter?.status === 'reversed' ? ok('Status: reversed') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex}`) : bad('Sin kardex');
  return stockOk && recAfter?.status === 'reversed' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 3. TRANSFER
// ──────────────────────────────────────────────────────────────────────
async function testTransfer() {
  head('TEST 3: TRANSFER — crear transferencia + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: tr, error: e1 } = await supabase.from('transfers').insert({
    origin_store_id: STORE_ID, destination_store_id: DEST_STORE_ID,
    created_by: USER_ID, status: 'CONFIRMADA', notes: 'E2E',
  }).select().single();
  if (e1) return bad(`transfer: ${e1.message}`);
  info(`Transfer creada: ${tr.id}`);

  const { error: e2 } = await supabase.from('transfer_items').insert([
    { transfer_id: tr.id, product_id: p.id, quantity: 2, unit_cost: 50 },
  ]);
  if (e2) return bad(`items: ${e2.message}`);

  // Descontar del origen (simular confirmación)
  await supabase.from('products').update({ stock_current: stockBefore - 2 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock tras transfer: ${stockMid} (esperado ${stockBefore - 2})`);

  // Revertir
  const { data: rev, error: e3 } = await supabase.rpc('reverse_transfer', {
    p_transfer_id: tr.id, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e3) return bad(`reverse: ${e3.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(tr.id);
  const { data: trAfter } = await supabase.from('transfers').select('status').eq('id', tr.id).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock origen restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  trAfter?.status === 'REVERSADA' ? ok('Status: REVERSADA') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex}`) : bad('Sin kardex');
  return stockOk && trAfter?.status === 'REVERSADA' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 4. DEVOLUTION
// ──────────────────────────────────────────────────────────────────────
async function testDevolution() {
  head('TEST 4: DEVOLUTION — crear devolución + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: dev, error: e1 } = await supabase.from('devolutions').insert({
    store_id: STORE_ID, devolution_number: 'DEV-E2E-' + Date.now(),
    reason: 'E2E test', total_amount: 100, payment_method: 'cash',
    status: 'completed', processed_at: new Date().toISOString(),
    processed_by: USER_ID, customer_name: 'Cliente E2E',
  }).select().single();
  if (e1) return bad(`devolution: ${e1.message}`);
  info(`Devolution creada: ${dev.id}`);

  const { error: e2 } = await supabase.from('devolution_items').insert([
    { devolution_id: dev.id, product_id: p.id, quantity: 1, unit_price: 100, total: 100 },
  ]);
  if (e2) return bad(`items: ${e2.message}`);

  // Sumar stock (devolución restaura)
  await supabase.from('products').update({ stock_current: stockBefore + 1 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock tras devolución: ${stockMid} (esperado ${stockBefore + 1})`);

  // Revertir
  const { data: rev, error: e3 } = await supabase.rpc('reverse_devolution', {
    p_devolution_id: dev.id, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e3) return bad(`reverse: ${e3.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(dev.id);
  const { data: devAfter } = await supabase.from('devolutions').select('status').eq('id', dev.id).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  devAfter?.status === 'reversed' ? ok('Status: reversed') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex}`) : bad('Sin kardex');
  return stockOk && devAfter?.status === 'reversed' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 5. ADJUSTMENT
// ──────────────────────────────────────────────────────────────────────
async function testAdjustment() {
  head('TEST 5: ADJUSTMENT — crear ajuste + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: adj, error: e1 } = await supabase.from('inventory_adjustments').insert({
    store_id: STORE_ID, reason: 'OTHER', status: 'confirmed',
    created_by: USER_ID, notes: 'E2E',
  }).select().single();
  if (e1) return bad(`adjustment: ${e1.message}`);
  info(`Adjustment creado: ${adj.id}`);

  const { error: e2 } = await supabase.from('inventory_adjustment_items').insert([
    { adjustment_id: adj.id, product_id: p.id, expected_quantity: 10, counted_quantity: 13 }, // diff = +3
  ]);
  if (e2) return bad(`items: ${e2.message}`);

  // Aplicar el ajuste al stock
  await supabase.from('products').update({ stock_current: stockBefore + 3 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock tras ajuste: ${stockMid} (esperado ${stockBefore + 3})`);

  // Revertir
  const { data: rev, error: e3 } = await supabase.rpc('reverse_adjustment', {
    p_adjustment_id: adj.id, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e3) return bad(`reverse: ${e3.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(adj.id);
  const { data: adjAfter } = await supabase.from('inventory_adjustments').select('status').eq('id', adj.id).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  adjAfter?.status === 'reversed' ? ok('Status: reversed') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex}`) : bad('Sin kardex');
  return stockOk && adjAfter?.status === 'reversed' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 6. PRODUCTION ORDER
// ──────────────────────────────────────────────────────────────────────
async function testProductionOrder() {
  head('TEST 6: PRODUCTION ORDER — crear orden + revertir');
  const p = await getProduct(); if (!p) return bad('Sin producto');
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: order, error: e1 } = await supabase.from('production_orders').insert({
    store_id: STORE_ID,
    order_number: 'OP-E2E-' + Date.now().toString().slice(-6),
    order_type: 'production', status: 'in_progress',
    customer_name: 'Cliente E2E', budget_total: 500, budget_currency: 'CUP',
    advance_amount: 0, advance_currency: 'CUP', paid_amount: 0,
    payment_status: 'unpaid', output_quantity: 1,
    description: 'E2E test',
  }).select().single();
  if (e1) return bad(`production_order: ${e1.message}`);
  info(`Order creada: ${order.id} (${order.order_number})`);

  const { error: e2 } = await supabase.from('production_order_items').insert([
    { order_id: order.id, product_id: p.id, budgeted_qty: 5, budgeted_unit_cost: 50, actual_qty: 3, actual_unit_cost: 50, status: 'partial' },
  ]);
  if (e2) return bad(`items: ${e2.message}`);

  // Descontar insumos del stock
  await supabase.from('products').update({ stock_current: stockBefore - 3 }).eq('id', p.id);
  const stockMid = await getStock(p.id, STORE_ID);
  info(`Stock tras consumir insumos: ${stockMid} (esperado ${stockBefore - 3})`);

  // Revertir
  const { data: rev, error: e3 } = await supabase.rpc('reverse_production_order', {
    p_order_id: order.id, p_reason: 'TEST E2E', p_user_id: null,
  });
  if (e3) return bad(`reverse: ${e3.message}`);

  const stockAfter = await getStock(p.id, STORE_ID);
  const kardex = await getKardexCount(order.id);
  const { data: orderAfter } = await supabase.from('production_orders').select('status').eq('id', order.id).single();

  const stockOk = Math.abs((stockAfter - stockBefore)) < 0.001;
  stockOk ? ok(`Stock restaurado: ${stockBefore} → ${stockAfter}`) : bad(`Stock mal: ${stockBefore} → ${stockAfter}`);
  orderAfter?.status === 'reversed' ? ok('Status: reversed') : bad('Status mal');
  kardex > 0 ? ok(`Kardex: ${kardex}`) : bad('Sin kardex');
  return stockOk && orderAfter?.status === 'reversed' && kardex > 0;
}

// ──────────────────────────────────────────────────────────────────────
// 7. TRIGGER validation
// ──────────────────────────────────────────────────────────────────────
async function testTrigger() {
  head('TEST 7: TRIGGER — transición inválida');
  const { data: tx } = await supabase.from('transactions').select('id').eq('status', 'reversed').limit(1).single();
  if (!tx) return ok('Sin tx reversed para probar (skip)');
  const { error } = await supabase.from('transactions').update({ status: 'completed' }).eq('id', tx.id);
  if (error?.message.includes('ERR_INVALID_TRANSITION')) { ok('Trigger rechazó reversed→completed'); return true; }
  bad('Trigger dejó pasar transición inválida');
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  AUDITORÍA V2.3 — E2E: CREAR + REVERTIR (6 tipos + trigger)     ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  const results = {};
  results.transaction = await testTransaction();
  results.receipt = await testReceipt();
  results.transfer = await testTransfer();
  results.devolution = await testDevolution();
  results.adjustment = await testAdjustment();
  results.production_order = await testProductionOrder();
  results.trigger = await testTrigger();

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
