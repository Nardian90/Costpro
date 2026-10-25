/**
 * pos-checkout-panel-denominations.test.tsx
 * MISIÓN POS DENOMINACIONES MULTIMONEDA (2026-10-26) — Función A (§6.1).
 *
 * Pruebas de COMPONENTE con el código real del POSCartCheckoutPanel:
 *  · Fixture aritmético obligatorio: CUP 2×5.000 + 1×2.000 = 12.000 CUP y
 *    USD 2×20 + 1×5 = 45 USD; tras cambiar de pestaña y limpiar el desglose
 *    USD, el desglose CUP sigue EXACTAMENTE en 12.000 y el USD queda en cero.
 *  · Independencia CUP/USD al cambiar de moneda repetidamente (cantidades
 *    y preferencias intactas).
 *  · Las cantidades de una moneda no cambian cashReceived/receivedCurrency
 *    de manera accidental (§6.1.12).
 *  · Una denominación personalizada aparece tras reabrir el carrito
 *    (remount → localStorage por tienda+moneda) (§6.1.7).
 *  · La configuración de una tienda no sobrescribe la de otra (§6.1.8).
 *  · El payload de venta/liquidación mantiene el contrato del checkout
 *    (§6.1.13): settlement por moneda nativa, sin reinterpretaciones.
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
    value: '2026-10-26',
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
import { denominationsStorageKey, defaultDenominationsFor } from '@/lib/pos/cash-denominations';

const STORE_A = '9635e633-387f-411d-bc15-7d2b6179aae4';
const STORE_B = '77777777-7777-4777-8777-777777777777';
const RATE = 800; // 1 USD = 800 CUP

const mc4Product = {
  id: 'bac99491-f719-4547-8817-d488bec15579',
  name: 'Conector MC4',
  price: 7,
  price_currency: 'USD',
  stock_current: 10,
  store_id: STORE_A,
  cost_price: 3,
};

/** Producto equivalente para otra tienda (addItem rechaza cross-store). */
const productForStore = (storeId: string) => ({
  ...mc4Product,
  id: `bac99491-f719-4547-8817-d488bec1${storeId.slice(0, 4)}`,
  store_id: storeId,
});

