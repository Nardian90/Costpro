import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '../useProducts';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => {
  const mock = {
    rpc: vi.fn(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
  };
  return { supabase: mock };
});

describe('useProducts', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validId = '550e8400-e29b-41d4-a716-446655440001';

  it('fetches products using get_products_for_pos RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    const storeId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useProducts(storeId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_products_for_pos', expect.any(Object));
  });

  it('useCreateProduct inserts into products', async () => {
    (supabase.from as any).mockReturnThis();
    (supabase.insert as any).mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useCreateProduct(), { wrapper: Wrapper });
    await result.current.mutateAsync({
      name: 'New Product', sku: 'NP001', price: 100, cost_price: 50,
      store_id: '550e8400-e29b-41d4-a716-446655440000', category: 'General'
    });
    expect(supabase.from).toHaveBeenCalledWith('products');
  });

  it('useUpdateProduct updates products', async () => {
    (supabase.from as any).mockReturnThis();
    (supabase.update as any).mockReturnThis();
    (supabase.eq as any).mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useUpdateProduct(), { wrapper: Wrapper });
    await result.current.mutateAsync({ id: validId, name: 'Updated' });
    expect(supabase.update).toHaveBeenCalled();
  });

  it('useDeleteProduct calls managed_delete_product RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useDeleteProduct(), { wrapper: Wrapper });
    await result.current.mutateAsync(validId);
    expect(supabase.rpc).toHaveBeenCalledWith('managed_delete_product', expect.any(Object));
  });
});
