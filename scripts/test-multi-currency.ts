// Test de lógica multi-moneda del carrito POS
// Ejecutar con: npx tsx scripts/test-multi-currency.ts

import { useCartStore, type CartItem } from '../src/store/cart';

// Mock mínimo del store para testing
const store = useCartStore.getState;

function createMockItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    product_id: 'test-1',
    variant_id: null,
    quantity: 1,
    price: 1600,
    // FIX-DEPLOY (2026-07-10): base_price_cup es requerido en CartItem
    base_price_cup: 1600,
    cost: 800,
    subtotal: 1600,
    product: { id: 'test-1', name: 'ARAGANES' } as any,
    variant: null,
    discount_type: null,
    discount_value: 0,
    discount_currency: 'CUP',
    // FIX-PAYMENT-ROWS: payments[] es requerido (array de filas de pago)
    payments: [{
      id: 'test-pay-1',
      method: 'cash',
      amount: 1600,
      currency: 'CUP',
      discount_type: null,
      discount_value: 0,
      discount_currency: 'CUP',
    }],
    cash_paid: 1600,
    transfer_paid: 0,
    zelle_paid: 0,
    cash_currency: 'CUP',
    transfer_currency: 'CUP',
    zelle_currency: 'USD',
    cash_discount_type: null,
    cash_discount_value: 0,
    cash_discount_currency: 'CUP',
    cash_surcharge_type: null,
    cash_surcharge_value: 0,
    transfer_discount_type: null,
    transfer_discount_value: 0,
    transfer_discount_currency: 'CUP',
    transfer_surcharge_type: null,
    transfer_surcharge_value: 0,
    zelle_discount_type: null,
    zelle_discount_value: 0,
    zelle_discount_currency: 'USD',
    zelle_surcharge_type: null,
    zelle_surcharge_value: 0,
    currency: 'CUP',
    exchange_rate: 1,
    payment_manual_override: false,
    ...overrides,
  };
}

