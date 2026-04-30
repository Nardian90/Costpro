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
    neq: vi.fn().mockReturnThis(),
  },
}));

describe('useUsers', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches users from profiles table', async () => {
    const mockUsers = [{
        id: '550e8400-e29b-41d4-a716-446655440001',
        full_name: 'User 1',
        email: 'user1@test.com',
        role: 'clerk',
        roles: ['clerk'],
        role_id: '550e8400-e29b-41d4-a716-446655440002',
        is_active: true,
        store_id: '550e8400-e29b-41d4-a716-446655440003',
        active_store_id: '550e8400-e29b-41d4-a716-446655440003',
        created_at: new Date().toISOString(),
        plan: 'free',
        created_by: '550e8400-e29b-41d4-a716-446655440004'
    }];

    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'profiles') {
            return {
                select: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: mockUsers, error: null }),
                neq: vi.fn().mockReturnThis()
            };
        }
        if (table === 'user_store_memberships') {
            return {
                select: vi.fn().mockResolvedValue({ data: [], error: null })
            };
        }
        return { select: vi.fn().mockReturnThis() };
    });

    const { result } = renderHook(() => useUsers('u1', true, false), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].full_name).toBe('User 1');
  });
});
