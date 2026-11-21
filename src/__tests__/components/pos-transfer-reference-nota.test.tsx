/**
 * pos-transfer-reference-nota.test.tsx — CP-LOG-RECEPTIONS-SERVICES-POS-
 * UNIFICATION-001 (§5.1/§5.2).
 *
 * Cobertura de UI del modal de confirmación de venta (POSCartCheckoutPanel):
 *  · Pago por transferencia SIN referencia → alert «Falta el número de
 *    transferencia» + botón Confirmar deshabilitado (la referencia es parte
 *    del comprobante del cobro).
 *  · Con la referencia completa → sin alert, Confirmar habilitado.
 *  · Efectivo puro → no se pide referencia (el campo vive en la fila de pago
 *    del carrito, no en el panel).
 *  · Nota general de la venta: textarea presente, editable, con contador —
 *    observación de toda la operación (no por línea).
 *
 * Patrón de la casa (pos-checkout-panel-f4-block): mocks mínimos del store
 * (estado real del carrito) y de los vecinos pesados.
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
    value: '2026-11-21',
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
    selectedPayment: 'transfer',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
}

/** Ítem con una fila de pago por transferencia (referencia opcional). */
function makeTransferItem(amount: number, reference?: string | null) {
  return {
    product_id: 'dddd3333-0000-4000-8000-000000000003',
    variant_id: null,
    quantity: 1,
    price: amount,
    subtotal: amount,
    cash_paid: 0,
    transfer_paid: amount,
    zelle_paid: 0,
    product: { name: 'Producto Transf' },
    payments: [
      {
        id: 'pay-row-1',
        method: 'transfer',
        amount,
        currency: 'CUP',
        discount_type: null,
        discount_value: 0,
        discount_currency: 'CUP',
        ...(reference !== undefined ? { reference } : {}),
      },
    ],
    payment_manual_override: true,
  };
}

function makeCashItem(amount: number) {
  return {
    product_id: 'cccc2222-0000-4000-8000-000000000002',
    variant_id: null,
    quantity: 1,
    price: amount,
    subtotal: amount,
    cash_paid: amount,
    transfer_paid: 0,
    zelle_paid: 0,
    product: { name: 'Producto Efectivo' },
    payments: [
      { id: 'pay-cash-1', method: 'cash', amount, currency: 'CUP', discount_type: null, discount_value: 0, discount_currency: 'CUP' },
    ],
    payment_manual_override: true,
  };
}

function renderPanel() {
  return render(
    <POSCartCheckoutPanel
      items={useCartStore.getState().items as any}
      itemCount={useCartStore.getState().items.length}
      getSubtotal={() => useCartStore.getState().getSubtotalCup()}
      getDiscountAmount={() => 0}
      getTotal={() => useCartStore.getState().getExpectedTotalCup()}
      getTaxAmount={() => 0}
      discount={null}
      setDiscount={() => {}}
      prorateGlobalPayment={() => {}}
      isPaymentModeByProduct={() => true}
      getConsolidatedPayments={() => ({})}
      isProcessing={false}
      selectedPayment={'transfer' as any}
      onSetSelectedPayment={() => {}}
      onCheckout={vi.fn().mockResolvedValue(undefined)}
      onClearCart={() => {}}
      isMobile={false}
    />,
  );
}

function openConfirm() {
  const cta = document.getElementById('pos-checkout-cta') as HTMLButtonElement | null;
  expect(cta).toBeTruthy();
  act(() => { cta!.click(); });
}

describe('CP-LOG-UNIFICATION-001 §5.1 — referencia de transferencia en el cobro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transferencia SIN referencia → alert «Falta el número de transferencia» + Confirmar deshabilitado', () => {
    setState([makeTransferItem(5000)]);
    renderPanel();
    openConfirm();
    expect(screen.getByText(/Falta el número de transferencia/i)).toBeTruthy();
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('transferencia CON referencia → sin alert, Confirmar habilitado', () => {
    setState([makeTransferItem(5000, 'TRANSF-0451-BCC')]);
    renderPanel();
    openConfirm();
    expect(screen.queryByText(/Falta el número de transferencia/i)).toBeNull();
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('efectivo puro → no se pide referencia (alert ausente, Confirmar habilitado)', () => {
    setState([makeCashItem(3000)]);
    renderPanel();
    openConfirm();
    expect(screen.queryByText(/Falta el número de transferencia/i)).toBeNull();
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('external_transfer (Transf. Exterior) SIN referencia → también exige la referencia', () => {
    const item = makeTransferItem(20, null);
    // moneda USD + método external_transfer (riel de divisa)
    item.payments[0].method = 'external_transfer';
    item.payments[0].currency = 'USD';
    setState([item]);
    renderPanel();
    openConfirm();
    expect(screen.getByText(/Falta el número de transferencia/i)).toBeTruthy();
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CP-LOG-UNIFICATION-001 §5.2 — Nota general de la venta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('el textarea de Nota está presente en el modal de confirmación', () => {
    setState([makeCashItem(3000)]);
    renderPanel();
    openConfirm();
    const nota = document.getElementById('pos-sale-notes') as HTMLTextAreaElement | null;
    expect(nota).toBeTruthy();
    expect(nota!.getAttribute('placeholder')).toMatch(/observación general de la venta/i);
  });

  it('la nota es editable y muestra el contador de caracteres', () => {
    setState([makeCashItem(3000)]);
    renderPanel();
    openConfirm();
    const nota = document.getElementById('pos-sale-notes') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(nota, { target: { value: 'Entrega en calle 5 con el cliente Ana' } });
    });
    expect(nota.value).toBe('Entrega en calle 5 con el cliente Ana');
    // Contador: «39/1000 · Se guarda con la venta...» (texto partido en nodos
    // — se busca el span contenedor por su texto completo normalizado).
    const counter = screen.getByText(/\/1000/);
    expect(counter.textContent).toContain('37/1000');
  });
});
