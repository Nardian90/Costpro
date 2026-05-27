import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStores } from '../useStores';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  },
}));

describe('useStores', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cuando isAdmin = true, retorna todas las tiendas activas', async () => {
    const mockStores = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Store 1',
        is_active: true,
        address: 'Address 1',
        logo_url: null,
        reeup: '123',
        bank_account: 'ACC1'
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'stores') {
            return {
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: mockStores, error: null })
            };
        }
        return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            mockResolvedValue: vi.fn().mockResolvedValue({ data: [], error: null })
        };
    });

    const { result } = renderHook(() => useStores('550e8400-e29b-41d4-a716-446655440000', true, false), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess || result.current.isLoading).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe('Store 1');
  });
});
