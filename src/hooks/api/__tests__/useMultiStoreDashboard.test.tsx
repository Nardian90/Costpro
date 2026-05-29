import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMultiStoreDashboard } from '../useMultiStoreDashboard';
import { supabase } from '@/lib/supabaseClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// More flexible mock for Supabase chainable calls
const createMockChain = (finalValue: any) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (resolve: any) => resolve(finalValue),
    catch: (reject: any) => {},
  };
  // To support await
  chain.asPromise = Promise.resolve(finalValue);
  return chain;
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => createMockChain({ data: [], count: 0, error: null }))
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
    { id: 'store-1', name: 'Store 1', address: 'Address 1', is_active: true, created_at: '' }
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
        pending_receptions: 1,
        visible_products: 42
      },
      error: null
    });

    const { result } = renderHook(() => useMultiStoreDashboard(mockStores, 'store-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
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
      visibleProducts: 42
    });
  });

  it('should fallback to individual queries if RPC fails', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'Not found' } });
    const fromSpy = vi.spyOn(supabase, 'from');

    const { result } = renderHook(() => useMultiStoreDashboard(mockStores, 'store-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(fromSpy).toHaveBeenCalledWith('products');
    expect(fromSpy).toHaveBeenCalledWith('transactions');
    expect(fromSpy).toHaveBeenCalledWith('transfers');
  });
});
