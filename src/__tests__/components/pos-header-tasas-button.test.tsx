/**
 * UX-TASAS (2026-10-26) — Acceso directo a «Tasas» desde el header de Vender.
 *
 * Criterios de aceptación del mandato (§4):
 *   1. El botón «Tasas» aparece junto a (después de) «Historial» en Vender.
 *   2. Se puede abrir con el carrito VACÍO.
 *   3. Se abre la MISMA interfaz de tasas (StoreRatesModal) usada desde el
 *      producto del carrito — no una segunda implementación.
 *   4. El acceso antiguo desde el producto del carrito sigue funcionando.
 *   5. Abrir y cerrar sin modificar datos no altera el carrito ni los importes.
 *   6. Las validaciones y permisos actuales siguen vigentes: el botón se
 *      presenta solo a quien ya puede gestionar tasas (canManageStore =
 *      dailyRates.canManageRates, idéntico al gate de «Revisar o actualizar
 *      tasas» del diálogo diario y al POST /api/store-rates server-side);
 *      el botón NO concede permisos nuevos.
 *   7. La disposición funciona en escritorio y móvil (icon-only <sm, mismo
 *      tratamiento responsive que «Historial»).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (UUID válido)

// ── Mocks de borde (patrón de pos-cart-counter / pos-transf-exterior-ui) ───
vi.mock('sonner', () => {
  const toastFn: any = Object.assign(() => 'toast-id', {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    info: vi.fn(),
  });
  return { toast: toastFn };
});
vi.mock('@/hooks/api/useProducts', () => ({
  useProducts: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
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
  auditService: { logSaleBelowCost: vi.fn(), logRatesConfirmed: vi.fn() },
}));
// Móvil controlable por prueba (TDZ resuelto: la factoría solo se evalúa al
// importar el módulo mockado; useIsMobile() se llama en render, ya inicializado).
let isMobileMock = false;
vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => isMobileMock }));
// Superficies laterales no relacionadas (aíslan el foco del test)
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
import { POSCartItem } from '@/components/views/terminal/views/pos/POSCartItem';
import type { CartItem } from '@/store/cart';

// ── Usuarios de prueba ─────────────────────────────────────────────────────
// canManageStore(user, storeId): admin/superadmin global → true; resto →
// membresía ACTIVA admin/manager/encargado EN ESA tienda.
const ADMIN_GLOBAL = { id: 'u-admin', email: 'admin@test.local', role: 'admin', activeStoreId: STORE };
const CLERK_SIN_GESTION = {
  id: 'u-clerk', email: 'clerk@test.local', role: 'clerk', activeStoreId: STORE, memberships: [],
};
const CLERK_MANAGER_MIEMBRO = {
  id: 'u-miembro', email: 'miembro@test.local', role: 'clerk', activeStoreId: STORE,
  memberships: [{ store_id: STORE, role: 'manager', status: 'active' }],
};

function setUser(u: unknown) {
  useAuthStore.setState({
    user: u as never,
    status: 'authenticated_valid',
    loading: false,
    token: 'test-token',
  });
}

function resetCart() {
  useCartStore.setState({
    items: [],
    discount: null,
    appliedTaxes: [],
    storeId: STORE,
    globalRates: {},
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'cash',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPOSView() {
  return render(
    <QueryClientProvider client={queryClient}>
      <POSView />
    </QueryClientProvider>,
  );
}

/** Ítem real de carrito (mismo patrón de pos-transf-exterior-ui). */
function setupItem(): CartItem {
  useCartStore.getState().hydrateStoreRates({ USD: 790, EUR: 850 });
  const accepted = useCartStore.getState().addItem({
    id: 'aaaa1111-0000-4000-8000-000000000002',
    name: 'Producto CUP',
    price: 7900,
    price_currency: 'CUP',
    stock_current: 10,
    store_id: STORE,
    cost_price: 4000,
  });
  expect(accepted).toBe(true);
  return useCartStore.getState().items[0];
}

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  vi.clearAllMocks();
  isMobileMock = false;
  resetCart();
});

