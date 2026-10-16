/**
 * FIX-TRANSF-EXTERIOR (2026-10-16) — UI del carrito del POS (Vender → Caja).
 *
 * 1. La moneda junto al botón «Tasas» deja de ser un selector: pasa a ser una
 *    insignia informativa (la moneda del ítem la define el producto; las tasas
 *    se gestionan SOLO con el botón Tasas; para cobrar en otra moneda está la
 *    moneda de la fila de pago).
 * 2. El método «Zelle» se muestra como «Transf. Exterior» (value de BD: 'zelle').
 * 3. Al elegir Transf. Exterior en una fila CUP: la fila pasa a USD con el
 *    monto convertido a la tasa vigente (el equivalente en CUP se mantiene).
 * 4. La moneda de una fila Transf. Exterior solo ofrece USD/EUR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

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

import { toast } from 'sonner';
import { POSCartItem } from '@/components/views/terminal/views/pos/POSCartItem';
import { PaymentMethodSelector } from '@/components/views/terminal/views/pos/PaymentMethodSelector';
import { useCartStore } from '@/store/cart';
import type { CartItem } from '@/store/cart';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS (formato UUID válido)
const RATE = 790;

const cupProduct = {
  id: 'aaaa1111-0000-4000-8000-000000000002',
  name: 'Producto CUP',
  price: 7900,
  price_currency: 'CUP',
  stock_current: 10,
  store_id: STORE,
  cost_price: 4000,
};

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

function setupItem(): CartItem {
  useCartStore.getState().hydrateStoreRates({ USD: RATE, EUR: 850 });
  const accepted = useCartStore.getState().addItem(cupProduct);
  expect(accepted).toBe(true);
  return useCartStore.getState().items[0];
}

function renderCartItem(item: CartItem) {
  return render(
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
}

/** Renderiza el item y EXPANDE el panel «Descuento / Pago Mixto / Moneda»
 *  (colapsado por defecto — ahí viven la insignia de moneda y las filas). */
function renderCartItemExpandido(item: CartItem) {
  const utils = renderCartItem(item);
  fireEvent.click(screen.getByText('Descuento / Pago Mixto / Moneda'));
  return utils;
}

beforeEach(() => {
  resetCart();
  vi.clearAllMocks();
});

describe('POSCartItem — moneda junto a Tasas ya no es selector', () => {
  it('no existe ningún <select> de moneda del ítem; hay insignia informativa con la moneda', () => {
    const item = setupItem();
    const { container } = renderCartItemExpandido(item);

    // El selector antiguo desapareció (aria-label histórico «Moneda para …»)
    const viejoSelect = container.querySelector('select[aria-label^="Moneda para"]');
    expect(viejoSelect).toBeNull();

    // La insignia muestra la moneda del producto y no es interactiva
    const badge = screen.getByLabelText(`Moneda del producto ${cupProduct.name}: CUP`);
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('SPAN');
    expect(badge.textContent).toContain('CUP');
  });

  it('la insignia refleja la moneda nativa de un producto USD', () => {
    const accepted = useCartStore.getState().addItem({
      ...cupProduct,
      id: 'aaaa1111-0000-4000-8000-000000000003',
      price: 120,
      price_currency: 'USD',
      name: 'Producto USD',
    });
    expect(accepted).toBe(true);
    const item = useCartStore.getState().items[0];
    renderCartItemExpandido(item);
    expect(screen.getByLabelText(`Moneda del producto Producto USD: USD`)).toBeInTheDocument();
  });
});

describe('POSCartItem — fila de pago Transf. Exterior (antes Zelle)', () => {
  it('el método se muestra como «Transf. Exterior» manteniendo el value zelle', () => {
    const item = setupItem();
    renderCartItemExpandido(item);
    const metodo = screen.getByLabelText('Método de pago fila 1') as HTMLSelectElement;
    const opcion = Array.from(metodo.options).find(o => o.value === 'zelle');
    expect(opcion).toBeDefined();
    expect(opcion!.textContent).toContain('Transf. Exterior');
  });

  it('cambiar a Transf. Exterior una fila CUP convierte el monto a USD con la tasa vigente', () => {
    const item = setupItem();
    renderCartItemExpandido(item);
    const metodo = screen.getByLabelText('Método de pago fila 1') as HTMLSelectElement;

    // Fila inicial: cash 7900 CUP → cambiar a Transf. Exterior
    expect(metodo.value).toBe('cash');
    fireEvent.change(metodo, { target: { value: 'zelle' } });

    // El store queda corregido: zelle + USD + monto convertido a la tasa
    const row = useCartStore.getState().items[0].payments![0];
    expect(row.method).toBe('zelle');
    expect(row.currency).toBe('USD');
    expect(row.amount).toBeCloseTo(7900 / RATE, 2); // 7900 CUP ÷ 790 = 10.00 USD
    // El equivalente en CUP se mantiene → sin descuadre falso
    expect(row.amount * RATE).toBeCloseTo(7900, 0);
    expect(toast.info).toHaveBeenCalled();
  });

  it('una fila Transf. Exterior solo ofrece USD/EUR en su selector de moneda', () => {
    const item = setupItem();
    // Preparar la fila en el store (zelle + USD, regla del store) y renderizar fresco
    useCartStore.getState().updateItemPaymentRow(
      item.product_id, null, item.payments![0].id, { method: 'zelle' },
    );
    const fresh = useCartStore.getState().items[0];
    renderCartItemExpandido(fresh);
    const moneda = screen.getByLabelText('Moneda de pago fila 1') as HTMLSelectElement;
    const monedas = Array.from(moneda.options).map(o => o.value);
    expect(monedas).toEqual(['USD', 'EUR']);
    expect(monedas).not.toContain('CUP');
    expect(monedas).not.toContain('MLC');
  });

  it('una fila cash sigue ofreciendo las 4 monedas (CUP/USD/EUR/MLC)', () => {
    const item = setupItem();
    renderCartItemExpandido(item);
    const moneda = screen.getByLabelText('Moneda de pago fila 1') as HTMLSelectElement;
    expect(Array.from(moneda.options).map(o => o.value)).toEqual(['CUP', 'USD', 'EUR', 'MLC']);
  });
});

describe('PaymentMethodSelector — etiqueta Transf. Exterior', () => {
  it('variante compact: la opción zelle se llama «Transf. Exterior»', () => {
    render(
      <PaymentMethodSelector
        value="cash"
        onChange={vi.fn()}
        variant="compact"
      />,
    );
    const select = screen.getByLabelText('Seleccionar método de pago') as HTMLSelectElement;
    const opcion = Array.from(select.options).find(o => o.value === 'zelle');
    expect(opcion).toBeDefined();
    expect(opcion!.textContent).toBe('Transf. Exterior');
  });

  it('variante full: el botón se llama «Transf. Exterior»', () => {
    render(
      <PaymentMethodSelector
        value="cash"
        onChange={vi.fn()}
        variant="full"
      />,
    );
    const boton = screen.getByRole('radio', { name: /Transf\. Exterior/i });
    expect(boton).toBeInTheDocument();
  });

  it('getPaymentLabel devuelve «Transf. Exterior» para el value zelle', async () => {
    const { getPaymentLabel } = await import('@/components/views/terminal/views/pos/PaymentMethodSelector');
    expect(getPaymentLabel('zelle')).toBe('Transf. Exterior');
    expect(getPaymentLabel('cash')).toBe('Efectivo'); // resto intacto
  });
});
