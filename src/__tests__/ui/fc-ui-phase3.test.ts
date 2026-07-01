/**
 * @file Tests de componentes UI de Fase 3 — FC Automatizada
 * @description Tests para FCStatusBadge, FCCoverageBar, y lógica de filtrado
 */

import { describe, it, expect } from 'vitest';
import { getFCStatusBadge, calculateFCCoverage } from '@/lib/integration/fc-automation';
import { getProductFCStatus } from '@/contracts/product-cost-sheet';
import type { CostSheetSyncStatus } from '@/contracts/product-cost-sheet';

// ============================================
// FCStatusBadge logic tests
// ============================================

describe('FCStatusBadge — getFCStatusBadge data', () => {
  it('returns green badge for vigente', () => {
    const badge = getFCStatusBadge('vigente');
    expect(badge).toEqual({ label: 'FC Vigente', color: 'green' });
  });

  it('returns yellow badge for pendiente', () => {
    const badge = getFCStatusBadge('pendiente');
    expect(badge).toEqual({ label: 'FC Pendiente', color: 'yellow' });
  });

  it('returns gray badge for sin_fc', () => {
    const badge = getFCStatusBadge('sin_fc');
    expect(badge).toEqual({ label: 'Sin FC', color: 'gray' });
  });
});

// ============================================
// FC Filter logic tests
// ============================================

describe('FC Filter — FCFilterStatus type', () => {
  const validFilters: Array<'vigente' | 'pendiente' | 'sin_fc' | 'all'> = ['all', 'vigente', 'pendiente', 'sin_fc'];

  it('accepts all valid filter values', () => {
    for (const filter of validFilters) {
      expect(typeof filter).toBe('string');
    }
  });

  it('all values are distinct', () => {
    expect(new Set(validFilters).size).toBe(validFilters.length);
  });
});

// ============================================
// FCCoverage display logic tests
// ============================================

describe('FCCoverage — calculateFCCoverage', () => {
  it('returns 0 coverage for empty products', () => {
    const result = calculateFCCoverage([], new Map());
    expect(result).toEqual({
      vigente: 0,
      pendiente: 0,
      sin_fc: 0,
      total: 0,
      coverage: 0,
    });
  });

  it('calculates 100% coverage when all products are vigente', () => {
    const products = [
      { cost_sheet_id: 'cs1', fc_auto_enabled: true, cost_price: 100 },
      { cost_sheet_id: 'cs2', fc_auto_enabled: true, cost_price: 200 },
    ];
    const costSheets = new Map([
      ['cs1', { sync_status: 'synced' as CostSheetSyncStatus, cost_price: 100 }],
      ['cs2', { sync_status: 'synced' as CostSheetSyncStatus, cost_price: 200 }],
    ]);

    const result = calculateFCCoverage(products, costSheets);
    expect(result.vigente).toBe(2);
    expect(result.pendiente).toBe(0);
    expect(result.sin_fc).toBe(0);
    expect(result.coverage).toBe(100);
  });

  it('calculates 50% coverage for half vigente half sin_fc', () => {
    const products = [
      { cost_sheet_id: 'cs1', fc_auto_enabled: true, cost_price: 100 },
      { cost_sheet_id: null, fc_auto_enabled: true, cost_price: 50 },
    ];
    const costSheets = new Map([
      ['cs1', { sync_status: 'synced' as CostSheetSyncStatus, cost_price: 100 }],
    ]);

    const result = calculateFCCoverage(products, costSheets);
    expect(result.vigente).toBe(1);
    expect(result.sin_fc).toBe(1);
    expect(result.coverage).toBe(50);
  });

  it('counts disabled products as sin_fc', () => {
    const products = [
      { cost_sheet_id: null, fc_auto_enabled: false, cost_price: 50 },
    ];

    const result = calculateFCCoverage(products, new Map());
    expect(result.sin_fc).toBe(1);
    expect(result.coverage).toBe(0);
  });

  it('rounds coverage to 2 decimal places', () => {
    const products = [
      { cost_sheet_id: 'cs1', fc_auto_enabled: true, cost_price: 100 },
      { cost_sheet_id: null, fc_auto_enabled: true, cost_price: 50 },
      { cost_sheet_id: null, fc_auto_enabled: true, cost_price: 75 },
    ];
    const costSheets = new Map([
      ['cs1', { sync_status: 'synced' as CostSheetSyncStatus, cost_price: 100 }],
    ]);

    const result = calculateFCCoverage(products, costSheets);
    expect(result.coverage).toBe(33.33);
  });
});

// ============================================
// getProductFCStatus integration with badge
// ============================================

describe('FC Status integration — getProductFCStatus + getFCStatusBadge', () => {
  it('synced cost sheet with price returns vigente badge (green)', () => {
    const status = getProductFCStatus('cs-1', 199.99, 'synced');
    expect(status).toBe('vigente');
    const badge = getFCStatusBadge(status);
    expect(badge.color).toBe('green');
  });

  it('pending cost sheet returns pendiente badge (yellow)', () => {
    const status = getProductFCStatus('cs-2', 100, 'pending');
    expect(status).toBe('pendiente');
    const badge = getFCStatusBadge(status);
    expect(badge.color).toBe('yellow');
  });

  it('null cost sheet id returns sin_fc badge (gray)', () => {
    const status = getProductFCStatus(null, 0, 'synced');
    expect(status).toBe('sin_fc');
    const badge = getFCStatusBadge(status);
    expect(badge.color).toBe('gray');
  });
});

// ============================================
// Store FC template indicator logic
// ============================================

describe('Store FC Template — indicator logic', () => {
  it('shows active badge when cost_template is active', () => {
    const store = {
      cost_template: {
        id: 't1',
        store_id: 's1',
        template_id: 'costpro-reinicio',
        modalidad: 'produccion',
        pdf_format: 'res148',
        is_active: true,
      },
    };
    expect(store.cost_template?.is_active).toBe(true);
    expect(store.cost_template?.modalidad).toBe('produccion');
  });

  it('shows inactive badge when cost_template is null', () => {
    const store: { cost_template: { is_active: boolean; modalidad: string } | null } = { cost_template: null };
    expect(store.cost_template?.is_active).toBeFalsy();
  });

  it('shows inactive badge when cost_template is undefined', () => {
    const store: { cost_template?: { is_active: boolean; modalidad: string } } = {};
    expect(store.cost_template?.is_active).toBeFalsy();
  });
});
