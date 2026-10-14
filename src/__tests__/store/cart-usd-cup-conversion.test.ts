/**
 * FIX-USD-CUP-RATE — Test de conversión USD/CUP y validación de pagos en el carrito.
 *
 * Caso reproducido en ENERVIDA-VITALLCONS: producto "MPPT" de 120 USD pagado
 * con 94 800 CUP (tasa 790 configurada en la tienda) → falso "Sobrepago:
 * $94,680.00 CUP" y error "Pago mixto descuadrado en MPPT" al cobrar.
 *
 * Causa raíz: los items no-CUP entraban al carrito con exchange_rate = 1.0
 * (el catálogo no trae tasa) y nunca se hidrataban las tasas configuradas de
 * la tienda (store_exchange_rates vía /api/store-rates).
 *
 * Los 8 casos obligatorios de la misión (tasa de prueba 790, NO fija en código:
 * se inyecta como tasa de tienda vía hydrateStoreRates) + casos borde.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (formato UUID válido)
const RATE_TEST = 790; // Tasa SOLO de prueba (la real viene de la configuración de la tienda)

const usdProduct = {
  id: 'aaaa1111-0000-4000-8000-000000000001',
  name: 'MPPT Solar 120W',
  price: 120,
  price_currency: 'USD',
  stock_current: 10,
  store_id: STORE,
  cost_price: 50,
};

const cupProduct = {
  id: 'aaaa1111-0000-4000-8000-000000000002',
  name: 'Producto CUP',
  price: 94800,
  price_currency: 'CUP',
  stock_current: 10,
  store_id: STORE,
  cost_price: 40000,
};

function resetCart() {
  useCartStore.setState({
    items: [],
    discount: null,
    appliedTaxes: [],
    storeId: STORE,
    globalRates: {},
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'cash',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
}

/** Simula la POS: hidratar tasas de la tienda al montar y añadir producto. */
function setupCartWithProduct(product: any) {
  const st = useCartStore.getState();
  st.hydrateStoreRates({ USD: RATE_TEST }); // ← configuración vigente de la tienda
  const accepted = st.addItem(product);
  expect(accepted).toBe(true);
  return useCartStore.getState().items[0];
}

/** Cambia la primera fila de pago (como el usuario: moneda + importe). */
function setPaymentRow(amount: number, currency: string, method: 'cash' | 'transfer' | 'zelle' = 'cash') {
  const st = useCartStore.getState();
  const item = st.items[0];
  st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount, currency, method });
}

/** Matemática EXACTA del badge Esperado/Sobrepago del panel de cobro. */
function checkoutMath() {
  const st = useCartStore.getState();
  const totalPaidCup = st.items.reduce((s, i) => s + st.getItemPaidCup(i), 0);
  const expectedTotal = st.getExpectedTotalCup();
  const diff = Number((totalPaidCup - expectedTotal).toFixed(2));
  return { totalPaidCup, expectedTotal, diff, isBalanced: Math.abs(diff) <= 0.01 };
}

/**
 * Réplica EXACTA de la validación por-item del checkout (usePOSCheckout).
 * Post-fix usa los helpers canónicos del store (getItemPaidCup).
 */
function itemCheckoutGate(itemIndex = 0): boolean {
  const st = useCartStore.getState();
  const i = st.items[itemIndex];
  const itemPaidCup = st.getItemPaidCup(i);
  const itemAdjustedSubtotalCup = (i.subtotal || 0) * (i.currency === 'CUP' ? 1 : (i.exchange_rate || 1));
  return Math.abs(itemPaidCup - itemAdjustedSubtotalCup) <= 0.01;
}

