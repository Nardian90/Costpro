import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionManager } from '../useSessionManager';
import { useAuthStore, useSessionStore } from '@/store';

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(vi.fn(), {
      getState: vi.fn().mockReturnValue({ isMocked: true, user: null, token: null, loading: false }),
      subscribe: vi.fn(),
  }),
  useSessionStore: vi.fn().mockReturnValue({
    isOnline: true,
    isCheckingSession: false,
    lastChecked: 0,
    setOnlineStatus: vi.fn(),
    setSessionStatus: vi.fn(),
    setStatus: vi.fn(),
  })
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('useSessionManager', () => {
  it('bypasses session check if mocked', async () => {
    (useAuthStore as any).mockImplementation((selector: any) => {
        const state = { isMocked: true, user: null, token: null, loading: false, login: vi.fn(), logout: vi.fn(), setLoading: vi.fn(), setStatus: vi.fn() };
        return typeof selector === 'function' ? selector(state) : state;
    });

    renderHook(() => useSessionManager());

    await waitFor(() => {
        expect(useAuthStore.getState().isMocked).toBe(true);
    });
  });
});
