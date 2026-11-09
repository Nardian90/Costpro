/**
 * usePriceListProducts-operational-class.test.tsx — CP-OPERATIONAL-CLASS-001.
 *
 * §8.17/§8.18 · el RPC→cliente conserva la distinción REAL del precio
 * (NULL = Sin precio, NO convertido a 0) y la clasificación operativa real
 * del catálogo. El schema compartido del POS convierte price NULL → 0
 * (.default(0)); este hook re-declara price nullable SOLO para el listado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePriceListProducts } from '@/hooks/api/usePriceListProducts';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: rpcMock,
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {
        select: () => builder, eq: () => builder, maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return builder;
    }),
  },
}));

const STORE_ID = '11111111-1111-4111-8111-111111111111';

function rpcRow(over: Record<string, unknown>) {
  return {
    id: '22222222-2222-4222-8222-222222222221',
    name: 'Producto de prueba',
    description: null,
    sku: '1',
    price: 100,
    cost_price: 50,
    image_url: null,
    category: null,
    unit_of_measure: 'unidad',
    supplier: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    stock_current: 5,
    cost_average: 50,
    min_stock: 1,
    store_id: STORE_ID,
    is_active: true,
    has_movements: false,
    product_variants: [],
    price_currency: 'CUP',
    barcode: null,
    barcode_type: null,
    visible_en_tienda: false,
    precio_empresa: null,
    precio_empresa_currency: null,
    on_promotion: false,
    is_service: false,
    operational_class: null,
    ...over,
  };
}

describe('CP-OPERATIONAL-CLASS-001 · hook del Listado de precios (mapper RPC→cliente)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('conserva price NULL (Sin precio) y la clasificación operativa real', async () => {
    rpcMock.mockResolvedValue({
      data: [
        rpcRow({ id: '22222222-2222-4222-8222-222222222221', sku: '1', price: null, operational_class: 'venta' }),
        rpcRow({ id: '22222222-2222-4222-8222-222222222222', sku: '2', price: 0, operational_class: 'insumo' }),
        rpcRow({ id: '22222222-2222-4222-8222-222222222223', sku: '3', price: 250, operational_class: null }),
      ],
      error: null,
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePriceListProducts(STORE_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data ?? [];
    expect(items).toHaveLength(3);
    // §4: NULL preservado (NO convertido a 0) — la base del filtro Sin precio.
    expect(items[0].price).toBeNull();
    // §4: 0 preservado (cero legítimo = Con precio).
    expect(items[1].price).toBe(0);
    expect(items[2].price).toBe(250);
    // §3: clasificación operativa real (NULL = Sin clasificar, sin inventar).
    expect(items[0].operational_class).toBe('venta');
    expect(items[1].operational_class).toBe('insumo');
    expect(items[2].operational_class).toBeNull();
  });

  it('el RPC se llama con la tienda activa (contexto de tienda único, sin mezclar tiendas)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => usePriceListProducts(STORE_ID), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][0]).toBe('get_products_for_pos');
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_store_id: STORE_ID });
  });
});
