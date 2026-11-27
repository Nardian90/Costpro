/**
 * pos-transfer-identity-express.test.tsx — MISIÓN COSTPRO-SALES-MODAL-INPUT-
 * AND-TRANSFER-VALIDATION-001 (FASE 2/3) — CAJERO EXPRESS.
 *
 * La pestaña «Datos de transferencia» del modal «Confirmar Venta» exige los
 * CUATRO datos (nombre + carné + teléfono + N.º por fila). El campo Teléfono
 * es NUEVO en esta misión; nombre/CI usan ahora el MISMO componente compartido
 * con el Modo Carrito (TransferIdentityFields). Cubre además el bug de foco
 * de la FASE 1 EN VIVO: escribir en Notas conserva el foco (POSPortalModal
 * real, sin mock).
 *
 * Arnés: patrón de pos-express-parity.test.tsx (mocks mínimos, fallback real
 * del store). NOTA DE ARNÉS: las mutaciones del store van SIEMPRE dentro de
 * act() — sin él el re-render de Express queda pendiente y el botón «Cobrar
 * venta» se clicaría en un render STALE (disabled).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import React from 'react';

const STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';

const P_ESCOBAS = {
  id: '11111111-0000-4000-8000-000000000030', name: 'Escobas', sku: 'PROD-030',
  barcode: '7509251381997', price: 250, cost_price: 150, stock_current: 75, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true,
};
const PRODUCTS = [P_ESCOBAS];

const { usePOSCheckoutMock } = vi.hoisted(() => ({ usePOSCheckoutMock: vi.fn() }));

vi.mock('@/hooks/api/useActiveShift', () => ({
  useActiveShift: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/api/useFrequentProducts', () => ({
  useFrequentProducts: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCheckout', () => ({
  usePOSCheckout: usePOSCheckoutMock,
}));
vi.mock('@/components/views/terminal/views/pos/POSOperationDateSection', () => ({
  POSOperationDateSection: () => null,
  usePosSaleDate: () => ({ validation: { valid: true, error: null } }),
}));
vi.mock('@/components/views/terminal/views/pos/PaymentMethodSelector', () => ({
  PaymentMethodSelector: () => <div data-testid="payment-selector-mock" />,
  getPaymentLabel: (m: string | null | undefined) => String(m ?? 'Sin especificar'),
}));
vi.mock('@/components/views/terminal/views/pos/POSCartItemEditModal', () => ({
  POSCartItemEditModal: ({ item }: { item: { product?: { name?: string } } }) => (
    <div data-testid="express-item-edit-modal">editando:{item?.product?.name}</div>
  ),
}));
vi.mock('@/components/views/terminal/views/pos/POSCartSuccessView', () => ({
  POSCartSuccessView: ({ lastSale }: { lastSale?: { id: string } | null }) => (
    <div data-testid="express-success-view">venta:{lastSale?.id}</div>
  ),
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCartExports', () => ({
  usePOSCartExports: () => ({
    generatePDF: vi.fn(), shareWhatsApp: vi.fn(), exportAsImage: vi.fn(), printReceipt: vi.fn(),
  }),
}));
vi.mock('@/components/views/terminal/views/pos/PriceSelectorModal', () => ({
  default: () => null,
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

function renderExpress() {
  const utils = render(
    <POSExpressMode
      products={PRODUCTS}
      onExit={() => {}}
      onAddToCart={undefined as never}
      onAddItemWithVariant={vi.fn()}
      hideOutOfStock={false}
    />,
  );
  return utils;
}

/** Agrega un producto y convierte SU fila de pago en transferencia completa. */
function addTransferSale(reference: string) {
  act(() => {
    useCartStore.getState().addItem(P_ESCOBAS); // 250 CUP, fila cash por defecto
    const st = useCartStore.getState();
    const item = st.items[0];
    st.updateItemPaymentRow(P_ESCOBAS.id, null, item.payments![0].id, {
      method: 'transfer', amount: 250, currency: 'CUP', reference,
    });
    useCartStore.setState((s) => ({
      items: s.items.map((i) => ({ ...i, payment_manual_override: true })),
    }));
  });
}

function openConfirm() {
  const cartDesktop = document.body.querySelector('[data-testid="express-cart-desktop"]')!;
  const cobrar = within(cartDesktop as HTMLElement).getByRole('button', { name: 'Cobrar venta' }) as HTMLButtonElement;
  expect(cobrar.disabled).toBe(false); // guard del arnés: nunca clicar un render stale
  fireEvent.click(cobrar);
}

function openTransferTab() {
  fireEvent.click(screen.getByTestId('tab-datos-transferencia'));
}

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
}

function fillIdentity(name: string, ci: string, phone: string) {
  fireEvent.change(document.getElementById('pos-express-transfer-name')!, { target: { value: name } });
  fireEvent.change(document.getElementById('pos-express-transfer-ci')!, { target: { value: ci } });
  fireEvent.change(document.getElementById('pos-express-transfer-phone')!, { target: { value: phone } });
}

