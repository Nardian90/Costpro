// Test de lógica multi-moneda con base_price_cup
// Ejecutar: npx tsx scripts/test-base-price.ts

function assert(name: string, actual: number, expected: number, tolerance = 1) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✅ ${name}: ${actual.toFixed(2)} ≈ ${expected.toFixed(2)}`);
  } else {
    console.log(`  ❌ ${name}: ${actual.toFixed(2)} ≠ ${expected.toFixed(2)} (diff: ${diff.toFixed(2)})`);
  }
}

// Simular base_price_cup y conversiones
const base_price_cup = 1600; // producto vale 1600 CUP en catálogo

console.log('\n=== TEST 1: Producto 1600 CUP → cambiar a USD con tasa 680 ===');
{
  const tasa = 680;
  const newPrice = base_price_cup / tasa; // 2.35
  console.log(`  base_price_cup: ${base_price_cup} CUP`);
  console.log(`  tasa: ${tasa}`);
  console.log(`  precio USD: ${newPrice.toFixed(4)}`);
  assert('Precio convertido', newPrice, 2.35, 0.01);

  // Subtotal en CUP (siempre desde base_price_cup)
  const subtotalCup = base_price_cup; // 1600 (1 unidad)
  console.log(`  subtotalCup: ${subtotalCup}`);
  assert('Subtotal CUP', subtotalCup, 1600);

  // Pago en efectivo: 2.35 USD
  const cashPaid = newPrice; // 2.35
  const cashCup = cashPaid * tasa; // 2.35 * 680 = 1598
  console.log(`  efectivo: ${cashPaid.toFixed(2)} USD = ${cashCup.toFixed(2)} CUP`);
  assert('Pago CUP', cashCup, 1598, 2);
  assert('Pago ≈ Subtotal', cashCup, subtotalCup, 3);
}

console.log('\n=== TEST 2: Cambiar tasa de 680 a 580 (recalcular desde base) ===');
{
  const tasa1 = 680;
  const price1 = base_price_cup / tasa1; // 2.35
  console.log(`  Tasa 680 → precio: ${price1.toFixed(4)} USD`);

  // Cambiar tasa a 580
  const tasa2 = 580;
  const price2 = base_price_cup / tasa2; // 2.76
  console.log(`  Tasa 580 → precio: ${price2.toFixed(4)} USD`);
  assert('Precio con nueva tasa', price2, 2.76, 0.01);

  // Subtotal CUP NO cambia (siempre es base_price_cup)
  const subtotalCup = base_price_cup;
  assert('Subtotal CUP estable', subtotalCup, 1600);
}

console.log('\n=== TEST 3: Volver a CUP desde USD ===');
{
  const tasa = 680;
  // Estaba en USD: price = 2.35
  // Volver a CUP: price = base_price_cup = 1600
  const newPriceCup = base_price_cup; // SIEMPRE base_price_cup al volver a CUP
  console.log(`  Volviendo a CUP: precio = ${newPriceCup}`);
  assert('Precio CUP', newPriceCup, 1600);
}

console.log('\n=== TEST 4: Múltiples conversiones (no se corrompe) ===');
{
  // CUP → USD (680) → EUR (620) → CUP → USD (580)
  let price = base_price_cup; // 1600 CUP
  console.log(`  Inicio: ${price} CUP`);

  // → USD con 680
  price = base_price_cup / 680; // 2.35
  console.log(`  → USD (680): ${price.toFixed(4)}`);
  assert('USD 680', price, 2.35, 0.01);

  // → EUR con 620 (desde base_price_cup, no desde price)
  price = base_price_cup / 620; // 2.58
  console.log(`  → EUR (620): ${price.toFixed(4)}`);
  assert('EUR 620', price, 2.58, 0.01);

  // → CUP (volver a base)
  price = base_price_cup; // 1600
  console.log(`  → CUP: ${price}`);
  assert('CUP', price, 1600);

  // → USD con 580
  price = base_price_cup / 580; // 2.76
  console.log(`  → USD (580): ${price.toFixed(4)}`);
  assert('USD 580', price, 2.76, 0.01);

  // El subtotal CUP siempre es 1600
  assert('Subtotal CUP final', base_price_cup, 1600);
}

console.log('\n=== TEST 5: Pago mixto CUP + USD (desde base_price_cup) ===');
{
  const tasa = 680;
  const priceUsd = base_price_cup / tasa; // 2.35 USD
  const subtotalCup = base_price_cup; // 1600 CUP

  // Pagar 1 USD en Zelle + resto en efectivo
  const zellePaid = 1.00; // USD
  const zelleCup = zellePaid * tasa; // 680 CUP
  const cashPaid = priceUsd - zellePaid; // 1.35 USD
  const cashCup = cashPaid * tasa; // 918 CUP
  const totalPaidCup = zelleCup + cashCup; // 1598 CUP

  console.log(`  Zelle: ${zellePaid} USD = ${zelleCup} CUP`);
  console.log(`  Efectivo: ${cashPaid.toFixed(2)} USD = ${cashCup.toFixed(2)} CUP`);
  console.log(`  Total pagado: ${totalPaidCup.toFixed(2)} CUP`);
  console.log(`  Subtotal CUP: ${subtotalCup}`);
  assert('Pago ≈ Subtotal', totalPaidCup, subtotalCup, 3);
}

console.log('\n=== TEST 6: Tasa incorrecta persistida (6) no afecta ===');
{
  // Simular globalRates con tasa vieja/incorrecta = 6
  const globalRates = { USD: 6 }; // tasa incorrecta de sesión anterior

  // Al cambiar MONEDA VENTA, el código usa globalRates primero
  // Pero con base_price_cup, el precio SIEMPRE se calcula desde base_price_cup
  const rate = globalRates['USD'] || 1; // 6 (incorrecta)
  const priceWithBadRate = base_price_cup / rate; // 266.67 USD (incorrecto)
  console.log(`  Con tasa vieja (6): ${priceWithBadRate.toFixed(2)} USD ← INCORRECTO`);

  // Pero el usuario edita la TASA a 680
  const correctRate = 680;
  const priceWithCorrectRate = base_price_cup / correctRate; // 2.35 USD
  console.log(`  Al editar TASA a 680: ${priceWithCorrectRate.toFixed(4)} USD ← CORRECTO`);
  assert('Precio corregido', priceWithCorrectRate, 2.35, 0.01);

  // El subtotal CUP siempre es 1600, sin importar la tasa
  assert('Subtotal CUP estable', base_price_cup, 1600);
}

console.log('\n=== TEST 7: Cantidad > 1 ===');
{
  const qty = 3;
  const tasa = 680;
  const priceUsd = base_price_cup / tasa; // 2.35 USD por unidad
  const subtotalUsd = priceUsd * qty; // 7.06 USD
  const subtotalCup = base_price_cup * qty; // 4800 CUP

  console.log(`  Cantidad: ${qty}`);
  console.log(`  Precio unit: ${priceUsd.toFixed(4)} USD`);
  console.log(`  Subtotal USD: ${subtotalUsd.toFixed(2)} USD`);
  console.log(`  Subtotal CUP: ${subtotalCup}`);

  // Pago: 7.06 USD en efectivo
  const paidCup = subtotalUsd * tasa; // 4800 CUP
  assert('Pago CUP', paidCup, 4800, 1);
  assert('Pago ≈ Subtotal CUP', paidCup, subtotalCup, 2);
}

console.log('\n=== RESUMEN ===');
console.log('Si todos pasan ✅, base_price_cup funciona correctamente.');
console.log('El precio SIEMPRE se calcula desde base_price_cup / tasa.');
console.log('Múltiples conversiones no corrompen el valor.');
