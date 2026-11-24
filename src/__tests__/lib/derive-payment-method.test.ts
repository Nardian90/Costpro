/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 — FASE 2: método de venta derivado
 * de las distribuciones reales por línea (helper compartido por el panel de
 * cobro clásico y Cajero Express).
 *
 * Contrato EXACTO del bloque «AUTO-DETECT PAYMENT METHOD» del panel clásico
 * (del que se extrajo): sin overrides → cash; 1 método → ese método;
 * 2+ métodos → mixed; fallback legacy a campos por método.
 */
import { describe, it, expect } from 'vitest';
import { deriveCartPaymentMethod } from '@/lib/pos/derive-payment-method';
import { useCartStore, type CartItem } from '@/store/cart';

const STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  const base: CartItem = {
    product_id: 'p-1',
    variant_id: null,
    quantity: 1,
    price: 100,
    base_price_cup: 100,
    cost: 50,
    subtotal: 100,
    product: { id: 'p-1', name: 'Producto', sku: 'SKU-1', price: 100, stock_current: 10, is_service: false } as CartItem['product'],
    variant: null,
    discount_type: null,
    discount_value: 0,
    discount_currency: 'CUP',
    payments: [],
    cash_paid: 0,
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
  };
  return { ...base, ...overrides };
}

function row(method: 'cash' | 'transfer' | 'external_transfer', amount: number, currency = 'CUP') {
  return {
    id: `pay-${method}-${Math.random().toString(36).slice(2, 7)}`,
    method, amount, currency,
    discount_type: null,
    discount_value: 0,
    discount_currency: currency,
  };
}

describe('deriveCartPaymentMethod — método derivado de las distribuciones reales', () => {
  it('sin overrides manuales → cash (default, soporta desglose de billetes)', () => {
    const items = [makeItem({ payments: [row('cash', 100)] })];
    expect(deriveCartPaymentMethod(items)).toBe('cash');
  });

  it('override manual con UN método → ese método (transferencia)', () => {
    const items = [makeItem({
      payment_manual_override: true,
      payments: [row('transfer', 100)],
    })];
    expect(deriveCartPaymentMethod(items)).toBe('transfer');
  });

  it('override con cash + transfer en la MISMA línea → mixed (misión §2.3)', () => {
    const items = [makeItem({
      payment_manual_override: true,
      payments: [row('cash', 400), row('transfer', 300)],
    })];
    expect(deriveCartPaymentMethod(items)).toBe('mixed');
  });

  it('líneas con distribuciones DIFERENTES → mixed (misión §2.3: cada producto su pago)', () => {
    const items = [
      makeItem({ product_id: 'a', payment_manual_override: true, payments: [row('cash', 500)] }),
      makeItem({ product_id: 'b', payment_manual_override: true, payments: [row('transfer', 300)] }),
      makeItem({ product_id: 'c', payment_manual_override: true, payments: [row('external_transfer', 700, 'USD')] }),
    ];
    expect(deriveCartPaymentMethod(items)).toBe('mixed');
  });

  it('todas las líneas con UN mismo método override → ese método (no mixed)', () => {
    const items = [
      makeItem({ product_id: 'a', payment_manual_override: true, payments: [row('transfer', 500)] }),
      makeItem({ product_id: 'b', payment_manual_override: true, payments: [row('transfer', 300)] }),
    ];
    expect(deriveCartPaymentMethod(items)).toBe('transfer');
  });

  it('fallback legacy: campos por método cuando payments[] está vacío', () => {
    const items = [makeItem({
      payment_manual_override: true,
      payments: [],
      cash_paid: 100,
      transfer_paid: 50,
    })];
    expect(deriveCartPaymentMethod(items)).toBe('mixed');
  });

  it('override manual pero filas con monto 0 → cash (sin métodos efectivos)', () => {
    const items = [makeItem({
      payment_manual_override: true,
      payments: [row('cash', 0)],
    })];
    expect(deriveCartPaymentMethod(items)).toBe('cash');
  });

  it('contrato con el store real: carrito sin overrides deriva cash', () => {
    useCartStore.setState({ items: [makeItem()], storeId: STORE, lastUpdated: Date.now() });
    expect(deriveCartPaymentMethod(useCartStore.getState().items)).toBe('cash');
  });
});
