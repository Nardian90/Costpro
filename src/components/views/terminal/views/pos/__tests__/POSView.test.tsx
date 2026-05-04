import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import POSView from '../POSView';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as storeModule from '@/store';
import * as cartModule from '@/store/cart';
import * as productsApi from '@/hooks/api/useProducts';
import * as taxesApi from '@/hooks/api/useTaxes';
import * as transactionsApi from '@/hooks/api/useTransactions';
import * as mobileHook from '@/hooks/ui/useMobile';

// Mock components
vi.mock('@/components/ui/Portal', () => ({
  Portal: ({ children }: any) => <div data-testid="mock-portal">{children}</div>
}));

// Mock SpeedDial specifically to avoid the "got: undefined" error
vi.mock('@/components/ui/SpeedDial', () => ({
  SpeedDial: () => <div data-testid="mock-speed-dial" />,
  SpeedDialAction: () => null
}));

// Mock hooks
vi.mock('@/store');
vi.mock('@/store/cart');
vi.mock('@/hooks/api/useProducts');
vi.mock('@/hooks/api/useTaxes');
vi.mock('@/hooks/api/useTransactions');
vi.mock('@/hooks/ui/useMobile');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('POSView', () => {
  const mockProduct = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Product Test',
    price: 100,
    category: 'General',
    sku: 'SKU1',
    stock_current: 10,
    store_id: '550e8400-e29b-41d4-a716-446655440001'
  };
  const mockUser = { id: '550e8400-e29b-41d4-a716-446655440002', activeStoreId: '550e8400-e29b-41d4-a716-446655440001' };

  beforeEach(() => {
    (storeModule.useAuthStore as any).mockReturnValue({ user: mockUser } as any);
    (storeModule.useUIStore as any).mockReturnValue({
      viewQueries: { pos: '' },
      currentView: 'pos',
      showQueries: false,
      setViewQuery: vi.fn(),
    } as any);

    (productsApi.useProducts as any).mockReturnValue({
        data: [mockProduct],
        isLoading: false,
        error: null,
    } as any);

    (taxesApi.useTaxes as any).mockReturnValue({
        data: [],
        isLoading: false,
    } as any);

    (cartModule.useCartStore as any).mockReturnValue({
      items: [],
      addItem: vi.fn(),
      removeItem: vi.fn(),
      updateQuantity: vi.fn(),
      clearCart: vi.fn(),
      getSubtotal: () => 0,
      getDiscountAmount: () => 0,
      getTaxAmount: () => 0,
      getTotal: () => 0,
      getItemCount: () => 0,
      discount: null,
      setDiscount: vi.fn(),
      appliedTaxes: [],
      toggleTax: vi.fn(),
      updateItemDiscount: vi.fn(),
      updateItemPayment: vi.fn(),
      prorateGlobalPayment: vi.fn(),
    } as any);

    (transactionsApi.useCreateSale as any).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);
    (mobileHook.useIsMobile as any).mockReturnValue(false);
  });

  it('renderiza la lista de productos', async () => {
    render(<POSView />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Product Test')).toBeInTheDocument();
    });
  });

  it('permite buscar productos', async () => {
    const user = userEvent.setup();
    render(<POSView />, { wrapper });

    const searchInput = await screen.findByPlaceholderText(/Buscar productos/i);
    await user.type(searchInput, 'Test');
    expect(searchInput).toHaveValue('Test');
  });
});
