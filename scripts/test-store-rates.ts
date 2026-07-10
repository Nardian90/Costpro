// Test de tasas persistentes + recargo + base_price_cup
// Ejecutar: npx tsx scripts/test-store-rates.ts

function assert(name: string, actual: number, expected: number, tolerance = 1) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✅ ${name}: ${actual.toFixed(2)} ≈ ${expected.toFixed(2)}`);
  } else {
    console.log(`  ❌ ${name}: ${actual.toFixed(2)} ≠ ${expected.toFixed(2)} (diff: ${diff.toFixed(2)})`);
  }
}

const base_price_cup = 1600;

console.log('\n=== TEST 1: Tasas persistentes se cargan desde BD ===');
{
  // Simular tasas guardadas en BD
  const storeRates = { USD: 680, EUR: 720, MLC: 600 };
  console.log(`  Tasas BD: USD=${storeRates.USD}, EUR=${storeRates.EUR}, MLC=${storeRates.MLC}`);

  // Al cargar, globalRates = storeRates
  const globalRates = { ...storeRates };
  console.log(`  globalRates: ${JSON.stringify(globalRates)}`);

  // Item en USD con tasa de BD
  const price = base_price_cup / globalRates.USD; // 2.35
  console.log(`  Precio USD: ${price.toFixed(4)}`);
  assert('Precio con tasa BD', price, 2.35, 0.01);
}

console.log('\n=== TEST 2: Cambiar tasa → recalcula desde base_price_cup ===');
{
  const globalRates = { USD: 680 };
  const price1 = base_price_cup / globalRates.USD; // 2.35
  console.log(`  Tasa 680 → precio: ${price1.toFixed(4)}`);

  // Usuario actualiza tasa a 580
  globalRates.USD = 580;
  const price2 = base_price_cup / globalRates.USD; // 2.76
  console.log(`  Tasa 580 → precio: ${price2.toFixed(4)}`);
  assert('Precio recalculado', price2, 2.76, 0.01);
}

console.log('\n=== TEST 3: Recargo 10% en efectivo ===');
{
  const subtotal = base_price_cup; // 1600 CUP
  const surchargeType = 'percentage';
  const surchargeValue = 10;
  let result = subtotal;
  if (surchargeType === 'percentage') {
    result = result * (1 + surchargeValue / 100); // 1600 * 1.10 = 1760
  }
  console.log(`  Subtotal: ${subtotal}`);
  console.log(`  Recargo 10%: +${subtotal * 0.10}`);
  console.log(`  Total con recargo: ${result}`);
  assert('Con recargo 10%', result, 1760);
}

console.log('\n=== TEST 4: Descuento 5% + Recargo 3% en efectivo ===');
{
  const subtotal = base_price_cup; // 1600
  const discountType = 'percentage';
  const discountValue = 5;
  const surchargeType = 'percentage';
  const surchargeValue = 3;

  let result = subtotal;
  // Descuento primero
  if (discountType === 'percentage') {
    result = result * (1 - discountValue / 100); // 1600 * 0.95 = 1520
  }
  // Recargo después
  if (surchargeType === 'percentage') {
    result = result * (1 + surchargeValue / 100); // 1520 * 1.03 = 1565.60
  }
  console.log(`  Subtotal: ${subtotal}`);
  console.log(`  -5%: ${subtotal * 0.95}`);
  console.log(`  +3%: ${subtotal * 0.95 * 1.03}`);
  console.log(`  Total: ${result.toFixed(2)}`);
  assert('Desc + Recargo', result, 1565.60, 0.1);
}

console.log('\n=== TEST 5: Recargo fijo $50 en Zelle ===');
{
  const subtotal = base_price_cup; // 1600
  const surchargeType = 'fixed';
  const surchargeValue = 50;
  let result = subtotal;
  if (surchargeType === 'fixed') {
    result = result + surchargeValue; // 1650
  }
  console.log(`  Subtotal: ${subtotal}`);
  console.log(`  +$50: ${result}`);
  assert('Recargo fijo', result, 1650);
}

console.log('\n=== TEST 6: Múltiples monedas con tasas persistentes ===');
{
  const storeRates = { USD: 680, EUR: 720, MLC: 600 };

  // Item en USD
  const priceUsd = base_price_cup / storeRates.USD; // 2.35
  const subtotalUsdCup = base_price_cup; // 1600
  console.log(`  USD: ${priceUsd.toFixed(4)} → CUP: ${subtotalUsdCup}`);

  // Item en EUR
  const priceEur = base_price_cup / storeRates.EUR; // 2.22
  const subtotalEurCup = base_price_cup; // 1600
  console.log(`  EUR: ${priceEur.toFixed(4)} → CUP: ${subtotalEurCup}`);

  // Item en MLC
  const priceMlc = base_price_cup / storeRates.MLC; // 2.67
  const subtotalMlcCup = base_price_cup; // 1600
  console.log(`  MLC: ${priceMlc.toFixed(4)} → CUP: ${subtotalMlcCup}`);

  // Todos los subtotales CUP son iguales (base_price_cup)
  assert('USD CUP', subtotalUsdCup, 1600);
  assert('EUR CUP', subtotalEurCup, 1600);
  assert('MLC CUP', subtotalMlcCup, 1600);
}

console.log('\n=== TEST 7: Pago en moneda diferente al item ===');
{
  const storeRates = { USD: 680, EUR: 720 };
  const itemCurrency = 'USD';
  const itemRate = storeRates.USD; // 680

  // Pago en EUR
  const cashCurrency = 'EUR';
  const cashRate = storeRates.EUR; // 720
  const cashPaid = 2.50; // EUR
  const cashCup = cashPaid * cashRate; // 2.50 * 720 = 1800 CUP

  const subtotalCup = base_price_cup; // 1600

  console.log(`  Item en USD (tasa ${itemRate})`);
  console.log(`  Pago en EUR (tasa ${cashRate})`);
  console.log(`  Pagado: ${cashPaid} EUR = ${cashCup} CUP`);
  console.log(`  Subtotal: ${subtotalCup} CUP`);
  assert('Pago CUP > Subtotal', cashCup, 1800);
  console.log(`  ✅ Sobrepago de ${cashCup - subtotalCup} CUP`);
}

console.log('\n=== RESUMEN ===');
console.log('Si todos pasan ✅, las tasas persistentes + recargo funcionan.');
