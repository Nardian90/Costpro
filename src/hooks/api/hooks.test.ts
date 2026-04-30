import { describe, it, expect, vi } from 'vitest';
import { profileSchema, transactionSchema } from '@/validation/schemas';

describe('Zod Schema Resilience', () => {
  it('should handle partial/invalid profile data gracefully using defaults', () => {
    const invalidProfile = {
      id: 'not-a-uuid',
      full_name: '',
      email: 'invalid-email',
      memberships: 'not-an-array' // Should be preprocessed to []
    };

    const result = profileSchema.safeParse(invalidProfile);

    // We expect success because of our hardening
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
      id: 'some-valid-id',
      full_name: 'Test User',
      email: 'test@example.com',
      memberships: [
        { store_id: '', role: 'invalid-role' }, // store_id '' transforms to null, role defaults to clerk
        { store_id: 'bad-uuid' } // bad uuid might fail if not careful, but we used .or(z.string()) if we wanted,
                                 // actually we used .uuid().or(z.string().length(0).transform(() => null))
      ]
    };

    const result = profileSchema.safeParse(profileWithBadMemberships);
    // If it fails, it should at least not throw
    // Our userStoreMembershipSchema: store_id: z.string().uuid().or(z.string().length(0).transform(() => null)).nullable().optional()

    // Because of our .catch([]), it now succeeds but returns an empty array
    // instead of failing the whole profile.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memberships).toHaveLength(0);
    }
  });

  it('should handle transaction defaults', () => {
    const emptyTransaction = {
      id: 'some-id'
    };
    const result = transactionSchema.safeParse(emptyTransaction);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_amount).toBe(0);
      expect(result.data.status).toBe('pending');
    }
  });
});
