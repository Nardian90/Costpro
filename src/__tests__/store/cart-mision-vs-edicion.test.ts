/**
 * cart-mision-vs-edicion.test.ts — MISIÓN 2026-10-21 (Vender / Vale de Salida / Edición en carrito)
 *
 * TAREA 2 — Generar un Vale de Salida SIN validaciones de pago ajenas:
 *   1. addItem en modo Vale NO crea filas de pago (raíz del falso sobrepago/falta).
 *   2. updateQuantity en modo Vale NO recrea filas de pago.
 *   3. updateItemDiscount en modo Vale NO recrea filas de pago.
 *   4. switchItemVariant en modo Vale NO recrea filas de pago.
 *   5. setOperationType('issue_slip') limpia pagos de items existentes (regresión).
 *   6. Volver a modo Venta restaura la sincronización de pagos (fila cash).
 *
 * TAREA 1 — Edición de productos desde el carrito:
 *   7. updateItemPrice actualiza el precio APLICADO sin tocar el precio maestro.
 *   8. updateItemPrice rechaza precio negativo e inválido (NaN / Infinity).
 *   9. updateItemPrice recalcula el subtotal con el descuento de línea (round2).
 *  10. updateItemPrice en modo VENTA re-sincroniza la fila de pago (sin override).
 *  11. updateItemPrice respeta el override manual de pagos (no los pisa).
 *  12. switchItemVariant cambia price/cost con la variante y recalcula el subtotal.
 *  13. switchItemVariant fusiona con línea existente de la misma variante (FIX-P1-3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCartStore, setCartNotificationHandler } from '@/store/cart';
import type { Product, ProductVariant } from '@/types';

const STORE_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const fisico = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Detergente Multiusos 1L',
  sku: 'DET-001',
  price: 120,
  cost_price: 85,
  stock_current: 50,
  is_service: false,
  price_currency: 'CUP',
  store_id: STORE_ID,
} as unknown as Product;

const varianteRollo100 = {
  id: 'v2000000-0000-4000-8000-000000000001',
  name: 'Rollo 100m',
  price: 9000,
  conversion_factor: 100,
} as unknown as ProductVariant;

const varianteRollo50 = {
  id: 'v2000000-0000-4000-8000-000000000002',
  name: 'Rollo 50m',
  price: 4600,
  conversion_factor: 50,
} as unknown as ProductVariant;

const cable = {
  id: 'b1000000-0000-4000-8000-000000000001',
  name: 'Cable THW',
  sku: 'CBL-001',
  price: 100,
  cost_price: 60,
  stock_current: 500,
  is_service: false,
  price_currency: 'CUP',
  store_id: STORE_ID,
  unit_of_measure: 'metro',
  product_variants: [varianteRollo100, varianteRollo50],
} as unknown as Product;

function resetCart() {
  useCartStore.setState({
    items: [],
    storeId: STORE_ID,
    discount: null,
    appliedTaxes: [],
    saleDate: null,
    operationType: 'sale',
    globalRates: {},
  });
}

describe('MISIÓN 2026-10-21 — Vale de Salida sin validaciones de pago ajenas (TAREA 2)', () => {
  beforeEach(() => {
    resetCart();
    setCartNotificationHandler(null);
  });

  it('1 · addItem en modo Vale crea el item SIN filas de pago', () => {
    useCartStore.getState().setOperationType('issue_slip');
    const accepted = useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 2, product: fisico, subtotal: fisico.price * 2 },
    );
    expect(accepted).toBe(true);
    const item = useCartStore.getState().items[0];
    expect(item.payments).toHaveLength(0);
    expect(item.cash_paid).toBe(0);
    expect(item.transfer_paid).toBe(0);
    expect(item.zelle_paid).toBe(0);
  });

  it('2 · updateQuantity en modo Vale NO recrea filas de pago', () => {
    useCartStore.getState().setOperationType('issue_slip');
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 1, product: fisico, subtotal: fisico.price },
    );
    useCartStore.getState().updateQuantity(fisico.id, null, 4);
    const item = useCartStore.getState().items[0];
    expect(item.quantity).toBe(4);
    expect(item.payments).toHaveLength(0);
    expect(item.cash_paid).toBe(0);
  });

  it('3 · updateItemDiscount en modo Vale NO recrea filas de pago', () => {
    useCartStore.getState().setOperationType('issue_slip');
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 1, product: fisico, subtotal: fisico.price },
    );
    useCartStore.getState().updateItemDiscount(fisico.id, null, 'percentage', 10);
    const item = useCartStore.getState().items[0];
    expect(item.discount_type).toBe('percentage');
    expect(item.payments).toHaveLength(0);
  });

  it('4 · switchItemVariant en modo Vale NO recrea filas de pago', () => {
    useCartStore.getState().setOperationType('issue_slip');
    useCartStore.getState().addItem(
      { product_id: cable.id, variant_id: null, variant: null, price: cable.price, cost: 0, quantity: 1, product: cable, subtotal: cable.price },
    );
    useCartStore.getState().switchItemVariant(cable.id, null, varianteRollo100.id);
    const item = useCartStore.getState().items[0];
    expect(item.variant_id).toBe(varianteRollo100.id);
    expect(item.price).toBe(varianteRollo100.price);
    expect(item.payments).toHaveLength(0);
  });

  it('5 · setOperationType("issue_slip") limpia los pagos de items ya agregados (regresión)', () => {
    // Agregar en modo VENTA (crea fila de pago default) y luego convertir a Vale
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 1, product: fisico, subtotal: fisico.price },
    );
    expect(useCartStore.getState().items[0].payments.length).toBeGreaterThan(0);
    useCartStore.getState().setOperationType('issue_slip');
    const item = useCartStore.getState().items[0];
    expect(item.payments).toHaveLength(0);
    expect(item.cash_paid).toBe(0);
    expect(item.payment_manual_override).toBe(false);
  });

  it('6 · al volver a modo VENTA, updateQuantity vuelve a sincronizar la fila de pago', () => {
    useCartStore.getState().setOperationType('issue_slip');
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 1, product: fisico, subtotal: fisico.price },
    );
    useCartStore.getState().setOperationType('sale');
    useCartStore.getState().updateQuantity(fisico.id, null, 3);
    const item = useCartStore.getState().items[0];
    expect(item.payments).toHaveLength(1);
    expect(item.payments[0].amount).toBe(fisico.price * 3);
  });
});

describe('MISIÓN 2026-10-21 — Edición desde el carrito: precio de operación vs maestro (TAREA 1)', () => {
  beforeEach(() => {
    resetCart();
    setCartNotificationHandler(null);
  });

  it('7 · updateItemPrice cambia el precio aplicado SIN tocar el precio maestro del catálogo', () => {
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 2, product: fisico, subtotal: fisico.price * 2 },
    );
    useCartStore.getState().updateItemPrice(fisico.id, null, 100);
    const item = useCartStore.getState().items[0];
    // Precio de la operación editado (y su ancla CUP — misma moneda)
    expect(item.price).toBe(100);
    expect(item.base_price_cup).toBe(100);
    expect(item.subtotal).toBe(200);
    // Precio maestro del producto (catálogo) intacto
    expect(item.product.price).toBe(120);
    expect(useCartStore.getState().items[0].product.price).toBe(120);
  });

  it('8 · updateItemPrice rechaza precio negativo e inválido (NaN / Infinity)', () => {
    setCartNotificationHandler((_type, _msg) => { /* capturado; el store rechaza */ });
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 1, product: fisico, subtotal: fisico.price },
    );
    useCartStore.getState().updateItemPrice(fisico.id, null, -5);
    expect(useCartStore.getState().items[0].price).toBe(120);

    useCartStore.getState().updateItemPrice(fisico.id, null, NaN);
    expect(useCartStore.getState().items[0].price).toBe(120);

    useCartStore.getState().updateItemPrice(fisico.id, null, Infinity);
    expect(useCartStore.getState().items[0].price).toBe(120);
  });

  it('9 · updateItemPrice recalcula el subtotal combinado con descuento de línea (round2)', () => {
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 3, product: fisico, subtotal: fisico.price * 3 },
    );
    // Descuento 10% de línea + precio editado a 100 → efectivo 90 × 3 = 270
    useCartStore.getState().updateItemDiscount(fisico.id, null, 'percentage', 10);
    useCartStore.getState().updateItemPrice(fisico.id, null, 100);
    const item = useCartStore.getState().items[0];
    expect(item.price).toBe(100);
    expect(item.subtotal).toBe(270);
  });

  it('10 · updateItemPrice en modo VENTA re-sincroniza la fila de pago sin override manual', () => {
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 2, product: fisico, subtotal: fisico.price * 2 },
    );
    useCartStore.getState().updateItemPrice(fisico.id, null, 100);
    const item = useCartStore.getState().items[0];
    expect(item.payments).toHaveLength(1);
    expect(item.payments[0].amount).toBe(200);
    expect(item.cash_paid).toBe(200);
    // Consistencia de cobro: total esperado (badge/CTA/checkout) = pagado
    // — sin esta alineación el RPC create_sale_v2 respondería ERR_TOTAL_MISMATCH.
    expect(useCartStore.getState().getExpectedTotalCup()).toBe(200);
    expect(useCartStore.getState().getItemPaidCup(item)).toBe(200);
  });

  it('11 · updateItemPrice respeta el override manual de pagos (no los pisa)', () => {
    useCartStore.getState().addItem(
      { product_id: fisico.id, variant_id: null, variant: null, price: fisico.price, cost: 0, quantity: 2, product: fisico, subtotal: fisico.price * 2 },
    );
    // El cajero fija pagos manualmente (payment_manual_override = true)
    useCartStore.getState().updateItemPayment(fisico.id, null, 100, 140, 0, { cash: 'CUP', transfer: 'CUP', zelle: 'USD' });
    const before = useCartStore.getState().items[0].payments.map(p => ({ ...p }));
    useCartStore.getState().updateItemPrice(fisico.id, null, 100);
    const after = useCartStore.getState().items[0].payments.map(p => ({ ...p }));
    expect(after).toEqual(before);
  });

  it('12 · switchItemVariant a variante cambia price/cost y recalcula el subtotal (cálculo canónico)', () => {
    useCartStore.getState().addItem(
      { product_id: cable.id, variant_id: null, variant: null, price: cable.price, cost: 0, quantity: 2, product: cable, subtotal: cable.price * 2 },
    );
    useCartStore.getState().switchItemVariant(cable.id, null, varianteRollo100.id);
    const item = useCartStore.getState().items[0];
    expect(item.variant_id).toBe(varianteRollo100.id);
    expect(item.price).toBe(9000);
    expect(item.cost).toBe(cable.cost_price * 100); // cost_price × factor
    expect(item.subtotal).toBe(18000);
    // Modo venta: fila de pago re-sincronizada al nuevo subtotal
    expect(item.payments[0].amount).toBe(18000);
  });

  it('13 · switchItemVariant fusiona con línea existente de la misma variante (FIX-P1-3)', () => {
    // Línea base (metros) y línea de rollos 100m (variante como 2º argumento,
    // igual que hace el catálogo POS al hacer click)
    useCartStore.getState().addItem(
      { product_id: cable.id, variant_id: null, variant: null, price: cable.price, cost: 0, quantity: 2, product: cable, subtotal: cable.price * 2 },
    );
    useCartStore.getState().addItem(
      { product_id: cable.id, variant_id: varianteRollo100.id, price: varianteRollo100.price, cost: 0, quantity: 1, product: cable, subtotal: varianteRollo100.price },
      varianteRollo100,
    );
    expect(useCartStore.getState().items).toHaveLength(2);
    // Cambiar la línea base a Rollo 100m → se fusiona con la existente
    useCartStore.getState().switchItemVariant(cable.id, null, varianteRollo100.id);
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].variant_id).toBe(varianteRollo100.id);
    expect(items[0].quantity).toBe(3); // 2 (base) + 1 (rollo)
    // La línea destino conserva SU precio y el subtotal se recalcula canónico.
    // (addItem resuelve price = product.price en lignes con precio base +
    // variantes — peculiaridad preexistente documentada en el informe; la
    // selección de unidad DENTRO del carrito sí aplica variant.price.)
    expect(items[0].subtotal).toBe(items[0].price * items[0].quantity);
  });
});
