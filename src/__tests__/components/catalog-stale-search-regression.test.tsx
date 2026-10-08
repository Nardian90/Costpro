/**
 * REGRESIÓN INVENTORY-CATALOG-REGRESSION-1379 — Tests del tab Catálogo.
 *
 * Síntoma reportado (post merge PR #1379):
 *   "En el tab Catálogo deberían mostrarse los productos de la tienda —más de
 *    100 productos— pero actualmente solamente aparecen 2 productos."
 *
 * Causa raíz demostrada (docs/audits/INVENTORY-CATALOG-REGRESSION-1379.md):
 *   NO fue una regresión de código introducida por PR #1379 (ese PR solo tocó
 *   Trazabilidad + props a11y compartidas, sin ruta causal al catálogo).
 *   El síntoma lo produce el estado de consulta persistido: CatalogView
 *   guardaba `catalog_searchTerm` en localStorage (CM-1.8) y lo RESTAURABA al
 *   montar. Tras una recarga / cambio de entorno, un término viejo (p.ej.
 *   "pintura", que coincide con exactamente 2 productos de ENERVIDA) dejaba el
 *   catálogo filtrado silenciosamente: cabecera "2 productos".
 *
 * Contrato verificado por estos tests:
 *   1. GUARDIÁN DE REGRESIÓN: con `catalog_searchTerm` pre-cargado en
 *      localStorage, CatalogView NO debe restaurarlo — la consulta al RPC debe
 *      crearse con searchTerm '' (catálogo completo de la tienda).
 *      (Con el código pre-fix este test FALLA: recibía 'pintura'.)
 *   2. PURGA: la clave legacy `catalog_searchTerm` se elimina del storage.
 *   3. RENDER: una tienda con total 157 y página de 5 productos renderiza los
 *      5 (más de 2) y la cabecera muestra el total real (157 productos).
 *   4. La búsqueda DENTRO de la sesión sigue funcionando (el término tecleado
 *      llega a la consulta tras el debounce) — el fix no elimina la feature.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CatalogView from '@/components/views/terminal/views/catalog/CatalogView';

// ── Polyfills jsdom (misma convención que inventory-mobile-row.test.tsx) ──
beforeAll(() => {
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
      takeRecords() { return []; }
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!(window as unknown as Record<string, unknown>).matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      }),
    });
  }
  if (!(window as unknown as Record<string, unknown>).ResizeObserver) {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
});

// ── Mock del módulo de hooks v2 del catálogo (captura opciones + fixture) ──
const catalogMocks = vi.hoisted(() => {
  const capturedOpts: Array<Record<string, unknown>> = [];
  const FIXTURE_PAGE = [
    { id: 'p-1', name: 'Pintura Casa Blanca 14L', sku: 'SKU-001', category: 'Pinturería', price: 32500, precio_empresa: 30000, price_currency: 'CUP', precio_empresa_currency: 'CUP', cost_price: 20000, min_stock: 2, image_url: null, description: '', unit_of_measure: 'unidad', supplier: null, stock_current: 10, cost_average: 20000, store_id: 'store-1', is_active: true, has_movements: true, visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_complete: true, barcode: null, barcode_type: null },
    { id: 'p-2', name: 'Pintura Verde 4L', sku: 'SKU-002', category: 'Pinturería', price: 9800, precio_empresa: 9000, price_currency: 'CUP', precio_empresa_currency: 'CUP', cost_price: 6000, min_stock: 2, image_url: null, description: '', unit_of_measure: 'unidad', supplier: null, stock_current: 4, cost_average: 6000, store_id: 'store-1', is_active: true, has_movements: true, visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_complete: true, barcode: null, barcode_type: null },
    { id: 'p-3', name: 'Cemento P425 Tudella', sku: 'SKU-003', category: 'Construcción', price: 13000, precio_empresa: 12000, price_currency: 'CUP', precio_empresa_currency: 'CUP', cost_price: 8000, min_stock: 5, image_url: null, description: '', unit_of_measure: 'unidad', supplier: null, stock_current: 190, cost_average: 8000, store_id: 'store-1', is_active: true, has_movements: true, visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_complete: true, barcode: null, barcode_type: null },
    { id: 'p-4', name: 'Escobas', sku: 'SKU-004', category: 'Limpieza', price: 1800, precio_empresa: 1500, price_currency: 'CUP', precio_empresa_currency: 'CUP', cost_price: 1080, min_stock: 3, image_url: null, description: '', unit_of_measure: 'unidad', supplier: null, stock_current: 75, cost_average: 1080, store_id: 'store-1', is_active: true, has_movements: true, visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_complete: true, barcode: null, barcode_type: null },
    { id: 'p-5', name: 'Bote sifón', sku: 'SKU-005', category: 'Plomería', price: 500, precio_empresa: 450, price_currency: 'CUP', precio_empresa_currency: 'CUP', cost_price: 300, min_stock: 3, image_url: null, description: '', unit_of_measure: 'unidad', supplier: null, stock_current: 33, cost_average: 300, store_id: 'store-1', is_active: true, has_movements: true, visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_complete: true, barcode: null, barcode_type: null },
  ];
  return { capturedOpts, FIXTURE_PAGE };
});
vi.mock('@/hooks/api/useCatalogProducts', () => ({
  useCatalogProductsInfinite: (opts: Record<string, unknown>) => {
    catalogMocks.capturedOpts.push({ mode: 'infinite', ...opts });
    return {
      data: undefined, isLoading: false, error: null,
      fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
    };
  },
  useCatalogProductsPage: (opts: Record<string, unknown>) => {
    catalogMocks.capturedOpts.push({ mode: 'page', ...opts });
    return {
      data: { products: catalogMocks.FIXTURE_PAGE, total: 157 },
      isLoading: false, isFetching: false, error: null,
    };
  },
}));

// ── Fixture alias para aserciones legibles ──
const FIXTURE_PAGE = catalogMocks.FIXTURE_PAGE;
const capturedOpts = catalogMocks.capturedOpts;

// ── Mock: supabase client (categorías + variantes usan .from()) ──
const fromMock = vi.fn((_table: string) => {
  const builder: Record<string, unknown> = {
    select: () => builder, eq: () => builder, in: () => builder,
    not: () => builder, neq: () => builder, order: () => builder,
    limit: () => builder, single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (r: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
});
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

// ── Mock: stores (usuario con tienda activa, mismo patrón vales-salida) ──
const authState = vi.hoisted(() => ({
  user: {
    id: 'u-1', role: 'admin', activeStoreId: 'store-1',
    memberships: [{ store_id: 'store-1', role: 'admin', status: 'active' }],
  },
}));
vi.mock('@/store', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ user: authState.user }) : { user: authState.user },
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel ? sel({ setIsCreateProductModalOpen: vi.fn() }) : { setIsCreateProductModalOpen: vi.fn() },
}));

// ── Mock: useInventory (v1, solo alimenta datos auxiliares) ──
vi.mock('@/hooks/api/useInventory', () => ({
  useInventory: () => ({
    data: undefined, isLoading: false, error: null,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
    refetch: vi.fn(),
  }),
}));

// ── Mock: mutaciones de productos ──
const { stub } = vi.hoisted(() => ({
  stub: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isLoading: false, error: null }),
}));
vi.mock('@/hooks/api/useProducts', () => ({
  useUpdateProduct: stub,
  useDeleteProduct: stub,
  useToggleProductActive: stub,
  useCreateProduct: stub,
  useUpdateVariant: stub,
  useDeleteVariant: stub,
  useAddVariant: stub,
  useBulkPriceUpdate: stub,
  useAutoGenerateFC: stub,
}));
vi.mock('@/hooks/api/useProductCostSheet', () => ({
  useAutoGenerateFC: stub,
  useProductCostSheetsBatch: () => ({ data: new Map(), isLoading: false }),
}));

// ── Mock: FC status (no interviene en este contrato) ──
vi.mock('@/hooks/ui/useProductFCStatus', () => ({
  useProductFCStatus: () => ({
    fcInfoMap: new Map(),
    coverage: { vigente: 0, pendiente: 0, sin_fc: 5, cobertura: 0 },
    getFCStatus: () => 'sin_fc',
    isLoading: false,
  }),
}));

// ── Mock: servicios auxiliares ──
vi.mock('@/services/catalog-service', () => ({
  catalogService: {},
  exportCatalogToExcel: vi.fn(),
}));
vi.mock('@/lib/image-compress', () => ({
  compressImage: vi.fn(), validateImageFile: () => ({ valid: true }),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderCatalog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CatalogView />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  capturedOpts.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Catálogo — regresión INVENTORY-CATALOG-REGRESSION-1379 (búsqueda persistida)', () => {
  it('1-GUARDIÁN: NO restaura un catalog_searchTerm persistido al montar — consulta con searchTerm vacío', async () => {
    // Estado exacto del navegador del usuario que produjo el síntoma:
    localStorage.setItem('catalog_searchTerm', 'pintura');

    renderCatalog();

    await waitFor(() => {
      expect(capturedOpts.filter(o => o.mode === 'page').length).toBeGreaterThan(0);
    });

    const pageCalls = capturedOpts.filter(o => o.mode === 'page');
    // Con el código pre-fix, la primera llamada arrivaba con 'pintura'
    // (restaurada de localStorage) y el "servidor" devolvía solo 2 productos.
    for (const call of pageCalls) {
      expect(call.searchTerm).toBe('');
    }
  });

  it('2-PURGA: elimina la clave legacy catalog_searchTerm del storage', async () => {
    localStorage.setItem('catalog_searchTerm', 'pintura');

    renderCatalog();

    await waitFor(() => {
      expect(localStorage.getItem('catalog_searchTerm')).toBeNull();
    });
  });

  it('3-RENDER: tienda con total 157 y página de 5 renderiza 5 productos (>2) y muestra el total real', async () => {
    renderCatalog();

    // Los 5 productos del fixture deben estar presentes (no solo 2)
    await waitFor(() => {
      expect(screen.getByText('Pintura Casa Blanca 14L')).toBeTruthy();
      expect(screen.getByText('Pintura Verde 4L')).toBeTruthy();
    });
    expect(screen.getByText('Cemento P425 Tudella')).toBeTruthy();
    expect(screen.getByText('Escobas')).toBeTruthy();
    expect(screen.getByText('Bote sifón')).toBeTruthy();

    // La cabecera muestra el TOTAL REAL de la tienda (no el de la página)
    await waitFor(() => {
      expect(screen.getByText(/157 productos/)).toBeTruthy();
    });
  });

  it('4-BUSQUEDA: la búsqueda dentro de la sesión sigue funcionando (llega al RPC tras debounce)', async () => {
    const user = userEvent.setup();
    renderCatalog();

    const input = await screen.findByPlaceholderText('Buscar por nombre o SKU...');
    await user.type(input, 'pintura');

    await waitFor(() => {
      const lastPageCall = [...capturedOpts].reverse().find(o => o.mode === 'page');
      expect(lastPageCall?.searchTerm).toBe('pintura');
    }, { timeout: 3000 });
  });
});
