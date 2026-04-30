import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUsers } from '../useUsers';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  },
}));

describe('useUsers', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches users from profiles table', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
            return {
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: [{ id: 'u1', full_name: 'User 1' }], error: null })
            };
        }
        return { select: vi.fn().mockReturnThis() };
    });
    const { result } = renderHook(() => useUsers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
