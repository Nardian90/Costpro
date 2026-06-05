import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCartStore } from '../cart';

const mockProduct = {
  id: 'prod-1',
  name: 'Product 1',

  cost_price: 50,
  stock_current: 10,
  sku: 'sku-1'
};

describe('Cart Store - Advanced Features', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it('should handle item-level percentage discount', () => {
    const store = useCartStore.getState();
    store.addItem({
      product_id: 'prod-1',
      variant_id: null,
      product: mockProduct as any,
      variant: null,
      quantity: 2,

      cost: 50,
      discount_type: null,
      discount_value: 0,
      cash_paid: 0,
      transfer_paid: 0,
      subtotal: 200
    });

    store.updateItemDiscount('prod-1', null, 'percentage', 10);
    const item = useCartStore.getState().items[0];

    // (100 - 10%) * 2 = 90 * 2 = 180
    expect(item.subtotal).toBe(180);
    expect(item.cash_paid).toBe(180);
  });

  it('should handle item-level fixed discount', () => {
    const store = useCartStore.getState();
    store.addItem({
      product_id: 'prod-1',
      variant_id: null,
      product: mockProduct as any,
      variant: null,
      quantity: 2,

      cost: 50,
      discount_type: null,
      discount_value: 0,
      cash_paid: 0,
      transfer_paid: 0,
      subtotal: 200
    });

    store.updateItemDiscount('prod-1', null, 'fixed', 5);
    const item = useCartStore.getState().items[0];

    // (100 - 5) * 2 = 95 * 2 = 190
    expect(item.subtotal).toBe(190);
  });

  it('should handle global proration (the penny problem)', () => {
    const store = useCartStore.getState();

    // Add 3 items of 33.33 each
    const products = [
        { id: 'p1', name: 'P1', price: 33.33 },
        { id: 'p2', name: 'P2', price: 33.33 },
        { id: 'p3', name: 'P3', price: 33.34 }
    ];

    products.forEach(p => {
        store.addItem({
            product_id: p.id,
            variant_id: null,
            product: { ...mockProduct, id: p.id, name: p.name, price: p.price, stock_current: 10 } as any,
            variant: null,
            quantity: 1,
            price: p.price,
            cost: 20,
            discount_type: null,
            discount_value: 0,
            cash_paid: 0,
            transfer_paid: 0,
            subtotal: p.price
        });
    });

    const total = store.getTotal(); // 33.33 + 33.33 + 33.34 = 100.00
    expect(total).toBe(100);

    // Pay 15.00 cash, 85.00 transfer
    store.prorateGlobalPayment(15, 85);

    const items = useCartStore.getState().items;
    const totalCash = items.reduce((acc, i) => acc + i.cash_paid!, 0);
    const totalTransfer = items.reduce((acc, i) => acc + i.transfer_paid!, 0);

    expect(totalCash).toBe(15);
    expect(totalTransfer).toBe(85);

    // Check individual items
    // Weight p1 = 33.33/100 = 0.3333
    // p1 cash = 15 * 0.3333 = 4.9995 -> 5.00 (rounded to 2 decimals)
    // p1 transfer = 85 * 0.3333 = 28.3305 -> 28.33

    // Check remainders on last item
    // p1: 5.00 cash, 28.33 transf (Sum = 33.33)
    // p2: 5.00 cash, 28.33 transf (Sum = 33.33)
    // p3: remainder of 15-10=5 cash, 85-56.66=28.34 transf (Sum = 33.34)
    expect(items[0].cash_paid).toBe(5.00);
    expect(items[1].cash_paid).toBe(5.00);
    expect(items[2].cash_paid).toBe(5.00);

    expect(items[0].transfer_paid).toBe(28.33);
    expect(items[1].transfer_paid).toBe(28.33);
    expect(items[2].transfer_paid).toBe(28.34);
  });
});
