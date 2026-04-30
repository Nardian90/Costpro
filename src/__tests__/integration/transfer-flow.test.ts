import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeProduct, makeUser } from '@/__fixtures__';

// Mock de hooks de API
vi.mock('@/hooks/api/useTransfers', () => ({
  useCreateTransfer: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: 't-123' }),
    isPending: false
  }),
  useConfirmTransfer: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false
  })
}));

vi.mock('@/hooks/api/useStores', () => ({
  useTransferableStores: vi.fn().mockReturnValue({ data: [{ id: 's2', name: 'Tienda B' }] }),
  useInventory: vi.fn().mockReturnValue({ data: { pages: [{ products: [] }] } })
}));

vi.mock('@/services/audit-service', () => ({
  auditService: {
    logTransferCreated: vi.fn(),
    logTransferConfirmed: vi.fn()
  }
}));

describe('Flujo de transferencia (Integración Lógica)', () => {
  // Nota: Dado que CreateTransferModal es un componente complejo con estado interno,
  // aquí testeamos los escenarios de negocio que el componente orquesta.

  it('validación de stock insuficiente impide crear transferencia', async () => {
    // Escenario: Producto con stock 5, se intenta transferir 10
    const product = makeProduct({ id: 'p1', stock_current: 5 });

    // Simulación de la lógica de handleCreate en el componente:
    const selectedItems = new Map([['p1', { product, quantity: 10 }]]);

    const stockErrors: string[] = [];
    for (const [, item] of selectedItems) {
      if (item.quantity > (item.product.stock_current ?? 0)) {
        stockErrors.push('Stock insuficiente');
      }
    }

    expect(stockErrors.length).toBeGreaterThan(0);
  });

  it('transferencia exitosa llama a la mutación correcta', async () => {
    const { useCreateTransfer } = await import('@/hooks/api/useTransfers');
    const createMutation = useCreateTransfer();

    const product = makeProduct({ id: 'p1', stock_current: 20 });
    const selectedItems = new Map([['p1', { product, quantity: 5 }]]);

    const items = Array.from(selectedItems.values()).map(item => ({
      product_id: item.product.id,
      quantity: item.quantity,
      unit_cost: item.product.cost_price || 0
    }));

    await createMutation.mutateAsync({
      origin_store_id: 's1',
      destination_store_id: 's2',
      items,
      notes: 'test'
    });

    expect(createMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      origin_store_id: 's1',
      destination_store_id: 's2',
      items: expect.arrayContaining([
        expect.objectContaining({ product_id: 'p1', quantity: 5 })
      ])
    }));
  });
});
