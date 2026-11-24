/**
 * CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24) — Pruebas de la misión.
 *
 * Cubre las causas raíz corregidas:
 *  · Cajero Express (§3.2/§3.3): catálogo inicial debajo del buscador sin
 *    escribir, agotados ocultos con «Solo con stock», búsqueda «Alarma» en
 *    vivo (sin exigir Enter), borrar búsqueda recupera el catálogo, estado
 *    «Sin coincidencias» explícito, estado de error con Reintentar.
 *  · Panel derecho de Ventas (§2): tras una venta confirmada (lastSale ≠ null)
 *    el botón X DEBE cerrar el panel de verdad. Causa raíz corregida: el X
 *    solo mutaba showCart y la condición (showCart || lastSale) mantenía el
 *    panel montado. Cerrar limpia lastSale (estado local del recibo) — la
 *    venta ya confirmada en BD no se toca (sin re-POST).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════════
// PARTE 1 — Cajero Express: catálogo inicial y estados del buscador
// ═══════════════════════════════════════════════════════════════════

const STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1'; // Puerto Padre (sandbox de pruebas)

const P_ALARMA = {
  id: '11111111-0000-4000-8000-000000000101', name: 'Alarma', sku: '123',
  barcode: 'INT000000000010', price: 120, cost_price: 80, stock_current: 3, min_stock: 1,
  store_id: STORE, product_variants: [], is_service: false, is_active: true,
};
const P_CEMENTO_COLA = {
  id: '11111111-0000-4000-8000-000000000013', name: 'Cemento cola de 25kg', sku: 'PROD-013',
  barcode: '7509251381409', price: 950, cost_price: 700, stock_current: 320, min_stock: 1,
  store_id: STORE, product_variants: [], is_service: false, is_active: true,
};
const P_AGOTADO = {
  id: '11111111-0000-4000-8000-000000000012', name: 'Cemento Blanco (agotado)', sku: 'PROD-012',
  barcode: null, price: 120, cost_price: 90, stock_current: 0, min_stock: 1,
  store_id: STORE, product_variants: [], is_service: false, is_active: true,
};
const PRODUCTS = [P_ALARMA, P_CEMENTO_COLA, P_AGOTADO];

vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/api/useFrequentProducts', () => ({
  useFrequentProducts: () => ({ data: null, isLoading: false }),
}));
// Stub universal de Supabase: rpc (Express/respaldo), from chainable
// (user-preferences en POSView) y Realtime channel no-op (useUserPreferences).
// Las consultas resuelven vacías — los tests no dependen de datos reales.
vi.mock('@/lib/supabaseClient', () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    const chainable = ['select', 'eq', 'neq', 'ilike', 'or', 'order', 'limit', 'range', 'single', 'maybeSingle', 'in', 'is'];
    for (const m of chainable) {
      (b[m] as unknown) = vi.fn(() => (m === 'single' || m === 'maybeSingle'
        ? Promise.resolve({ data: null, error: null })
        : b));
    }
    for (const t of ['insert', 'update', 'delete', 'upsert']) {
      (b[t] as unknown) = vi.fn(() => Promise.resolve({ data: null, error: null }));
    }
    return b;
  };
  return {
    supabase: {
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      from: vi.fn(() => builder()),
      channel: vi.fn(() => ({
        on: vi.fn(() => ({ subscribe: vi.fn(() => ({})) })),
      })),
      removeChannel: vi.fn(),
    },
  };
});
// HARDENING CI (2026-11-24): UN solo vi.mock por módulo. Antes este archivo
// registraba DOS veces `@/…/usePOSCheckout` (fábrica sync muerta con
// lastSale:null + la fábrica real de abajo) y DOS veces `POSCartSuccessView`
// (con testids distintos). El registro duplicado es código muerto (Vitest
// resuelve con la última fábrica) pero introduce ambigüedad y fue la única
// vía por la que el panel de éxito podía quedar sin montar en CI
// («Unable to find [data-testid="pos-success-view"]», 2 corridas
// consecutivas en runner de GitHub, irreproducible en local).
vi.mock('@/components/views/terminal/views/pos/POSOperationDateSection', () => ({
  POSOperationDateSection: () => null,
  usePosSaleDate: () => ({ validation: { valid: true, error: null } }),
}));
vi.mock('@/components/views/terminal/views/pos/PaymentMethodSelector', () => ({
  PaymentMethodSelector: () => <div data-testid="payment-selector-mock" />,
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCartExports', () => ({
  usePOSCartExports: () => ({
    generatePDF: vi.fn(), shareWhatsApp: vi.fn(), exportAsImage: vi.fn(), printReceipt: vi.fn(),
  }),
}));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, k) => (p: Record<string, unknown>) => React.createElement(String(k), p, p?.children as never) }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  useReducedMotion: () => false,
}));
vi.mock('@/components/ui/ProductImage', () => ({
  default: ({ name }: { name?: string }) => <div data-testid={`img-${name ?? 'sin-nombre'}`} />,
}));

import { useAuthStore } from '@/store';
import { useCartStore } from '@/store/cart';
import { POSExpressMode } from '@/components/views/terminal/views/pos/POSExpressMode';

function renderExpress(props: Partial<Parameters<typeof POSExpressMode>[0]> = {}) {
  const onAddToCart = vi.fn();
  const utils = render(
    <POSExpressMode
      products={props.products ?? PRODUCTS}
      onExit={() => {}}
      onAddToCart={props.onAddToCart ?? onAddToCart}
      hideOutOfStock={props.hideOutOfStock ?? true}
      onHideOutOfStockChange={props.onHideOutOfStockChange ?? vi.fn()}
      productsLoading={props.productsLoading ?? false}
      productsError={props.productsError ?? null}
      onRetryProducts={props.onRetryProducts}
      {...props}
    />,
  );
  const input = document.body.querySelector('#pos-express-search-input') as HTMLInputElement;
  return { ...utils, input, onAddToCart };
}

describe('CP-UX-NAVIGATION-POS-REPAIR-001 · Cajero Express (§3.2/§3.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', email: 'express@test.local', role: 'admin', activeStoreId: STORE } as never,
      status: 'authenticated_valid', loading: false,
    });
  });

  it('muestra el catálogo inicial debajo del buscador al entrar (sin escribir)', () => {
    renderExpress();
    const catalog = screen.getByText(/Catálogo disponible/i);
    expect(catalog).toBeInTheDocument();
    // «Alarma» (con existencias) está en el catálogo inicial
    expect(document.body.querySelector('[aria-label="Agregar Alarma"]')).toBeTruthy();
    // «Cemento cola» (con existencias) también
    expect(document.body.querySelector('[aria-label="Agregar Cemento cola de 25kg"]')).toBeTruthy();
  });

  it('no muestra productos agotados en el catálogo con «Solo con stock» activo', () => {
    renderExpress(); // hideOutOfStock=true por defecto
    expect(document.body.querySelector('[aria-label="Agregar Cemento Blanco (agotado)"]')).toBeNull();
  });

  it('buscar «Alarma» devuelve coincidencias reales en vivo (sin exigir Enter)', () => {
    renderExpress();
    const input = document.body.querySelector('#pos-express-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alarma' } }); // minúsculas: normalización
    const results = screen.getByRole('listbox', { name: /resultados de búsqueda express/i });
    const option = within(results).getByRole('option');
    expect(option).toHaveTextContent('Alarma');
  });

  it('borrar la búsqueda (botón limpiar) recupera el catálogo inicial', () => {
    renderExpress();
    const input = document.body.querySelector('#pos-express-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'alarma' } });
    expect(screen.getByRole('listbox', { name: /resultados de búsqueda express/i })).toBeInTheDocument();
    // Botón de limpiar dentro del contenedor del input
    fireEvent.click(screen.getByRole('button', { name: /Limpiar búsqueda y volver al catálogo/i }));
    expect(input.value).toBe('');
    expect(screen.getByText(/Catálogo disponible/i)).toBeInTheDocument();
  });

  it('muestra el estado «Sin coincidencias» cuando nada coincide', () => {
    renderExpress();
    const input = document.body.querySelector('#pos-express-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xyz-nada' } });
    expect(screen.getByText(/Sin coincidencias para «xyz-nada»/i)).toBeInTheDocument();
  });

  it('muestra el estado de error con Reintentar cuando la carga del catálogo falla', () => {
    const onRetryProducts = vi.fn();
    renderExpress({ productsError: 'HTTP 500', onRetryProducts });
    expect(screen.getByText(/Error al recuperar productos/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(onRetryProducts).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado de carga (skeleton) mientras llegan los productos', () => {
    renderExpress({ productsLoading: true });
    expect(screen.getByRole('status', { name: /Cargando productos de la tienda/i })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// PARTE 2 — Panel derecho de Ventas: el X cierra tras venta confirmada
// ═══════════════════════════════════════════════════════════════════

const SALE = {
  id: 'sale-abc-123',
  items: [{ product: { name: 'Alarma', sku: '123' }, quantity: 1, price: 120, subtotal: 120, variantName: null, currency: 'CUP' }],
  subtotal: 120, subtotalCup: 120, discountAmount: 0, taxAmount: 0, total: 120,
  discount: null, paymentMethod: 'cash', payments: [], cashReceived: null, change: null,
  date: new Date().toISOString(),
};

// Holder de lastSale controlable desde los tests (el hook real lo setea tras el POST)
const { lastSaleHolder, setLastSaleMock } = vi.hoisted(() => ({
  lastSaleHolder: { current: null as unknown },
  setLastSaleMock: vi.fn((v: unknown) => { lastSaleHolder.current = v; }),
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: PRODUCTS, isLoading: false, error: null, refetch: vi.fn() }),
}));
// Mock de usePOSCheckout (ÚNICO registro para este módulo) con lastSale como
// ESPEJO del holder: se LEE EN CADA RENDER (no solo como valor inicial de
// useState) y setLastSale fuerza re-render — fiel al contrato real (setLastSale
// es un setState del hook y el POST lo setea tras confirmar la venta).
// HARDENING CI (2026-11-24): el diseño anterior sembraba el estado solo vía
// valor inicial de useState, de modo que cualquier remontaje/timing de módulo
// podía ver lastSale=null tras haber sembrado el holder — exactamente el modo
// de fallo observado en runner de GitHub (panel de éxito ausente en
// «X cierra el panel de verdad tras una venta confirmada»). Con el espejo,
// el estado post-venta es determinista ante cualquier orden de montaje.
vi.mock('@/components/views/terminal/views/pos/usePOSCheckout', async () => {
  const { useCallback, useReducer } = await import('react');
  return {
    usePOSCheckout: () => {
      const [, forceRender] = useReducer((c: number) => c + 1, 0);
      const setLastSale = useCallback((v: unknown) => {
        lastSaleHolder.current = v;
        setLastSaleMock(v);
        forceRender();
      }, []);
      return {
        startCheckout: vi.fn(), confirmUnpricedCheckout: vi.fn(), isProcessingSale: false,
        showPriceWarning: false, setShowPriceWarning: vi.fn(), showRateWarning: false,
        rateWarningData: null, confirmRateWarning: vi.fn(), cancelRateWarning: vi.fn(),
        updateRateFromModal: vi.fn(), lastSale: lastSaleHolder.current as never, setLastSale,
      };
    },
  };
});
vi.mock('@/services/audit-service', () => ({
  auditService: { logSaleBelowCost: vi.fn() },
}));
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));
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
vi.mock('@/components/views/terminal/views/pos/POSCartItem', () => ({
  POSCartItem: () => <div data-testid="cart-item" />,
}));
vi.mock('@/components/views/terminal/views/pos/POSCartSuccessView', () => ({
  POSCartSuccessView: ({ lastSale }: { lastSale?: { id: string } | null }) => (
    <div data-testid="pos-success-view">venta:{lastSale?.id}</div>
  ),
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCartExports', () => ({
  usePOSCartExports: () => ({
    generatePDF: vi.fn(), shareWhatsApp: vi.fn(), exportAsImage: vi.fn(), printReceipt: vi.fn(),
  }),
}));
vi.mock('@/components/views/terminal/views/pos/CustomerSelector', () => ({
  CustomerSelector: () => <div data-testid="customer-selector" />,
}));
vi.mock('@/components/views/terminal/views/pos/POSCartCheckoutPanel', () => ({
  POSCartCheckoutPanel: () => <div data-testid="checkout-panel" />,
}));
vi.mock('@/components/views/terminal/views/pos/ValeSalidaPanel', () => ({
  ValeSalidaPanel: () => <div data-testid="vale-panel" />,
}));
// POSExpressMode NO se mockea: en las pruebas de POSView nunca se activa el
// modo Express (solo se monta si expressMode=true) y en la Parte 1 de este
// archivo se testea el componente REAL.

import POSView from '@/components/views/terminal/views/pos/POSView';

describe('CP-UX-NAVIGATION-POS-REPAIR-001 · Cierre del panel de Ventas (§2)', () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.clearAllMocks();
    lastSaleHolder.current = null;
    useAuthStore.setState({
      user: { id: 'u1', email: 'pos@test.local', role: 'admin', activeStoreId: STORE } as never,
      status: 'authenticated_valid', loading: false,
    });
    useCartStore.setState({ items: [], storeId: STORE, lastUpdated: Date.now() });
  });

  it('X cierra el panel de verdad tras una venta confirmada (lastSale ≠ null)', async () => {
    // Simula el estado post-venta: la venta fue confirmada (POST OK) y el
    // recibo (lastSale) permanece — exactamente el escenario del bug.
    lastSaleHolder.current = SALE;

    render(
      <QueryClientProvider client={queryClient}>
        <POSView />
      </QueryClientProvider>,
    );

    // FIABILIDAD CI (2026-11-24): en producción lastSale SIEMPRE llega de forma
    // asíncrona (se fija cuando el POST de create_sale_v2 resuelve), así que el
    // contrato correcto es «la vista de éxito aparece» — no «aparece en el
    // primer microtask». findBy tolera el render asíncrono bajo carga del
    // runner (flake observado en CI: getByTestId síncrono antes del re-render).
    await screen.findByTestId('pos-success-view');

    // Clic en el X del header del carrito
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar carrito' }));

    // POST-fix: el panel DESAPARECE de verdad (antes: showCart=false pero
    // lastSale ≠ null mantenía el panel montado).
    expect(screen.queryByTestId('pos-success-view')).not.toBeInTheDocument();
    // Y el cierre limpió el recibo local (la venta ya está en BD: sin re-POST)
    expect(setLastSaleMock).toHaveBeenCalledWith(null);
  });

  it('cerrar el panel NO altera un carrito pendiente sin confirmar', () => {
    // Carrito con items SIN confirmar (operación pendiente): el X cierra el
    // panel pero NO vacía el carrito (los items persisten para reabrir).
    useCartStore.setState({ items: [], storeId: STORE, lastUpdated: Date.now() });
    useCartStore.getState().addItem({
      product_id: P_ALARMA.id, variant_id: null, variant: null,
      price: P_ALARMA.price, cost: P_ALARMA.cost_price,
      quantity: 1, product: P_ALARMA as never, subtotal: P_ALARMA.price,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <POSView />
      </QueryClientProvider>,
    );

    // Abrir el carrito manualmente (sin lastSale: venta pendiente)
    fireEvent.click(screen.getByRole('button', { name: /Abrir carrito/i }));
    expect(screen.getAllByTestId('cart-item').length).toBeGreaterThan(0);

    // Cerrar con X
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar carrito' }));
    expect(screen.queryByTestId('cart-item')).not.toBeInTheDocument();

    // El carrito pendiente NO se borra al cerrar el panel
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