function buildCart(storeId: string) {
  useCartStore.setState({
    items: [],
    discount: null,
    appliedTaxes: [],
    storeId,
    globalRates: { USD: RATE },
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'cash',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
  useCartStore.getState().addItem(productForStore(storeId));
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

/** Abre el acordeón de efectivo (si está contraído) y el modal de desglose. */
function openBreakdownModal() {
  if (!document.getElementById('cash-breakdown-content')) {
    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
  }
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Abrir desglose y configuración de denominaciones' })); });
}

/** Cuenta n unidades de la denominación (label) en la moneda dada (tab Contar del modal). */
function countDenom(label: string, qty: number, currency: string) {
  const input = screen.getByLabelText(`Cantidad de ${label} en ${currency}`) as HTMLInputElement;
  act(() => { fireEvent.change(input, { target: { value: String(qty) } }); });
}

/** Texto de la FILA completa del modal que contiene el label dado (valor incluido). */
function rowText(labelRe: RegExp): string {
  const labelEl = screen.getByText(labelRe);
  return labelEl.parentElement?.textContent ?? '';
}

describe('MISIÓN POS — denominaciones del panel: independencia CUP/USD (§6.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    buildCart(STORE_A);
  });

  it('fixture aritmético: CUP 12.000 y USD 45; limpiar USD deja CUP intacto en 12.000', () => {
    renderPanel();
    openBreakdownModal();

    // Tab CUP del modal: contar 2 × 5.000 + 1 × 2.000 = 12.000 CUP
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    countDenom('5.000', 2, 'CUP');
    countDenom('2.000', 1, 'CUP');
    expect(rowText(/Total contado \(CUP\):/)).toContain('12,000.00');

    // Cambiar a tab USD y contar 2 × $20 + 1 × $5 = 45 USD
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    countDenom('$20', 2, 'USD');
    countDenom('$5', 1, 'USD');
    expect(rowText(/Total contado \(USD\):/)).toContain('45.00');

    // Volver a CUP: las cantidades CUP siguen intactas (12.000)
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    expect(rowText(/Total contado \(CUP\):/)).toContain('12,000.00');

    // Cambiar entre las pestañas varias veces sin cerrar el carrito:
    for (let i = 0; i < 2; i++) {
      act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
      act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    }
    expect(rowText(/Total contado \(CUP\):/)).toContain('12,000.00');

    // Ambas monedas contadas → el total consolidado equivalente CUP aparece
    // como dato secundario claramente identificado (12.000 CUP nativos,
    // 45 USD × 800 = 36.000 CUP equivalentes)
    expect(screen.getByText(/Total desglose \(equivalente CUP, tasa POS\)/)).toBeTruthy();

    // Limpiar el desglose USD desde SU tab: CUP debe seguir EXACTAMENTE en 12.000
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Limpiar desglose de USD' })); });
    expect(rowText(/Total contado \(USD\):/)).toContain('0.00');
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    expect(rowText(/Total contado \(CUP\):/)).toContain('12,000.00');
  });

  it('cambiar de moneda repetidamente conserva cantidades de cada una', () => {
    renderPanel();
    openBreakdownModal();

    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    countDenom('5.000', 2, 'CUP');
    countDenom('2.000', 1, 'CUP');
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    countDenom('$20', 2, 'USD');
    countDenom('$5', 1, 'USD');

    // Ida y vuelta repetida CUP ↔ USD
    for (let i = 0; i < 3; i++) {
      act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
      act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    }

    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    expect(rowText(/Total contado \(CUP\):/)).toContain('12,000.00');
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    expect(rowText(/Total contado \(USD\):/)).toContain('45.00');
  });

  it('contar en el modal de OTRA moneda no cambia cashReceived ni receivedCurrency (§6.1.12)', () => {
    renderPanel();

    // Billete recibido en CUP con importe manual 5600 (contrato del checkout)
    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
    const input = document.querySelector('#pos-cash-received-input') as HTMLInputElement;
    act(() => { fireEvent.change(input, { target: { value: '5600' } }); });

    // Contar USD en el modal SIN confirmar: no debe tocar el importe recibido CUP
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    countDenom('$20', 2, 'USD');
    expect((document.querySelector('#pos-cash-received-input') as HTMLInputElement).value).toBe('5600');

    // «Confirmar» en tab USD SÍ cambia explícitamente la moneda recibida
    // (acción deliberada del usuario, no accidental)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })); });
    expect((document.querySelector('#pos-cash-received-input') as HTMLInputElement).value).toBe('40.00');
    expect(screen.getByText('Desglose USD')).toBeTruthy();
  });

  it('una denominación personalizada aparece tras reabrir el carrito (§6.1.7)', () => {
    // Primera sesión del carrito: añadir 3.000 CUP personalizada en Configurar
    const { unmount } = renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    const newInput = screen.getByLabelText('Nueva denominación en CUP');
    act(() => { fireEvent.change(newInput, { target: { value: '3000' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    expect(screen.getByText(/3\.000 · activa/)).toBeTruthy();

    // Cerrar el carrito (unmount del panel) y reabrir (remount)
    unmount();

    // Persistido bajo la clave de tienda+moneda correcta
    const raw = window.localStorage.getItem(denominationsStorageKey(STORE_A, 'CUP'));
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved.some((d: any) => d.value === 3000 && d.custom === true)).toBe(true);

    renderPanel();
    openBreakdownModal();
    // La personalizada sobrevive al reabrir: visible en Configurar
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    expect(screen.getByText(/3\.000 · activa/)).toBeTruthy();
    // ...y el catálogo USD no la hereda
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    expect(screen.queryByText(/3\.000 · activa/)).toBeNull();
    expect(screen.getByText('$100 · activa')).toBeTruthy();
  });

  it('la configuración de una tienda no sobrescribe la de otra (§6.1.8)', () => {
    // Tienda A: personalizada 3.000 CUP
    const { unmount } = renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '3000' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    unmount();

    // Tienda B: defaults, sin la personalizada de A
    buildCart(STORE_B);
    renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    expect(screen.queryByText(/3\.000 · activa/)).toBeNull();
    expect(screen.getByText(/5\.000 · activa/)).toBeTruthy(); // catálogo inicial completo

    // El guardado de B no altera lo guardado de A
    const rawA = JSON.parse(window.localStorage.getItem(denominationsStorageKey(STORE_A, 'CUP'))!);
    expect(rawA.some((d: any) => d.value === 3000 && d.custom)).toBe(true);
    const rawB = JSON.parse(window.localStorage.getItem(denominationsStorageKey(STORE_B, 'CUP')) || 'null');
    if (rawB) expect(rawB.some((d: any) => d.value === 3000)).toBe(false);
  });

  it('validación en vivo: duplicado y valor inválido se rechazan con mensaje (§3.3)', () => {
    renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });

    // Duplicado del catálogo
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '1000' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    expect(screen.getByRole('alert').textContent).toContain('ya existe en el catálogo');

    // Negativo
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '-5' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    expect(screen.getByRole('alert').textContent).toContain('mayor que cero');

    // Más de dos decimales
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '10.125' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    expect(screen.getByRole('alert').textContent).toContain('dos decimales');

    // Vacío
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    expect(screen.getByRole('alert').textContent).toContain('Introduce un valor');
  });

  it('restaurar predeterminadas de CUP no toca la configuración de USD (§3.3)', () => {
    renderPanel();
    openBreakdownModal();

    // Añadir personalizada en USD
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en USD'), { target: { value: '3' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a USD' })); });
    expect(screen.getByText('$3 · activa')).toBeTruthy();

    // Añadir personalizada en CUP y restaurar SOLO CUP
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /CUP/ })); });
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '3000' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Restaurar denominaciones predeterminadas de CUP' })); });
    expect(screen.queryByText(/3\.000 · activa/)).toBeNull();
    expect(screen.getByText(/5\.000 · activa/)).toBeTruthy();

    // USD conserva su $3
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    expect(screen.getByText('$3 · activa')).toBeTruthy();

    // Y lo persistido refleja la independencia
    const savedUsd = JSON.parse(window.localStorage.getItem(denominationsStorageKey(STORE_A, 'USD'))!);
    expect(savedUsd.some((d: any) => d.value === 3 && d.custom)).toBe(true);
    const savedCup = JSON.parse(window.localStorage.getItem(denominationsStorageKey(STORE_A, 'CUP'))!);
    expect(savedCup.some((d: any) => d.custom)).toBe(false);
  });

  it('payload de venta/liquidación: el desglose mantiene el contrato del checkout (§6.1.13)', () => {
    const onCheckout = vi.fn();
    renderPanel(onCheckout);

    // Contar CUP exacto con el desglose: 7 USD × 800 = 5.600 CUP
    // 5.600 = 5.000 + 500 + 100 → exacto con el catálogo activo
    act(() => { fireEvent.click(screen.getByText('Efectivo')); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Exacto' })); });

    // El importe recibido CUP se sincroniza con el total del desglose (5.600)
    expect((document.querySelector('#pos-cash-received-input') as HTMLInputElement).value).toBe('5600.00');

    act(() => { fireEvent.click(document.querySelector('#pos-checkout-cta') as HTMLButtonElement); });
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    act(() => { fireEvent.click(confirm); });

    expect(onCheckout).toHaveBeenCalledTimes(1);
    const [, , receiptContext] = onCheckout.mock.calls[0];
    // Liquidación física por moneda — contrato RPC v2.24.0 INTACTO:
    // venta EXACTA → registra lo recibido, sin vuelto (nulos), igual que la
    // regresión CUP existente del panel.
    expect(receiptContext.settlement).toEqual({
      cash_received_cup: 5600,
      cash_received_usd: null,
      change_given_cup: null,
      change_given_usd: null,
      change_currency: null,
    });
    expect(receiptContext.cashReceived).toBe(5600);
  });

  it('denominación personalizada CUP se usa en el conteo (después de reabrir)', () => {
    // Añadir 3.000 CUP personalizada y reabrir el carrito
    const { unmount } = renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    act(() => { fireEvent.change(screen.getByLabelText('Nueva denominación en CUP'), { target: { value: '3000' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Añadir denominación a CUP' })); });
    unmount();

    // Reabrir: la personalizada está disponible para contar
    renderPanel();
    openBreakdownModal();
    countDenom('3.000', 1, 'CUP');
    expect(rowText(/Total contado \(CUP\):/)).toContain('3,000.00');
  });

  it('defaults completos al abrir sin configuración previa (§6.1.1-3)', () => {
    renderPanel();
    openBreakdownModal();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Configurar' })); });
    // CUP: catálogo completo, incluidas 5.000 y 2.000
    expect(screen.getByText(/5\.000 · activa/)).toBeTruthy();
    expect(screen.getByText(/2\.000 · activa/)).toBeTruthy();
    // USD: billetes + fracciones utilizables por defecto
    act(() => { fireEvent.click(screen.getByRole('tab', { name: /USD/ })); });
    expect(screen.getByText('$100 · activa')).toBeTruthy();
    expect(screen.getByText('$2 · activa')).toBeTruthy();
    expect(screen.getByText('$0.50 · activa')).toBeTruthy();
    expect(screen.getByText('$0.01 · activa')).toBeTruthy();
    // Sin preferencias guardadas aún (no se persiste hasta cambiar algo)
    expect(window.localStorage.getItem(denominationsStorageKey(STORE_A, 'CUP'))).toBeNull();
    expect(defaultDenominationsFor('USD').length).toBe(12);
  });
});
