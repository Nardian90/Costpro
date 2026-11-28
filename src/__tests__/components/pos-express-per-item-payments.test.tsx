/**
 * CP-POS-REDESIGN-PER-ITEM-PAYMENTS-001 — Cajero Express: pagos por producto,
 * pestaña condicional «Datos de transferencia» y layout con carrito de altura
 * completa. Escenarios de la misión cubiertos aquí (nivel componente):
 *
 *  · §1.2/§1.3: carrito desktop SIEMPRE presente con «Configurar pago» por
 *    línea; modal de pago por línea monta el MISMO editor de filas del carrito.
 *  · §1.4: barra inferior móvil con acceso evidente al carrito (panel a
 *    pantalla completa) y al total.
 *  · B/C/D: método DERIVADO de las distribuciones (transferencia / mixto) en
 *    el resumen y la confirmación — sin selector global.
 *  · F: pestaña «Datos de transferencia» presente con cliente + CI + números
 *    por fila; el botón bloquea sin datos y pasa a la pestaña (fail-closed).
 *  · G: sin transferencia la pestaña NO existe y no se exigen datos personales.
 *  · H: cambiar entre pestañas CONSERVA los datos (nombre/CI/referencias).
 *  · I: importe parcialmente distribuido → «Pendiente» visible en resumen.
 *  · J: importe distribuido superior → «Sobrepago» visible en la línea.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';

const STORE = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';

const P_CAFE = {
  id: '11111111-0000-4000-8000-000000000013', name: 'Café molido 250g', sku: 'PROD-013',
  barcode: null, price: 700, cost_price: 400, stock_current: 100, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true, unit_of_measure: 'unidad',
};
const P_AGUA = {
  id: '11111111-0000-4000-8000-000000000014', name: 'Agua embotellada 1L', sku: 'PROD-014',
  barcode: null, price: 500, cost_price: 300, stock_current: 100, min_stock: 1, store_id: STORE,
  product_variants: [], is_service: false, is_active: true, unit_of_measure: 'unidad',
};
const PRODUCTS = [P_CAFE, P_AGUA];

const { usePOSCheckoutMock } = vi.hoisted(() => ({ usePOSCheckoutMock: vi.fn() }));

vi.mock('@/hooks/api/useActiveShift', () => ({ useActiveShift: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/api/useFrequentProducts', () => ({ useFrequentProducts: () => ({ data: null, isLoading: false }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
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
import { useCartStore, type CartItem } from '@/store/cart';
import { POSExpressMode } from '@/components/views/terminal/views/pos/POSExpressMode';

function row(method: 'cash' | 'transfer' | 'external_transfer', amount: number, currency = 'CUP', reference?: string) {
  return {
    id: `pay-${method}-${Math.random().toString(36).slice(2, 7)}`,
    method, amount, currency, reference: reference ?? null,
    discount_type: null, discount_value: 0, discount_currency: currency,
  };
}

function makeItem(product: typeof P_CAFE, payments: CartItem['payments'], override = true): CartItem {
  const subtotal = product.price;
  return {
    product_id: product.id,
    variant_id: null,
    quantity: 1,
    price: product.price,
    base_price_cup: product.price,
    cost: product.cost_price,
    subtotal,
    product: product as unknown as CartItem['product'],
    variant: null,
    discount_type: null,
    discount_value: 0,
    discount_currency: 'CUP',
    payments,
    cash_paid: payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0),
    transfer_paid: payments.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0),
    zelle_paid: payments.filter(p => p.method === 'external_transfer').reduce((s, p) => s + p.amount, 0),
    cash_currency: 'CUP',
    transfer_currency: 'CUP',
    zelle_currency: 'USD',
    cash_discount_type: null,
    cash_discount_value: 0,
    cash_discount_currency: 'CUP',
    cash_surcharge_type: null,
    cash_surcharge_value: 0,
    transfer_discount_type: null,
    transfer_discount_value: 0,
    transfer_discount_currency: 'CUP',
    transfer_surcharge_type: null,
    transfer_surcharge_value: 0,
    zelle_discount_type: null,
    zelle_discount_value: 0,
    zelle_discount_currency: 'USD',
    zelle_surcharge_type: null,
    zelle_surcharge_value: 0,
    currency: 'CUP',
    exchange_rate: 1,
    payment_manual_override: override,
  };
}

function renderExpress() {
  render(
    <POSExpressMode
      products={PRODUCTS}
      onExit={() => {}}
      hideOutOfStock={false}
    />,
  );
  const body = document.body;
  const cart = body.querySelector('[data-testid="express-cart-desktop"]') as HTMLElement;
  return { body, cart };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  usePOSCheckoutMock.mockReturnValue({
    startCheckout: vi.fn(), isProcessingSale: false, lastSale: null, setLastSale: vi.fn(),
    confirmUnpricedCheckout: vi.fn(), processCheckout: vi.fn(), showPriceWarning: false,
    setShowPriceWarning: vi.fn(), showRateWarning: false, rateWarningData: null,
    confirmRateWarning: vi.fn(), cancelRateWarning: vi.fn(), updateRateFromModal: vi.fn(),
  } as never);
  useAuthStore.setState({
    user: { id: 'u1', email: 'express@test.local', role: 'admin', activeStoreId: STORE } as never,
    status: 'authenticated_valid',
    loading: false,
  });
  useCartStore.setState({
    items: [], storeId: STORE, globalRates: {}, lastUpdated: Date.now(),
    customerId: null, customerName: null, customerCi: null, customerPhone: null, customerAddress: null, customerCode: null,
  });
});

describe('CP-POS-PER-ITEM-PAYMENTS — carrito Express con pagos por producto', () => {
  it('§1.2/§1.3 · cada línea muestra importe, chip de distribución y «Configurar pago»', () => {
    useCartStore.setState({ items: [
      makeItem(P_CAFE, [row('cash', 700)]),
      makeItem(P_AGUA, [row('cash', 200), row('transfer', 300, 'CUP', 'TR-456')]),
    ] });
    const { cart } = renderExpress();

    // Importes de línea visibles
    expect(within(cart).getByText('$700.00')).toBeInTheDocument();
    const configButtons = within(cart).getAllByRole('button', { name: /Configurar pago/i });
    expect(configButtons).toHaveLength(2);
  });

  it('§2.2 · «Configurar pago» abre el MISMO editor de filas del carrito (método/moneda/referencia)', () => {
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 700)])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getAllByRole('button', { name: /Configurar pago/i })[0]);

    const modal = document.body.querySelector('[data-testid="pos-express-payment-modal"]') as HTMLElement;
    expect(modal).toBeTruthy();
    // Editor de filas: selector de método + botón «Agregar Pago» del editor compartido
    expect(within(modal).getByRole('combobox', { name: /Método de pago fila 1/i })).toBeTruthy();
    expect(within(modal).getByRole('button', { name: /Agregar Pago/i })).toBeTruthy();
    // Importe del producto visible
    expect(within(modal).getByText(/Importe del producto/i)).toBeTruthy();
  });

  it('§FIX-SMOKE-001 · el modal refleja el estado VIVO de la fila (CP-POS-SMOKE-PRODUCTION-001)', () => {
    // Regresión: el modal montaba el snapshot del item al abrir — el cajero
    // no veía sus cambios (método/importe/validación/referencia congelados).
    // El fix resuelve el item del store con suscripción reactiva.
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 700)])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getAllByRole('button', { name: /Configurar pago/i })[0]);

    const modal = document.body.querySelector('[data-testid="pos-express-payment-modal"]') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(within(modal).getByText(/Pago completo/i)).toBeTruthy();

    // Ajuste del importe a 900 (sobrepago +200) SIN cerrar ni reabrir el modal
    const amountInput = within(modal).getByRole('spinbutton', { name: /Monto fila 1/i }) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '900' } });

    // Valor vivo en el input (no el snapshot 700)
    expect((within(modal).getByRole('spinbutton', { name: /Monto fila 1/i }) as HTMLInputElement).value).toBe('900');
    // Validación canónica reactiva: Sobrepago visible
    expect(within(modal).getByText(/Sobrepago/i)).toBeTruthy();
  });

  it('D · método DERIVADO: cash + transfer en líneas → «mixed» en el carrito (sin selector global)', () => {
    useCartStore.setState({ items: [
      makeItem(P_CAFE, [row('cash', 700)]),
      makeItem(P_AGUA, [row('transfer', 500, 'CUP', 'TR-1')]),
    ] });
    const { cart } = renderExpress();
    expect(within(cart).getAllByText('mixed').length).toBeGreaterThanOrEqual(1);
    // El selector global del header fue retirado (misión §2.1)
    expect(document.body.querySelector('[data-testid="payment-selector-mock"]')).toBeNull();
  });

  it('B · única transferencia → método derivado «transfer»', () => {
    useCartStore.setState({ items: [makeItem(P_AGUA, [row('transfer', 500, 'CUP', 'TR-2')])] });
    const { cart } = renderExpress();
    expect(within(cart).getAllByText('transfer').length).toBeGreaterThanOrEqual(1);
  });

  it('F · pestaña «Datos de transferencia» presente con cliente + CI + número por fila', () => {
    useCartStore.setState({ items: [makeItem(P_AGUA, [row('transfer', 500, 'CUP', 'TR-2')])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getByRole('button', { name: 'Cobrar venta' }));

    const tab = screen.getByTestId('tab-datos-transferencia');
    fireEvent.click(tab);
    expect(document.body.querySelector('[data-testid="datos-transferencia-panel"]')).toBeTruthy();
    expect(document.body.querySelector('#pos-express-transfer-name')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="pos-express-transfer-ci"]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid="transfer-ref-11111111-0000-4000-8000-000000000014"]')).toBeTruthy();
  });

  it('F/G · sin transferencia: la pestaña NO existe y no se exigen datos personales', () => {
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 700)])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getByRole('button', { name: 'Cobrar venta' }));
    expect(screen.queryByTestId('tab-datos-transferencia')).toBeNull();
    expect(document.body.querySelector('#pos-express-transfer-name')).toBeNull();
    expect(document.body.querySelector('[data-testid="pos-express-transfer-ci"]')).toBeNull();
  });

  it('H · cambiar entre pestañas CONSERVA los datos (nombre, CI y referencias)', () => {
    useCartStore.setState({ items: [makeItem(P_AGUA, [row('transfer', 500, 'CUP', '')])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getByRole('button', { name: 'Cobrar venta' }));
    fireEvent.click(screen.getByTestId('tab-datos-transferencia'));

    const nameInput = document.body.querySelector('#pos-express-transfer-name') as HTMLInputElement;
    const ciInput = document.body.querySelector('[data-testid="pos-express-transfer-ci"]') as HTMLInputElement;
    const refInput = document.body.querySelector('[data-testid="transfer-ref-11111111-0000-4000-8000-000000000014"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Cliente Transferencia QA' } });
    fireEvent.change(ciInput, { target: { value: '92031112345' } });
    fireEvent.change(refInput, { target: { value: 'TR-H-42' } });

    // Volver al Resumen y regresar: el estado vive en el store/componente
    fireEvent.click(screen.getByRole('tab', { name: 'Resumen' }));
    fireEvent.click(screen.getByTestId('tab-datos-transferencia'));
    expect((document.body.querySelector('#pos-express-transfer-name') as HTMLInputElement).value).toBe('Cliente Transferencia QA');
    expect((document.body.querySelector('[data-testid="pos-express-transfer-ci"]') as HTMLInputElement).value).toBe('92031112345');
    expect((document.body.querySelector('[data-testid="transfer-ref-11111111-0000-4000-8000-000000000014"]') as HTMLInputElement).value).toBe('TR-H-42');
  });

  it('F · sin datos completos el botón bloquea y lleva a la pestaña de datos (fail-closed)', async () => {
    const startCheckout = vi.fn();
    usePOSCheckoutMock.mockReturnValue({
      startCheckout, isProcessingSale: false, lastSale: null, setLastSale: vi.fn(),
      confirmUnpricedCheckout: vi.fn(), processCheckout: vi.fn(), showPriceWarning: false,
      setShowPriceWarning: vi.fn(), showRateWarning: false, rateWarningData: null,
      confirmRateWarning: vi.fn(), cancelRateWarning: vi.fn(), updateRateFromModal: vi.fn(),
    } as never);
    useCartStore.setState({ items: [makeItem(P_AGUA, [row('transfer', 500, 'CUP', '')])] });
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getByRole('button', { name: 'Cobrar venta' }));
    // Desde Resumen, el Confirmar NO arranca el checkout: conduce a la pestaña de datos
    fireEvent.click(screen.getByRole('button', { name: 'Completar datos' }));
    expect(startCheckout).not.toHaveBeenCalled();
    // El botón de la pestaña de datos está deshabilitado sin cliente/CI/referencia
    const confirmInDatos = await screen.findByRole('button', { name: 'Confirmar' });
    expect((confirmInDatos as HTMLButtonElement).disabled).toBe(true);
  });

  it('F · con datos completos, Confirmar delega en startCheckout con método derivado y notas', async () => {
    const startCheckout = vi.fn();
    usePOSCheckoutMock.mockReturnValue({
      startCheckout, isProcessingSale: false, lastSale: null, setLastSale: vi.fn(),
      confirmUnpricedCheckout: vi.fn(), processCheckout: vi.fn(), showPriceWarning: false,
      setShowPriceWarning: vi.fn(), showRateWarning: false, rateWarningData: null,
      confirmRateWarning: vi.fn(), cancelRateWarning: vi.fn(), updateRateFromModal: vi.fn(),
    } as never);
    useCartStore.setState({ items: [makeItem(P_AGUA, [row('transfer', 500, 'CUP', 'TR-F-1')])] });
    useCartStore.getState().setCustomer(null, 'Cliente QA');
    useCartStore.getState().setCustomerCi('92031112345');
    // MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001: los 4 datos
    // son obligatorios — el teléfono también debe estar completo para confirmar.
    useCartStore.getState().setCustomerPhone('+53 51234567');
    const { cart } = renderExpress();
    fireEvent.click(within(cart).getByRole('button', { name: 'Cobrar venta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(startCheckout.mock.calls[0][0]).toBe('transfer');
    expect(startCheckout.mock.calls[0][2]).toEqual({ saleNotes: null });
  });

  it('I · importe parcialmente distribuido → «Pendiente» visible en el resumen', () => {
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 200)])] }); // faltan 500
    const { cart } = renderExpress();
    const summary = cart.querySelector('[data-testid="express-payment-summary"]') as HTMLElement;
    expect(within(summary).getByText(/Pendiente \$500\.00 CUP/i)).toBeTruthy();
  });

  it('J · importe distribuido superior → «Sobrepago» visible en la configuración de pago de la línea', () => {
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 900)])] }); // 900 > 700
    const { cart } = renderExpress();
    // La validación de cuadre canónica (PaymentRowsValidation) vive en el
    // modal «Configurar pago» — mismo criterio que el carrito clásico.
    fireEvent.click(within(cart).getAllByRole('button', { name: /Configurar pago/i })[0]);
    const modal = document.body.querySelector('[data-testid="pos-express-payment-modal"]') as HTMLElement;
    expect(within(modal).getByText(/Sobrepago/i)).toBeTruthy();
  });

  it('§1.4 · móvil: barra inferior con carrito + total, y panel a pantalla completa', () => {
    useCartStore.setState({ items: [makeItem(P_CAFE, [row('cash', 700)])] });
    const { body } = renderExpress();
    const bar = body.querySelector('[data-testid="express-mobile-bar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: /Ver carrito/i }));
    expect(body.querySelector('[data-testid="express-cart-mobile"]')).toBeTruthy();
  });
});
