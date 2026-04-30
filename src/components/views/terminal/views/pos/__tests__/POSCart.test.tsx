import { render, screen, fireEvent } from '@testing-library/react';
import { POSCart } from '../POSCart';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

vi.mock('@/hooks/api/useTaxes', () => ({
  useTaxes: vi.fn().mockReturnValue({ data: [], isLoading: false })
}));

describe('POSCart', () => {
  const mockItems = [
    {
      id: 'item-1',
      product_id: 'prod-1',
      name: 'Producto 1',
      price: 100,
      quantity: 2,
      subtotal: 200,
      cash_paid: 100,
      transfer_paid: 100,
      variant_id: null,
      product: {
          name: 'Producto 1',
          stock_current: 10
      }
    }
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    items: mockItems,
    onUpdateQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onClearCart: vi.fn(),
    onCheckout: vi.fn(),
    getSubtotal: vi.fn().mockReturnValue(200),
    getDiscountAmount: vi.fn().mockReturnValue(0),
    getTaxAmount: vi.fn().mockReturnValue(0),
    getTotal: vi.fn().mockReturnValue(200),
    discount: null,
    onApplyDiscount: vi.fn(),
    prorateGlobalPayment: vi.fn(),
    appliedTaxes: [],
    toggleTax: vi.fn(),
  };

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('muestra mensaje de carrito vacío cuando no hay ítems', () => {
    renderWithProvider(<POSCart {...defaultProps} items={[]} />);
    expect(screen.getAllByText(/Carrito Vacío/i).length).toBeGreaterThan(0);
  });

  it('muestra los ítems en el carrito', () => {
    renderWithProvider(<POSCart {...defaultProps} />);
    expect(screen.getByText('Producto 1')).toBeInTheDocument();
  });

  it('llama a onUpdateQuantity al cambiar la cantidad', () => {
    renderWithProvider(<POSCart {...defaultProps} />);
    const incrementBtn = screen.getByLabelText(/Aumentar cantidad/i);
    fireEvent.click(incrementBtn);
    expect(defaultProps.onUpdateQuantity).toHaveBeenCalled();
  });

  it('el botón CONFIRMAR VENTA llama a onCheckout', () => {
    renderWithProvider(<POSCart {...defaultProps} />);
    const processBtn = screen.getByText(/CONFIRMAR VENTA/i);
    fireEvent.click(processBtn);
    expect(defaultProps.onCheckout).toHaveBeenCalled();
  });
});
