import { describe, it, expect } from 'vitest';
import {
  resolveProductFC,
  shouldInvalidateFC,
  createInvalidationEvent,
  getQuickPdfUrl,
  getFCStatusBadge,
  calculateFCCoverage,
  type FCProductInput,
  type FCStoreTemplateInput,
  type FCExistingCostSheetInput,
} from '@/lib/integration/fc-automation';

// ============================================
// Fixtures
// ============================================

const baseProduct: FCProductInput = {
  id: 'prod-001',
  store_id: 'store-001',
  cost_sheet_id: null,
  fc_auto_enabled: true,
  cost_price: 100,
  name: 'Pizza Margherita',
};

const baseTemplate: FCStoreTemplateInput = {
  template_id: 'template-pizza',
  template_data: null,
  modalidad: 'produccion',
  pdf_format: 'res148',
  is_active: true,
};

const baseCostSheet: FCExistingCostSheetInput = {
  id: 'cs-001',
  product_id: 'prod-001',
  store_id: 'store-001',
  template_id: 'template-pizza',
  modalidad: 'produccion',
  calculated_data: { total: 100 },
  cost_price: 100,
  cost_price_updated_at: '2026-06-15T00:00:00Z',
  sync_status: 'synced',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T00:00:00Z',
  deleted_at: null,
};

// ============================================
// resolveProductFC
// ============================================

describe('resolveProductFC', () => {
  it('returns "disabled" when fc_auto_enabled is false', () => {
    const product = { ...baseProduct, fc_auto_enabled: false };
    const result = resolveProductFC(product, null, baseTemplate);

    expect(result.status).toBe('disabled');
    if (result.status === 'disabled') {
      expect(result.product_id).toBe('prod-001');
      expect(result.fc_status).toBe('sin_fc');
      expect(result.message).toContain('deshabilitada');
    }
  });

  it('returns "existing" when product has a valid cost_sheet_id', () => {
    const product = { ...baseProduct, cost_sheet_id: 'cs-001' };
    const result = resolveProductFC(product, baseCostSheet, baseTemplate);

    expect(result.status).toBe('existing');
    if (result.status === 'existing') {
      expect(result.costSheet.id).toBe('cs-001');
      expect(result.fc_status).toBe('vigente');
    }
  });

  it('returns "existing" with "pendiente" when FC has sync_status conflict', () => {
    const product = { ...baseProduct, cost_sheet_id: 'cs-001' };
    const costSheet = { ...baseCostSheet, sync_status: 'conflict' as const };
    const result = resolveProductFC(product, costSheet, baseTemplate);

    expect(result.status).toBe('existing');
    if (result.status === 'existing') {
      expect(result.fc_status).toBe('pendiente');
    }
  });

  it('returns "existing" with "pendiente" when cost_price is 0', () => {
    const product = { ...baseProduct, cost_sheet_id: 'cs-001' };
    const costSheet = { ...baseCostSheet, cost_price: 0 };
    const result = resolveProductFC(product, costSheet, baseTemplate);

    expect(result.status === 'existing' ? result.fc_status : null).toBe('pendiente');
  });

  it('falls through to template when costSheet is deleted', () => {
    const product = { ...baseProduct, cost_sheet_id: 'cs-001' };
    const costSheet = { ...baseCostSheet, deleted_at: '2026-06-10T00:00:00Z' };
    const result = resolveProductFC(product, costSheet, baseTemplate);

    // Should fall through to needs_calculation since costSheet is deleted
    expect(result.status).toBe('needs_calculation');
  });

  it('returns "no_template" when product has no store_id', () => {
    const product = { ...baseProduct, store_id: null, cost_sheet_id: null };
    const result = resolveProductFC(product, null, null);

    expect(result.status).toBe('no_template');
    if (result.status === 'no_template') {
      expect(result.store_id).toBe('');
      expect(result.message).toContain('tienda asignada');
    }
  });

  it('returns "needs_calculation" when store has active template and no FC exists', () => {
    const result = resolveProductFC(baseProduct, null, baseTemplate);

    expect(result.status).toBe('needs_calculation');
    if (result.status === 'needs_calculation') {
      expect(result.product_id).toBe('prod-001');
      expect(result.store_id).toBe('store-001');
      expect(result.template_id).toBe('template-pizza');
      expect(result.modalidad).toBe('produccion');
      expect(result.pdf_format).toBe('res148');
      expect(result.fc_status).toBe('pendiente');
    }
  });

  it('returns "no_template" when store has no template', () => {
    const result = resolveProductFC(baseProduct, null, null);

    expect(result.status).toBe('no_template');
    if (result.status === 'no_template') {
      expect(result.fc_status).toBe('sin_fc');
      expect(result.message).toContain('plantilla');
    }
  });

  it('returns "no_template" when store template is inactive', () => {
    const inactiveTemplate = { ...baseTemplate, is_active: false };
    const result = resolveProductFC(baseProduct, null, inactiveTemplate);

    expect(result.status).toBe('no_template');
  });

  it('respects disabled FC even when store has template', () => {
    const product = { ...baseProduct, fc_auto_enabled: false };
    const result = resolveProductFC(product, null, baseTemplate);

    // Disabled takes priority over everything
    expect(result.status).toBe('disabled');
  });
});

// ============================================
// shouldInvalidateFC
// ============================================

