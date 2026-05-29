import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMultiStoreDashboard } from '../useMultiStoreDashboard';
import { supabase } from '@/lib/supabaseClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => {
      // Build a deep chainable mock that always returns a resolved promise at the end
      const chainable: any = () => chainable;
      chainable.select = chainable;
      chainable.eq = chainable;
      chainable.gte = chainable;
      chainable.lte = chainable;
      chainable.in = chainable;
      chainable.limit = chainable;
      chainable.order = chainable;
      chainable.single = vi.fn().mockResolvedValue({ data: null, error: null });
      chainable.then = (resolve: any) => resolve({ data: [], count: 0, error: null });
      return chainable;
    })
  }
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useMultiStoreDashboard', () => {
  const mockStores = [
    { id: 'store-1', name: 'Store 1', address: 'Address 1', is_active: true, created_at: '', slug: null },
    { id: 'store-2', name: 'Store 2', address: 'Address 2', is_active: true, created_at: '', slug: null }
  ] as any[];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('should fetch KPIs using RPC when available', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: {
        today_sales: 1000,
        today_transactions: 10,
        low_stock_count: 5,
        pending_transfers_out: 2,
        pending_receptions: 1
      },
      error: null
    });

    const { result } = renderHook(() => useMultiStoreDashboard(mockStores, 'store-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]).toEqual({
      storeId: 'store-1',
      storeName: 'Store 1',
      storeSlug: null,
      storeAddress: 'Address 1',
      isActive: true,
      todaySales: 1000,
      todayTransactions: 10,
      lowStockCount: 5,
      pendingTransfersOut: 2,
      pendingReceptions: 1,
      visibleProducts: 0,
    });
  });

  it('should fallback to individual queries if RPC fails', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Not found' } });

    // Mock for individual queries (products, transactions, transfers)
    const fromSpy = vi.spyOn(supabase, 'from');

    const { result } = renderHook(() => useMultiStoreDashboard(mockStores, 'store-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    // Fallback queries 'products' first, then 'transactions', then 'transfers' per store
    expect(fromSpy).toHaveBeenCalledWith('products');
    expect(fromSpy).toHaveBeenCalledWith('transactions');
    expect(fromSpy).toHaveBeenCalledWith('transfers');
  });
});
