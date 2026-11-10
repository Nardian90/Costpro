/**
 * useCommissionRules-enabled.test.tsx — REGRESIÓN «Error al cargar Listado de
 * precios» (2026-11-10).
 *
 * Causa raíz reproducida en E2E real (BD aislada, navegador): con localStorage
 * VACÍO, el inicializador de `showCommission` de PriceListView devolvía `null`
 * (JS: `false || (null && …)` → null, no `false`); el hook propagaba ese falsy
 * no-booleano a react-query (`enabled: null && !!storeId` → null) y
 * react-query 5.101.4 (queryObserver.js) lanza
 * «Expected enabled to be a boolean or a callback that returns a boolean»
 * → ErrorBoundary → «Error al cargar Listado de precios» en la primera
 * visita de TODO usuario.
 *
 * Contrato que esta prueba fija:
 *  1. useCommissionRules JAMÁS propaga un `enabled` no-booleano, sea el valor
 *     que el llamador pase (null, '', 0, false, true) — con falsy la query
 *     queda deshabilitada (sin fetch), nunca crash.
 *  2. El render REAL de PriceListView (hooks reales, sin mock del hook de
 *     reglas) no crashea con localStorage vacío ni con valores heredados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommissionRules } from '@/hooks/api/useCommissionRules';
import PriceListView from '@/components/views/terminal/views/price_list/PriceListView';
import type { PriceListSourceItem } from '@/lib/price-list/model';

const apiFetchMock = vi.hoisted(() => vi.fn());
const viewFixture = vi.hoisted(() => ({
  FIXTURE: [
    {
      id: 'p1', sku: '1', name: 'Producto uno', description: null, price: 100,
      price_currency: 'CUP', stock_current: 5, is_active: true, is_service: false, operational_class: 'venta',
    },
  ] as PriceListSourceItem[],
  storeInfo: { id: 'store-1', name: 'Tienda Central', logoUrl: null, reeup: null, nit: null },
}));

vi.mock('@/lib/api-fetch', () => ({ apiFetch: apiFetchMock }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// ── 1 · El hook no propaga enabled no-booleano y no crashea ────────────────
describe('useCommissionRules · contrato de enabled (regresión crash vista)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetchMock.mockReset();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const STORE = '11111111-1111-4111-8111-111111111111';

  it('no crashea con enabled falsy NO booleano (null / "" / 0) — query deshabilitada, sin fetch', () => {
    for (const badEnabled of [null, '', 0] as unknown as boolean[]) {
      const { unmount } = renderHook(() => useCommissionRules(STORE, badEnabled), { wrapper });
      // El valor malo NO debe disparar la consulta (fetchCounts con valores
      // deshabilitados: sin llamadas a la API).
      expect(apiFetchMock).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('con enabled=true y tienda válida SÍ consulta y filtra por tienda', async () => {
    apiFetchMock.mockResolvedValue({
      rules: [
        { id: 'r1', store_id: STORE, type: 'product_specific', fixed_value: 5, base_calculation: 'product_specific' },
        { id: 'r2', store_id: 'otra-tienda', type: 'product_specific', fixed_value: 9, base_calculation: 'product_specific' },
      ],
    });
    const { result } = renderHook(() => useCommissionRules(STORE, true), { wrapper });
    await vi.waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/commissions/rules?store_id=${STORE}`));
      expect(result.current.data?.length).toBe(1);
      expect(result.current.data?.[0].store_id).toBe(STORE);
    });
  });
});

// ── 2 · La vista REAL (hook sin mockear) no crashea con localStorage real ──
describe('PriceListView · render con useCommissionRules REAL y localStorage heredado (regresión)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ rules: [] });
    window.localStorage.clear(); // escenario del bug: primera visita, key ausente
  });

  vi.mock('@/store', () => ({
    useAuthStore: (sel?: (s: unknown) => unknown) =>
      sel ? sel({ user: { id: 'u-1', activeStoreId: 'store-1' } }) : { user: { id: 'u-1', activeStoreId: 'store-1' } },
  }));

  vi.mock('@/hooks/api/usePriceListProducts', () => ({
    usePriceListProducts: vi.fn(() => ({ data: viewFixture.FIXTURE, isLoading: false, error: null })),
    fetchPriceListStoreInfo: vi.fn(() => Promise.resolve(viewFixture.storeInfo)),
  }));

  vi.mock('@/lib/price-list/pdf', () => ({
    renderPriceListPdf: vi.fn(async () => ({ output: vi.fn(() => 'blob:mock'), save: vi.fn() })),
    priceListFileName: vi.fn(() => 'listado.pdf'),
  }));

  function viewWithQueryClient(): React.ReactElement {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}><PriceListView /></QueryClientProvider>;
  }

  it('localStorage VACÍO (primera visita — escenario exacto del bug) renderiza sin crash', () => {
    const { container } = render(viewWithQueryClient());
    // Sin ErrorBoundary el crash anterior interrumpía el render al montar:
    // si llegamos aquí, el throw de react-query ya no ocurre.
    expect(container.querySelector('[data-view="listado-precios"]')).toBeTruthy();
    expect(screen_getFilters()).toBeTruthy();
    // y la preferencia inicial quedó persistida como objeto booleano legítimo
    expect(window.localStorage.getItem('costpro:price-list:columns')).toBe('{"commission":false}');
  });

  it.each(['""', '0', 'null', 'true', '{"commission":true}'])(
    'localStorage heredado %s renderiza sin crash y con booleano saneado',
    (raw) => {
      window.localStorage.setItem('costpro:price-list:columns', raw);
      const { container } = render(viewWithQueryClient());
      expect(container.querySelector('[data-view="listado-precios"]')).toBeTruthy();
      expect(screen_getFilters()).toBeTruthy();
    },
  );
});

/** El primer bloque visible de la vista: si el render crashea, no existe. */
function screen_getFilters(): HTMLElement | null {
  return document.querySelector('[data-view="listado-precios"]');
}
