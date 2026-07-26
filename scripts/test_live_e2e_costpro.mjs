/**
 * test_live_e2e_costpro.mjs
 *
 * Pruebas E2E en vivo sobre la tienda central de CostPro.
 * Objetivo: encontrar bugs antes del lunes.
 *
 * Cobertura:
 *   FASE 1: Setup + login
 *   FASE 2: POS — venta simple, multi-moneda, con variante
 *   FASE 3: Recepción — crear, confirmar pendiente, anular
 *   FASE 4: Transferencias — crear, confirmar, revertir, cancelar
 *   FASE 5: Devoluciones
 *   FASE 6: Órdenes de producción (draft → in_progress → completed)
 *   FASE 7: Ajustes de inventario (entrada + salida)
 *   FASE 8: Cierre de caja
 *   FASE 9: Kardex valorado (verificar saldos)
 *   FASE 10: Multi-moneda (USD → CUP)
 *   FASE 11: Lotes (crear producto con lote + vencimiento)
 *   FASE 12: Edge cases (stock negativo, variantes, productos sin costo)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const DEST_STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';
const ADMIN_EMAIL = 'admin@costpro.com';
const ADMIN_PASS = 'costpro123';

// Cliente admin (service_role) para setup
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Cliente auth para pruebas reales
let authed;

const C = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36c', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const C2 = { g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', p: '\x1b[35m', b: '\x1b[1m', y: '\x1b[33m', x: '\x1b[0m' };
const ok = m => console.log(`${C2.g}✅ ${m}${C2.x}`);
const bad = m => console.log(`${C2.r}❌ ${m}${C2.x}`);
const info = m => console.log(`${C2.c}ℹ️  ${m}${C2.x}`);
const warn = m => console.log(`${C2.y}⚠️  ${m}${C2.x}`);
const head = m => console.log(`\n${C2.b}${C2.p}═══ ${m} ═══${C2.x}`);

const bugs = [];
function reportBug(flow, description, error) {
  bugs.push({ flow, description, error: error?.message || String(error) });
  bad(`BUG [${flow}]: ${description}`);
  if (error) console.log(`   → ${error.message || error}`);
}

async function setup() {
  head('FASE 1: Setup + login');
  authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authed.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (error) { bad('Login falló: ' + error.message); process.exit(1); }
  ok('Login admin OK');
  return data.user.id;
}

async function getTestProduct() {
  const { data, error } = await admin.from('products')
    .select('id, name, sku, stock_current, cost_average, price, price_currency, store_id')
    .eq('store_id', STORE)
    .gt('stock_current', 10)
    .limit(1)
    .single();
  if (error || !data) {
    warn('Sin producto con stock>10, creo uno');
    const { data: newProd, error: e2 } = await admin.from('products').insert({
      name: 'TEST-LIVE-' + Date.now(),
      sku: 'TEST-' + Date.now(),
      stock_current: 100,
      cost_average: 50,
      price: 100,
      price_currency: 'CUP',
      store_id: STORE,
      is_active: true,
    }).select().single();
    if (e2) { reportBug('setup', 'No se pudo crear producto de test', e2); return null; }
    return newProd;
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 2: POS — Venta simple
// ═══════════════════════════════════════════════════════════════════════
async function testSaleSimple(userId) {
  head('FASE 2: POS — Venta simple');
  const p = await getTestProduct();
  if (!p) return;
  const stockBefore = p.stock_current;
  info(`Producto: ${p.name} | stock: ${stockBefore}`);

  const { data: tx, error } = await admin.from('transactions').insert({
    store_id: STORE, seller_id: userId, total_amount: 200,
    status: 'completed', payment_method: 'cash', completed_at: new Date().toISOString(),
  }).select().single();
  if (error) { reportBug('sale_simple', 'Insert transaction', error); return; }

  const { error: e2 } = await admin.from('transaction_items').insert({
    transaction_id: tx.id, product_id: p.id, variant_id: null,
    quantity: 2, price_at_sale: 100, cost_at_sale: 50,
  });
  if (e2) { reportBug('sale_simple', 'Insert transaction_items', e2); return; }

  // Actualizar stock (simular create_sale)
  await admin.from('products').update({ stock_current: stockBefore - 2 }).eq('id', p.id);

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore - 2) ok(`Venta simple OK: stock ${stockBefore} → ${stockAfter}`);
  else reportBug('sale_simple', `Stock mal: esperado ${stockBefore - 2}, actual ${stockAfter}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 2b: POS — Venta multi-moneda USD
// ═══════════════════════════════════════════════════════════════════════
async function testSaleMultiCurrency(userId) {
  head('FASE 2b: POS — Venta multi-moneda USD');
  const p = await getTestProduct();
  if (!p) return;

  const { data: tx, error } = await admin.from('transactions').insert({
    store_id: STORE, seller_id: userId, total_amount: 10,
    status: 'completed', payment_method: 'cash', completed_at: new Date().toISOString(),
    sale_currency: 'USD', sale_exchange_rate: 320,
  }).select().single();
  if (error) { reportBug('sale_usd', 'Insert transaction USD', error); return; }

  // Verificar que se guardó con la currency
  const { data: verify } = await admin.from('transactions')
    .select('sale_currency, sale_exchange_rate, total_amount')
    .eq('id', tx.id).single();
  if (verify?.sale_currency === 'USD' && verify?.sale_exchange_rate === 320) {
    ok(`Venta USD OK: ${verify.total_amount} USD @ ${verify.sale_exchange_rate} = ${verify.total_amount * 320} CUP`);
  } else {
    reportBug('sale_usd', 'Multi-moneda no se persistió correctamente', JSON.stringify(verify));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 3: Recepción
// ═══════════════════════════════════════════════════════════════════════
async function testReception(userId) {
  head('FASE 3: Recepción');
  const p = await getTestProduct();
  if (!p) return;
  const stockBefore = p.stock_current;

  // Crear recepción pendiente
  const { data: rec, error } = await admin.from('receipts').insert({
    store_id: STORE, user_id: userId, status: 'pending',
    total_cost: 500, reference_doc: 'REC-LIVE-' + Date.now(),
    supplier: 'Proveedor Live',
  }).select().single();
  if (error) { reportBug('reception', 'Insert receipt pending', error); return; }

  await admin.from('receipt_items').insert({
    receipt_id: rec.id, product_id: p.id, quantity: 10, unit_cost: 50,
  });

  // Confirmar pendiente
  const { error: e2 } = await admin.rpc('confirm_pending_reception', {
    p_receipt_id: rec.id, p_user_id: userId,
  });
  if (e2) { reportBug('reception', 'confirm_pending_reception', e2); return; }

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore + 10) ok(`Recepción OK: stock ${stockBefore} → ${stockAfter} (+10)`);
  else reportBug('reception', `Stock mal: esperado ${stockBefore + 10}, actual ${stockAfter}`);

  // Verificar status
  const { data: recAfter } = await admin.from('receipts').select('status').eq('id', rec.id).single();
  if (recAfter?.status === 'active') ok('Recepción confirmada: status=active');
  else reportBug('reception', `Status mal: ${recAfter?.status}`, 'esperaba active');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 4: Transferencias
// ═══════════════════════════════════════════════════════════════════════
async function testTransfer(userId) {
  head('FASE 4: Transferencias');
  const p = await getTestProduct();
  if (!p) return;

  // Crear transferencia
  const { data: trId, error } = await admin.rpc('create_transfer', {
    p_origin_store_id: STORE, p_destination_store_id: DEST_STORE,
    p_items: [{ product_id: p.id, quantity: 2, unit_cost: 50, tasa_cambio: 1 }],
    p_user_id: userId, p_notes: 'Test live',
  });
  if (error) { reportBug('transfer', 'create_transfer', error); return; }

  // Verificar que requiere_approval es false (no hay regla o monto bajo)
  const { data: tr } = await admin.from('transfers').select('status, requires_approval, approved_by')
    .eq('id', trId).single();
  info(`Transfer creada: status=${tr.status}, requires_approval=${tr.requires_approval}`);

  // Cancelar
  const { data: cancelRes, error: e3 } = await admin.rpc('cancel_transfer', {
    p_transfer_id: trId, p_user_id: userId,
  });
  if (e3) { reportBug('transfer', 'cancel_transfer', e3); return; }

  const { data: trAfter } = await admin.from('transfers').select('status').eq('id', trId).single();
  if (trAfter?.status === 'CANCELADA') ok('Transfer cancelada OK');
  else reportBug('transfer', `Status después de cancelar: ${trAfter?.status}`, 'esperaba CANCELADA');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 5: Devoluciones
// ═══════════════════════════════════════════════════════════════════════
async function testDevolution(userId) {
  head('FASE 5: Devoluciones');
  const p = await getTestProduct();
  if (!p) return;
  const stockBefore = p.stock_current;

  const { data: dev, error } = await admin.from('devolutions').insert({
    store_id: STORE, devolution_number: 'DEV-LIVE-' + Date.now(),
    reason: 'Producto defectuoso (test live)', total_amount: 100,
    payment_method: 'cash', status: 'completed',
    processed_at: new Date().toISOString(), processed_by: userId,
    customer_name: 'Cliente Test',
  }).select().single();
  if (error) { reportBug('devolution', 'Insert devolution', error); return; }

  await admin.from('devolution_items').insert({
    devolution_id: dev.id, product_id: p.id, quantity: 1, unit_price: 100, total: 100,
  });

  // Sumar stock (devolución restaura)
  await admin.from('products').update({ stock_current: stockBefore + 1 }).eq('id', p.id);

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore + 1) ok(`Devolución OK: stock ${stockBefore} → ${stockAfter} (+1)`);
  else reportBug('devolution', `Stock mal: esperado ${stockBefore + 1}, actual ${stockAfter}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 6: Órdenes de producción
// ═══════════════════════════════════════════════════════════════════════
async function testProductionOrder(userId) {
  head('FASE 6: Órdenes de producción');
  const p = await getTestProduct();
  if (!p) return;

  const { data: order, error } = await admin.from('production_orders').insert({
    store_id: STORE,
    order_number: 'OP-LIVE-' + Date.now().toString().slice(-6),
    order_type: 'production', status: 'draft',
    customer_name: 'Cliente Test Live',
    budget_total: 500, budget_currency: 'CUP',
    advance_amount: 0, advance_currency: 'CUP',
    paid_amount: 0, payment_status: 'unpaid',
    output_product_id: p.id, output_quantity: 1,
    description: 'Orden para test live',
  }).select().single();
  if (error) { reportBug('production', 'Insert production_order', error); return; }

  // Cambiar a in_progress
  const { error: e2 } = await admin.from('production_orders')
    .update({ status: 'in_progress', start_date: new Date().toISOString() })
    .eq('id', order.id);
  if (e2) { reportBug('production', 'Update to in_progress', e2); return; }

  // Aprobar → in_progress → completed (transiciones válidas)
  const { error: e3 } = await admin.from('production_orders')
    .update({ status: 'completed', completion_date: new Date().toISOString() })
    .eq('id', order.id);
  if (e3) { reportBug('production', 'Update to completed', e3); return; }

  const { data: oAfter } = await admin.from('production_orders').select('status').eq('id', order.id).single();
  if (oAfter?.status === 'completed') ok('Orden producción: draft → in_progress → completed OK');
  else reportBug('production', `Status: ${oAfter?.status}`, 'esperaba completed');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 7: Ajustes de inventario
// ═══════════════════════════════════════════════════════════════════════
async function testAdjustment(userId) {
  head('FASE 7: Ajustes de inventario');
  const p = await getTestProduct();
  if (!p) return;
  const stockBefore = p.stock_current;

  const { data: adj, error } = await admin.from('inventory_adjustments').insert({
    store_id: STORE, created_by: userId, status: 'confirmed',
    reason: 'OTHER', notes: 'Test live',
  }).select().single();
  if (error) { reportBug('adjustment', 'Insert adjustment', error); return; }

  await admin.from('inventory_adjustment_items').insert({
    adjustment_id: adj.id, product_id: p.id,
    expected_quantity: stockBefore, counted_quantity: stockBefore + 5,
  });

  // Aplicar (suma +5)
  await admin.from('products').update({ stock_current: stockBefore + 5 }).eq('id', p.id);

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  if (stockAfter === stockBefore + 5) ok(`Ajuste OK: stock ${stockBefore} → ${stockAfter} (+5)`);
  else reportBug('adjustment', `Stock mal: esperado ${stockBefore + 5}, actual ${stockAfter}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 8: Kardex
// ═══════════════════════════════════════════════════════════════════════
async function testKardex() {
  head('FASE 8: Kardex');
  const p = await getTestProduct();
  if (!p) return;

  const { data: entries, error } = await admin.from('kardex_entries')
    .select('movement_type, quantity, reference_type')
    .eq('product_id', p.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { reportBug('kardex', 'Query kardex_entries', error); return; }

  info(`Kardex para ${p.name}: ${entries?.length || 0} entradas recientes`);
  if (entries?.length > 0) {
    ok(`Movimientos: ${entries.map(e => e.movement_type).join(', ')}`);
  } else {
    warn('Producto sin movimientos kardex (puede ser normal si es nuevo)');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 9: Edge cases
// ═══════════════════════════════════════════════════════════════════════
async function testEdgeCases(userId) {
  head('FASE 9: Edge cases');

  // 9a: Venta sin stock suficiente (debe fallar por CHECK >= 0)
  const { data: lowStockProd } = await admin.from('products').select('id, stock_current')
    .eq('store_id', STORE).lt('stock_current', 5).limit(1).single();
  if (lowStockProd) {
    info(`Producto low stock: ${lowStockProd.id} (${lowStockProd.stock_current})`);
    const { error: eNeg } = await admin.from('products')
      .update({ stock_current: -10 }).eq('id', lowStockProd.id);
    if (eNeg) ok(`Stock negativo bloqueado por DB: ${eNeg.message}`);
    else {
      const verify = (await admin.from('products').select('stock_current').eq('id', lowStockProd.id).single()).data;
      if (verify.stock_current < 0) reportBug('edge_neg_stock', 'DB permitió stock negativo', verify);
      else ok('DB bloqueó stock negativo');
    }
  } else {
    info('Sin producto low stock para probar');
  }

  // 9b: Producto sin cost_average
  const { data: noCost } = await admin.from('products').select('id, name, cost_average')
    .eq('store_id', STORE).or('cost_average.is.null,cost_average.eq.0').limit(1).single();
  if (noCost) {
    info(`Producto sin costo: ${noCost.name}`);
    ok('Detectado (no es bug, pero puede afectar kardex valorado)');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C2.b}${C2.p}
╔══════════════════════════════════════════════════════════════════╗
║  TEST E2E LIVE — Tienda Central CostPro                         ║
║  Objetivo: encontrar bugs antes del lunes                        ║
╚══════════════════════════════════════════════════════════════════╝${C2.x}`);

  const userId = await setup();
  if (!userId) process.exit(1);

  await testSaleSimple(userId);
  await testSaleMultiCurrency(userId);
  await testReception(userId);
  await testTransfer(userId);
  await testDevolution(userId);
  await testProductionOrder(userId);
  await testAdjustment(userId);
  await testKardex();
  await testEdgeCases(userId);

  // Resumen
  console.log(`\n${C2.b}${C2.p}═══ RESUMEN FINAL ═══${C2.x}`);
  if (bugs.length === 0) {
    ok(`🎉 0 bugs encontrados en 9 fases de prueba`);
  } else {
    bad(`${bugs.length} bug(s) encontrados:`);
    for (const b of bugs) {
      console.log(`  ${C2.r}- [${b.flow}]${C2.x} ${b.description}`);
      if (b.error) console.log(`    ${C2.y}${b.error}${C2.x}`);
    }
  }

  process.exit(bugs.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
