import { describe, it, expect } from 'vitest';
import { resilientUuid, optionalResilientUuid } from '../schemas';

describe('Resilient UUID Schemas', () => {
  describe('resilientUuid', () => {
    it('should convert "null" string to null', () => {
      const result = resilientUuid.safeParse('null');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(null);
    });

    it('should convert "undefined" string to null', () => {
      const result = resilientUuid.safeParse('undefined');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(null);
    });

    it('should convert empty string to null', () => {
      const result = resilientUuid.safeParse('');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(null);
    });

    it('should pass valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = resilientUuid.safeParse(uuid);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(uuid);
    });

    it('should fail on invalid UUID string (that is not a common JS-ism)', () => {
      const result = resilientUuid.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('optionalResilientUuid', () => {
    it('should catch invalid UUID and return null', () => {
      const result = optionalResilientUuid.safeParse('completely-invalid');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(null);
    });

    it('should still convert JS-isms to null', () => {
      expect(optionalResilientUuid.safeParse('undefined').data).toBe(null);
      expect(optionalResilientUuid.safeParse('null').data).toBe(null);
      expect(optionalResilientUuid.safeParse('').data).toBe(null);
    });
  });
});
