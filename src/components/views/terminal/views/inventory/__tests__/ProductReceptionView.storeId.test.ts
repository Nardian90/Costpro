import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductReceptionView from '../ProductReceptionView';
import { useAuthStore } from '@/store';
import { useInventory } from '@/hooks/api/useInventory';
import React from 'react';

// Mocks
vi.mock('@/store', async () => {
  const actual = await vi.importActual('@/store') as any;
  return {
    ...actual,
    useAuthStore: vi.fn(),
    useUIStore: vi.fn(() => ({
      setIsCreateProductModalOpen: vi.fn(),
    })),
  };
});

vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: vi.fn(),
  useRegisterReception: vi.fn(() => ({
    isPending: false,
    mutateAsync: vi.fn(),
  })),
}));

vi.mock('@/hooks/ui/useDebounce', () => ({
  useDebounce: vi.fn(val => val),
}));

describe('ProductReceptionView StoreId Integrity', () => {
  it('should use activeStoreId instead of storeId when calling useInventory', () => {
    // Setup user with different storeId and activeStoreId
    (useAuthStore as any).mockReturnValue({
      user: {
        id: 'user-123',
        storeId: 'legacy-store',
        activeStoreId: 'current-active-store'
      }
    });

    (useInventory as any).mockReturnValue({
      data: { pages: [{ products: [] }] },
      isFetching: false
    });

    render(React.createElement(ProductReceptionView, { onCancel: vi.fn() }));

    // Verify useInventory was called with activeStoreId
    expect(useInventory).toHaveBeenCalledWith(
      'current-active-store',
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    );

    // Verify it was NOT called with the legacy storeId
    expect(useInventory).not.toHaveBeenCalledWith(
      'legacy-store',
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    );
  });

  it('should pass empty string to useInventory when activeStoreId is undefined', () => {
    (useAuthStore as any).mockReturnValue({
      user: {
        id: 'user-123',
        storeId: 'legacy-store',
        activeStoreId: undefined
      }
    });

    (useInventory as any).mockReturnValue({
      data: { pages: [{ products: [] }] },
      isFetching: false
    });

    render(React.createElement(ProductReceptionView, { onCancel: vi.fn() }));

    expect(useInventory).toHaveBeenCalledWith(
      '',
      expect.any(String),
      expect.any(String),
      expect.any(Number)
    );
  });
});
