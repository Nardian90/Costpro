import { describe, it, expect } from 'vitest';
import { receiptItemSchema } from '../schemas';

describe('Receipt Schemas', () => {
  describe('receiptItemSchema', () => {
    it('should validate a valid receipt item', () => {
      const validItem = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        receipt_id: '550e8400-e29b-41d4-a716-446655440002',
        product_id: '550e8400-e29b-41d4-a716-446655440003',
        quantity: 10,
        unit_cost: 5.5,
        products: { id: 'p1', name: 'Product 1' }
      };
      const result = receiptItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });

    it('should handle numeric coercion for quantity and unit_cost', () => {
      const stringValuesItem = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        receipt_id: '550e8400-e29b-41d4-a716-446655440002',
        product_id: '550e8400-e29b-41d4-a716-446655440003',
        quantity: '25.5',
        unit_cost: '100.20',
        products: { id: 'p1', name: 'Product 1' }
      };
      const result = receiptItemSchema.safeParse(stringValuesItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(25.5);
        expect(result.data.unit_cost).toBe(100.20);
      }
    });
  });
});
