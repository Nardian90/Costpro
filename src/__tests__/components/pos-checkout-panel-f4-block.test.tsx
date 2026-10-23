/**
 * pos-checkout-panel-f4-block.test.tsx — REVISIÓN FINAL v2.24.1 (F4).
 *
 * Cobertura de UI del bloqueo preventivo del vuelto NO registrable:
 *   · Sobrepago sin liquidación (mixto) → Confirmar deshabilitado + alert
 *     comprensible con alternativas (rol=alert).
 *   · Cobro exacto (mixto) → Confirmar habilitado, sin alert.
 *   · (El caso "cobro simple con recibido > total" queda cubierto a nivel
 *     hook: la liquidación construida registra el vuelto — F4.d en
 *     pos-checkout-payment-incidents.test.tsx — y el panel no bloquea cuando
 *     `settlement` existe: rama `if (settlement) return false`.)
 *
 * Patrón de la casa: mocks mínimos del store (estado real del carrito) y de
 * los vecinos pesados (framer-motion, modal, sección de fecha).
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
    value: '2026-10-24',
    validation: { valid: true, error: null },
    setValue: vi.fn(),
  }),
}));
vi.mock('@/components/views/terminal/views/pos/PaymentMethodSelector', () => ({
  getPaymentLabel: (m: string) => m,
  // el panel lo usa como COMPONENTE JSX (<Icon />) — debe devolver un componente válido
  getPaymentIcon: () => () => <span data-testid="pay-icon" />,
  getPaymentColor: () => '',
}));

import { POSCartCheckoutPanel } from '@/components/views/terminal/views/pos/POSCartCheckoutPanel';
import { useCartStore } from '@/store/cart';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

function setState(items: any[]) {
  useCartStore.setState({
    items,
    discount: null,
    appliedTaxes: [],
    storeId: STORE,
    globalRates: {},
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'mixed',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
}

function makeItem(cashPaid: number) {
  return {
    product_id: 'cccc2222-0000-4000-8000-000000000002',
    variant_id: null,
    quantity: 1,
    price: 94800,
    subtotal: 94800,
    cash_paid: cashPaid,
    transfer_paid: 0,
    zelle_paid: 0,
    product: { name: 'Producto CUP F4' },
  };
}

function renderPanel() {
  return render(
    <POSCartCheckoutPanel
      items={[makeItem(currentCashPaid)]}
      getSubtotal={() => 94800}
      getDiscountAmount={() => 0}
      getTotal={() => 94800}
      discount={null}
      setDiscount={() => {}}
      selectedPayment="mixed"
      onSetSelectedPayment={() => {}}
      isProcessing={false}
      itemCount={1}
      onCheckout={() => {}}
      onClearCart={() => {}}
      isMobile={false}
    />,
  );
}

let currentCashPaid = 100000;

describe('POSCartCheckoutPanel — F4: bloqueo del vuelto no registrable (UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentCashPaid = 100000; // sobrepago 5 200 CUP sobre 94 800
    setState([makeItem(currentCashPaid)]);
  });

  it('sobrepago mixto sin liquidación: Confirmar deshabilitado + alert con alternativas', () => {
    renderPanel();

    const cta = document.querySelector('#pos-checkout-cta') as HTMLButtonElement;
    expect(cta).toBeTruthy();
    act(() => { fireEvent.click(cta); }); // abre el modal de confirmación

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('el vuelto quedaría sin registrar');
    expect(alert.textContent).toContain('Ajusta el desglose');

    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it('cobro mixto exacto: sin alert de vuelto y Confirmar habilitado', () => {
    currentCashPaid = 94800;
    setState([makeItem(currentCashPaid)]);
    renderPanel();

    act(() => { fireEvent.click(document.querySelector('#pos-checkout-cta') as HTMLButtonElement); });
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.every(a => !a.textContent.includes('vuelto quedaría sin registrar'))).toBe(true);
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });
});
