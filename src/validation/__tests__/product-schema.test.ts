import { describe, it, expect } from 'vitest';
import { productSchema } from '../schemas';

describe('Product Schema', () => {
  it('should validate a valid product with SKU', () => {
    const validProduct = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Product',
      sku: 'PROD-001',
      price: 10.5,
      cost_price: 5.0
    };
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('should validate a product with empty SKU', () => {
    const emptySkuProduct = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Empty SKU Product',
      sku: '',
      price: 10,
      cost_price: 5
    };
    const result = productSchema.safeParse(emptySkuProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe(null);
    }
  });

  it('should validate a product with null SKU', () => {
    const nullSkuProduct = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Null SKU Product',
      sku: null,
      price: 10,
      cost_price: 5
    };
    const result = productSchema.safeParse(nullSkuProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe(null);
    }
  });

  it('should validate a product without SKU field', () => {
    const noSkuProduct = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'No SKU Product',
      price: 10,
      cost_price: 5
    };
    const result = productSchema.safeParse(noSkuProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeUndefined();
    }
  });
});
