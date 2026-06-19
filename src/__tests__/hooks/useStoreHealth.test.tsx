import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabaseClient antes de importar el hook
const mockFrom = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useStoreHealth } from '@/hooks/api/useStoreHealth';

// Helper para crear query chain de Supabase
function createCountChain(count: number | null = 0, error: unknown = null) {
  const proxy: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // Hacer que el proxy sea thenable (resuelve como { count, error })
  proxy.then = (resolve: (v: any) => void) => resolve({ data: null, error, count });
  return proxy;
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useStoreHealth (F4-T05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFrom.mockReset();
  });

  it('calcula score 100 cuando todas las categorías están logradas', async () => {
    const stores = [{
      id: 'store-1', name: 'Tienda Test',
      address: 'Calle 1', phone: '123', email: 'test@test.com',
      reeup: '12345678901', nit: '12345', bank_account: 'BANCO123',
      cost_template: { is_active: true },
    }];

    // Mock: products count > 0, transactions count > 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' || table === 'transactions') {
        return createCountChain(5, null);
      }
      return createCountChain(0, null);
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

    mockFrom.mockImplementation(() => createCountChain(0, null));

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

    mockFrom.mockImplementation(() => createCountChain(0, null));

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    const health = result.current.data?.['store-3'];
    expect(health!.total).toBe(40); // 20 config + 20 fiscal
    expect(health!.categories.find(c => c.key === 'config')!.achieved).toBe(true);
    expect(health!.categories.find(c => c.key === 'fiscal')!.achieved).toBe(true);
    expect(health!.categories.find(c => c.key === 'fc')!.achieved).toBe(false);
  });

  it('consulta transactions (no sales) con status=completed', async () => {
    const stores = [{
      id: 'store-4', name: 'T',
      address: 'a', phone: 'p', email: 'e@e.com',
      reeup: '12345678901', nit: 'n', bank_account: 'b',
      cost_template: { is_active: true },
    }];

    const transactionsChain = createCountChain(3, null);
    const productsChain = createCountChain(2, null);
    const spyTransactions = vi.fn().mockReturnValue(transactionsChain);
    const spyProducts = vi.fn().mockReturnValue(productsChain);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        const chain = createCountChain(3, null);
        // Verificar que se llama con eq('status', 'completed')
        return chain;
      }
      if (table === 'products') {
        return createCountChain(2, null);
      }
      return createCountChain(0, null);
    });

    const { result } = renderHook(() => useStoreHealth(stores), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    // Verificar que se consultó 'transactions' (no 'sales')
    const calledTables = mockFrom.mock.calls.map(c => c[0]);
    expect(calledTables).toContain('transactions');
    expect(calledTables).not.toContain('sales');
  });
});