describe('shouldInvalidateFC', () => {
  it('returns true when cost_price changed', () => {
    expect(shouldInvalidateFC({ cost_price: 100 }, { cost_price: 120 })).toBe(true);
  });

  it('returns false when cost_price is the same', () => {
    expect(shouldInvalidateFC({ cost_price: 100 }, { cost_price: 100 })).toBe(false);
  });

  it('returns true when cost_price changes from 0 to positive', () => {
    expect(shouldInvalidateFC({ cost_price: 0 }, { cost_price: 50 })).toBe(true);
  });

  it('returns true when cost_price drops to 0', () => {
    expect(shouldInvalidateFC({ cost_price: 50 }, { cost_price: 0 })).toBe(true);
  });
});

// ============================================
// createInvalidationEvent
// ============================================

describe('createInvalidationEvent', () => {
  it('creates event with all fields', () => {
    const event = createInvalidationEvent(
      'prod-001',
      'store-001',
      'cost_price_changed',
      100,
      120,
    );

    expect(event.product_id).toBe('prod-001');
    expect(event.store_id).toBe('store-001');
    expect(event.reason).toBe('cost_price_changed');
    expect(event.previous_cost_price).toBe(100);
    expect(event.new_cost_price).toBe(120);
    expect(event.timestamp).toBeTypeOf('string');
    expect(new Date(event.timestamp).getTime()).not.toBeNaN();
  });

  it('creates event without price info', () => {
    const event = createInvalidationEvent('prod-002', 'store-002', 'template_changed');

    expect(event.previous_cost_price).toBeUndefined();
    expect(event.new_cost_price).toBeUndefined();
  });
});

// ============================================
// getQuickPdfUrl
// ============================================

describe('getQuickPdfUrl', () => {
  it('generates correct URL with default format', () => {
    const url = getQuickPdfUrl('prod-001', 'store-001');
    expect(url).toBe('/api/product-cost-sheets/quick-pdf?product_id=prod-001&store_id=store-001&pdf_format=res148');
  });

  it('generates correct URL with custom format', () => {
    const url = getQuickPdfUrl('prod-001', 'store-001', 'pro');
    expect(url).toContain('pdf_format=pro');
    expect(url).toContain('product_id=prod-001');
  });
});

// ============================================
// getFCStatusBadge
// ============================================

describe('getFCStatusBadge', () => {
  it('returns green badge for "vigente"', () => {
    const badge = getFCStatusBadge('vigente');
    expect(badge.label).toBe('FC Vigente');
    expect(badge.color).toBe('green');
  });

  it('returns yellow badge for "pendiente"', () => {
    const badge = getFCStatusBadge('pendiente');
    expect(badge.label).toBe('FC Pendiente');
    expect(badge.color).toBe('yellow');
  });

  it('returns gray badge for "sin_fc"', () => {
    const badge = getFCStatusBadge('sin_fc');
    expect(badge.label).toBe('Sin FC');
    expect(badge.color).toBe('gray');
  });
});

// ============================================
// calculateFCCoverage
// ============================================

describe('calculateFCCoverage', () => {
  it('returns zero coverage for empty product list', () => {
    const result = calculateFCCoverage([], new Map());
    expect(result.total).toBe(0);
    expect(result.coverage).toBe(0);
  });

  it('counts sin_fc for products with fc_auto_enabled=false', () => {
    const products = [{ cost_sheet_id: null, fc_auto_enabled: false, cost_price: 0 }];
    const result = calculateFCCoverage(products, new Map());
    expect(result.sin_fc).toBe(1);
    expect(result.vigente).toBe(0);
  });

  it('counts sin_fc for products without cost_sheet_id', () => {
    const products = [{ cost_sheet_id: null, fc_auto_enabled: true, cost_price: 0 }];
    const result = calculateFCCoverage(products, new Map());
    expect(result.sin_fc).toBe(1);
  });

  it('counts vigente for synced products with positive cost_price', () => {
    const products = [{ cost_sheet_id: 'cs-1', fc_auto_enabled: true, cost_price: 100 }];
    const costSheets = new Map([['cs-1', { sync_status: 'synced' as const, cost_price: 100 }]]);
    const result = calculateFCCoverage(products, costSheets);
    expect(result.vigente).toBe(1);
    expect(result.coverage).toBe(100);
  });

  it('counts pendiente for conflict cost sheets', () => {
    const products = [{ cost_sheet_id: 'cs-1', fc_auto_enabled: true, cost_price: 100 }];
    const costSheets = new Map([['cs-1', { sync_status: 'conflict' as const, cost_price: 100 }]]);
    const result = calculateFCCoverage(products, costSheets);
    expect(result.pendiente).toBe(1);
    expect(result.vigente).toBe(0);
  });

  it('calculates mixed coverage correctly', () => {
    const products = [
      { cost_sheet_id: 'cs-1', fc_auto_enabled: true, cost_price: 100 },   // vigente
      { cost_sheet_id: 'cs-2', fc_auto_enabled: true, cost_price: 200 },   // pendiente (conflict)
      { cost_sheet_id: null, fc_auto_enabled: true, cost_price: 0 },       // sin_fc
      { cost_sheet_id: 'cs-3', fc_auto_enabled: false, cost_price: 50 },   // sin_fc (disabled)
    ];
    const costSheets = new Map([
      ['cs-1', { sync_status: 'synced' as const, cost_price: 100 }],
      ['cs-2', { sync_status: 'conflict' as const, cost_price: 200 }],
    ]);
    const result = calculateFCCoverage(products, costSheets);

    expect(result.total).toBe(4);
    expect(result.vigente).toBe(1);
    expect(result.pendiente).toBe(1);
    expect(result.sin_fc).toBe(2);
    expect(result.coverage).toBe(25); // 1/4 = 25%
  });
});
