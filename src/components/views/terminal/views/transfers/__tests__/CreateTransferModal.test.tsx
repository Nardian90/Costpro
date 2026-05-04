import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateTransferModal from '../CreateTransferModal';
import { useAuthStore } from '@/store';
import { useInventory } from '@/hooks/api/useInventory';
import { useTransferableStores, useCreateTransfer } from '@/hooks/api/useTransfers';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: vi.fn(),
}));

vi.mock('@/hooks/api/useTransfers', () => ({
  useTransferableStores: vi.fn(),
  useCreateTransfer: vi.fn(),
}));

describe('CreateTransferModal', () => {
  const mockUser = { id: 'user-1', activeStoreId: 'store-1' };
  const mockStores = [{ id: 'store-2', name: 'Almacén 2' }];
  const mockProduct = { id: 'p1', name: 'Producto Test', sku: 'SKU1', stock_current: 10 };

  beforeEach(() => {
    (useAuthStore as any).mockReturnValue({ user: mockUser } as any);
    (useTransferableStores as any).mockReturnValue({ data: mockStores } as any);
    (useInventory as any).mockReturnValue({
      data: { pages: [{ products: [mockProduct] }] },
      isFetching: false
    } as any);
    (useCreateTransfer as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    } as any);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('permite buscar y seleccionar un producto', async () => {
    render(<CreateTransferModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    const searchInput = screen.getByPlaceholderText(/Nombre o SKU/i);
    fireEvent.change(searchInput, { target: { value: 'Test' } });

    // Esperar a que el producto aparezca en los resultados
    const productResult = await screen.findByText('Producto Test');
    fireEvent.click(productResult);

    // El producto debe aparecer en la lista de seleccionados
    expect(screen.getAllByText('Producto Test').length).toBeGreaterThan(0);
    expect(screen.getByText('/ 10 disp.')).toBeInTheDocument();
  });

  it('deshabilita el botón Enviar si la cantidad supera el stock', async () => {
    render(<CreateTransferModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    // Agregar producto
    fireEvent.change(screen.getByPlaceholderText(/Nombre o SKU/i), { target: { value: 'Test' } });
    const productResult = await screen.findByText('Producto Test');
    fireEvent.click(productResult);

    // Cambiar cantidad a algo superior al stock (10)
    const qtyInput = screen.getByRole('spinbutton');
    fireEvent.change(qtyInput, { target: { value: '11' } });

    const submitBtn = screen.getByRole('button', { name: /Enviar Solicitud/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('/ 10 disp.')).toHaveClass('text-destructive');
  });

  it('habilita el botón si la cantidad es válida', async () => {
    render(<CreateTransferModal isOpen={true} onClose={vi.fn()} />, { wrapper });

    // Agregar producto
    fireEvent.change(screen.getByPlaceholderText(/Nombre o SKU/i), { target: { value: 'Test' } });
    const productResult = await screen.findByText('Producto Test');
    fireEvent.click(productResult);

    // Cantidad válida (p.e. 5)
    const qtyInput = screen.getByRole('spinbutton');
    fireEvent.change(qtyInput, { target: { value: '5' } });

    const submitBtn = screen.getByRole('button', { name: /Enviar Solicitud/i });
    expect(submitBtn).not.toBeDisabled();
  });
});
