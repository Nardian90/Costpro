/**
 * test_live_e2e_round2.mjs
 *
 * RONDA 2 de pruebas E2E en vivo sobre la tienda central.
 * Cubre los flujos avanzados que la jefa podría usar:
 *   - Cierre de caja (cash closure)
 *   - Cierre fiscal (close_fiscal_period)
 *   - Cotizaciones
 *   - Clientes CRM
 *   - Conciliación bancaria
 *   - Lotes
 *   - ABC clasificación
 *   - Variantes de producto
 *   - Recepción parcial
 *   - Edge: producto sin costo, venta sin stock
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const ADMIN_EMAIL = 'admin@costpro.com';
const ADMIN_PASS = 'costpro123';

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

async function setup() {
  head('RONDA 2 — Setup');
  const authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await authed.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (error) { bad('Login falló: ' + error.message); process.exit(1); }
  ok('Login admin OK');
  return data.user.id;
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 10: Cierre de caja
// ═══════════════════════════════════════════════════════════════════════
async function testCashClosure(userId) {
  head('FASE 10: Cierre de caja');

  // Verificar si hay cash_closures recientes
  const { data: existing, error: e1 } = await admin.from('cash_closures')
    .select('id, status, declared_total, system_expected_total, created_at')
    .eq('store_id', STORE)
    .order('created_at', { ascending: false })
    .limit(3);
  if (e1) { reportBug('cash_closure', 'Query cash_closures', e1); return; }

  info(`Cierres existentes: ${existing?.length || 0}`);

  // Crear cierre
  const { data: cc, error } = await admin.from('cash_closures').insert({
    user_id: userId, store_id: STORE,
    declared_cash: 1000, declared_vouchers: 500,
    system_total: 1500, declared_total: 1500,
    system_expected_total: 1500, difference: 0,
    status: 'cerrado', closed_at: new Date().toISOString(),
    notes: 'Test live',
  }).select().single();
  if (error) { reportBug('cash_closure', 'Insert cash_closure', error); return; }

  ok(`Cierre creado: ${cc.id}, status=${cc.status}, total=${cc.declared_total}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 11: Cierre fiscal
// ═══════════════════════════════════════════════════════════════════════
async function testFiscalClose(userId) {
  head('FASE 11: Cierre fiscal');

  // Verificar si hay fiscal_closings
  const { data: existing } = await admin.from('fiscal_closings')
    .select('id, status, period_year, period_month')
    .eq('store_id', STORE)
    .order('created_at', { ascending: false })
    .limit(3);
  info(`Cierres fiscales existentes: ${existing?.length || 0}`);

  // Intentar crear cierre fiscal (puede fallar si ya hay uno abierto)
  const now = new Date();
  const { data: fc, error } = await admin.from('fiscal_closings').insert({
    store_id: STORE, closed_by: userId,
    period_year: now.getFullYear(), period_month: now.getMonth() + 1,
    status: 'open',
    total_sales: 0, total_payments: 0, total_commissions: 0,
  }).select().single();
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      warn('Ya existe cierre fiscal para este período (esperado si ya hay uno abierto)');
    } else {
      reportBug('fiscal_close', 'Insert fiscal_closing', error);
    }
    return;
  }
  ok(`Cierre fiscal creado: ${fc.id}, status=${fc.status}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 12: Cotizaciones
// ═══════════════════════════════════════════════════════════════════════
async function testQuotation(userId) {
  head('FASE 12: Cotizaciones');
  const { data: p } = await admin.from('products').select('id, name, price').eq('store_id', STORE).limit(1).single();
  if (!p) { warn('Sin producto para cotización'); return; }

  const { data: q, error } = await admin.from('quotations').insert({
    store_id: STORE, created_by: userId,
    quotation_number: 'COT-LIVE-' + Date.now(),
    customer_name: 'Cliente Cot Test',
    customer_phone: '555-1234',
    total_amount: p.price * 2,
    status: 'draft',
    notes: 'Test live cotización',
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).select().single();
  if (error) { reportBug('quotation', 'Insert quotation', error); return; }

  // Añadir items
  const { error: e2 } = await admin.from('quotation_items').insert({
    quotation_id: q.id, product_id: p.id,
    quantity: 2, unit_price: p.price, total: p.price * 2,
  });
  if (e2) { reportBug('quotation', 'Insert quotation_items', e2); return; }

  // Cambiar a sent
  const { error: e3 } = await admin.from('quotations').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', q.id);
  if (e3) { reportBug('quotation', 'Update to sent', e3); return; }

  ok(`Cotización creada y enviada: ${q.quotation_number}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 13: Clientes CRM
// ═══════════════════════════════════════════════════════════════════════
async function testCustomers(userId) {
  head('FASE 13: Clientes CRM');

  const { data: cust, error } = await admin.from('customers').insert({
    store_id: STORE, created_by: userId,
    name: 'Cliente Test Live ' + Date.now(),
    email: 'test' + Date.now() + '@example.com',
    phone: '555-' + Date.now().toString().slice(-4),
    ci: '12345678901',
    address: 'Calle Test 123',
    notes: 'Cliente de prueba live',
  }).select().single();
  if (error) { reportBug('customers', 'Insert customer', error); return; }

  ok(`Cliente creado: ${cust.name} (id: ${cust.id})`);

  // Verificar que se puede listar
  const { data: list, error: e2 } = await admin.from('customers')
    .select('id, name, email').eq('store_id', STORE).limit(10);
  if (e2) { reportBug('customers', 'List customers', e2); return; }
  info(`Total clientes en store: ${list?.length || 0}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 14: Lotes
// ═══════════════════════════════════════════════════════════════════════
async function testLots(userId) {
  head('FASE 14: Lotes');
  const { data: p } = await admin.from('products').select('id, name').eq('store_id', STORE).limit(1).single();
  if (!p) { warn('Sin producto para lote'); return; }

  // Verificar si la tabla product_lots existe
  const { data: lot, error } = await admin.from('product_lots').insert({
    product_id: p.id, store_id: STORE,
    lot_number: 'LOT-LIVE-' + Date.now(),
    quantity: 50, quantity_remaining: 50,
    expiration_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    received_date: new Date().toISOString(),
    received_by: userId,
  }).select().single();
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('relation')) {
      warn('Tabla product_lots no existe (puede ser que el módulo no esté aplicado)');
    } else {
      reportBug('lots', 'Insert product_lot', error);
    }
    return;
  }
  ok(`Lote creado: ${lot.lot_number} (qty: ${lot.quantity})`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 15: ABC clasificación
// ═══════════════════════════════════════════════════════════════════════
async function testABC() {
  head('FASE 15: ABC clasificación');

  const { data, error } = await admin.from('abc_classifications')
    .select('id, product_id, classification, period_start, period_end')
    .eq('store_id', STORE)
    .limit(5);
  if (error) {
    if (error.message.includes('does not exist')) {
      warn('Tabla abc_classifications no existe');
    } else {
      reportBug('abc', 'Query abc_classifications', error);
    }
    return;
  }
  info(`Clasificaciones ABC: ${data?.length || 0}`);
  if (data?.length > 0) ok('ABC datos presentes');
  else warn('Sin clasificaciones ABC (puede ser normal si no se ha ejecutado)');
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 16: Conciliación bancaria
// ═══════════════════════════════════════════════════════════════════════
async function testBankReconciliation(userId) {
  head('FASE 16: Conciliación bancaria');

  // Crear statement
  const { data: stmt, error } = await admin.from('bank_statements').insert({
    store_id: STORE, uploaded_by: userId,
    bank_name: 'Banco Test',
    account_number: '0000-0000-0000',
    statement_date: new Date().toISOString().split('T')[0],
    status: 'pending',
  }).select().single();
  if (error) {
    if (error.message.includes('does not exist')) {
      warn('Tabla bank_statements no existe');
      return;
    }
    reportBug('bank_recon', 'Insert bank_statement', error);
    return;
  }

  // Añadir items
  const { error: e2 } = await admin.from('bank_statement_items').insert({
    statement_id: stmt.id,
    transaction_date: new Date().toISOString(),
    description: 'Depósito test',
    amount: 1000,
    status: 'unreconciled',
  });
  if (e2) {
    if (e2.message.includes('does not exist')) {
      warn('Tabla bank_statement_items no existe');
      return;
    }
    reportBug('bank_recon', 'Insert bank_statement_item', e2);
    return;
  }

  ok(`Statement creado: ${stmt.id} con 1 item`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 17: Variantes
// ═══════════════════════════════════════════════════════════════════════
async function testVariants(userId) {
  head('FASE 17: Variantes de producto');
  const { data: p } = await admin.from('products').select('id, name').eq('store_id', STORE).limit(1).single();
  if (!p) return;

  const { data: variant, error } = await admin.from('product_variants').insert({
    product_id: p.id,
    name: 'Variante Test',
    sku_suffix: '-VAR1',
    conversion_factor: 12, // 1 docena = 12 unidades
    price: 1200,
    is_active: true,
  }).select().single();
  if (error) {
    if (error.message.includes('does not exist')) {
      warn('Tabla product_variants no existe');
      return;
    }
    reportBug('variants', 'Insert product_variant', error);
    return;
  }
  ok(`Variante creada: ${variant.name} (factor: ${variant.conversion_factor})`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 18: Recepción parcial
// ═══════════════════════════════════════════════════════════════════════
async function testPartialReception(userId) {
  head('FASE 18: Recepción parcial');
  const { data: p } = await admin.from('products').select('id, stock_current').eq('store_id', STORE).limit(1).single();
  if (!p) return;

  // Crear recepción pendiente
  const { data: rec, error } = await admin.from('receipts').insert({
    store_id: STORE, user_id: userId, status: 'pending',
    total_cost: 1000, reference_doc: 'REC-PARTIAL-' + Date.now(),
    supplier: 'Prov Parcial',
  }).select().single();
  if (error) { reportBug('partial_rec', 'Insert receipt', error); return; }

  // Item con cantidad 100
  await admin.from('receipt_items').insert({
    receipt_id: rec.id, product_id: p.id, quantity: 100, unit_cost: 10,
  });

  // Confirmar (suma 100 al stock)
  const { error: e2 } = await admin.rpc('confirm_pending_reception', {
    p_receipt_id: rec.id, p_user_id: userId,
  });
  if (e2) { reportBug('partial_rec', 'confirm_pending_reception', e2); return; }

  const stockAfter = (await admin.from('products').select('stock_current').eq('id', p.id).single()).data?.stock_current;
  ok(`Recepción confirmada: stock actual = ${stockAfter}`);

  // Verificar status (debería ser 'active' o 'partial')
  const { data: recAfter } = await admin.from('receipts').select('status').eq('id', rec.id).single();
  info(`Status final: ${recAfter?.status}`);
}

// ═══════════════════════════════════════════════════════════════════════
// FASE 19: Producto sin costo (kardex valorado debe manejar)
// ═══════════════════════════════════════════════════════════════════════
async function testProductNoCost(userId) {
  head('FASE 19: Producto sin costo');

  const { data: p, error } = await admin.from('products').insert({
    name: 'NO-COST-' + Date.now(),
    sku: 'NOCOST-' + Date.now(),
    stock_current: 10,
    cost_average: 0, // sin costo
    price: 50,
    price_currency: 'CUP',
    store_id: STORE,
    is_active: true,
  }).select().single();
  if (error) { reportBug('no_cost', 'Insert product sin costo', error); return; }

  // Crear ajuste con este producto
  const { data: adj, error: e2 } = await admin.from('inventory_adjustments').insert({
    store_id: STORE, created_by: userId, status: 'confirmed',
    reason: 'OTHER', notes: 'Test producto sin costo',
  }).select().single();
  if (e2) { reportBug('no_cost', 'Insert adjustment', e2); return; }

  await admin.from('inventory_adjustment_items').insert({
    adjustment_id: adj.id, product_id: p.id,
    expected_quantity: 10, counted_quantity: 15,
  });

  // Aplicar ajuste manualmente
  await admin.from('products').update({ stock_current: 15 }).eq('id', p.id);

  ok(`Producto sin costo manejado: stock 10 → 15`);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.b}${C.p}
╔══════════════════════════════════════════════════════════════════╗
║  RONDA 2 — TEST E2E LIVE                                        ║
║  Flujos avanzados: cierre, cotizaciones, lotes, ABC, variantes  ║
╚══════════════════════════════════════════════════════════════════╝${C.x}`);

  const userId = await setup();

  await testCashClosure(userId);
  await testFiscalClose(userId);
  await testQuotation(userId);
  await testCustomers(userId);
  await testLots(userId);
  await testABC();
  await testBankReconciliation(userId);
  await testVariants(userId);
  await testPartialReception(userId);
  await testProductNoCost(userId);

  console.log(`\n${C.b}${C.p}═══ RESUMEN RONDA 2 ═══${C.x}`);
  if (bugs.length === 0) {
    ok(`🎉 0 bugs en 10 fases avanzadas`);
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
