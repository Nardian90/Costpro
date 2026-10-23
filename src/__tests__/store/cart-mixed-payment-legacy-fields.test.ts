/**
 * MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24) — campos legacy del carrito.
 *
 * Prueba la corrección de syncLegacyFields (src/store/cart.ts): cuando un
 * método tiene filas de pago en VARIAS monedas (efectivo 5 USD + 15 000 CUP),
 * el campo legacy guarda la suma CANÓNICA en CUP (convertida con las tasas
 * hidratadas de la tienda) y la moneda legacy pasa a 'CUP' — ANTES sumaba
 * nominalmente 15 005 con la moneda de la ÚLTIMA fila (dato corrupto que
 * viajaba al servidor en transaction_items.cash_paid).
 *
 * Con una sola moneda por método el comportamiento previo se conserva
 * (importe real + su moneda).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (UUID válido)
const RATE = 1000; // tasa de la misión: 1 USD = 1 000 CUP

const usdProduct = {
  id: 'bbbb2222-0000-4000-8000-000000000001',
  name: 'Producto X (10 USD)',
  price: 10,
  price_currency: 'USD',
  stock_current: 10,
  store_id: STORE,
  cost_price: 4,
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

function setupCart() {
  const st = useCartStore.getState();
  st.hydrateStoreRates({ USD: RATE });
  const accepted = st.addItem(usdProduct);
  expect(accepted).toBe(true);
  return useCartStore.getState().items[0];
}

describe('MISIÓN PAGOS MIXTOS — syncLegacyFields multi-moneda', () => {
  beforeEach(resetCart);

  it('1. Efectivo 5 USD + 15 000 CUP: legacy = 20 000 CUP canónico (ANTES: 15 005 con la moneda de la última fila)', () => {
    const item = setupCart();
    const st = useCartStore.getState();

    // Primera fila (cash, moneda del ítem USD por defecto): 5 USD
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 5, currency: 'USD', method: 'cash' });
    // Segunda fila cash: nace con la moneda del ítem; el usuario la cambia a CUP con 15 000
    st.addItemPayment(item.product_id, null, 'cash');
    const item2 = useCartStore.getState().items[0];
    const newRow = item2.payments!.find(p => p.id !== item.payments![0].id)!;
    st.updateItemPaymentRow(item.product_id, null, newRow.id, { amount: 15000, currency: 'CUP', method: 'cash' });

    const finalItem = useCartStore.getState().items[0];
    // Regla nueva: suma canónica CUP = 5×1000 + 15000 = 20000, moneda 'CUP'
    expect(finalItem.cash_paid).toBe(20000);
    expect(finalItem.cash_currency).toBe('CUP');
    // ANTES (defecto): cash_paid = 15005 (5 + 15000 nominal) con la moneda de
    // la última fila — orden-dependiente y sin sentido contable.
  });

  it('2. El resultado es INDEPENDIENTE del orden de las filas (5 USD primero o último)', () => {
    const item = setupCart();
    const st = useCartStore.getState();

    // CUP primero, USD después (orden inverso del caso 1)
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 15000, currency: 'CUP', method: 'cash' });
    st.addItemPayment(item.product_id, null, 'cash');
    const item2 = useCartStore.getState().items[0];
    const newRow = item2.payments!.find(p => p.id !== item.payments![0].id)!;
    st.updateItemPaymentRow(item.product_id, null, newRow.id, { amount: 5, currency: 'USD', method: 'cash' });

    const finalItem = useCartStore.getState().items[0];
    expect(finalItem.cash_paid).toBe(20000);
    expect(finalItem.cash_currency).toBe('CUP');
  });

  it('3. Una sola moneda por método conserva el comportamiento previo (importe real + su moneda)', () => {
    const item = setupCart();
    const st = useCartStore.getState();
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 20000, currency: 'CUP', method: 'cash' });

    const finalItem = useCartStore.getState().items[0];
    expect(finalItem.cash_paid).toBe(20000);
    expect(finalItem.cash_currency).toBe('CUP');
  });

  it('4. Fila única USD: importe real USD con su moneda (sin conversión)', () => {
    const item = setupCart();
    const st = useCartStore.getState();
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 20, currency: 'USD', method: 'cash' });

    const finalItem = useCartStore.getState().items[0];
    expect(finalItem.cash_paid).toBe(20);
    expect(finalItem.cash_currency).toBe('USD');
  });

  it('5. Mixto multi-método: cash CUP + transfer USD — cada método aplica su propia regla', () => {
    const item = setupCart();
    const st = useCartStore.getState();

    // cash: 5 USD + 15 000 CUP → canónico 20 000 CUP
    st.updateItemPaymentRow(item.product_id, null, item.payments![0].id, { amount: 5, currency: 'USD', method: 'cash' });
    st.addItemPayment(item.product_id, null, 'cash');
    const s2 = useCartStore.getState().items[0];
    const newCashRow = s2.payments!.find(p => p.method === 'cash' && p.id !== item.payments![0].id)!;
    st.updateItemPaymentRow(item.product_id, null, newCashRow.id, { amount: 15000, currency: 'CUP', method: 'cash' });

    // transfer: 8 USD (una sola moneda) → importe real
    st.addItemPayment(item.product_id, null, 'transfer');
    const s3 = useCartStore.getState().items[0];
    const transferRow = s3.payments!.find(p => p.method === 'transfer')!;
    st.updateItemPaymentRow(item.product_id, null, transferRow.id, { amount: 8, currency: 'USD', method: 'transfer' });

    const finalItem = useCartStore.getState().items[0];
    expect(finalItem.cash_paid).toBe(20000);
    expect(finalItem.cash_currency).toBe('CUP');
    expect(finalItem.transfer_paid).toBe(8);
    expect(finalItem.transfer_currency).toBe('USD');
  });
});
