import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCartStore } from '@/store/cart';
import { usePOSView } from '@/components/views/terminal/views/pos/usePOSView';
import { makeProduct, makeUser } from '@/__fixtures__';
import { auditService } from '@/services/audit-service';
import * as transactionsHooks from '@/hooks/api/useTransactions';

// Mock dependencias externas
vi.mock('@/services/audit-service', () => ({
  auditService: {
    logSaleBelowCost: vi.fn().mockResolvedValue({}),
    logInvoiceWithoutPrice: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: vi.fn().mockReturnValue({ data: [], isLoading: false })
}));

vi.mock('@/hooks/api/useTransactions', () => ({
  useCreateSale: vi.fn()
}));

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

vi.mock('@/store', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useAuthStore: vi.fn(() => ({
      user: makeUser({ id: VALID_UUID, activeStoreId: VALID_UUID })
    }))
  };
});

describe('Flujo de venta completo (integración)', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    vi.clearAllMocks();

    // Default mock implementation
    vi.mocked(transactionsHooks.useCreateSale).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue('sale-123'),
      isPending: false
    } as any);
  });

  it('flujo happy path: agregar producto -> procesar venta -> carrito limpio', async () => {
    const product = makeProduct({ id: VALID_UUID, price: 100, stock_current: 10 });
    const { result } = renderHook(() => usePOSView());

    // 1. Agregar al carrito
    act(() => {
      result.current.handleAddItem(product);
    });
    expect(useCartStore.getState().getItemCount()).toBe(1);

    // 2. Procesar la venta
    await act(async () => {
      await result.current.handleCheckout('cash');
    });

    // 3. Assert
    expect(useCartStore.getState().getItemCount()).toBe(0);
    expect(result.current.lastSale).toBeDefined();
    expect(result.current.lastSale.id).toBe('sale-123');
  });

  it('venta fallida: el carrito NO se limpia si el endpoint falla', async () => {
    vi.mocked(transactionsHooks.useCreateSale).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Server Error')),
      isPending: false
    } as any);

    const product = makeProduct({ id: VALID_UUID });
    const { result } = renderHook(() => usePOSView());

    act(() => {
      result.current.handleAddItem(product);
    });

    await act(async () => {
      await result.current.handleCheckout('transfer');
    });

    // El carrito debe mantener sus ítems
    expect(useCartStore.getState().getItemCount()).toBe(1);
  });

  it('venta con producto sin precio registra en audit_logs', async () => {
    const productSinPrecio = makeProduct({ id: VALID_UUID, price: 0 });
    const { result } = renderHook(() => usePOSView());

    act(() => {
      result.current.handleAddItem(productSinPrecio);
    });

    // En usePOSView, si hay productos sin precio, activa un warning
    await act(async () => {
      await result.current.startCheckout('cash');
    });

    expect(result.current.showPriceWarning).toBe(true);

    // Confirmamos el checkout sin precio
    await act(async () => {
      await result.current.confirmUnpricedCheckout();
    });

    expect(auditService.logInvoiceWithoutPrice).toHaveBeenCalled();
  });

  it('venta por debajo del costo registra en audit_logs', async () => {
    const productBarato = makeProduct({ id: VALID_UUID, price: 40, cost_price: 60 });
    const { result } = renderHook(() => usePOSView());

    act(() => {
      result.current.handleAddItem(productBarato);
    });

    expect(auditService.logSaleBelowCost).toHaveBeenCalled();
  });
});
