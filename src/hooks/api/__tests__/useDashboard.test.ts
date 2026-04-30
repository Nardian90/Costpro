import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '../useDashboard';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('useDashboardData', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches KPIs using get_dashboard_kpis RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [{ total_sales: 1000 }], error: null });
    const storeId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useDashboardData(storeId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.kpis.gross_sales).toBe(1000);
  });
});
