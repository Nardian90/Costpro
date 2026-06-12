/**
 * @vitest-environment jsdom
 *
 * Tests unitarios para useReportValidation hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseAuthStore = vi.hoisted(() => vi.fn());
vi.mock('@/store', () => ({ useAuthStore: mockUseAuthStore }));

import { useReportValidation } from '@/hooks/ui/useReportValidation';
import type { ReportDefinition } from '@/types';

const baseConfig: Partial<ReportDefinition> = {
  name: 'Test', type: 'sales', filters: {},
  date_range: { from: '2025-01-01', to: '2025-12-31' },
  columns: ['id', 'created_at', 'total_amount'],
};

describe('useReportValidation', () => {
  beforeEach(() => {
    // useAuthStore() returns zustand state: { user: UserContract, token, loading, ... }
    mockUseAuthStore.mockReturnValue({ user: { activeStoreId: 's1' } });
  });

  it('valid when all conditions met', () => {
    const { result } = renderHook(() => useReportValidation(baseConfig));
    expect(result.current.validate('generate')).toBeNull();
    expect(result.current.hasStore).toBe(true);
    expect(result.current.isInvalidDateRange).toBe(false);
  });

  it('detects missing store', () => {
    mockUseAuthStore.mockReturnValue({ user: { activeStoreId: null } });
    const { result } = renderHook(() => useReportValidation(baseConfig));
    expect(result.current.validate('generate')).toBe('Seleccione una tienda activa');
    expect(result.current.hasStore).toBe(false);
  });

  it('detects invalid date range', () => {
    const cfg = { ...baseConfig, date_range: { from: '2025-12-31', to: '2025-01-01' } };
    const { result } = renderHook(() => useReportValidation(cfg));
    expect(result.current.validate('generate')).toContain('Desde');
    expect(result.current.isInvalidDateRange).toBe(true);
  });

  it('detects missing kardex product', () => {
    const cfg = { ...baseConfig, type: "kardex" as any, filters: {} };
    const { result } = renderHook(() => useReportValidation(cfg));
    expect(result.current.validate('generate')).toContain('producto');
    expect(result.current.isMissingKardexProduct).toBe(true);
  });

  it('passes kardex with product_id', () => {
    const cfg = { ...baseConfig, type: "kardex" as any, filters: { product_id: "p1" } };
    const { result } = renderHook(() => useReportValidation(cfg));
    expect(result.current.validate('generate')).toBeNull();
  });

  it('checks columns only for export', () => {
    const cfg = { ...baseConfig, columns: [] };
    const { result } = renderHook(() => useReportValidation(cfg));
    expect(result.current.validate('generate')).toBeNull();
    expect(result.current.validate('export')).toContain('columna');
  });

  it('handles null user', () => {
    mockUseAuthStore.mockReturnValue({ user: null });
    const { result } = renderHook(() => useReportValidation(baseConfig));
    expect(result.current.validate('generate')).toBe('Seleccione una tienda activa');
  });

  it('handles missing date_range', () => {
    const cfg = { ...baseConfig, date_range: undefined };
    const { result } = renderHook(() => useReportValidation(cfg));
    expect(result.current.isInvalidDateRange).toBe(false);
    expect(result.current.validate('generate')).toBeNull();
  });
});
