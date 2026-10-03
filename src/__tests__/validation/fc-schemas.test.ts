import { describe, it, expect } from 'vitest';
import {
  upsertStoreCostTemplateSchema,
  getStoreCostTemplateSchema,
  getProductCostSheetSchema,
  saveProductCostSheetSchema,
  quickPdfSchema,
} from '@/validation/api-schemas';
// RES190-CONTRACT (fix/fc-res190-contract): el contrato UI (FC_PDF_FORMATS,
// fuente única de los <option> de EditStoreModal / StoreOnboardingWizard /
// BulkApplyTemplateModal) y el enum Zod de la API deben estar alineados.
import { FC_PDF_FORMATS } from '@/contracts/store-cost-template';

// ============================================
// upsertStoreCostTemplateSchema
// ============================================

describe('upsertStoreCostTemplateSchema', () => {
  it('validates a complete valid input', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      template_data: { custom: true },
      modalidad: 'produccion',
      pdf_format: 'res148',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.store_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.data.template_id).toBe('template-pizza');
      expect(result.data.modalidad).toBe('produccion');
      expect(result.data.pdf_format).toBe('res148');
    }
  });

  it('validates with minimal required fields', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'costpro-reinicio',
      modalidad: 'servicios',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pdf_format).toBe('res148'); // default
      expect(result.data.template_data).toBeUndefined(); // optional
    }
  });

  it('rejects invalid store_id', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: 'not-a-uuid',
      template_id: 'template-pizza',
      modalidad: 'produccion',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty template_id', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: '',
      modalidad: 'produccion',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid modalidad', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      modalidad: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid pdf_format', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      modalidad: 'produccion',
      pdf_format: 'nonexistent',
    });

    expect(result.success).toBe(false);
  });

  it('accepts all 3 valid modalidades', () => {
    for (const modalidad of ['produccion', 'servicios', 'comercializacion']) {
      const result = upsertStoreCostTemplateSchema.safeParse({
        store_id: '550e8400-e29b-41d4-a716-446655440000',
        template_id: 'template-pizza',
        modalidad,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts null template_data', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      template_data: null,
      modalidad: 'produccion',
    });

    expect(result.success).toBe(true);
  });
});

// ============================================
// RES190-CONTRACT (fix/fc-res190-contract)
// ============================================
// Contrato determinado (Caso B — evidencia en el informe de la rama
// fix/fc-res190-contract): 'res190' ("Res. 190/2021") NUNCA fue un formato
// soportado por CostPro — el enum Zod de PUT /api/store-cost-templates
// (10 formatos) y el generador de PDF (pdf-generator.ts) nunca lo
// aceptaron; la opción existía SOLO en la UI (nació rota en 1a25d1901).
// La UI dejó de ofrecerla y ahora deriva sus <option> de FC_PDF_FORMATS.
// Estos tests fijan el contrato en ambos extremos:

describe('RES190-CONTRACT: pdf_format UI ↔ API alineados', () => {
  it('acepta res148 (regresión — formato normativo vigente Res. 148/2023 MFP)', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      modalidad: 'produccion',
      pdf_format: 'res148',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pdf_format).toBe('res148');
  });

  it('rechaza res190 — nunca fue parte del contrato de formatos (bug original: UI lo ofrecía y la API respondía 400 INVALID_DATA)', () => {
    const result = upsertStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
      template_id: 'template-pizza',
      modalidad: 'produccion',
      pdf_format: 'res190',
    });

    expect(result.success).toBe(false);
  });

  it('quickPdfSchema también rechaza res190 (descarga de PDF coherente con el upsert)', () => {
    const result = quickPdfSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
      pdf_format: 'res190',
    });

    expect(result.success).toBe(false);
  });

  it('cada formato que la UI puede ofrecer (FC_PDF_FORMATS) es aceptado por el enum Zod — drift imposible', () => {
    expect(FC_PDF_FORMATS.length).toBeGreaterThan(0);
    for (const pdfFormat of FC_PDF_FORMATS) {
      const result = upsertStoreCostTemplateSchema.safeParse({
        store_id: '550e8400-e29b-41d4-a716-446655440000',
        template_id: 'template-pizza',
        modalidad: 'produccion',
        pdf_format: pdfFormat,
      });
      expect(result.success, `FC_PDF_FORMATS contiene "${pdfFormat}" que la API rechazaría`).toBe(true);
    }
  });

  it('res190 no está en FC_PDF_FORMATS (la UI ya no puede ofrecerlo)', () => {
    expect(FC_PDF_FORMATS).not.toContain('res190' as never);
  });
});

// ============================================
// getStoreCostTemplateSchema
// ============================================

describe('getStoreCostTemplateSchema', () => {
  it('validates a valid store_id', () => {
    const result = getStoreCostTemplateSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing store_id', () => {
    const result = getStoreCostTemplateSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = getStoreCostTemplateSchema.safeParse({
      store_id: 'invalid',
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// getProductCostSheetSchema
// ============================================

describe('getProductCostSheetSchema', () => {
  it('validates with required product_id only', () => {
    const result = getProductCostSheetSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.success).toBe(true);
  });

  it('validates with optional store_id', () => {
    const result = getProductCostSheetSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
      store_id: '660e8400-e29b-41d4-a716-446655440001',
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing product_id', () => {
    const result = getProductCostSheetSchema.safeParse({
      store_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid product_id', () => {
    const result = getProductCostSheetSchema.safeParse({
      product_id: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// saveProductCostSheetSchema
// ============================================

describe('saveProductCostSheetSchema', () => {
  const validInput = {
    product_id: '550e8400-e29b-41d4-a716-446655440000',
    store_id: '660e8400-e29b-41d4-a716-446655440001',
    template_id: 'template-pizza',
    modalidad: 'produccion',
    calculated_data: { rows: [], total: 100 },
    cost_price: 100,
  };

  it('validates a complete valid input', () => {
    const result = saveProductCostSheetSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_price).toBe(100);
    }
  });

  it('rejects negative cost_price', () => {
    const result = saveProductCostSheetSchema.safeParse({
      ...validInput,
      cost_price: -5,
    });

    expect(result.success).toBe(false);
  });

  it('accepts zero cost_price', () => {
    const result = saveProductCostSheetSchema.safeParse({
      ...validInput,
      cost_price: 0,
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid modalidad', () => {
    const result = saveProductCostSheetSchema.safeParse({
      ...validInput,
      modalidad: 'otra_cosa',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing calculated_data', () => {
    const { calculated_data, ...withoutData } = validInput;
    const result = saveProductCostSheetSchema.safeParse(withoutData);

    expect(result.success).toBe(false);
  });

  it('rejects empty template_id', () => {
    const result = saveProductCostSheetSchema.safeParse({
      ...validInput,
      template_id: '',
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// quickPdfSchema
// ============================================

describe('quickPdfSchema', () => {
  it('validates with required product_id only', () => {
    const result = quickPdfSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pdf_format).toBe('res148'); // default
    }
  });

  it('validates with all fields', () => {
    const result = quickPdfSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
      store_id: '660e8400-e29b-41d4-a716-446655440001',
      pdf_format: 'pro',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pdf_format).toBe('pro');
    }
  });

  it('rejects invalid product_id', () => {
    const result = quickPdfSchema.safeParse({
      product_id: 'bad',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid pdf_format', () => {
    const result = quickPdfSchema.safeParse({
      product_id: '550e8400-e29b-41d4-a716-446655440000',
      pdf_format: 'nonexistent',
    });

    expect(result.success).toBe(false);
  });
});
