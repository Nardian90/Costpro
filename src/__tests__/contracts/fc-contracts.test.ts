import { describe, it, expect } from 'vitest';
import {
  StoreCostTemplateFactory,
  mapStoreCostTemplateToContract,
  FC_MODALIDADES,
  FC_PDF_FORMATS,
  FC_MODALIDAD_LABELS,
  FC_PDF_FORMAT_LABELS,
  type StoreCostTemplateRaw,
} from '@/contracts/store-cost-template';
import {
  ProductCostSheetFactory,
  mapProductCostSheetToContract,
  getProductFCStatus,
  type ProductCostSheetRaw,
} from '@/contracts/product-cost-sheet';

// ============================================
// StoreCostTemplateContract
// ============================================

describe('StoreCostTemplateFactory', () => {
  it('create() returns an object with all default values', () => {
    const template = StoreCostTemplateFactory.create();

    expect(template.id).toBe('');
    expect(template.store_id).toBe('');
    expect(template.template_id).toBe('costpro-reinicio');
    expect(template.template_data).toBeNull();
    expect(template.modalidad).toBe('produccion');
    expect(template.pdf_format).toBe('res148');
    expect(template.is_active).toBe(true);
    expect(template.created_by).toBeNull();
    expect(template.created_at).toBeTypeOf('string');
    expect(template.updated_at).toBeTypeOf('string');
    // Validate ISO dates
    expect(new Date(template.created_at).getTime()).not.toBeNaN();
    expect(new Date(template.updated_at).getTime()).not.toBeNaN();
  });

  it('create() merges partial overrides', () => {
    const template = StoreCostTemplateFactory.create({
      id: 'tpl-001',
      store_id: 'store-123',
      template_id: 'template-pizza',
      modalidad: 'servicios',
      pdf_format: 'pro',
      template_data: { custom: true },
    });

    expect(template.id).toBe('tpl-001');
    expect(template.store_id).toBe('store-123');
    expect(template.template_id).toBe('template-pizza');
    expect(template.modalidad).toBe('servicios');
    expect(template.pdf_format).toBe('pro');
    expect(template.template_data).toEqual({ custom: true });
    // Non-overridden keep defaults
    expect(template.is_active).toBe(true);
  });
});

describe('mapStoreCostTemplateToContract', () => {
  it('converts raw DB type with all nulls to guaranteed contract', () => {
    const raw: StoreCostTemplateRaw = {
      id: 'tpl-raw',
      store_id: 'store-raw',
    };

    const contract = mapStoreCostTemplateToContract(raw);

    expect(contract.id).toBe('tpl-raw');
    expect(contract.store_id).toBe('store-raw');
    expect(contract.template_id).toBe('costpro-reinicio');
    expect(contract.template_data).toBeNull();
    expect(contract.modalidad).toBe('produccion');
    expect(contract.pdf_format).toBe('res148');
    expect(contract.is_active).toBe(true);
    expect(contract.created_by).toBeNull();
  });

  it('preserves valid non-null values from raw', () => {
    const raw: StoreCostTemplateRaw = {
      id: 'tpl-full',
      store_id: 'store-full',
      template_id: 'template-shoes',
      template_data: { section: 'calzado' },
      modalidad: 'comercializacion',
      pdf_format: 'ejecutivo',
      is_active: false,
      created_by: 'user-001',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };

    const contract = mapStoreCostTemplateToContract(raw);

    expect(contract.template_id).toBe('template-shoes');
    expect(contract.modalidad).toBe('comercializacion');
    expect(contract.pdf_format).toBe('ejecutivo');
    expect(contract.is_active).toBe(false);
    expect(contract.created_by).toBe('user-001');
    expect(contract.created_at).toBe('2026-01-01T00:00:00Z');
  });

  it('falls back to defaults for invalid modalidad', () => {
    const raw: StoreCostTemplateRaw = {
      id: 'tpl-bad',
      store_id: 'store-bad',
      modalidad: 'invalid_modalidad',
      pdf_format: 'invalid_format',
    };

    const contract = mapStoreCostTemplateToContract(raw);

    expect(contract.modalidad).toBe('produccion');
    expect(contract.pdf_format).toBe('res148');
  });
});

