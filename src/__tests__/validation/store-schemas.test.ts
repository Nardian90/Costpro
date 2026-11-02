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

  it('accepts missing address (create-quick flow)', () => {
    // F4-FIX: address es opcional para soportar create-quick donde solo se envía name + slug
    const result = createStoreSchema.safeParse({ name: 'Tienda' });
    expect(result.success).toBe(true);
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

  // ── MISIÓN 2026-11-02: fix del wipe de imágenes en PATCH parciales ──
  // Antes, nullableUrl transformaba claves AUSENTES en null → cualquier PATCH
  // parcial (toggle is_active, banner de Vitrina, whatsapp…) borraba logo_url,
  // signature_url, stamp_url, banner_url, etc. de la tienda en la DB.
  describe('optionalNullableUrl — PATCH parciales no borran imágenes (regresión)', () => {
    const STORE = '550e8400-e29b-41d4-a716-446655440000';

    it('toggle is_active NO inyecta null en campos de imagen ausentes', () => {
      const result = updateStoreSchema.safeParse({ storeId: STORE, is_active: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logo_url).toBeUndefined();
        expect(result.data.signature_url).toBeUndefined();
        expect(result.data.stamp_url).toBeUndefined();
        expect(result.data.banner_url).toBeUndefined();
        expect(result.data.whatsapp_group_url).toBeUndefined();
        expect(result.data.telegram_url).toBeUndefined();
        expect(result.data.banner_cta_link).toBeUndefined();
        expect(result.data.is_active).toBe(false);
      }
    });

    it("logo_url: '' → null SOLO para logo_url (quitar logo, resto ausente)", () => {
      const result = updateStoreSchema.safeParse({ storeId: STORE, logo_url: '' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logo_url).toBeNull();
        expect(result.data.signature_url).toBeUndefined();
        expect(result.data.stamp_url).toBeUndefined();
      }
    });

    it("signature_url: '' y stamp_url: '' → null; logo_url ausente intacto", () => {
      const result = updateStoreSchema.safeParse({ storeId: STORE, signature_url: '', stamp_url: '' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.signature_url).toBeNull();
        expect(result.data.stamp_url).toBeNull();
        expect(result.data.logo_url).toBeUndefined();
      }
    });

    it('URL válida enviada se conserva tal cual', () => {
      const url = 'https://wthkddeleylijmonclxg.supabase.co/storage/v1/object/public/stores/store-logos/a.jpeg';
      const result = updateStoreSchema.safeParse({ storeId: STORE, logo_url: url });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logo_url).toBe(url);
      }
    });

    it('rechaza un valor no-URL explícito', () => {
      const result = updateStoreSchema.safeParse({ storeId: STORE, logo_url: 'no-es-url' });
      expect(result.success).toBe(false);
    });
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
