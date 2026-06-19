import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock React hooks before importing the hook
const mockRef = { current: false };
vi.mock('react', () => ({
  useRef: (_initial: unknown) => mockRef,
  useCallback: (fn: (...args: unknown[]) => unknown, _deps: unknown[]) => fn,
}));

// Mock dependencies before imports
const mockUpdateUser = vi.fn();
const mockClearCartOnStoreSwitch = vi.fn();
const mockSetActiveStore = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@/store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', activeStoreId: 'store-old', storeId: 'store-old' },
    updateUser: mockUpdateUser,
  }),
}));

vi.mock('@/store/cart', () => ({
  useCartStore: {
    getState: () => ({ clearCartOnStoreSwitch: mockClearCartOnStoreSwitch }),
  },
}));

vi.mock('@/services/user-service', () => ({
  userService: {
    setActiveStore: (...args: unknown[]) => mockSetActiveStore(...args),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('useStoreSwitcher', () => {
  let switchStore: (storeId: string) => Promise<void>;
  let isSwitching: { current: boolean };

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Reset the shared ref for each test
    mockRef.current = false;
    mockUpdateUser.mockReset();
    mockClearCartOnStoreSwitch.mockReset();
    mockSetActiveStore.mockReset();
    mockInvalidateQueries.mockReset();

    // Import fresh each time
    const mod = await import('@/hooks/ui/useStoreSwitcher');
    const hook = mod.useStoreSwitcher();
    switchStore = hook.switchStore;
    isSwitching = hook.isSwitching;
  });

  describe('switchStore', () => {
    it('clears cart on store switch', async () => {
      mockSetActiveStore.mockResolvedValue(undefined);
      await switchStore('store-new');
      expect(mockClearCartOnStoreSwitch).toHaveBeenCalledWith('store-new');
    });

    it('performs optimistic local update immediately', async () => {
      mockSetActiveStore.mockResolvedValue(undefined);
      await switchStore('store-new');
      expect(mockUpdateUser).toHaveBeenCalledWith({
        activeStoreId: 'store-new',
        storeId: 'store-new',
      });
    });

    it('persists active store to database', async () => {
      mockSetActiveStore.mockResolvedValue(undefined);
      await switchStore('store-new');
      expect(mockSetActiveStore).toHaveBeenCalledWith('user-1', 'store-new');
    });

    it('invalidates ALL 15 store-dependent query keys', async () => {
      mockSetActiveStore.mockResolvedValue(undefined);
      await switchStore('store-new');

      const invalidatedKeys = mockInvalidateQueries.mock.calls.map(
        (call: any[]) => call[0]?.queryKey
      );

      // All 15 query keys that must be invalidated
      const expectedKeys = [
        ['products'],
        ['transactions'],
        ['dashboard'],
        ['inventory'],
        ['cost-sheets'],
        ['cash-closures'],
        ['receptions'],
        ['stock-movements'],
        ['audit-logs'],
        ['stores'],
        ['transfers'],
        ['ofertas'],
        ['kardex'],
        ['taxes'],
        ['reports'],
      ];

      // Verify every single expected key is present
      for (const key of expectedKeys) {
        expect(invalidatedKeys).toContainEqual(key);
      }

      // Exactly 15 query keys should be invalidated
      expect(invalidatedKeys.length).toBe(15);
    });

    it('reverts optimistic update on database failure', async () => {
      mockSetActiveStore.mockRejectedValue(new Error('DB error'));
      await switchStore('store-new');

      // Should have been called twice: once optimistic, once revert
      expect(mockUpdateUser).toHaveBeenCalledTimes(2);
      expect(mockUpdateUser).toHaveBeenLastCalledWith({
        activeStoreId: 'store-old',
        storeId: 'store-old',
      });
    });

    it('returns isSwitching ref that is false after completion', async () => {
      mockSetActiveStore.mockResolvedValue(undefined);
      await switchStore('store-new');
      expect(isSwitching.current).toBe(false);
    });

    it('returns isSwitching ref that is false after failure', async () => {
      mockSetActiveStore.mockRejectedValue(new Error('DB error'));
      await switchStore('store-new');
      expect(isSwitching.current).toBe(false);
    });

    it('ignores second rapid call when isSwitching guard is active (race condition)', async () => {
      // Make setActiveStore take a while to resolve
      let resolveFirst: () => void;
      mockSetActiveStore.mockImplementation(
        () => new Promise<void>((resolve) => { resolveFirst = resolve; })
      );

      // Fire both calls in parallel without awaiting
      const call1 = switchStore('store-A');
      const call2 = switchStore('store-B');

      // Resolve the first call's DB operation
      resolveFirst!();

      // Await both calls
      await Promise.all([call1, call2]);

      // setActiveStore should only be called ONCE — the second call was ignored
      expect(mockSetActiveStore).toHaveBeenCalledTimes(1);
      expect(mockSetActiveStore).toHaveBeenCalledWith('user-1', 'store-A');

      // The optimistic update should only reflect the first call
      expect(mockUpdateUser).toHaveBeenCalledWith({
        activeStoreId: 'store-A',
        storeId: 'store-A',
      });

      // isSwitching should be reset to false after completion
      expect(isSwitching.current).toBe(false);
    });

    it('does not call setActiveStore when user is null', async () => {
      // Re-mock with null user for this specific test
      vi.doMock('@/store', () => ({
        useAuthStore: () => ({
          user: null,
          updateUser: mockUpdateUser,
        }),
      }));

      // Reset module registry to pick up the new mock
      vi.resetModules();

      // Re-mock all dependencies for the fresh import
      vi.doMock('react', () => ({
        useRef: (_initial: unknown) => ({ current: false }),
        useCallback: (fn: (...args: unknown[]) => unknown, _deps: unknown[]) => fn,
      }));
      vi.doMock('@/store/cart', () => ({
        useCartStore: {
          getState: () => ({ clearCartOnStoreSwitch: mockClearCartOnStoreSwitch }),
        },
      }));
      vi.doMock('@/services/user-service', () => ({
        userService: {
          setActiveStore: (...args: unknown[]) => mockSetActiveStore(...args),
        },
      }));
      vi.doMock('@tanstack/react-query', () => ({
        useQueryClient: () => ({
          invalidateQueries: mockInvalidateQueries,
        }),
      }));
      vi.doMock('@/lib/logger', () => ({
        logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
      }));
      vi.doMock('sonner', () => ({
        toast: { success: vi.fn(), error: vi.fn() },
      }));

      const mod = await import('@/hooks/ui/useStoreSwitcher');
      const hook = mod.useStoreSwitcher();

      await hook.switchStore('store-new');
      expect(mockSetActiveStore).not.toHaveBeenCalled();

      // Restore original mocks
      vi.resetModules();
    });
  });
});
