/**
 * pos-cart-mobile-close.test.tsx
 * MISIÓN POS CARRITO MÓVIL (2026-10-26) — Función B (§6.2).
 *
 * El carrito móvil ya NO se cierra por gestos: el cierre manual es
 * EXCLUSIVAMENTE el botón «X» del header. Verifica:
 *  · Deslizar hacia abajo más de 120 píxeles NO ejecuta onClose.
 *  · Desplazar el cuerpo (scroll simulado con touchstart/touchend) no lo cierra.
 *  · Pulsar «X» SÍ ejecuta el cierre.
 *  · El componente ya no registra manejadores onTouchStart/onTouchEnd en el
 *    cuerpo (sin umbral sustituto ni listener equivalente).
 *  · El botón «X» conserva aria-label y área táctil suficiente (≥44px).
 *
 * Patrón de la casa: mocks mínimos (framer-motion, hijos del carrito).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: () => true,
}));
// jsdom no implementa matchMedia (hook useIsMobile lo usa internamente).
vi.mock('@/hooks/ui/useMobile', () => ({
  useIsMobile: () => true,
}));
// Hijos del carrito con dependencias pesadas — stubs neutrales.
vi.mock('@/components/views/terminal/views/pos/POSCartItem', () => ({
  POSCartItem: () => <div data-testid="cart-item" />,
}));
vi.mock('@/components/views/terminal/views/pos/POSCartSuccessView', () => ({
  POSCartSuccessView: () => <div data-testid="cart-success" />,
}));
vi.mock('@/components/views/terminal/views/pos/usePOSCartExports', () => ({
  usePOSCartExports: () => ({ generatePDF: vi.fn(), shareWhatsApp: vi.fn(), exportAsImage: vi.fn(), printReceipt: vi.fn() }),
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

import { POSCart } from '@/components/views/terminal/views/pos/POSCart';
import { useCartStore } from '@/store/cart';

const STORE = '9635e633-387f-411d-bc15-7d2b6179aae4';

const product = {
  id: 'prod-1',
  name: 'Producto prueba',
  price: 100,
  stock_current: 50,
  store_id: STORE,
  cost_price: 50,
};

function buildCartWithItems() {
  useCartStore.setState({
    items: [],
    discount: null,
    appliedTaxes: [],
    storeId: STORE,
    globalRates: {},
    saleCurrency: 'CUP',
    saleExchangeRate: 1.0,
    selectedPayment: 'cash',
    operationType: 'sale',
    customerId: null,
    customerName: null,
    lastUpdated: Date.now(),
  });
  useCartStore.getState().addItem(product);
}

function renderMobileCart(onClose: () => void = vi.fn()) {
  const st = useCartStore.getState();
  return render(
    <POSCart
      items={st.items}
      onRemoveItem={vi.fn()}
      onUpdateQuantity={vi.fn()}
      onClearCart={vi.fn()}
      getSubtotal={st.getSubtotal}
      getDiscountAmount={st.getDiscountAmount}
      getTotal={st.getTotal}
      discount={null}
      setDiscount={vi.fn()}
      isMobile={true}
      isProcessing={false}
      onCheckout={vi.fn()}
      onClose={onClose}
      lastSale={null}
      onClearLastSale={vi.fn()}
      updateItemDiscount={vi.fn()}
      updateItemPayment={vi.fn()}
      prorateGlobalPayment={vi.fn()}
      getTaxAmount={() => 0}
    />,
  );
}

/** Cuerpo del carrito: el div flex-1 con overflow-hidden bajo el header
 *  (el wrapper exterior añade w-full — se excluye para quedar con el cuerpo). */
function getCartBody(): HTMLElement {
  return document.querySelector('.flex-1.flex.flex-col.overflow-hidden.bg-card:not(.w-full)') as HTMLElement;
}

describe('MISIÓN POS — carrito móvil: cierre solo con «X» (§6.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildCartWithItems();
  });

  it('deslizar hacia abajo más de 120 píxeles NO ejecuta onClose', () => {
    const onClose = vi.fn();
    renderMobileCart(onClose);
    const body = getCartBody();
    expect(body).toBeTruthy();

    // Gesto swipe-down > 120px (el que antes cerraba el carrito)
    act(() => {
      fireEvent.touchStart(body, { touches: [{ clientY: 300 }] });
      fireEvent.touchEnd(body, { changedTouches: [{ clientY: 500 }] }); // diff +200 > 120
    });
    expect(onClose).not.toHaveBeenCalled();

    // Y tampoco con un deslizamiento aún mayor
    act(() => {
      fireEvent.touchStart(body, { touches: [{ clientY: 100 }] });
      fireEvent.touchEnd(body, { changedTouches: [{ clientY: 800 }] }); // diff +700
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deslizar hacia arriba tampoco modifica el estado de apertura', () => {
    const onClose = vi.fn();
    renderMobileCart(onClose);
    const body = getCartBody();
    act(() => {
      fireEvent.touchStart(body, { touches: [{ clientY: 500 }] });
      fireEvent.touchEnd(body, { changedTouches: [{ clientY: 100 }] }); // diff -400 (arriba)
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('el cuerpo del carrito YA NO registra onTouchStart/onTouchEnd (sin listener equivalente)', () => {
    renderMobileCart();
    const body = getCartBody();
    // La eliminación del cierre por gesto es estructural: el div del cuerpo
    // no lleva manejadores táctiles de cierre (React los reflejaría como props).
    expect(body.hasAttribute('onTouchStart')).toBe(false);
    expect(body.hasAttribute('onTouchEnd')).toBe(false);
    // El componente fuente ya no contiene el umbral de 120px ni touchStartY.
    // (Verificación de fuente — anti-regresión del gesto eliminado.)
    const source = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/components/views/terminal/views/pos/POSCart.tsx'),
      'utf-8',
    );
    expect(source).not.toContain('touchStartY');
    expect(source).not.toContain('onTouchStart');
    expect(source).not.toContain('onTouchEnd');
    expect(source).not.toContain('if (diff > 120)');
  });

  it('pulsar «X» SÍ ejecuta el cierre manual', () => {
    const onClose = vi.fn();
    renderMobileCart(onClose);
    const xButton = screen.getByRole('button', { name: 'Cerrar carrito' });
    expect(xButton).toBeTruthy();
    act(() => { fireEvent.click(xButton); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('el botón «X» es accesible: aria-label claro y área táctil suficiente (≥44px)', () => {
    renderMobileCart();
    const xButton = screen.getByRole('button', { name: 'Cerrar carrito' }) as HTMLButtonElement;
    expect(xButton.getAttribute('aria-label')).toBe('Cerrar carrito');
    // Clases de área táctil: min-h-[44px] min-w-[44px] (convención 44px touch)
    expect(xButton.className).toContain('min-h-[44px]');
    expect(xButton.className).toContain('min-w-[44px]');
  });

  it('la zona de items y los tabs siguen operando tras el cambio (scroll no roto)', () => {
    const onClose = vi.fn();
    renderMobileCart(onClose);
    // El tab Pago funciona (cambio de pestaña interno sin cierre)
    const pagoTab = screen.getByRole('tab', { name: /Pago/ });
    act(() => { fireEvent.click(pagoTab); });
    expect(screen.getByTestId('checkout-panel')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    // Volver a Items
    const itemsTab = screen.getByRole('tab', { name: /Items/ });
    act(() => { fireEvent.click(itemsTab); });
    expect(screen.getAllByTestId('cart-item').length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
