import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReceptions } from '../useReceptions';
import { supabase } from '@/lib/supabaseClient';
import { createQueryWrapper } from '@/__fixtures__/query-wrapper';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/services/audit-service', () => ({
  auditService: { logReceptionVoided: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAuthStore: { getState: vi.fn() },
}));

describe('useReceptions', () => {
  const { Wrapper } = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches receptions from receipts table', async () => {
    const mockData = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'active',
        total_cost: 100,
        created_at: new Date().toISOString(),
        user_id: '550e8400-e29b-41d4-a716-446655440002',
        store_id: '550e8400-e29b-41d4-a716-446655440003'
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'receipts') {
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockResolvedValue({ data: mockData, error: null })
            };
        }
        return { select: vi.fn().mockReturnThis() };
    });
    const { result } = renderHook(() => useReceptions('s1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});
