import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../index';

const mockProduct = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Product',
  price: 100,
  cost_price: 50,
  stock_current: 10,
  cost_average: 50,
  min_stock: 2,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
};

const mockCartItem = {
  product_id: mockProduct.id,
  variant_id: null,
  product: mockProduct,
  variant: null,
  quantity: 2,
  price: 100,
  cost: 50,
  subtotal: 200,
};

describe('Cart Store', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it('should add an item to the cart', () => {
    const { addItem } = useCartStore.getState();
    addItem(mockCartItem);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product_id).toBe(mockProduct.id);
  });

  it('should increase quantity if adding the same item', () => {
    const { addItem } = useCartStore.getState();
    addItem(mockCartItem);
    addItem(mockCartItem);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(4);
    expect(useCartStore.getState().items[0].subtotal).toBe(400);
  });

  it('should remove an item', () => {
    const { addItem, removeItem } = useCartStore.getState();
    addItem(mockCartItem);
    removeItem(mockCartItem.product_id, mockCartItem.variant_id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('should update quantity', () => {
    const { addItem, updateQuantity } = useCartStore.getState();
    addItem(mockCartItem);
    updateQuantity(mockCartItem.product_id, mockCartItem.variant_id, 5);
    expect(useCartStore.getState().items[0].quantity).toBe(5);
    expect(useCartStore.getState().items[0].subtotal).toBe(500);
  });

  it('should calculate subtotal and total', () => {
    const { addItem, getSubtotal, getTotal, setDiscount } = useCartStore.getState();
    addItem(mockCartItem); // 200
    expect(getSubtotal()).toBe(200);
    expect(getTotal()).toBe(200);

    setDiscount({ type: 'percentage', value: 10 });
    expect(getTotal()).toBe(180);

    setDiscount({ type: 'fixed', value: 50 });
    expect(getTotal()).toBe(150);
  });
});
