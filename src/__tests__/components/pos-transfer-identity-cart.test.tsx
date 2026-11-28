/**
 * pos-transfer-identity-cart.test.tsx — MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-
 * TRANSFER-VALIDATION-001 (FASE 2/3) — MODO CARRITO.
 *
 * El modal «Confirmar Venta» del carrito clásico ahora exige la identidad del
 * pagador cuando la venta incluye transferencia (mismo componente compartido
 * con Cajero Express):
 *  · transferencia sin nombre/CI/teléfono → sección visible, mensajes junto a
 *    cada campo, Confirmar deshabilitado.
 *  · rellenar los tres campos (los datos VIVEN en el store: se conservan ante
 *    re-renders/errores) → Confirmar habilitado.
 *  · espacios como único contenido siguen bloqueando.
 *  · efectivo puro → la sección NO aparece y no se exige nada personal.
 *  · la referencia por fila sigue exigiéndose (regla §5.1 previa, intacta).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', () => ({ useReducedMotion: () => true }));
vi.mock('@/components/views/terminal/views/pos/POSOperationDateSection', () => ({
  POSOperationDateSection: () => <div data-testid="op-date" />,
  usePosSaleDate: () => ({
    value: '2026-11-28',
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

function setState(items: any[], customer: { name?: string | null; ci?: string | null; phone?: string | null } = {}) {
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
    customerName: customer.name ?? null,
    customerCi: customer.ci ?? null,
    customerPhone: customer.phone ?? null,
    lastUpdated: Date.now(),
  });
}

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

function confirmButton() {
  return screen.getByRole('button', { name: /confirmar/i }) as HTMLButtonElement;
}

describe('MISIÓN TRANSFER-VALIDATION — Modo Carrito: identidad del pagador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transferencia SIN identidad → sección visible, mensajes junto a cada campo y Confirmar deshabilitado', () => {
    setState([makeTransferItem(5000, 'TR-0451-BCC')]);
    renderPanel();
    openConfirm();
    // Sección de identidad del pagador presente
    expect(screen.getByText(/Datos de transferencia/i)).toBeTruthy();
    // Mensaje junto a cada campo vacío (3 × «Requerido para el pago por transferencia»)
    const alerts = screen.getAllByText(/Requerido para el pago por transferencia/i);
    expect(alerts.length).toBe(3);
    // Resumen accesible del bloqueo
    expect(screen.getByText(/Completa los tres datos para confirmar/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it('el N.º de transferencia sigue exigiéndose (regla §5.1 previa, intacta)', () => {
    setState([makeTransferItem(5000)]); // sin referencia
    renderPanel();
    openConfirm();
    expect(screen.getByText(/Falta el número de transferencia/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it('rellenar nombre + CI + teléfono habilita Confirmar y los datos se conservan en el store', () => {
    setState([makeTransferItem(5000, 'TR-0451-BCC')]);
    renderPanel();
    openConfirm();

    const name = document.getElementById('pos-cart-transfer-name') as HTMLInputElement;
    const ci = document.getElementById('pos-cart-transfer-ci') as HTMLInputElement;
    const phone = document.getElementById('pos-cart-transfer-phone') as HTMLInputElement;
    act(() => { fireEvent.change(name, { target: { value: 'Ana Pérez Rodríguez' } }); });
    act(() => { fireEvent.change(ci, { target: { value: '92031112345' } }); });
    act(() => { fireEvent.change(phone, { target: { value: '+53 51234567' } }); });

    // Fuente única de verdad: el store (compartido con Cajero Express)
    const st = useCartStore.getState();
    expect(st.customerName).toBe('Ana Pérez Rodríguez');
    expect(st.customerCi).toBe('92031112345');
    expect(st.customerPhone).toBe('+53 51234567');

    // Los datos se conservan (inputs controlados por el store)
    expect((document.getElementById('pos-cart-transfer-name') as HTMLInputElement).value).toBe('Ana Pérez Rodríguez');
    expect((document.getElementById('pos-cart-transfer-phone') as HTMLInputElement).value).toBe('+53 51234567');

    expect(confirmButton().disabled).toBe(false);
    expect(screen.queryByText(/Completa los tres datos para confirmar/i)).toBeNull();
  });

  it('espacios como único contenido siguen bloqueando (cada campo por separado)', () => {
    setState([makeTransferItem(5000, 'TR-0451-BCC'), ]);
    renderPanel();
    openConfirm();
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-name')!, { target: { value: 'Ana' } }); });
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-ci')!, { target: { value: '92031112345' } }); });
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-phone')!, { target: { value: '   ' } }); });
    expect(confirmButton().disabled).toBe(true);
  });

  it('efectivo puro → la sección de identidad NO aparece y Confirmar está habilitado', () => {
    setState([makeCashItem(3000)]);
    renderPanel();
    openConfirm();
    expect(screen.queryByText(/Datos de transferencia/i)).toBeNull();
    expect(document.getElementById('pos-cart-transfer-name')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('pago mixto (efectivo + transferencia) también exige la identidad', () => {
    const mixed = makeTransferItem(3000, 'TR-MIX');
    mixed.subtotal = 3000;
    mixed.transfer_paid = 2000;
    mixed.payments[0].amount = 2000;
    mixed.payments.push({ id: 'pay-row-2', method: 'cash', amount: 1000, currency: 'CUP', discount_type: null, discount_value: 0, discount_currency: 'CUP' });
    mixed.cash_paid = 1000;
    setState([mixed]);
    renderPanel();
    openConfirm();
    expect(screen.getByText(/Datos de transferencia/i)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-name')!, { target: { value: 'Carlos Ruiz' } }); });
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-ci')!, { target: { value: '88051223456' } }); });
    act(() => { fireEvent.change(document.getElementById('pos-cart-transfer-phone')!, { target: { value: '53012345' } }); });
    expect(confirmButton().disabled).toBe(false);
  });
});