describe('FIX-USD-CUP-RATE — conversión USD/CUP y validación de pagos (tasa de prueba 790)', () => {
  beforeEach(resetCart);

  it('Caso 1 · Pago exacto en CUP: 120 USD × 790 = 94 800 CUP → venta cuadrada, sin sobrepago', () => {
    const item = setupCartWithProduct(usdProduct);

    // El item hereda la tasa configurada de la tienda
    expect(item.currency).toBe('USD');
    expect(item.exchange_rate).toBe(RATE_TEST);
    expect(item.base_price_cup).toBe(94800); // 120 × 790 — ancla CUP correcta

    // El usuario cambia la fila de pago a CUP e introduce 94 800
    setPaymentRow(94800, 'CUP');

    const { expectedTotal, totalPaidCup, diff, isBalanced } = checkoutMath();
    expect(expectedTotal).toBe(94800);   // ANTES: 120 (tasa 1.0) → falso sobrepago
    expect(totalPaidCup).toBe(94800);
    expect(diff).toBe(0);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true); // ANTES: "Pago mixto descuadrado en MPPT"
  });

  it('Caso 2 · Pago insuficiente: 94 000 CUP → Falta 800 CUP con unidad identificada', () => {
    setupCartWithProduct(usdProduct);
    setPaymentRow(94000, 'CUP');

    const { diff, isBalanced } = checkoutMath();
    expect(diff).toBe(-800);              // falta 800 CUP (no mezcla monedas)
    expect(isBalanced).toBe(false);
    // El gate de checkout bloquea el pago incompleto (POS exige pago completo)
    expect(itemCheckoutGate()).toBe(false);
  });

  it('Caso 3 · Pago superior: 95 000 CUP → sobrepago/vuelto +200 CUP coherente', () => {
    setupCartWithProduct(usdProduct);
    setPaymentRow(95000, 'CUP');

    const { diff } = checkoutMath();
    expect(diff).toBe(200);               // sobrepago de 200 CUP en la moneda recibida
  });

  it('Caso 4 · Pago exacto en USD: 120 USD para producto de 120 USD → venta aceptada', () => {
    setupCartWithProduct(usdProduct);
    // Fila por defecto ya es cash USD 120 (moneda nativa del item)
    const { expectedTotal, totalPaidCup, diff, isBalanced } = checkoutMath();
    expect(expectedTotal).toBe(94800);
    expect(totalPaidCup).toBe(94800);     // 120 USD × 790 — ANTES: 120 (×1) → falso descuadre inverso
    expect(diff).toBe(0);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true);
  });

  it('Caso 5 · Precio CUP, pago CUP: 94 800 → venta aceptada sin conversión', () => {
    const item = setupCartWithProduct(cupProduct);
    expect(item.currency).toBe('CUP');
    expect(item.exchange_rate).toBe(1);   // CUP = 1 por definición
    expect(item.base_price_cup).toBe(94800);
    // La fila por defecto es cash CUP 94800 (subtotal nativo)
    const { diff, isBalanced } = checkoutMath();
    expect(diff).toBe(0);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true);
  });

  it('Caso 6 · Precio CUP, pago USD: conversión inversa 120 USD × 790 = 94 800 CUP', () => {
    setupCartWithProduct(cupProduct);
    setPaymentRow(120, 'USD');

    const { expectedTotal, totalPaidCup, diff, isBalanced } = checkoutMath();
    expect(expectedTotal).toBe(94800);
    expect(totalPaidCup).toBe(94800);     // 120 USD ÷ (1/790) — regla inversa correcta
    expect(diff).toBe(0);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true);
  });

  it('Caso 7 · Pago mixto: efectivo CUP 79 000 + transferencia USD 20 → cuadra sin diferencias ficticias', () => {
    setupCartWithProduct(usdProduct);
    let st = useCartStore.getState();
    const item = st.items[0];
    // Fila 1 (cash): CUP 79 000; fila 2 (transfer): USD 20 (= 15 800 CUP)
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 79000, currency: 'CUP', method: 'cash' });
    useCartStore.getState().addItemPayment(item.product_id, null, 'transfer');
    const row2 = useCartStore.getState().items[0].payments![1];
    useCartStore.getState().updateItemPaymentRow(item.product_id, null, row2.id, { amount: 20, currency: 'USD', method: 'transfer' });

    const { expectedTotal, totalPaidCup, diff, isBalanced } = checkoutMath();
    expect(expectedTotal).toBe(94800);
    expect(totalPaidCup).toBe(79000 + 20 * RATE_TEST); // 79 000 + 15 800 = 94 800
    expect(diff).toBe(0);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true);
  });

  it('Caso 8 · Reintento: el estado del carrito es determinista (misma entrada → misma matemática)', () => {
    // La no-duplicación server-side la garantiza el registro de idempotencia de
    // create_sale_v2 (idempotency_registry, UNIQUE key+operation, migración
    // 20261004130000 §7). Aquí se verifica que la matemática del carrito es
    // determinista entre reintentos de checkout con el mismo contenido.
    setupCartWithProduct(usdProduct);
    setPaymentRow(94800, 'CUP');

    const first = checkoutMath();
    const second = checkoutMath();
    expect(second.expectedTotal).toBe(first.expectedTotal);
    expect(second.totalPaidCup).toBe(first.totalPaidCup);
    expect(second.diff).toBe(first.diff);
    expect(second.isBalanced).toBe(true);
  });

  // ── Casos borde obligatorios de la misión ─────────────────────────────────

  it('Hidratación re-tasa items corruptos: carrito persistido con tasa 1.0 se corrige al montar', () => {
    // Simula un carrito persistido de la sesión PRE-fix: item USD con tasa 1.0
    resetCart();
    useCartStore.getState().addItem(usdProduct); // sin tasas hidratadas → tasa 1.0
    const corrupt = useCartStore.getState().items[0];
    expect(corrupt.exchange_rate).toBe(1.0);
    expect(corrupt.base_price_cup).toBe(120);

    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });

    const fixed = useCartStore.getState().items[0];
    expect(fixed.exchange_rate).toBe(RATE_TEST);
    expect(fixed.base_price_cup).toBe(94800);
    expect(fixed.price).toBe(120);          // precio nativo intacto
    expect(useCartStore.getState().getExpectedTotalCup()).toBe(94800);
  });

  it('Conversión única: hidratar dos veces no re-aplica la tasa (ancla CUP inmutable)', () => {
    setupCartWithProduct(usdProduct);
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST }); // segunda hidratación
    const item = useCartStore.getState().items[0];
    expect(item.exchange_rate).toBe(RATE_TEST);   // sin doble conversión
    expect(item.base_price_cup).toBe(94800);      // 120×790, NO 120×790×790
  });

  it('Tasa manual del item (≠1) se respeta: la hidratación no la pisa', () => {
    resetCart();
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });
    useCartStore.getState().addItem(usdProduct);
    // El usuario edita la tasa del item a 800 (el input de tasa también fija globalRates)
    useCartStore.getState().setGlobalRate('USD', 800);
    useCartStore.setState({
      items: useCartStore.getState().items.map(i => ({
        ...i, exchange_rate: 800, base_price_cup: i.price * 800,
      })),
    });
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST }); // tienda sigue en 790
    const item = useCartStore.getState().items[0];
    expect(item.exchange_rate).toBe(800);         // decisión manual preservada
    expect(item.base_price_cup).toBe(96000);
  });

  it('Tasas inválidas (0, negativa, nula) se ignoran: fallback seguro', () => {
    useCartStore.getState().hydrateStoreRates({ USD: 0, EUR: -5, MLC: undefined as any });
    expect(useCartStore.getState().globalRates.USD).toBe(0); // se fusiona tal cual...
    // ...pero addItem NO las usa: tasa inválida → fallback 1.0 (estado sin tasa)
    useCartStore.getState().addItem({ ...usdProduct, price_currency: 'EUR' });
    const item = useCartStore.getState().items[0];
    expect(item.exchange_rate).toBe(1.0);          // fail-safe, comportamiento legacy
    expect(item.base_price_cup).toBe(120);
    // hydrateStoreRates tampoco re-tasa con tasas inválidas (guard storeRate <= 1)
    useCartStore.getState().hydrateStoreRates({ EUR: -5 });
    expect(useCartStore.getState().items[0].exchange_rate).toBe(1.0);
  });

  it('Precios decimales: 10.55 USD × 790 con precisión monetaria correcta', () => {
    resetCart();
    useCartStore.getState().hydrateStoreRates({ USD: RATE_TEST });
    useCartStore.getState().addItem({ ...usdProduct, price: 10.55 });
    setPaymentRow(10.55 * RATE_TEST, 'CUP'); // 8334.5
    const { expectedTotal, totalPaidCup, isBalanced } = checkoutMath();
    expect(expectedTotal).toBeCloseTo(8334.5, 2);
    expect(totalPaidCup).toBeCloseTo(8334.5, 2);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate()).toBe(true);
  });

  it('clearCart preserva las tasas de la tienda (2.ª venta de la sesión sigue correcta)', () => {
    setupCartWithProduct(usdProduct);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().globalRates.USD).toBe(RATE_TEST); // ANTES: {} → bug de 2.ª venta
    useCartStore.getState().addItem(usdProduct);
    expect(useCartStore.getState().items[0].exchange_rate).toBe(RATE_TEST);
    expect(useCartStore.getState().items[0].base_price_cup).toBe(94800);
  });

  it('Múltiples productos con monedas de origen distintas: suma CUP coherente', () => {
    const st = useCartStore.getState();
    st.hydrateStoreRates({ USD: RATE_TEST });
    st.addItem(usdProduct);    // 120 USD = 94 800 CUP
    st.addItem(cupProduct);    // 94 800 CUP
    setPaymentRow(94800, 'CUP'); // fila del primer item
    // Segunda fila de pago: item CUP — fila por defecto ya es 94 800 CUP
    const { expectedTotal, totalPaidCup, isBalanced } = checkoutMath();
    expect(expectedTotal).toBe(94800 + 94800);
    expect(totalPaidCup).toBe(94800 + 94800);
    expect(isBalanced).toBe(true);
    expect(itemCheckoutGate(0)).toBe(true);
    expect(itemCheckoutGate(1)).toBe(true);
  });
});
