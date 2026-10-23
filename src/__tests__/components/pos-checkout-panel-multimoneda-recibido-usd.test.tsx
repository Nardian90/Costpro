/**
 * pos-checkout-panel-multimoneda-recibido-usd.test.tsx
 * MISIÓN VENTA MULTIMONEDA CON VUELTO EN CUP — 23/10/2026.
 *
 * Caso EXACTO de la misión (tienda aislada Enervida-E2E):
 *   - Producto "Conector MC4" de 7 USD (price_currency USD, SKU 22).
 *   - Cliente entrega 10 USD físicos (billete), tasa de tienda 800.
 *   - Vuelto entregado: 2 400 CUP físicos (3 USD × 800) — no hay billetes USD.
 *
 * Contrato verificado:
 *   · El panel permite declarar la MONEDA del billete recibido (CUP | USD).
 *   · El equivalente canónico mostrado es 10 × 800 = 8 000 CUP.
 *   · El cambio canónico es 8 000 − 5 600 = 2 400 CUP.
 *   · La liquidación enviada al RPC es { cash_received_usd: 10,
 *     change_given_cup: 2400, change_currency: 'CUP' } — el cajón USD sube 10
 *     y el CUP baja 2 400 (movimiento FÍSICO por moneda), el ingreso de la
 *     venta permanece 7 USD / 5 600 CUP (identidad revalidada server-side).
 *
 * Patrón de la casa: mocks mínimos (framer-motion, modal, sección de fecha).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', () => ({ useReducedMotion: () => true }));
vi.mock('@/components/views/terminal/views/pos/POSPortalModal', () => ({
  POSPortalModal: ({ open, children, title }: any) =>
    open ? (
      <div role="dialog" aria-label={title} data-testid="pos-modal">
        {children}
      </div>
    ) : null,
}));
vi.mock('@/components/views/terminal/views/pos/POSOperationDateSection', () => ({
  POSOperationDateSection: () => <div data-testid="op-date" />,
  usePosSaleDate: () => ({
    value: '2026-10-23',
    validation: { valid: true, error: null },
    setValue: vi.fn(),
  }),
}));
vi.mock('@/components/views/terminal/views/pos/PaymentMethodSelector', () => ({
  getPaymentLabel: (m: string) => m,
  getPaymentIcon: () => () => <span data-testid="pay-icon" />,
  getPaymentColor: () => '',
}));

import { POSCartCheckoutPanel } from '@/components/views/terminal/views/pos/POSCartCheckoutPanel';
import { useCartStore } from '@/store/cart';

const STORE = '9635e633-387f-411d-bc15-7d2b6179aae4'; // Enervida (E2E aislado)
const RATE = 800; // 1 USD = 800 CUP (tasa de la misión, sembrada en store_exchange_rates)

const mc4Product = {
  id: 'bac99491-f719-4547-8817-d488bec15579',
  name: 'Conector MC4',
  price: 7,
  price_currency: 'USD',
  stock_current: 10,
  store_id: STORE,
  cost_price: 3,
};

function buildMissionCart() {
  useCartStore.setState({
    items: [],
    discount: null,
    appliedTaxes: [],
    storeId: STORE,
    globalRates: { USD: RATE },
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'cash',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
  useCartStore.getState().addItem(mc4Product);
  const st = useCartStore.getState();
  expect(st.getExpectedTotalCup()).toBe(5600); // 7 USD × 800
}

function renderPanel(onCheckout: (...args: any[]) => void = () => {}) {
  const st = useCartStore.getState();
  return render(
    <POSCartCheckoutPanel
      items={st.items}
      getSubtotal={st.getSubtotal}
      getDiscountAmount={st.getDiscountAmount}
      getTotal={st.getTotal}
      getTaxAmount={() => 0}
      discount={null}
      setDiscount={() => {}}
      selectedPayment="cash"
      onSetSelectedPayment={() => {}}
      isProcessing={false}
      itemCount={1}
      onCheckout={onCheckout}
      onClearCart={() => {}}
      isMobile={false}
    />,
  );
}

describe('POSCartCheckoutPanel — MISIÓN MULTIMONEDA: billete USD recibido, vuelto CUP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildMissionCart();
  });

  it('recibido 10 USD: equivalente canónico 8 000 CUP y cambio 2 400 CUP en la UI', () => {
    renderPanel();

    // El acordeón de efectivo está contraído por defecto: expandirlo
    act(() => { fireEvent.click(screen.getByText('Efectivo')); });

    // Cambiar la moneda del billete recibido a USD
    const usdToggle = screen.getByRole('button', { name: 'USD' });
    act(() => { fireEvent.click(usdToggle); });

    // Teclear el billete recibido
    const input = document.querySelector('#pos-cash-received-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => { fireEvent.change(input, { target: { value: '10' } }); });

    // El equivalente canónico aparece en la UI con la tasa POS
    expect(screen.getByText(/≈ .*CUP \(tasa POS 800\.00\)/)).toBeTruthy();

    // El bloque de vuelto sugiere el cambio canónico CUP
    const changeBlock = screen.getByText('Vuelto a entregar');
    expect(changeBlock).toBeTruthy();
    expect(screen.getByText(/Vuelto en CUP:/).textContent).toContain('2,400');
  });

  it('Confirmar envía la liquidación física por moneda: recibido 10 USD, vuelto 2 400 CUP', () => {
    const onCheckout = vi.fn();
    renderPanel(onCheckout);

    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'USD' })); });
    const input = document.querySelector('#pos-cash-received-input') as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: '10' } }); });

    // Modal de confirmación
    act(() => { fireEvent.click(document.querySelector('#pos-checkout-cta') as HTMLButtonElement); });

    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false); // la liquidación es válida → no bloquea
    act(() => { fireEvent.click(confirm); });

    expect(onCheckout).toHaveBeenCalledTimes(1);
    const [method, , receiptContext] = onCheckout.mock.calls[0];
    expect(method).toBe('cash');

    // LIQUIDACIÓN FÍSICA POR MONEDA — contrato del RPC create_sale_v2 v2.24.0:
    expect(receiptContext.settlement).toEqual({
      cash_received_cup: null,
      cash_received_usd: 10,
      change_given_cup: 2400,
      change_given_usd: null,
      change_currency: 'CUP',
    });
    // El ingreso de la venta NO cambia: el contexto de cobro es presentación.
    expect(receiptContext.cashReceived).toBe(10);
  });

  it('sin tasa POS válida: el recibido USD bloquea el Confirm (ERR_RATE_INVALID), sin inventar tasa', () => {
    useCartStore.setState({ globalRates: {} }); // POS sin tasa hidratada
    renderPanel();

    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'USD' })); });
    const input = document.querySelector('#pos-cash-received-input') as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: '10' } }); });

    act(() => { fireEvent.click(document.querySelector('#pos-checkout-cta') as HTMLButtonElement); });

    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('title')).toContain('tasa USD válida');
  });

  it('regresión CUP: recibido en CUP mantiene el payload legacy (cash_received_cup)', () => {
    const onCheckout = vi.fn();
    renderPanel(onCheckout);

    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
    // Moneda CUP (default) + desglose exacto del efectivo (5 600 CUP)
    const exactoBtn = screen.getByRole('button', { name: 'Exacto' });
    act(() => { fireEvent.click(exactoBtn); });

    act(() => { fireEvent.click(document.querySelector('#pos-checkout-cta') as HTMLButtonElement); });

    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    // 5 600 CUP con denominaciones CUP (1000/500/200/100/50/20/10/5/1) es exacto
    expect(confirm.disabled).toBe(false);
    act(() => { fireEvent.click(confirm); });

    const [method, , receiptContext] = onCheckout.mock.calls[0];
    expect(method).toBe('cash');
    // Cobro exacto con recibido explícito (desglose de billetes): la liquidación
    // D6 registra el recibido (identidad: 5600 − 0 = cash_amount 5600) y sin
    // vuelto. Compatibilidad total con el flujo legacy de denominaciones CUP.
    expect(receiptContext.settlement).toEqual({
      cash_received_cup: 5600,
      cash_received_usd: null,
      change_given_cup: null,
      change_given_usd: null,
      change_currency: null,
    });
  });
});