describe('MISIÓN TRANSFER-VALIDATION — Cajero Express: pestaña Datos de transferencia', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    usePOSCheckoutMock.mockReturnValue(
      {
        startCheckout: vi.fn(), confirmUnpricedCheckout: vi.fn(), processCheckout: vi.fn(),
        isProcessingSale: false, showPriceWarning: false, setShowPriceWarning: vi.fn(),
        showRateWarning: false, rateWarningData: null, confirmRateWarning: vi.fn(),
        cancelRateWarning: vi.fn(), updateRateFromModal: vi.fn(), lastSale: null, setLastSale: vi.fn(),
      } as never,
    );
    useAuthStore.setState({
      user: { id: 'u1', email: 'express@test.local', role: 'admin', activeStoreId: STORE } as never,
      status: 'authenticated_valid',
      loading: false,
    });
    // Reset COMPLETO de la identidad (setState hace merge: sin esto, los
    // datos del test anterior contaminan el siguiente)
    useCartStore.setState({ items: [], storeId: STORE, customerName: null, customerCi: null, customerPhone: null, lastUpdated: Date.now() });
  });

  it('sin identidad → Confirmar deshabilitado y mensajes junto a cada campo', () => {
    renderExpress();
    addTransferSale('TR-EXP-001');
    openConfirm();
    openTransferTab();
    const alerts = screen.getAllByText(/Requerido para el pago por transferencia/i);
    expect(alerts.length).toBe(3);
    expect(confirmButton().disabled).toBe(true);
  });

  it('campo Teléfono presente (NUEVO) y los 4 datos habilitan Confirmar', () => {
    renderExpress();
    addTransferSale('TR-EXP-002');
    openConfirm();
    openTransferTab();
    // El teléfono existe y es requerido
    expect(document.getElementById('pos-express-transfer-phone')).toBeTruthy();
    fillIdentity('Ana Pérez Rodríguez', '92031112345', '+53 51234567');
    // Fuente única compartida con el Modo Carrito
    const st = useCartStore.getState();
    expect(st.customerName).toBe('Ana Pérez Rodríguez');
    expect(st.customerCi).toBe('92031112345');
    expect(st.customerPhone).toBe('+53 51234567');
    expect(confirmButton().disabled).toBe(false);
  });

  it('con referencia pero SIN identidad → «Completar datos» navega y exige los tres campos', () => {
    renderExpress();
    addTransferSale('TR-EXP-003');
    openConfirm();
    // En Resumen el botón pasa a «Completar datos» cuando falta la identidad
    const completar = screen.getByRole('button', { name: /Completar datos/i }) as HTMLButtonElement;
    fireEvent.click(completar);
    expect(screen.getByTestId('datos-transferencia-panel')).toBeTruthy();
    fillIdentity('Ana Pérez Rodríguez', '92031112345', '');
    expect(confirmButton().disabled).toBe(true); // falta teléfono
    fireEvent.change(document.getElementById('pos-express-transfer-phone')!, { target: { value: '51234567' } });
    expect(confirmButton().disabled).toBe(false);
  });

  it('venta SIN transferencia → no existe pestaña de datos ni se exige identidad', () => {
    renderExpress();
    act(() => { useCartStore.getState().addItem(P_ESCOBAS); }); // cash por defecto
    openConfirm();
    expect(screen.queryByTestId('tab-datos-transferencia')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });
});

describe('MISIÓN TRANSFER-VALIDATION — foco al escribir Notas en el modal real de Express (FASE 1 en vivo)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    usePOSCheckoutMock.mockReturnValue({ startCheckout: vi.fn(), isProcessingSale: false } as never);
    useAuthStore.setState({
      user: { id: 'u1', email: 'express@test.local', role: 'admin', activeStoreId: STORE } as never,
      status: 'authenticated_valid',
      loading: false,
    });
    useCartStore.setState({ items: [], storeId: STORE, customerName: null, customerCi: null, customerPhone: null, lastUpdated: Date.now() });
  });

  it('escribir varias palabras en «Notas de la venta» no secuestra el foco hacia Cerrar', () => {
    renderExpress();
    act(() => { useCartStore.getState().addItem(P_ESCOBAS); });
    openConfirm();
    const nota = document.getElementById('pos-express-sale-notes') as HTMLTextAreaElement;
    expect(nota).toBeTruthy();
    nota.focus();
    const frase = 'Cliente regular, entrega en el domicilio de siempre';
    for (const ch of frase) {
      act(() => { fireEvent.change(nota, { target: { value: nota.value + ch } }); });
    }
    expect(nota.value).toBe(frase);
    expect(document.activeElement).toBe(nota);
    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    expect(document.activeElement).not.toBe(closeBtn);
    // El modal sigue abierto
    expect(screen.getByText('Confirmar Venta')).toBeTruthy();
  });
});
