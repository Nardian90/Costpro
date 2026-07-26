/**
 * seed_reverse_test_data.mjs
 *
 * Crea datos de prueba para los 6 tipos de reverse_* que faltan:
 * - Receipt con items
 * - Transfer CONFIRMADA
 * - Inventory adjustment con items
 * - Production order con insumos consumidos (actual_qty > 0)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const STORE_ID = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const USER_ID = '8c90b7b8-3e6a-449e-84e0-ac19ff6c3945'; // adrianpompasantana

async function main() {
  // Buscar un producto con stock en el store central
  const { data: products } = await supabase
    .from('products')
    .select('id, name, stock_current, cost_average, store_id')
    .eq('store_id', STORE_ID)
    .gt('stock_current', 5)
    .limit(5);
  if (!products || products.length < 3) {
    console.error('❌ Se necesitan al menos 3 productos con stock > 5');
    process.exit(1);
  }
  const [p1, p2, p3] = products;
  console.log(`✅ Productos: ${p1.name}(${p1.stock_current}), ${p2.name}(${p2.stock_current}), ${p3.name}(${p3.stock_current})`);

  // 1. Crear RECEIPT con items (insert directo)
  console.log('\n📦 Creando receipt con items...');
  const { data: rec, error: recErr } = await supabase
    .from('receipts')
    .insert({
      store_id: STORE_ID,
      user_id: USER_ID,
      status: 'active',
      total_cost: 1000,
      reference_doc: 'REC-TEST-V23-' + Date.now().toString().slice(-6),
      supplier: 'Proveedor Test V2.3',
      notes: 'Receipt test V2.3',
      payment_status: 'paid',
      paid_amount: 1000,
    })
    .select()
    .single();
  if (recErr) console.error('Receipt error:', recErr.message);
  else {
    console.log('✅ Receipt creado:', rec.id);
    const { error: recItemErr } = await supabase
      .from('receipt_items')
      .insert([
        { receipt_id: rec.id, product_id: p1.id, quantity: 10, unit_cost: 50 },
        { receipt_id: rec.id, product_id: p2.id, quantity: 5, unit_cost: 100 },
      ]);
    if (recItemErr) console.error('Receipt items error:', recItemErr.message);
    else {
      console.log('✅ Receipt items añadidos');
      // Sumar al stock lo recibido
      await supabase.from('products').update({ stock_current: p1.stock_current + 10 }).eq('id', p1.id);
      await supabase.from('products').update({ stock_current: p2.stock_current + 5 }).eq('id', p2.id);
      console.log('✅ Stock actualizado (p1+10, p2+5)');
    }
  }

  // 2. Crear TRANSFER + confirmarla
  console.log('\n📦 Creando transferencia PENDIENTE...');
  // Necesitamos otro store
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')
    .neq('id', STORE_ID)
    .limit(1);
  let destStoreId;
  if (stores && stores.length > 0) {
    destStoreId = stores[0].id;
    console.log(`✅ Store destino: ${stores[0].name}`);
  } else {
    console.log('⚠ No hay otro store — usando el mismo (transf interna)');
    destStoreId = STORE_ID;
  }

  // Crear transfer via API directa (insert)
  const { data: tr, error: trErr } = await supabase
    .from('transfers')
    .insert({
      origin_store_id: STORE_ID,
      destination_store_id: destStoreId,
      created_by: USER_ID,
      status: 'CONFIRMADA',  // crear ya confirmada
      notes: 'Transfer test V2.3 CONFIRMADA',
    })
    .select()
    .single();
  if (trErr) console.error('Transfer insert error:', trErr.message);
  else {
    console.log('✅ Transfer CONFIRMADA creada:', tr.id);
    const { error: trItemErr } = await supabase
      .from('transfer_items')
      .insert([
        { transfer_id: tr.id, product_id: p1.id, quantity: 2, unit_cost: 50 },
        { transfer_id: tr.id, product_id: p3.id, quantity: 1, unit_cost: 100 },
      ]);
    if (trItemErr) console.error('Transfer items error:', trItemErr.message);
    else {
      console.log('✅ Transfer items añadidos');
      // Aplicar movimiento de stock (origen -qty, destino +qty)
      const stockP1Before = (await supabase.from('products').select('stock_current').eq('id', p1.id).eq('store_id', STORE_ID).single()).data?.stock_current || 0;
      const stockP3Before = (await supabase.from('products').select('stock_current').eq('id', p3.id).eq('store_id', STORE_ID).single()).data?.stock_current || 0;
      await supabase.from('products').update({ stock_current: stockP1Before - 2 }).eq('id', p1.id).eq('store_id', STORE_ID);
      await supabase.from('products').update({ stock_current: stockP3Before - 1 }).eq('id', p3.id).eq('store_id', STORE_ID);
      console.log('✅ Stock descontado del origen (p1-2, p3-1)');
    }
  }

  // 3. Crear INVENTORY ADJUSTMENT con items
  console.log('\n📦 Creando inventory adjustment...');
  const { data: adj, error: adjErr } = await supabase
    .from('inventory_adjustments')
    .insert({
      store_id: STORE_ID,
      reason: 'OTHER',  // enum válido
      status: 'confirmed',
      created_by: USER_ID,
      notes: 'Ajuste test V2.3',
    })
    .select()
    .single();
  if (adjErr) console.error('Adjustment error:', adjErr.message);
  else {
    console.log('✅ Adjustment creado:', adj.id);
    const { error: adjItemErr } = await supabase
      .from('inventory_adjustment_items')
      .insert([
        { adjustment_id: adj.id, product_id: p1.id, expected_quantity: 10, counted_quantity: 13 }, // diff = +3
        { adjustment_id: adj.id, product_id: p2.id, expected_quantity: 10, counted_quantity: 8 },  // diff = -2
      ]);
    if (adjItemErr) console.error('Adj items error:', adjItemErr.message);
    else {
      console.log('✅ Adj items añadidos');
      // Aplicar el ajuste manualmente (sumar al stock)
      await supabase.from('products').update({ stock_current: p1.stock_current + 3 }).eq('id', p1.id);
      await supabase.from('products').update({ stock_current: p2.stock_current - 2 }).eq('id', p2.id);
      console.log('✅ Stock actualizado (p1+3, p2-2)');
    }
  }

  // 4. Crear PRODUCTION ORDER con insumos consumidos (actual_qty > 0)
  console.log('\n📦 Creando production order con insumos...');
  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      store_id: STORE_ID,
      order_number: 'OP-TEST-V23-' + Date.now().toString().slice(-6),
      order_type: 'production',
      status: 'in_progress',
      customer_name: 'Cliente Test',
      budget_total: 500,
      budget_currency: 'CUP',
      advance_amount: 0,
      advance_currency: 'CUP',
      paid_amount: 0,
      payment_status: 'unpaid',
      output_product_id: p3.id,
      output_quantity: 1,
      description: 'Orden test V2.3 para reverse_production_order',
    })
    .select()
    .single();
  if (orderErr) console.error('Production order error:', orderErr.message);
  else {
    console.log('✅ Production order creada:', order.id, order.order_number);
    // Añadir items con actual_qty > 0 (simular que ya se consumieron)
    const { error: poItemErr } = await supabase
      .from('production_order_items')
      .insert([
        { order_id: order.id, product_id: p1.id, budgeted_qty: 5, budgeted_unit_cost: 50, actual_qty: 3, actual_unit_cost: 50, status: 'partial' },
        { order_id: order.id, product_id: p2.id, budgeted_qty: 2, budgeted_unit_cost: 100, actual_qty: 2, actual_unit_cost: 100, status: 'completed' },
      ]);
    if (poItemErr) console.error('PO items error:', poItemErr.message);
    else {
      console.log('✅ PO items añadidos (actual_qty > 0)');
      // Descontar del stock los insumos "consumidos"
      const stockP1Now = (await supabase.from('products').select('stock_current').eq('id', p1.id).single()).data?.stock_current;
      const stockP2Now = (await supabase.from('products').select('stock_current').eq('id', p2.id).single()).data?.stock_current;
      await supabase.from('products').update({ stock_current: stockP1Now - 3 }).eq('id', p1.id);
      await supabase.from('products').update({ stock_current: stockP2Now - 2 }).eq('id', p2.id);
      console.log(`✅ Stock descontado (p1-3=${stockP1Now - 3}, p2-2=${stockP2Now - 2})`);
    }
  }

  console.log('\n✅ Datos de prueba creados. Ahora re-ejecuta test_reverse_all_live.mjs');
}

main().catch(e => { console.error(e); process.exit(1); });
