/**
 * FIX-TRANSF-EXTERIOR (2026-10-16) — regla de moneda para transferencias del
 * exterior (antes «Zelle») en el carrito del POS.
 *
 * REQUERIMIENTO DEL NEGOCIO (Vender → Carrito/Caja):
 *   · «Zelle» se renombra a «Transf. Exterior» (solo etiqueta; el VALUE de BD
 *     sigue siendo 'zelle' por compatibilidad de datos).
 *   · Una transferencia del exterior es intrínsecamente en divisa extranjera
 *     → la fila solo permite USD o EUR. CUP (efectivo local) y MLC (vale
 *     minorista interno) no aplican.
 *
 * La regla vive en el STORE (updateItemPaymentRow), fuente única de verdad:
 * protege a todo consumidor presente o futuro, no solo al selector del UI.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (formato UUID válido)

const cupProduct = {
  id: 'aaaa1111-0000-4000-8000-000000000002',
  name: 'Producto CUP',
  price: 7900,
  price_currency: 'CUP',
  stock_current: 10,
  store_id: STORE,
  cost_price: 4000,
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

/** Item con 1 fila de pago default (cash) + tasa de tienda hidratada. */
function setupItem() {
  useCartStore.getState().hydrateStoreRates({ USD: 790, EUR: 850 });
  const accepted = useCartStore.getState().addItem(cupProduct);
  expect(accepted).toBe(true);
  return useCartStore.getState().items[0];
}

function primeraFila(item: ReturnType<typeof useCartStore.getState>['items'][number]) {
  return item.payments![0];
}

describe('FIX-TRANSF-EXTERIOR — la fila Transf. Exterior solo admite USD/EUR (regla del store)', () => {
  beforeEach(resetCart);

  it('fila en CUP que pasa a Transf. Exterior → corregida a USD (y discount_currency sincronizada)', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    expect(fila.currency).toBe('CUP');

    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'external_transfer' },
    );

    const row = useCartStore.getState().items[0].payments![0];
    expect(row.method).toBe('external_transfer');
    expect(row.currency).toBe('USD'); // ← regla del store: CUP no aplica a Transf. Exterior
    expect(row.discount_currency).toBe('USD');
  });

  it('fila Transf. Exterior con MLC → corregida a USD', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'external_transfer', currency: 'MLC' },
    );
    const row = useCartStore.getState().items[0].payments![0];
    expect(row.currency).toBe('USD');
    expect(row.discount_currency).toBe('USD');
  });

  it('fila Transf. Exterior con EUR se respeta (EUR sí es divisa del exterior)', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'external_transfer', currency: 'EUR' },
    );
    const row = useCartStore.getState().items[0].payments![0];
    expect(row.method).toBe('external_transfer');
    expect(row.currency).toBe('EUR');
    expect(row.discount_currency).toBe('EUR');
  });

  it('fila Transf. Exterior con USD se respeta (default correcto)', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'external_transfer', currency: 'USD' },
    );
    const row = useCartStore.getState().items[0].payments![0];
    expect(row.currency).toBe('USD');
  });

  it('filas NO-exterior no se ven afectadas: cash con USD y cash con CUP siguen válidas', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'cash', currency: 'USD' },
    );
    expect(useCartStore.getState().items[0].payments![0]).toMatchObject({ method: 'cash', currency: 'USD' });

    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'cash', currency: 'CUP' },
    );
    expect(useCartStore.getState().items[0].payments![0]).toMatchObject({ method: 'cash', currency: 'CUP' });

    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'transfer', currency: 'MLC' },
    );
    expect(useCartStore.getState().items[0].payments![0]).toMatchObject({ method: 'transfer', currency: 'MLC' });
  });

  it('addItemPayment con Transf. Exterior crea la fila en USD por defecto', () => {
    const item = setupItem();
    useCartStore.getState().addItemPayment(item.product_id, null, 'external_transfer');
    const pagos = useCartStore.getState().items[0].payments!;
    const exterior = pagos.find(p => p.method === 'external_transfer');
    expect(exterior).toBeDefined();
    expect(exterior!.currency).toBe('USD');
  });

  it('syncLegacyFields refleja la moneda corregida en zelle_currency', () => {
    const item = setupItem();
    const fila = primeraFila(item);
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, fila.id, { method: 'external_transfer', currency: 'CUP' },
    );
    const legacy = useCartStore.getState().items[0];
    expect(legacy.zelle_currency).toBe('USD');
  });
});
