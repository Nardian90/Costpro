/**
 * FASE D — Test de integración del flujo REAL de Vender (POSView).
 *
 * Renderiza POSView con la secuencia exacta del bug reportado:
 *   localStorage con carrito persistido de otra tienda (storeId stale)
 *   → montar POS → clic en producto → el contador DEBE pasar a 1.
 *
 * PRE-fix: el clic muestra toast de éxito pero "Caja (0)" (bug).
 * POST-fix: "Caja (1)".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';

const PRODUCTS = [
  { id: 'pos-prod-1', name: 'Cemento Fase D', sku: 'FD-1', price: 100, stock_current: 10, min_stock: 0, store_id: STORE_B, product_variants: [] },
  { id: 'pos-prod-2', name: 'Bloque Fase D', sku: 'FD-2', price: 50, stock_current: 4, min_stock: 0, store_id: STORE_B, product_variants: [] },
];

// ── Mocks de borde (documentados) ──────────────────────────────────────────
vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: PRODUCTS, isLoading: false, error: null }),
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCheckout', () => ({
  usePOSCheckout: () => ({
    startCheckout: vi.fn(), confirmUnpricedCheckout: vi.fn(), isProcessingSale: false,
    showPriceWarning: false, setShowPriceWarning: vi.fn(), showRateWarning: false,
    rateWarningData: null, confirmRateWarning: vi.fn(), cancelRateWarning: vi.fn(),
    updateRateFromModal: vi.fn(), lastSale: null, setLastSale: vi.fn(),
  }),
}));
vi.mock('@/services/audit-service', () => ({
  auditService: { logSaleBelowCost: vi.fn() },
}));
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));
// Superficies laterales no relacionadas al contador (aíslan el foco del test)
vi.mock('@/components/views/terminal/views/pos/OfflineStatusIndicator', () => ({
  default: () => null, OfflineStatusIndicator: () => null,
}));
vi.mock('@/components/views/terminal/views/pos/CashStatusWidget', () => ({
  CashStatusWidget: () => null,
}));
vi.mock('@/components/views/terminal/views/pos/NoShiftBanner', () => ({
  NoShiftBanner: () => null,
}));
vi.mock('@/components/views/terminal/views/pos/FrequentProducts', () => ({
  FrequentProducts: () => null,
}));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, k) => (p: any) => React.createElement(String(k), p, p?.children) }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import POSView from '@/components/views/terminal/views/pos/POSView';

describe('FASE D — flujo real Vender: agregar producto actualiza el contador', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.clearAllMocks();
    // Usuario con tienda activa STORE_B (igual que la de los productos)
    useAuthStore.setState({
      user: { id: 'u1', email: 'fase-d@test.local', role: 'admin', activeStoreId: STORE_B } as never,
      status: 'authenticated_valid', loading: false,
    });
    // ⚠️ Estado envenenado idéntico al del bug reportado: carrito vacío con
    // storeId persistido de una tienda anterior (STORE_A).
    useCartStore.setState({ items: [], storeId: STORE_A, lastUpdated: Date.now() });
  });

  it('agregar producto desde el grid actualiza el contador a 1 (con estado stale preexistente)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <POSView />
      </QueryClientProvider>,
    );

    // El producto del grid de la tienda activa
    const card = await screen.findByText('Cemento Fase D');
    fireEvent.click(card);

    // POST-fix: el header pasa a "Caja (1)". PRE-fix: queda "Caja (0)".
    await screen.findByText(/Caja \(1\)/, {}, { timeout: 3000 });
  });

  it('segundo producto distinto → 2 líneas y contador 2', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <POSView />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('Cemento Fase D'));
    fireEvent.click(await screen.findByText('Bloque Fase D'));
    await screen.findByText(/Caja \(2\)/, {}, { timeout: 3000 });
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items.map(i => i.product_id).sort()).toEqual(['pos-prod-1', 'pos-prod-2']);
  });

  it('mismo producto dos veces → consolida cantidad (contador 2, 1 línea)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <POSView />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('Cemento Fase D'));
    fireEvent.click(await screen.findByText('Cemento Fase D'));
    await screen.findByText(/Caja \(2\)/, {}, { timeout: 3000 });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });
});
