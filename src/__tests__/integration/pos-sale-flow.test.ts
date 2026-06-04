import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCartStore } from '@/store/cart';
import { usePOSCheckout } from '@/components/views/terminal/views/pos/usePOSCheckout';
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
  const actual = await importOriginal<typeof import('@/store')>();
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

    vi.mocked(transactionsHooks.useCreateSale).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue('sale-123'),
      isPending: false
    } as ReturnType<typeof transactionsHooks.useCreateSale>);
  });

  it('flujo happy path: agregar producto -> procesar venta -> carrito limpio', async () => {
    const product = makeProduct({ id: VALID_UUID, price: 100, stock_current: 10 });

    // 1. Agregar al carrito via store directly
    useCartStore.getState().addItem({
      product_id: product.id,
      variant_id: null,
      variant: null,
      price: product.price,
      cost: product.cost_price || 0,
      quantity: 1,
      product,
      subtotal: product.price,
    });
    expect(useCartStore.getState().getItemCount()).toBe(1);

    // 2. Procesar la venta via usePOSCheckout
    const { result } = renderHook(() => usePOSCheckout());

    await act(async () => {
      await result.current.startCheckout('cash');
    });

    // 3. Assert
    expect(useCartStore.getState().getItemCount()).toBe(0);
    expect(result.current.lastSale).toBeDefined();
    expect(result.current.lastSale?.id).toBe('sale-123');
  });

  it('venta con producto sin precio activa warning de precio', async () => {
    const productSinPrecio = makeProduct({ id: VALID_UUID, price: 0 });

    // Agregar producto sin precio
    useCartStore.getState().addItem({
      product_id: productSinPrecio.id,
      variant_id: null,
      variant: null,
      price: 0,
      cost: 0,
      quantity: 1,
      product: productSinPrecio,
      subtotal: 0,
    });

    const { result } = renderHook(() => usePOSCheckout());

    // startCheckout detecta precio sin asignar y muestra warning
    await act(async () => {
      await result.current.startCheckout('cash');
    });

    expect(result.current.showPriceWarning).toBe(true);

    // Confirmar checkout a pesar del warning
    await act(async () => {
      await result.current.confirmUnpricedCheckout();
    });

    expect(useCartStore.getState().getItemCount()).toBe(0);
    expect(result.current.lastSale).toBeDefined();
  });
});
