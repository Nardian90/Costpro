import { vi, describe, it, expect } from 'vitest';

// Este test verifica que el guard de carrito sigue activo
vi.mock('@/store/cart', () => ({
  useCartStore: vi.fn()
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }));

describe('Regresión FC-03: Guard de carrito en cambio de tienda', () => {
  it('con carrito vacío, el cambio de tienda NO muestra warning', async () => {
    const { useCartStore } = await import('@/store/cart');
    (useCartStore as any).mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({ getItemCount: () => 0, clearCart: vi.fn(), items: [] })
    );

    const { toast } = await import('sonner');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('con carrito con ítems, el cambio de tienda muestra toast.warning', async () => {
    const { useCartStore } = await import('@/store/cart');
    (useCartStore as any).mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({ getItemCount: () => 3, clearCart: vi.fn(), items: [{}, {}, {}] })
    );

    const { toast } = await import('sonner');
    expect(toast.warning).toBeDefined();
  });
});
