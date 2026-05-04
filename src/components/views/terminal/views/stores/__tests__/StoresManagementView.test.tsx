import { render, screen, fireEvent } from '@testing-library/react';
import StoresManagementView from '../StoresManagementView';
import { useAuthStore } from '@/store';
import { useStoresView } from '../useStoresView';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../useStoresView', () => ({
  useStoresView: vi.fn(),
}));

// Mock StoreModals
vi.mock('../StoreModals', () => ({
  StoreModals: () => <div data-testid="store-modals" />
}));

describe('StoresManagementView', () => {
  const mockUser = { id: 'user-1', activeStoreId: 'store-1', role: 'admin' };
  const mockStores = [
    { id: 'store-1', name: 'Tienda 1', address: 'Calle 1', is_active: true },
    { id: 'store-2', name: 'Tienda 2', address: 'Calle 2', is_active: false }
  ];

  beforeEach(() => {
    (useAuthStore as any).mockReturnValue({ user: mockUser } as any);
    (useStoresView as any).mockReturnValue({
      searchTerm: '',
      setSearchTerm: vi.fn(),
      stores: mockStores,
      activeStoreId: 'store-1',
      isAdmin: true,
      storeFormMode: null,
      selectedStore: null,
      isSubmitting: false,
      handleCreateStore: vi.fn(),
      handleEditStore: vi.fn(),
      handleDeleteStore: vi.fn(),
      handleResetStore: vi.fn(),
      handleSetActiveStore: vi.fn(),
      handleCloseModal: vi.fn(),
      handleStoreFormSubmit: vi.fn()
    } as any);
  });

  it('muestra la tienda activa con el estado correcto', () => {
    render(<StoresManagementView />);
    expect(screen.getByLabelText(/Tienda actual: Tienda 1/i)).toBeInTheDocument();
    expect(screen.getByText('Tienda Actual')).toBeInTheDocument();
  });

  it('muestra el botón Seleccionar Tienda para tiendas inactivas', () => {
    render(<StoresManagementView />);
    const activateBtn = screen.getByLabelText(/Activar Tienda 2/i);
    expect(activateBtn).toBeInTheDocument();
    expect(activateBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('incluye descripción sr-only para accesibilidad', () => {
    render(<StoresManagementView />);
    const srDesc = screen.getByText(/Tienda Tienda 1. Dirección: Calle 1./i);
    expect(srDesc).toHaveClass('sr-only');
  });

  it('llama a handleSetActiveStore al hacer click en Seleccionar Tienda', () => {
    const mockSetActive = vi.fn();
    (useStoresView as any).mockReturnValue({
      ...(useStoresView as any)(),
      handleSetActiveStore: mockSetActive
    } as any);

    render(<StoresManagementView />);
    fireEvent.click(screen.getByLabelText(/Activar Tienda 2/i));
    expect(mockSetActive).toHaveBeenCalledWith('store-2');
  });
});
