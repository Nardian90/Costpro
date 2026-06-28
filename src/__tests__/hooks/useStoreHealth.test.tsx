import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useStoreHealth } from '@/hooks/api/useStoreHealth';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useStoreHealth (F4-T05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockApiFetch.mockReset();
  });

  it('calcula score 100 cuando todas las categorías están logradas', async () => {
    const stores = [{
      id: 'store-1', name: 'Tienda Test',
      address: 'Calle 1', phone: '123', email: 'test@test.com',
      reeup: '12345678901', nit: '12345', bank_account: 'BANCO123',
      cost_template: { is_active: true },
    }];

    mockApiFetch.mockResolvedValue({
      'store-1': { has_products: true, has_sales: true },
    });

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const health = result.current.data?.['store-1'];
    expect(health).toBeDefined();
    expect(health!.total).toBe(100);
    expect(health!.categories.every(c => c.achieved)).toBe(true);
  });

  it('calcula score 0 cuando nada está logrado', async () => {
    const stores = [{
      id: 'store-2', name: 'Tienda Vacía',
      address: null, phone: null, email: null,
      reeup: null, nit: null, bank_account: null,
      cost_template: null,
    }];

    mockApiFetch.mockResolvedValue({
      'store-2': { has_products: false, has_sales: false },
    });

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const health = result.current.data?.['store-2'];
    expect(health!.total).toBe(0);
    expect(health!.categories.every(c => !c.achieved)).toBe(true);
  });

  it('calcula score 40 con config + fiscal pero sin FC/productos/ventas', async () => {
    const stores = [{
      id: 'store-3', name: 'Tienda Parcial',
      address: 'Calle', phone: '123', email: 'e@e.com',
      reeup: '12345678901', nit: '123', bank_account: 'BANCO',
      cost_template: null,
    }];

    mockApiFetch.mockResolvedValue({
      'store-3': { has_products: false, has_sales: false },
    });

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const health = result.current.data?.['store-3'];
    expect(health!.total).toBe(40);
    expect(health!.categories.find(c => c.key === 'config')!.achieved).toBe(true);
    expect(health!.categories.find(c => c.key === 'fiscal')!.achieved).toBe(true);
    expect(health!.categories.find(c => c.key === 'fc')!.achieved).toBe(false);
  });

  it('usa batch endpoint (apiFetch) en vez de queries individuales', async () => {
    const stores = [{
      id: 'store-4', name: 'T',
      address: 'a', phone: 'p', email: 'e@e.com',
      reeup: '12345678901', nit: 'n', bank_account: 'b',
      cost_template: { is_active: true },
    }];

    mockApiFetch.mockResolvedValue({
      'store-4': { has_products: true, has_sales: true },
    });

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/stores/health-batch');
    expect(url).toContain('store_ids=store-4');
  });
});
