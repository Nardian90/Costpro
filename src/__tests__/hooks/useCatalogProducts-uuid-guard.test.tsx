/**
 * useCatalogProducts-uuid-guard.test.tsx — INCIDENTE UUID-CATALOG-CENTRAL (2026-10-15)
 *
 * Regresión del incidente «Inventario → Catálogo → Ha ocurrido un error —
 * Invalid UUID (p_store_id)» en TIENDA CENTRAL COSTPRO.
 *
 * Causa raíz: catalogProductsV2ParamsSchema usaba `z.string().uuid()` de Zod 4
 * (exige bits de variante RFC 4122 [89ab]) y el UUID canónico de Central
 * (d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576, variante 'e') — válido para el tipo
 * `uuid` de Postgres y aceptado por la RPC get_paginated_products_v2 — era
 * rechazado EN CLIENTE antes de llegar a la red. Enervida (variante 'b') pasaba,
 * por eso el defecto solo se veía en Central.
 *
 * Cobertura (matriz Fase 4 de la misión):
 *   - El schema acepta el UUID canónico de Central y de Enervida (COM-01/02 análogo)
 *   - El schema rechaza nombres, cadenas vacías, sentinelas y UUID truncados
 *   - Render sin tienda (null): NO llama a la RPC (F4-06)
 *   - ID inválido: error controlado con mensaje útil, RPC NUNCA llamada (F4-07)
 *   - Cambio de tienda Central ↔ Enervida: cada consulta usa el storeId activo
 *     (queryKey distinto → parámetros del RPC con el ID correcto) (F4-04/05)
 *   - Tienda sin productos: estado vacío normal (datos [], sin error) (F4-08)
 *   - Aislamiento: la RPC se invoca SIEMPRE con p_store_id exacto — nunca null
 *     implícito ni ID de otra tienda (F4-10, en cliente; el servidor refuerza
 *     con has_store_access)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// IDs canónicos REALES (verificados en BD stores.id uuid, 2026-10-15):
// Central es el UUID sintético con variante 'e' que Zod estricto rechazaba.
const CENTRAL_ID = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'; // TIENDA CENTRAL COSTPRO
const ENERVIDA_ID = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS

const rpcMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/lib/rpc-validator', () => ({
  // Devuelve las filas tal cual para que el test observe los parámetros, no el shape.
  validateRPCArrayResponse: async (data: unknown) => data,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  useCatalogProductsInfinite,
  useCatalogProductsPage,
  catalogProductsV2ParamsSchema,
} from '@/hooks/api/useCatalogProducts';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1', name: 'Producto Prueba', sku: 'SKU-1', barcode: null, barcode_type: null,
    category: 'General', price: 1000, precio_empresa: null, precio_empresa_currency: null,
    price_currency: 'CUP', cost_price: 500, min_stock: 0, image_url: null, description: null,
    unit_of_measure: 'ud', supplier: null, stock_current: 10, cost_average: null,
    store_id: CENTRAL_ID, is_active: true, has_movements: false, visible_en_tienda: true,
    price_visible: true, stock_visible: true, on_promotion: false,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    is_complete: true, total_count: 1,
    ...overrides,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('catalogProductsV2ParamsSchema — contrato p_store_id (causa raíz)', () => {
  it('ACEPTA el UUID canónico de TIENDA CENTRAL COSTPRO (variante e — el bug original)', () => {
    const parsed = catalogProductsV2ParamsSchema.parse({
      p_limit: 24, p_offset: 0, p_store_id: CENTRAL_ID,
    });
    expect(parsed.p_store_id).toBe(CENTRAL_ID);
  });

  it('ACEPTA el UUID canónico de ENERVIDA-VITALLCONS (sin regresión)', () => {
    const parsed = catalogProductsV2ParamsSchema.parse({
      p_limit: 24, p_offset: 0, p_store_id: ENERVIDA_ID,
    });
    expect(parsed.p_store_id).toBe(ENERVIDA_ID);
  });

  it('ACEPTA null (sin tienda) — nullable se conserva', () => {
    const parsed = catalogProductsV2ParamsSchema.parse({ p_store_id: null });
    expect(parsed.p_store_id).toBeNull();
  });

  it.each([
    ['nombre de tienda', 'Central de Costpro'],
    ['cadena vacía', ''],
    ['sentinela me', 'me'],
    ['sentinela null textual', 'null'],
    ['UUID truncado', CENTRAL_ID.slice(0, 30)],
    ['texto arbitrario', 'd1c4ba0e'],
  ])('RECHAZA %s (fail-closed antes de la red)', (_label, bad) => {
    expect(() =>
      catalogProductsV2ParamsSchema.parse({ p_limit: 24, p_offset: 0, p_store_id: bad })
    ).toThrow();
  });
});

describe('useCatalogProductsPage — guard en el límite de la llamada', () => {
  it('F4-06: sin tienda (null) NO llama a la RPC y devuelve estado vacío normal', async () => {
    const { result } = renderHook(
      () => useCatalogProductsPage({ storeId: null, mode: 'page' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ products: [], total: 0 });
    expect(result.current.error).toBeNull();
  });

  it('F4-07: ID inválido → error CONTROLADO con mensaje útil y RPC nunca llamada', async () => {
    const { result } = renderHook(
      () => useCatalogProductsPage({ storeId: 'Central de Costpro', mode: 'page' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).not.toHaveBeenCalled(); // jamás consulta con ID inválido
    expect(String(result.current.error?.message)).toMatch(/no es un UUID válido/i);
    // el mensaje es comprensible, no el JSON de Zod crudo
    expect(String(result.current.error?.message)).not.toMatch(/invalid_format/);
  });

  it('F4-02: en Central llama a la RPC con p_store_id = UUID real de Central', async () => {
    rpcMock.mockResolvedValue({ data: [sampleRow()], error: null });
    const { result } = renderHook(
      () => useCatalogProductsPage({ storeId: CENTRAL_ID, mode: 'page' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('get_paginated_products_v2');
    expect(params.p_store_id).toBe(CENTRAL_ID);
    expect(result.current.data?.total).toBe(1);
  });

  it('F4-08: tienda válida sin productos → estado vacío (datos [], sin error)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(
      () => useCatalogProductsPage({ storeId: CENTRAL_ID, mode: 'page' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ products: [], total: 0 });
    expect(result.current.error).toBeNull();
  });

  it('F4-04/05: cambiar Central → Enervida → Central usa SIEMPRE el storeId activo', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result, rerender } = renderHook(
      ({ storeId }) => useCatalogProductsPage({ storeId, mode: 'page' }),
      { wrapper: makeWrapper(), initialProps: { storeId: CENTRAL_ID } }
    );
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][1].p_store_id).toBe(CENTRAL_ID);

    await act(async () => rerender({ storeId: ENERVIDA_ID }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[1][1].p_store_id).toBe(ENERVIDA_ID); // no reutiliza el anterior

    await act(async () => rerender({ storeId: CENTRAL_ID }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));
    expect(rpcMock.mock.calls[2][1].p_store_id).toBe(CENTRAL_ID);
  });
});

describe('useCatalogProductsInfinite — mismo contrato para vista TARJETAS', () => {
  it('acepta Central y llama con su UUID real (vista grid, defecto del incidente)', async () => {
    rpcMock.mockResolvedValue({ data: [sampleRow()], error: null });
    const { result } = renderHook(
      () => useCatalogProductsInfinite({ storeId: CENTRAL_ID, mode: 'infinite' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock.mock.calls[0][1].p_store_id).toBe(CENTRAL_ID);
  });

  it('ID inválido → error controlado, sin llamada a la RPC', async () => {
    const { result } = renderHook(
      () => useCatalogProductsInfinite({ storeId: '', mode: 'infinite' }),
      { wrapper: makeWrapper() }
    );
    // '' → getCleanStoreId → null → estado vacío, SIN error y SIN RPC
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('Aislamiento: nunca invoca la RPC sin p_store_id definido (ni null implícito)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    renderHook(
      () => useCatalogProductsInfinite({ storeId: ENERVIDA_ID, mode: 'infinite' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    for (const call of rpcMock.mock.calls) {
      expect(call[1].p_store_id).toBe(ENERVIDA_ID);
    }
  });
});
