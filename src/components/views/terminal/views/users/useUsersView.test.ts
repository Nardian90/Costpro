import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUsersView } from './useUsersView';

// Mock hook dependencies
vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'admin-1', role: 'admin', activeStoreId: 's1' },
  })),
}));

vi.mock('@/hooks/api/useUsers', () => ({
  useUsers: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateUser: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateUser: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useManageUserMemberships: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false })),
}));

describe('useUsersView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', async () => {
    const { result } = renderHook(() => useUsersView());
    expect(result.current.users).toEqual([]);
    expect(result.current.isLoadingUsers).toBe(false);
  });

  it('filters users by search term', async () => {
    const { useUsers } = await import('@/hooks/api/useUsers');
    (useUsers as any).mockReturnValue({
        data: [
            { id: '1', full_name: 'Juan', email: 'juan@test.com', role: 'clerk' },
            { id: '2', full_name: 'Admin', email: 'admin@test.com', role: 'admin' },
        ],
        isLoading: false
    });

    const { result } = renderHook(() => useUsersView());

    act(() => {
      result.current.setSearchTerm('Juan');
    });

    expect(result.current.users).toHaveLength(1);
    expect(result.current.users[0].full_name).toBe('Juan');
  });
});
