import { describe, it, expect } from 'vitest';
import { createStoreSchema, updateStoreSchema, deleteStoreSchema } from '@/validation/api-schemas';

describe('createStoreSchema', () => {
  const validPayload = {
    name: 'Mi Tienda',
    address: 'Calle 10 #456',
  };

  it('passes with valid minimal payload (name + address)', () => {
    const result = createStoreSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('passes with full valid payload', () => {
    const fullPayload = {
      ...validPayload,
      email: 'tienda@example.com',
      reeup: '12345678901',
      nit: '123456789012345',
      plantilla: 'moderna' as const,
      logo_url: 'https://example.com/logo.png',
      signature_url: 'https://example.com/sign.png',
      stamp_url: 'https://example.com/stamp.png',
      phone: '+53 555 12345',
      slug: 'mi-tienda',
      bank_account: '1234-5678',
      latitude: 23.11,
      longitude: -82.36,
    };
    const result = createStoreSchema.safeParse(fullPayload);
    expect(result.success).toBe(true);
  });

  it('fails when name is missing', () => {
    const result = createStoreSchema.safeParse({ address: 'Calle 10' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find(i => i.path.includes('name'));
      expect(nameIssue).toBeDefined();
    }
  });

  it('fails when address is missing', () => {
    const result = createStoreSchema.safeParse({ name: 'Tienda' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const addressIssue = result.error.issues.find(i => i.path.includes('address'));
      expect(addressIssue).toBeDefined();
    }
  });

  it('fails with invalid email', () => {
    const result = createStoreSchema.safeParse({ ...validPayload, email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailIssue = result.error.issues.find(i => i.path.includes('email'));
      expect(emailIssue).toBeDefined();
    }
  });

  it('fails with invalid REEUP (not 11 digits)', () => {
    const result = createStoreSchema.safeParse({ ...validPayload, reeup: '123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const reeupIssue = result.error.issues.find(i => i.path.includes('reeup'));
      expect(reeupIssue).toBeDefined();
    }
  });

  it('fails with invalid NIT (non-digits)', () => {
    const result = createStoreSchema.safeParse({ ...validPayload, nit: 'abc123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nitIssue = result.error.issues.find(i => i.path.includes('nit'));
      expect(nitIssue).toBeDefined();
    }
  });

  it('fails with invalid plantilla enum', () => {
    const result = createStoreSchema.safeParse({ ...validPayload, plantilla: 'invalid_template' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const plantillaIssue = result.error.issues.find(i => i.path.includes('plantilla'));
      expect(plantillaIssue).toBeDefined();
    }
  });
});

describe('updateStoreSchema', () => {
  it('passes with valid update payload', () => {
    const payload = {
      storeId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Tienda Actualizada',
    };
    const result = updateStoreSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('fails with invalid storeId (not UUID)', () => {
    const payload = {
      storeId: 'not-a-uuid',
      name: 'Tienda',
    };
    const result = updateStoreSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const storeIdIssue = result.error.issues.find(i => i.path.includes('storeId'));
      expect(storeIdIssue).toBeDefined();
    }
  });
});

describe('deleteStoreSchema', () => {
  it('passes with valid delete payload', () => {
    const payload = { storeId: '550e8400-e29b-41d4-a716-446655440000' };
    const result = deleteStoreSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('fails when storeId is missing', () => {
    const result = deleteStoreSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const storeIdIssue = result.error.issues.find(i => i.path.includes('storeId'));
      expect(storeIdIssue).toBeDefined();
    }
  });

  it('fails with invalid storeId format', () => {
    const payload = { storeId: 'abc-123' };
    const result = deleteStoreSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const storeIdIssue = result.error.issues.find(i => i.path.includes('storeId'));
      expect(storeIdIssue).toBeDefined();
    }
  });
});
