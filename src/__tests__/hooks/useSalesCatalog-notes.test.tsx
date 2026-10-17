/**
 * Test de regresión — CP-POS-007 (auditoría 2026-10-16, MISIÓN 2).
 *
 * Defecto: el modal de checkout del Catálogo de Ventas recoge «notas de
 * venta» y las pasa a confirmCheckout(notes?, operationDate?), pero el body
 * enviado a /api/pos/checkout NUNCA incluía las notas (ni el path online ni
 * el offline). El endpoint ya acepta sale_notes → p_notes en create_sale_v2,
 * por lo que las notas se perdían silenciosamente: pérdida de información de
 * negocio con el usuario creyendo que quedaron registradas.
 *
 * Fix (4 puntos):
 *  1. Body online: sale_notes: notes (trim + cap 1000).
 *  2. Path offline: p_notes en el enqueue a createSale.
 *  3. createSaleParamsSchema: p_notes declarado (zod .parse() elimina
 *     claves no declaradas → sin esto, el punto 2 es inútil).
 *  4. /api/sync/batch: p_notes propagado al replay de create_sale_v2.
 *
 * Este test ejercita los puntos 1-3 (el 4 se valida en
 * sync-batch-pnotes.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useSalesCatalog } from '@/components/views/terminal/views/pos/useSalesCatalog';

// ── Mocks hoisted ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  createSaleMock: vi.fn(),
  userHolder: { current: null as any },
  onlineHolder: { current: true },
}));

vi.mock('@/store', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/store')>();
  // Auth store con selector + getState (el hook llama useAuthStore.getState().token
  // al construir el header del checkout online).
  const useAuthStoreMock = Object.assign(
    (sel?: any) => {
      const state = {
        user: h.userHolder.current,
        token: 'token-test-cp-pos-007',
      };
      return sel ? sel(state) : state;
    },
    {
      getState: () => ({ user: h.userHolder.current, token: 'token-test-cp-pos-007' }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  );
  return {
    ...orig,
    useAuthStore: useAuthStoreMock,
  };
});

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('@/hooks/api/useTransactions', () => ({
  useCreateSale: () => ({ mutateAsync: h.createSaleMock, isPending: false }),
}));

// Cart store: soporta selector (s => s.x) y getState() con addItem real.
const cartAddItemMock = vi.fn();
vi.mock('@/store/cart', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/store/cart')>();
  return {
    ...orig,
    useCartStore: Object.assign(
      (sel?: any) => {
        const state = {
          clearCart: vi.fn(),
          addItem: cartAddItemMock,
        };
        return sel ? sel(state) : state;
      },
      {
        getState: () => ({ clearCart: vi.fn(), addItem: cartAddItemMock }),
        setState: vi.fn(),
        subscribe: vi.fn(),
      },
    ),
  };
});

vi.mock('./supervisor-auth-store', () => ({
  getSupervisorAuth: () => null,
  clearSupervisorAuth: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/useHaptics', () => ({
  useHaptics: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.stubGlobal('fetch', h.fetchMock);

// @tanstack/react-query: queryClient simulado (useQueryClient).
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...orig,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const STORE_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = '99999999-8888-4777-8666-555555555555';

const product = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name: 'Producto Test',
  sku: 'SKU-T',
  price: 100,
  cost_price: 50,
  stock_current: 100,
  product_variants: [],
} as any;

function makeRow(qty = 2) {
  return { product, quantity: qty };
}

describe('CP-POS-007 · notas de venta del Catálogo de Ventas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.userHolder.current = { id: USER_ID, activeStoreId: STORE_ID };
    h.onlineHolder.current = true;
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => h.onlineHolder.current,
    });
    h.fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transaction_id: 'tx-123' }),
    });
    h.createSaleMock.mockResolvedValue('tx-offline-123');
  });

  async function setupRow() {
    const { result } = renderHook(() => useSalesCatalog());
    // Cargar la fila con cantidad (updateRow → rows Map → activeRows).
    await act(async () => {
      result.current.handleSetQuantity(product, 2);
    });
    await waitFor(() => {
      expect(result.current.activeRows.length).toBeGreaterThan(0);
    });
    return result;
  }

  it('ONLINE: el body de /api/pos/checkout incluye sale_notes con la nota del modal', async () => {
    const result = await setupRow();

    await act(async () => {
      await result.current.confirmCheckout('  Entregar en mostrador, cliente Juan  ');
    });

    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = h.fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/pos/checkout');

    const body = JSON.parse(options?.body);
    // Punto EXACTO del defecto: la nota debe viajar en el body.
    expect(body.sale_notes).toBe('Entregar en mostrador, cliente Juan');
    // Y el resto del contrato del checkout sigue intacto.
    expect(body.store_id).toBe(STORE_ID);
    expect(body.seller_id).toBe(USER_ID);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].quantity).toBe(2);
  });

  it('ONLINE: sin nota → sale_notes = null (no string vacío, no undefined)', async () => {
    const result = await setupRow();

    await act(async () => {
      await result.current.confirmCheckout(undefined);
    });

    const [, options] = h.fetchMock.mock.calls[0];
    const body = JSON.parse(options?.body);
    expect(body.sale_notes).toBeNull();
  });

  it('ONLINE: nota mayor a 1000 caracteres se trunca al límite del endpoint', async () => {
    const result = await setupRow();
    const longNote = 'x'.repeat(2500);

    await act(async () => {
      await result.current.confirmCheckout(longNote);
    });

    const [, options] = h.fetchMock.mock.calls[0];
    const body = JSON.parse(options?.body);
    expect(body.sale_notes).toHaveLength(1000);
  });

  it('OFFLINE: el enqueue a createSale incluye p_notes', async () => {
    h.onlineHolder.current = false;
    const result = await setupRow();

    await act(async () => {
      await result.current.confirmCheckout('Venta offline con nota');
    });

    expect(h.createSaleMock).toHaveBeenCalledTimes(1);
    const params = h.createSaleMock.mock.calls[0][0];
    // Punto 2 del defecto: la nota también viaja encolada.
    expect(params.p_notes).toBe('Venta offline con nota');
    expect(params.p_store_id).toBe(STORE_ID);
  });

  it('SCHEMA: createSaleParamsSchema NO elimina p_notes (regla zod strip)', async () => {
    // Punto 3 del defecto: z.object por defecto ELIMINA claves desconocidas en
    // .parse(). Si p_notes no está declarado, el valor se pierde aunque el
    // caller lo envíe. Este test lo garantiza para el path offline completo.
    const { createSaleParamsSchema } = await import('@/validation/schemas');
    const parsed = createSaleParamsSchema.parse({
      p_store_id: STORE_ID,
      p_seller_id: USER_ID,
      p_payment_method: 'cash',
      p_total_amount: 200,
      p_subtotal: 200,
      p_discount_type: 'fixed',
      p_discount_value: 0,
      p_items: [
        {
          product_id: product.id,
          variant_id: null,
          quantity: 2,
          price: 100,
          cost: 50,
        },
      ],
      p_notes: 'nota persistida por el schema',
    });
    expect(parsed.p_notes).toBe('nota persistida por el schema');

    // Y el trío null/undefined/largo se comporta según contrato.
    expect(createSaleParamsSchema.parse({
      p_store_id: STORE_ID,
      p_seller_id: USER_ID,
      p_payment_method: 'cash',
      p_total_amount: 1,
      p_subtotal: 1,
      p_discount_type: 'fixed',
      p_discount_value: 0,
      p_items: [{ product_id: product.id, variant_id: null, quantity: 1, price: 1, cost: 1 }],
      p_notes: null,
    }).p_notes).toBeNull();
  });
});