describe('FC Constants', () => {
  it('FC_MODALIDADES has 3 values matching Res. 148/2023', () => {
    expect(FC_MODALIDADES).toEqual(['produccion', 'servicios', 'comercializacion']);
  });

  it('FC_PDF_FORMATS has 10 formats', () => {
    expect(FC_PDF_FORMATS).toHaveLength(10);
    expect(FC_PDF_FORMATS).toContain('res148');
  });

  it('FC_MODALIDAD_LABELS has labels for all modalidades', () => {
    for (const modalidad of FC_MODALIDADES) {
      expect(FC_MODALIDAD_LABELS[modalidad]).toBeDefined();
      expect(FC_MODALIDAD_LABELS[modalidad].length).toBeGreaterThan(0);
    }
  });

  it('FC_PDF_FORMAT_LABELS has labels for all formats', () => {
    for (const format of FC_PDF_FORMATS) {
      expect(FC_PDF_FORMAT_LABELS[format]).toBeDefined();
      expect(FC_PDF_FORMAT_LABELS[format].length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// ProductCostSheetContract
// ============================================

describe('ProductCostSheetFactory', () => {
  it('create() returns an object with all default values', () => {
    const cs = ProductCostSheetFactory.create();

    expect(cs.id).toBe('');
    expect(cs.product_id).toBe('');
    expect(cs.store_id).toBe('');
    expect(cs.template_id).toBe('costpro-reinicio');
    expect(cs.modalidad).toBe('produccion');
    expect(cs.calculated_data).toEqual({});
    expect(cs.cost_price).toBe(0);
    expect(cs.cost_price_updated_at).toBeTypeOf('string');
    expect(cs.sync_status).toBe('pending');
    expect(cs.deleted_at).toBeNull();
  });

  it('create() merges partial overrides', () => {
    const cs = ProductCostSheetFactory.create({
      id: 'cs-001',
      product_id: 'prod-123',
      store_id: 'store-456',
      template_id: 'template-pizza',
      modalidad: 'comercializacion',
      cost_price: 125.50,
      sync_status: 'synced',
    });

    expect(cs.id).toBe('cs-001');
    expect(cs.product_id).toBe('prod-123');
    expect(cs.template_id).toBe('template-pizza');
    expect(cs.modalidad).toBe('comercializacion');
    expect(cs.cost_price).toBe(125.50);
    expect(cs.sync_status).toBe('synced');
  });
});

describe('mapProductCostSheetToContract', () => {
  it('converts raw DB type with nulls to guaranteed contract', () => {
    const raw: ProductCostSheetRaw = {
      id: 'cs-raw',
      product_id: 'prod-raw',
    };

    const contract = mapProductCostSheetToContract(raw);

    expect(contract.id).toBe('cs-raw');
    expect(contract.product_id).toBe('prod-raw');
    expect(contract.store_id).toBe('');
    expect(contract.template_id).toBe('costpro-reinicio');
    expect(contract.modalidad).toBe('produccion');
    expect(contract.calculated_data).toEqual({});
    expect(contract.cost_price).toBe(0);
    expect(contract.sync_status).toBe('pending');
    expect(contract.deleted_at).toBeNull();
  });

  it('converts NUMERIC string cost_price to number', () => {
    const raw: ProductCostSheetRaw = {
      id: 'cs-num',
      product_id: 'prod-num',
      cost_price: '199.99', // PostgreSQL NUMERIC returns as string
    };

    const contract = mapProductCostSheetToContract(raw);

    expect(contract.cost_price).toBe(199.99);
    expect(contract.cost_price).toBeTypeOf('number');
  });

  it('handles numeric cost_price without conversion', () => {
    const raw: ProductCostSheetRaw = {
      id: 'cs-num2',
      product_id: 'prod-num2',
      cost_price: 250.75, // Already a number
    };

    const contract = mapProductCostSheetToContract(raw);

    expect(contract.cost_price).toBe(250.75);
  });

  it('falls back to defaults for invalid modalidad and sync_status', () => {
    const raw: ProductCostSheetRaw = {
      id: 'cs-invalid',
      product_id: 'prod-invalid',
      modalidad: 'unknown',
      sync_status: 'unknown',
    };

    const contract = mapProductCostSheetToContract(raw);

    expect(contract.modalidad).toBe('produccion');
    expect(contract.sync_status).toBe('pending');
  });

  it('preserves valid non-null values', () => {
    const raw: ProductCostSheetRaw = {
      id: 'cs-valid',
      product_id: 'prod-valid',
      store_id: 'store-valid',
      template_id: 'template-icecream',
      modalidad: 'servicios',
      calculated_data: { total: 500 },
      cost_price: 500,
      cost_price_updated_at: '2026-03-15T12:00:00Z',
      sync_status: 'synced',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-03-15T12:00:00Z',
      deleted_at: null,
    };

    const contract = mapProductCostSheetToContract(raw);

    expect(contract.store_id).toBe('store-valid');
    expect(contract.template_id).toBe('template-icecream');
    expect(contract.modalidad).toBe('servicios');
    expect(contract.calculated_data).toEqual({ total: 500 });
    expect(contract.cost_price).toBe(500);
    expect(contract.sync_status).toBe('synced');
  });
});

// ============================================
// getProductFCStatus
// ============================================

describe('getProductFCStatus', () => {
  it('returns "sin_fc" when no cost_sheet_id', () => {
    expect(getProductFCStatus(null, 100, 'synced')).toBe('sin_fc');
    expect(getProductFCStatus(undefined, 100, 'synced')).toBe('sin_fc');
    expect(getProductFCStatus('', 100, 'synced')).toBe('sin_fc');
  });

  it('returns "vigente" when synced with positive cost_price', () => {
    expect(getProductFCStatus('cs-1', 150.50, 'synced')).toBe('vigente');
    expect(getProductFCStatus('cs-1', 0.01, 'synced')).toBe('vigente');
  });

  it('returns "pendiente" when sync_status is conflict', () => {
    expect(getProductFCStatus('cs-1', 100, 'conflict')).toBe('pendiente');
  });

  it('returns "pendiente" when cost_price is 0', () => {
    expect(getProductFCStatus('cs-1', 0, 'synced')).toBe('pendiente');
  });

  it('returns "pendiente" when cost_price is null with existing sheet', () => {
    expect(getProductFCStatus('cs-1', null, 'pending')).toBe('pendiente');
    expect(getProductFCStatus('cs-1', undefined, 'pending')).toBe('pendiente');
  });

  it('returns "pendiente" for any non-vigente, non-sin_fc case', () => {
    expect(getProductFCStatus('cs-1', 100, 'pending')).toBe('pendiente');
  });
});
