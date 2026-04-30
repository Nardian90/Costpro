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
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'stores') {
            return {
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [{ id: 's1', is_active: true }], error: null })
            };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), mockResolvedValue: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
    const { result } = renderHook(() => useStores('u1', true, false), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