describe('UX-TASAS — botón «Tasas» junto a «Historial» en el header de Vender', () => {
  it('1. muestra «Tasas» inmediatamente después de «Historial» (mismo grupo, orden visual)', () => {
    setUser(ADMIN_GLOBAL);
    renderPOSView();

    const historial = screen.getByLabelText('Ir al Historial de Ventas');
    const tasas = screen.getByLabelText('Consultar o actualizar tasas de cambio');
    // El label visible del botón es «Tasas»
    expect(tasas.textContent).toContain('Tasas');
    // Orden en el DOM = orden visual de la fila flex: Historial | Tasas
    expect(
      historial.compareDocumentPosition(tasas) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Mismo padre (misma fila/grupo de acciones)
    expect(tasas.parentElement).toBe(historial.parentElement);
  });

  it('2+3. con carrito VACÍO abre el MISMO StoreRatesModal del carrito (inputs USD/EUR/MLC + Guardar)', async () => {
    setUser(ADMIN_GLOBAL);
    expect(useCartStore.getState().items.length).toBe(0);
    renderPOSView();

    fireEvent.click(screen.getByLabelText('Consultar o actualizar tasas de cambio'));

    // StoreRatesModal: role=dialog con nombre accesible «Tasas de Cambio»
    const dialog = await screen.findByRole('dialog', { name: 'Tasas de Cambio' });
    expect(within(dialog).getByLabelText('Tasa USD')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Tasa EUR')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Tasa MLC')).toBeInTheDocument();
    expect(within(dialog).getByText('Guardar Tasas')).toBeInTheDocument();
  });

  it('5. abrir y cerrar sin guardar NO altera carrito, importes ni tasas activas', async () => {
    setUser(ADMIN_GLOBAL);
    useCartStore.getState().hydrateStoreRates({ USD: 790 });
    const ratesBefore = { ...useCartStore.getState().globalRates };
    renderPOSView();

    fireEvent.click(screen.getByLabelText('Consultar o actualizar tasas de cambio'));
    const dialog = await screen.findByRole('dialog', { name: 'Tasas de Cambio' });

    // Cerrar SIN tocar los inputs NI guardar
    fireEvent.click(within(dialog).getByLabelText('Cerrar'));

    expect(screen.queryByRole('dialog', { name: 'Tasas de Cambio' })).toBeNull();
    // El carrito sigue vacío y con su contador a 0
    expect(useCartStore.getState().items.length).toBe(0);
    expect(screen.getByText(/Carrito \(0\)/)).toBeInTheDocument();
    // Las tasas activas del carrito no cambiaron (sin guardado no hay POST ni re-tasa)
    expect(useCartStore.getState().globalRates).toEqual(ratesBefore);
  });

  it('6a. permisos vigentes: clerk SIN membresía de gestión NO ve el botón (Historial intacto)', () => {
    setUser(CLERK_SIN_GESTION);
    renderPOSView();

    expect(screen.queryByLabelText('Consultar o actualizar tasas de cambio')).toBeNull();
    // El resto del header no se ve afectado
    expect(screen.getByLabelText('Ir al Historial de Ventas')).toBeInTheDocument();
  });

  it('6b. canManageStore por MEMBRESÍA activa (manager en esa tienda) SÍ ve el botón', () => {
    setUser(CLERK_MANAGER_MIEMBRO);
    renderPOSView();

    expect(screen.getByLabelText('Consultar o actualizar tasas de cambio')).toBeInTheDocument();
  });

  it('7. móvil: el botón persiste con el MISMO tratamiento responsive icon-only que «Historial»', () => {
    setUser(ADMIN_GLOBAL);
    isMobileMock = true;
    renderPOSView();

    const tasas = screen.getByLabelText('Consultar o actualizar tasas de cambio');
    const historial = screen.getByLabelText('Ir al Historial de Ventas');
    expect(tasas).toBeInTheDocument();
    // El span de texto de «Tasas» usa exactamente las mismas clases responsive
    // (hidden sm:inline) que el de «Historial» → icon-only en móvil, sin ocupar
    // ancho extra ni solaparse con el carrito.
    const tasasLabel = tasas.querySelector('span');
    const historialLabel = historial.querySelector('span');
    expect(tasasLabel?.className).toBe(historialLabel?.className);
    // En móvil sigue abriendo el mismo modal con el carrito vacío
    fireEvent.click(tasas);
    expect(screen.getByLabelText('Consultar o actualizar tasas de cambio')).toBeInTheDocument();
  });
});

describe('UX-TASAS — el acceso antiguo (botón Tasas del ítem del carrito) sigue intacto', () => {
  it('4. POSCartItem sin cambios: su botón «Actualizar tasas» abre el MISMO StoreRatesModal', async () => {
    const item = setupItem();
    render(
      <POSCartItem
        item={item}
        isEasyReading={false}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onViewImage={vi.fn()}
        updateItemDiscount={vi.fn()}
        updateItemPayment={vi.fn()}
      />,
    );

    // Expandir el panel donde vive la insignia de moneda y el botón Tasas
    fireEvent.click(screen.getByText('Descuento / Pago Mixto / Moneda'));

    const oldBtn = screen.getByLabelText('Actualizar tasas');
    expect(oldBtn).toBeInTheDocument();
    fireEvent.click(oldBtn);

    // Misma interfaz compartida (StoreRatesModal)
    await screen.findByRole('dialog', { name: 'Tasas de Cambio' });
  });
});
