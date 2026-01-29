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

  it('should default is_active to true when missing or undefined', () => {
    const productWithoutActive = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      name: 'Missing Active Product',
      price: 10,
      cost_price: 5
    };

    // Test missing field
    const result1 = productSchema.safeParse(productWithoutActive);
    expect(result1.success).toBe(true);
    if (result1.success) {
      expect(result1.data.is_active).toBe(true);
    }

    // Test undefined field
    const result2 = productSchema.safeParse({ ...productWithoutActive, is_active: undefined });
    expect(result2.success).toBe(true);
    if (result2.success) {
      expect(result2.data.is_active).toBe(true);
    }

    // Test null field (should also default to true according to our fix)
    const result3 = productSchema.safeParse({ ...productWithoutActive, is_active: null });
    expect(result3.success).toBe(true);
    if (result3.success) {
      expect(result3.data.is_active).toBe(true);
    }
  });

  it('should correctly handle string "true" and "false" for is_active', () => {
    const productBase = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      name: 'String Boolean Product',
      price: 10,
      cost_price: 5
    };

    const resultTrue = productSchema.safeParse({ ...productBase, is_active: 'true' });
    expect(resultTrue.success).toBe(true);
    if (resultTrue.success) {
      expect(resultTrue.data.is_active).toBe(true);
    }

    const resultFalse = productSchema.safeParse({ ...productBase, is_active: 'false' });
    expect(resultFalse.success).toBe(true);
    if (resultFalse.success) {
      expect(resultFalse.data.is_active).toBe(false);
    }
  });
});