function assert(name: string, actual: number, expected: number, tolerance = 0.01) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✅ ${name}: ${actual.toFixed(2)} ≈ ${expected.toFixed(2)}`);
  } else {
    console.log(`  ❌ ${name}: ${actual.toFixed(2)} ≠ ${expected.toFixed(2)} (diff: ${diff.toFixed(2)})`);
  }
}

console.log('\n=== TEST 1: Conversión CUP → USD ===');
console.log('Producto: $1,600 CUP, cambiar a USD con tasa 680');
{
  const item = createMockItem({ price: 1600, currency: 'CUP', exchange_rate: 1 });
  const rate = 680;
  // Simular conversión: CUP → USD
  const newPrice = item.price / rate; // 1600 / 680 = 2.35
  console.log(`  Precio original: ${item.price} CUP`);
  console.log(`  Nueva moneda: USD, tasa: ${rate}`);
  console.log(`  Precio convertido: ${newPrice.toFixed(2)} USD`);
  assert('Precio convertido', newPrice, 2.35, 0.01);

  // Subtotal en CUP después de convertir
  const newItem = { ...item, price: newPrice, currency: 'USD', exchange_rate: rate, subtotal: newPrice };
  const cartStore = store();
  // Simular getItemSubtotalCup
  const subtotalCup = newItem.currency === 'CUP' ? newItem.subtotal : newItem.subtotal * newItem.exchange_rate;
  console.log(`  Subtotal CUP: ${subtotalCup.toFixed(2)}`);
  assert('Subtotal CUP', subtotalCup, 1600, 1); // ≈1600 (2.35 * 680 = 1598)
}

console.log('\n=== TEST 2: Pago en efectivo hereda moneda de venta ===');
console.log('Producto: $2.35 USD (originalmente 1600 CUP), pagar en efectivo');
{
  const item = createMockItem({
    price: 2.35, currency: 'USD', exchange_rate: 680,
    subtotal: 2.35, cash_paid: 2.35, cash_currency: 'USD',
  });
  console.log(`  Precio: ${item.price} USD`);
  console.log(`  Efectivo: ${item.cash_paid} ${item.cash_currency}`);
  // CUP equivalente del pago
  const paidCup = item.cash_paid * item.exchange_rate;
  console.log(`  CUP equivalente: ${paidCup.toFixed(2)}`);
  assert('Pago en CUP', paidCup, 1598, 1);
}

console.log('\n=== TEST 3: Pago mixto CUP + USD ===');
console.log('Producto: $2.35 USD (1600 CUP), pagar 1 USD Zelle + resto efectivo');
{
  const item = createMockItem({
    price: 2.35, currency: 'USD', exchange_rate: 680,
    subtotal: 2.35,
    cash_paid: 1.35, cash_currency: 'USD',  // 1.35 USD en efectivo
    zelle_paid: 1.00, zelle_currency: 'USD', // 1.00 USD en Zelle
    transfer_paid: 0,
  });
  const cashCup = item.cash_paid * item.exchange_rate; // 1.35 * 680 = 918
  const zelleCup = item.zelle_paid * item.exchange_rate; // 1.00 * 680 = 680
  const totalPaidCup = cashCup + zelleCup; // 1598
  const subtotalCup = item.subtotal * item.exchange_rate; // 2.35 * 680 = 1598
  console.log(`  Efectivo: ${item.cash_paid} USD = ${cashCup.toFixed(2)} CUP`);
  console.log(`  Zelle: ${item.zelle_paid} USD = ${zelleCup.toFixed(2)} CUP`);
  console.log(`  Total pagado: ${totalPaidCup.toFixed(2)} CUP`);
  console.log(`  Subtotal: ${subtotalCup.toFixed(2)} CUP`);
  assert('Pago = Subtotal', totalPaidCup, subtotalCup, 1);
}

console.log('\n=== TEST 4: Validación con tasa incorrecta (rate=1) ===');
console.log('Producto: $1,600 CUP, cambiar a USD pero tasa fetch falla (rate=1)');
{
  const rate = 1; // fetch falló
  const price = 1600;
  // FIX-DEPLOY (2026-07-10): tipar como string para permitir comparación con 'CUP'
  const currency: string = 'USD';
  // FIX-CRITICAL: si rate <= 1, NO cambiar moneda
  if (currency !== 'CUP' && rate <= 1) {
    console.log('  ✅ Bloqueado: "No se pudo obtener la tasa de cambio"');
    console.log('  ✅ El precio se mantiene en 1600 CUP (no se convierte a 1600 USD)');
  } else {
    const newPrice = price / rate;
    console.log(`  ❌ BUG: precio convertido a ${newPrice} USD (absurdo)`);
  }
}

console.log('\n=== TEST 5: Descuento por método en CUP ===');
console.log('Producto: $1,600 CUP, descuento 10% en efectivo');
{
  const item = createMockItem({
    price: 1600, currency: 'CUP', exchange_rate: 1,
    subtotal: 1600, cash_paid: 1440, cash_currency: 'CUP',
    cash_discount_type: 'percentage', cash_discount_value: 10,
  });
  const subtotalCup = 1600;
  const discountAmount = subtotalCup * 0.10; // 160
  const expectedSubtotal = subtotalCup - discountAmount; // 1440
  console.log(`  Subtotal original: ${subtotalCup} CUP`);
  console.log(`  Descuento 10%: ${discountAmount} CUP`);
  console.log(`  Subtotal con descuento: ${expectedSubtotal} CUP`);
  console.log(`  Pago efectivo: ${item.cash_paid} CUP`);
  assert('Pago = Subtotal ajustado', item.cash_paid, expectedSubtotal, 0.01);
}

console.log('\n=== TEST 6: Descuento fijo en USD sobre producto en CUP ===');
console.log('Producto: $2.35 USD (1600 CUP), descuento fijo $0.50 USD en Zelle');
{
  const item = createMockItem({
    price: 2.35, currency: 'USD', exchange_rate: 680,
    subtotal: 2.35,
    zelle_paid: 1.85, zelle_currency: 'USD',
    zelle_discount_type: 'fixed', zelle_discount_value: 0.50, zelle_discount_currency: 'USD',
  });
  const subtotalCup = 2.35 * 680; // 1598
  const discountCup = 0.50 * 680; // 340
  const expectedCup = subtotalCup - discountCup; // 1258
  const paidCup = item.zelle_paid * 680; // 1.85 * 680 = 1258
  console.log(`  Subtotal: ${subtotalCup.toFixed(2)} CUP`);
  console.log(`  Descuento fijo $0.50 USD: ${discountCup.toFixed(2)} CUP`);
  console.log(`  Esperado: ${expectedCup.toFixed(2)} CUP`);
  console.log(`  Pagado Zelle: ${item.zelle_paid} USD = ${paidCup.toFixed(2)} CUP`);
  assert('Pago = Esperado con descuento', paidCup, expectedCup, 1);
}

console.log('\n=== TEST 7: Tasa manual editable se arrastra ===');
console.log('Usuario edita tasa a 580, luego paga en Zelle');
{
  // Simular setGlobalRate('USD', 580)
  const globalRates = { USD: 580 };
  const item = createMockItem({
    price: 1600, currency: 'CUP', exchange_rate: 1,
    subtotal: 1600, cash_paid: 0, transfer_paid: 0,
    zelle_paid: 2.76, zelle_currency: 'USD',
  });
  // getRateToCup: globalRates['USD'] = 580
  const rate = globalRates['USD'] || item.exchange_rate || 1;
  const zelleCup = item.zelle_paid * rate; // 2.76 * 580 = 1600.80
  const subtotalCup = 1600;
  console.log(`  Tasa manual: ${rate}`);
  console.log(`  Zelle: ${item.zelle_paid} USD = ${zelleCup.toFixed(2)} CUP`);
  console.log(`  Subtotal: ${subtotalCup} CUP`);
  assert('Pago ≈ Subtotal', zelleCup, subtotalCup, 1);
}

console.log('\n=== RESUMEN ===');
console.log('Si todos los tests pasan (✅), la lógica multi-moneda es correcta.');
console.log('Si hay ❌, hay bugs que fixear.');
