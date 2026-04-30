import { describe, it, expect } from 'vitest';
import { receiptSchema, receiptItemSchema } from '../schemas';

describe('Receipt Schemas', () => {
  describe('receiptSchema', () => {
    it('should validate a valid receipt with active status', () => {
      const validReceipt = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        created_at: new Date().toISOString(),
        status: 'active',
        total_cost: 100.50,
        supplier: 'Test Supplier'
      };
      const result = receiptSchema.safeParse(validReceipt);
      expect(result.success).toBe(true);
    });

    it('should validate a receipt with pending status', () => {
      const pendingReceipt = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        created_at: new Date().toISOString(),
        status: 'pending',
        total_cost: 0,
        supplier: 'New Supplier'
      };
      const result = receiptSchema.safeParse(pendingReceipt);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('pending');
      }
    });

    it('should validate a receipt with partial status', () => {
      const partialReceipt = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        created_at: new Date().toISOString(),
        status: 'partial',
        total_cost: 500,
        supplier: 'Partial Supplier'
      };
      const result = receiptSchema.safeParse(partialReceipt);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('partial');
      }
    });

    it('should fallback to active status if an unknown status is provided', () => {
      const unknownStatusReceipt = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        created_at: new Date().toISOString(),
        status: 'unknown',
        total_cost: 0
      };
      const result = receiptSchema.safeParse(unknownStatusReceipt);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
      }
    });
  });

  describe('receiptItemSchema', () => {
    it('should validate a valid receipt item', () => {
      const validItem = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        receipt_id: '550e8400-e29b-41d4-a716-446655440000',
        product_id: '550e8400-e29b-41d4-a716-446655440005',
        quantity: 10,
        unit_cost: 15.25
      };
      const result = receiptItemSchema.safeParse(validItem);
      expect(result.success).toBe(true);
    });

    it('should handle numeric coercion for quantity and unit_cost', () => {
      const stringValuesItem = {
        id: '550e8400-e29b-41d4-a716-446655440006',
        receipt_id: '550e8400-e29b-41d4-a716-446655440000',
        product_id: '550e8400-e29b-41d4-a716-446655440005',
        quantity: '25.5',
        unit_cost: '100.99'
      };
      const result = receiptItemSchema.safeParse(stringValuesItem);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(25.5);
        expect(result.data.unit_cost).toBe(100.99);
      }
    });
  });
});
