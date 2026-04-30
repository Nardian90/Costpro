import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMultiStoreDashboard } from '../useMultiStoreDashboard';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }
}));

describe('useMultiStoreDashboard', () => {
  const { Wrapper } = createQueryWrapper();
  const mockStores = [
    { id: 'store-1', name: 'Store 1', address: 'Address 1', is_active: true, created_at: '' },
    { id: 'store-2', name: 'Store 2', address: 'Address 2', is_active: true, created_at: '' }
  ] as any[];

  beforeEach(() => {
    vi.clearAllMocks();
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

    const { result } = renderHook(() => useMultiStoreDashboard(mockStores, 'store-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].todaySales).toBe(1000);
  });
});
