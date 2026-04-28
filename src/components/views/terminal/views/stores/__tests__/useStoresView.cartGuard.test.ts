import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoresView } from '../useStoresView';
import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { toast } from 'sonner';
import { userService } from '@/services/user-service';

// Mocks
vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/store/cart', () => ({
  useCartStore: vi.fn(),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/services/user-service', () => ({
  userService: {
    setActiveStore: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

describe('useStoresView Cart Guard', () => {
  const mockUpdateUser = vi.fn();
  const mockClearCart = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({
      user: { id: 'user-1' },
      updateUser: mockUpdateUser,
    });
  });

  it('should call executeStoreChange directly when cart is empty', async () => {
    (useCartStore as any).mockImplementation((selector: any) => {
        const state = { getItemCount: () => 0, clearCart: mockClearCart };
        return selector(state);
    });

    const { result } = renderHook(() => useStoresView());

    await act(async () => {
      await result.current.handleSetActiveStore('store-1');
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ activeStoreId: 'store-1' });
    expect(userService.setActiveStore).toHaveBeenCalledWith('user-1', 'store-1');
    expect(toast.success).toHaveBeenCalledWith('Tienda cambiada exitosamente');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('should show toast.warning and NOT call executeStoreChange when cart has items', async () => {
    (useCartStore as any).mockImplementation((selector: any) => {
        const state = { getItemCount: () => 2, clearCart: mockClearCart };
        return selector(state);
    });

    const { result } = renderHook(() => useStoresView());

    await act(async () => {
      await result.current.handleSetActiveStore('store-1');
    });

    expect(toast.warning).toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(userService.setActiveStore).not.toHaveBeenCalled();
  });

  it('should call clearCart and executeStoreChange when user confirms in toast', async () => {
    let capturedAction: any;
    (toast.warning as any).mockImplementation((msg: string, options: any) => {
      capturedAction = options.action;
    });

    (useCartStore as any).mockImplementation((selector: any) => {
        const state = { getItemCount: () => 2, clearCart: mockClearCart };
        return selector(state);
    });

    const { result } = renderHook(() => useStoresView());

    await act(async () => {
      await result.current.handleSetActiveStore('store-1');
    });

    expect(toast.warning).toHaveBeenCalled();

    // Simulate user clicking confirmation in toast
    await act(async () => {
      await capturedAction.onClick();
    });

    expect(mockClearCart).toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith({ activeStoreId: 'store-1' });
    expect(userService.setActiveStore).toHaveBeenCalledWith('user-1', 'store-1');
  });
});
