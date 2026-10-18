/**
 * Test de regresión — CP-POS-003 (auditoría 2026-10-16, MISIÓN 2).
 *
 * Defecto: useInventoryCount.fetchProducts() llamaba a
 * /api/inventory/products SIN storeId. El endpoint (withStoreAccess) exige
 * el parámetro y responde 400 «storeId es requerido» → la vista mostraba
 * «0 de 0 productos» de forma permanente (reproducido en vivo 2026-10-15).
 *
 * Fix: adjuntar la tienda activa del usuario autenticado
 * (`?storeId=...`), igual que LotsView/DevolutionsView/WorkersView.
 *
 * Escenarios:
 *  1. Con tienda activa → el fetch incluye ?storeId=<tienda> y el listado
 *     se pobla con la respuesta del endpoint (punto exacto del defecto).
 *  2. Sin tienda activa → NO se lanza el fetch y se notifica el error
 *     (fail-closed con mensaje accionable, no «0 de 0» silencioso).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useInventoryCount } from '@/components/views/terminal/views/inventory_count/useInventoryCount';

// ── Mocks ───────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  userHolder: { current: null as any },
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel: any) => {
    const state = {
      user: h.userHolder.current,
      token: 'token-test-cp-pos-003',
    };
    return sel ? sel(state) : state;
  },
  useCartStore: () => ({ addItem: vi.fn() }),
  useUIStore: () => ({ setCurrentView: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.stubGlobal('fetch', h.fetchMock);

const STORE_ID = '11111111-2222-4333-8444-555555555555';

const fakeProducts = [
  {
    id: 'prod-1',
    name: 'Producto A',
    sku: 'SKU-A',
    price: 100,
    cost_price: 50,
    stock_current: 10,
    product_variants: [],
  },
  {
    id: 'prod-2',
    name: 'Producto B',
    sku: 'SKU-B',
    price: 200,
    cost_price: 80,
    stock_current: 5,
    product_variants: [],
  },
];

describe('CP-POS-003 · useInventoryCount envía storeId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.userHolder.current = { id: 'user-1', activeStoreId: STORE_ID };
    h.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => fakeProducts,
    });
  });

  it('el fetch a /api/inventory/products incluye ?storeId=<tienda activa>', async () => {
    const { result } = renderHook(() => useInventoryCount());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = h.fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/inventory/products');
    // Punto EXACTO del defecto: la query debe llevar la tienda activa.
    expect(String(url)).toContain(`storeId=${encodeURIComponent(STORE_ID)}`);
    // El header de autorización se mantiene igual que antes.
    expect(options?.headers?.Authorization).toBe('Bearer token-test-cp-pos-003');

    // El listado se pobla (antes quedaba en «0 de 0 productos» por el 400).
    await waitFor(() => {
      expect(result.current.allProducts).toHaveLength(2);
    });
    expect(result.current.allProducts[0].name).toBe('Producto A');
  });

  it('sin tienda activa NO llama al endpoint y notifica error accionable', async () => {
    h.userHolder.current = { id: 'user-1', activeStoreId: null };
    const { result } = renderHook(() => useInventoryCount());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(h.fetchMock).not.toHaveBeenCalled();
    // El usuario ve un error claro en lugar del «0 de 0 productos» silencioso.
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('No hay tienda activa seleccionada')
    );
  });
});
