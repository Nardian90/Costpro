import { describe, it, expect } from 'vitest';
import { profileSchema, transactionSchema } from '@/validation/schemas';

describe('Zod Schema Resilience', () => {
  it('should handle partial/invalid profile data gracefully using defaults', () => {
    const invalidProfile = {
      id: '550e8400-e29b-41d4-a716-446655440001', // id is strict z.string()
      full_name: '',
      email: 'invalid-email',
      memberships: 'not-an-array' // Should be preprocessed to []
    };

    const result = profileSchema.safeParse(invalidProfile);

    // email and full_name have .catch()
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Usuario sin nombre');
      expect(result.data.email).toBe('no-email@costpro.com');
      expect(Array.isArray(result.data.memberships)).toBe(true);
      expect(result.data.memberships).toHaveLength(0);
    }
  });

  it('should handle invalid memberships within the array', () => {
    const profileWithBadMemberships = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      full_name: 'Test User',
      email: 'test@example.com',
      memberships: [
        { store_id: '', role: 'invalid-role' },
        { store_id: 'bad-uuid' }
      ]
    };

    const result = profileSchema.safeParse(profileWithBadMemberships);

    // Currently memberships: z.preprocess(...).catch([])
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memberships).toHaveLength(0);
    }
  });

  it('should handle transaction defaults', () => {
    const emptyTransaction = {
      id: '550e8400-e29b-41d4-a716-446655440001'
    };
    const result = transactionSchema.safeParse(emptyTransaction);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_amount).toBe(0);
      expect(result.data.status).toBe('pending');
    }
  });
});
