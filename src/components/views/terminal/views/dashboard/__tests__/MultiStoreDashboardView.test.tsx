import { render, screen, fireEvent } from '@testing-library/react';
import MultiStoreDashboardView from '../MultiStoreDashboardView';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useMultiStoreDashboard } from '@/hooks/api/useMultiStoreDashboard';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: vi.fn(),
}));

vi.mock('@/hooks/api/useMultiStoreDashboard', () => ({
  useMultiStoreDashboard: vi.fn(),
}));

// Mock de StateRenderer
vi.mock('@/components/ui/StateRenderer', () => ({
  StateRenderer: ({ children, data, isLoading }: any) => {
    if (isLoading) return <div>Loading...</div>;
    return typeof children === 'function' ? children(data) : children;
  }
}));

describe('MultiStoreDashboardView', () => {
  const mockUser = { id: 'user-1', role: 'admin', activeStoreId: 'store-1' };
  const mockStores = [
    { id: 'store-1', name: 'Tienda 1', address: 'Calle 1' },
    { id: 'store-2', name: 'Tienda 2', address: 'Calle 2' }
  ];
  const mockKPIs = [
    {
      storeId: 'store-1',
      storeName: 'Tienda 1',
      storeAddress: 'Calle 1',
      isActive: true,
      todaySales: 1000,
      todayTransactions: 10,
      lowStockCount: 2,
      pendingTransfersOut: 1
    },
    {
      storeId: 'store-2',
      storeName: 'Tienda 2',
      storeAddress: 'Calle 2',
      isActive: false,
      todaySales: 500,
      todayTransactions: 5,
      lowStockCount: 0,
      pendingTransfersOut: 0
    }
  ];

  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({ user: mockUser } as any);
    vi.mocked(useStores).mockReturnValue({ data: mockStores, isLoading: false } as any);
    vi.mocked(useMultiStoreDashboard).mockReturnValue({ data: mockKPIs, isLoading: false, refetch: vi.fn() } as any);
  });

  it('renderiza el título y los KPIs globales', () => {
    render(<MultiStoreDashboardView />);
    expect(screen.getByText('Tablero Consolidado')).toBeInTheDocument();

    // Usamos matcher flexible para el precio debido a espacios inseparables o formato local
    expect(screen.getByText((content) => content.includes('1.500,00'))).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renderiza tarjetas por cada tienda', () => {
    render(<MultiStoreDashboardView />);
    expect(screen.getByText('Tienda 1')).toBeInTheDocument();
    expect(screen.getByText('Tienda 2')).toBeInTheDocument();

    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activar Tienda 2/i })).toBeInTheDocument();
  });

  it('dispara evento personalizado al activar una tienda', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<MultiStoreDashboardView />);

    fireEvent.click(screen.getByRole('button', { name: /Activar Tienda 2/i }));

    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('llama a refetch al hacer click en el botón de actualizar', () => {
    const mockRefetch = vi.fn();
    vi.mocked(useMultiStoreDashboard).mockReturnValue({ data: mockKPIs, isLoading: false, refetch: mockRefetch } as any);

    render(<MultiStoreDashboardView />);
    fireEvent.click(screen.getByRole('button', { name: /Actualizar datos del tablero/i }));

    expect(mockRefetch).toHaveBeenCalled();
  });
});
