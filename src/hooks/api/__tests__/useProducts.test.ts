import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProducts, useSuspenseProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useToggleProductActive, useBulkUpdateProducts } from '../useProducts';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
  },
}));

describe('useProducts', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validId = '550e8400-e29b-41d4-a716-446655440001';

  it('fetches products using get_products_for_pos RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useProducts('550e8400-e29b-41d4-a716-446655440000'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_products_for_pos', expect.any(Object));
  });

  it('useSuspenseProducts fetches products', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useSuspenseProducts('550e8400-e29b-41d4-a716-446655440000'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });

  it('useToggleProductActive calls RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useToggleProductActive(), { wrapper: Wrapper });
    await result.current.mutateAsync({ productId: validId, isActive: false });
    expect(supabase.rpc).toHaveBeenCalledWith('managed_toggle_product_active', expect.any(Object));
  });

  it('useBulkUpdateProducts calls RPC', async () => {
    // Correcting mock return to be an array as expected by validateRPCArrayResponse
    (supabase.rpc as any).mockResolvedValue({ data: [{ updated_count: 1, inserted_count: 0 }], error: null });
    const { result } = renderHook(() => useBulkUpdateProducts(), { wrapper: Wrapper });
    await result.current.mutateAsync({
        storeId: '550e8400-e29b-41d4-a716-446655440000',
        products: [{
            store_id: '550e8400-e29b-41d4-a716-446655440000',
            sku: 'S1', name: 'P1', cost_price: 10, price: 15
        }]
    });
    expect(supabase.rpc).toHaveBeenCalledWith('bulk_update_products', expect.any(Object));
  });
});
