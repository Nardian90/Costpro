import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useInventory, useSuspenseInventory, useRegisterReception, useAdjustStock } from '../useInventory';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/components/providers/SyncProvider', () => ({
    useSyncContext: () => ({ addToQueue: vi.fn() })
}));

describe('useInventory', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockData = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Product 1',
      sku: 'SKU1',
      total_count: 1
    },
  ];

  it('fetches inventory using get_paginated_products RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: mockData, error: null });
    const storeId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useInventory(storeId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('get_paginated_products', expect.any(Object));
  });

  it('useSuspenseInventory fetches inventory', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: mockData, error: null });
    const storeId = '550e8400-e29b-41d4-a716-446655440000';
    const { result } = renderHook(() => useSuspenseInventory(storeId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].products).toHaveLength(1);
  });

  it('useRegisterReception calls register_reception RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: '550e8400-e29b-41d4-a716-446655440001', error: null });
    const { result } = renderHook(() => useRegisterReception(), { wrapper: Wrapper });
    await result.current.mutateAsync({
      p_store_id: '550e8400-e29b-41d4-a716-446655440000',
      p_supplier: 'Vendor',
      p_reception_date: new Date().toISOString(),
      p_invoice_number: 'INV-001',
      p_items: []
    });
    expect(supabase.rpc).toHaveBeenCalledWith('register_reception', expect.any(Object));
  });

  it('useAdjustStock calls perform_inventory_adjustment RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: {
        status: 'OK',
        nuevo_stock: 10,
        nuevo_costo_total: 100,
        nuevo_costo_unitario: 10,
        movimiento_registrado: true
    }, error: null });
    const { result } = renderHook(() => useAdjustStock(), { wrapper: Wrapper });
    await result.current.mutateAsync({
      productId: '550e8400-e29b-41d4-a716-446655440001',
      storeId: '550e8400-e29b-41d4-a716-446655440000',
      userId: '550e8400-e29b-41d4-a716-446655440002',
      quantityDelta: 10,
      unitCostAdjustment: 0,
      reason: 'Correction'
    });
    expect(supabase.rpc).toHaveBeenCalledWith('perform_inventory_adjustment', expect.any(Object));
  });
});
