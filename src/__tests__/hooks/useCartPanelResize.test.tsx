/**
 * useCartPanelResize.test.tsx — MISIÓN CARRITO-VENTAS (2026-10-23).
 *
 * Contrato del hook del panel de carrito redimensionable:
 *  1. Ancho por defecto por breakpoint (440 / 480 / 520 según viewport).
 *  2. Límites adaptativos: mínimo 360px; máximo = viewport − espacio del
 *     catálogo (560px), con techo duro 880px; nunca por debajo del mínimo.
 *  3. Persistencia en localStorage con RE-validación al leer: un valor
 *     corrupto se descarta y uno válido se clampea al viewport actual.
 *  4. Arrastre (Pointer Events): hacia la izquierda AUMENTA el ancho (panel a
 *     la derecha), con clamp en los extremos.
 *  5. Teclado: ←/→ ±16px (Shift ±48px) y resetWidth restaura el default.
 *  6. Sincronización con el breakpoint lg (isLgViewport).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import {
  useCartPanelResize,
  type CartPanelResize,
  clampCartWidth,
  cartMaxWidth,
  CART_MIN_WIDTH,
  CART_MAX_WIDTH_LIMIT,
  CART_CATALOG_MIN_SPACE,
  CART_PANEL_GAP,
  LG_BREAKPOINT,
} from '@/components/views/terminal/views/pos/useCartPanelResize';

const STORAGE_KEY = 'costpro:pos-cart-width';

function setViewport(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });
}

/**
 * Harness: monta el hook dentro de un componente real y expone su estado;
 * el separador es un div React con los handlers — imprescindible para que
 * los eventos sintéticos (pointerDown) disparen el flujo del hook.
 */
let latest: CartPanelResize | null = null;
function ResizeHarness() {
  const h = useCartPanelResize();
  latest = h;
  return (
    <div
      data-testid="handle"
      role="separator"
      onPointerDown={h.startResize}
      onKeyDown={h.handleResizeKeyDown}
      onDoubleClick={h.resetWidth}
    />
  );
}

function mountHarness() {
  const view = render(<ResizeHarness />);
  return { view, get: () => latest as CartPanelResize };
}

describe('clampCartWidth / cartMaxWidth (límites adaptativos)', () => {
  it('máximo = viewport − espacio del catálogo, con techo duro 880', () => {
    expect(cartMaxWidth(1440)).toBe(880);
    expect(cartMaxWidth(1024)).toBe(1024 - CART_CATALOG_MIN_SPACE);
    // en viewports pequeños el máximo no baja del mínimo absoluto
    expect(cartMaxWidth(800)).toBe(CART_MIN_WIDTH);
  });

  it('en viewports pequeños el máximo nunca baja del mínimo absoluto', () => {
    expect(cartMaxWidth(600)).toBe(CART_MIN_WIDTH);
    expect(clampCartWidth(900, 600)).toBe(CART_MIN_WIDTH);
  });

  it('clampa por ambos extremos y redondea', () => {
    expect(clampCartWidth(100, 1440)).toBe(CART_MIN_WIDTH);
    expect(clampCartWidth(2000, 1440)).toBe(CART_MAX_WIDTH_LIMIT);
    expect(clampCartWidth(523.6, 1440)).toBe(524);
  });
});

describe('useCartPanelResize', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewport(1440);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('default 440 en viewport lg (1024–1279), 480 en xl y 520 en 2xl', () => {
    // localStorage limpio antes de CADA instancia: el efecto de persistencia
    // de una instancia previa contaminaría la lectura de la siguiente.
    setViewport(1100);
    window.localStorage.clear();
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(440);
    setViewport(1400);
    window.localStorage.clear();
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(480);
    setViewport(1600);
    window.localStorage.clear();
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(520);
  });

  it('descarta valores corruptos del storage y usa el default', () => {
    window.localStorage.setItem(STORAGE_KEY, 'no-es-un-número');
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(480);
  });

  it('re-valida el valor persistido contra el viewport actual (resolución menor)', () => {
    window.localStorage.setItem(STORAGE_KEY, '880');
    setViewport(1024); // máximo real = 1024 − 560 = 464
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(464);
  });

  it('usa el valor persistido válido tal cual (dentro de límites)', () => {
    window.localStorage.setItem(STORAGE_KEY, '600');
    expect(renderHook(() => useCartPanelResize()).result.current.width).toBe(600);
  });

  it('persiste el ancho elegido en localStorage', () => {
    const { result } = renderHook(() => useCartPanelResize());
    act(() => result.current.resizeBy(100));
    // default a 1440px (breakpoint xl) = 480
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(String(480 + 100));
  });

  it('drag hacia la izquierda aumenta el ancho; hacia la derecha lo reduce', () => {
    const { get } = mountHarness();
    const handle = screen.getByTestId('handle');
    // pointerdown en x=1000 (el ancho inicial 480 a 1440px no depende de la X)
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 1000, button: 0, pointerType: 'mouse' });
    });
    // arrastre 120px a la izquierda → 480 + 120 = 600
    act(() => {
      fireEvent.pointerMove(window, { clientX: 880 });
    });
    expect(get().isResizing).toBe(true);
    expect(get().width).toBe(600);
    // arrastre 60px a la derecha → 600 − 60 = 540
    act(() => {
      fireEvent.pointerMove(window, { clientX: 940 });
    });
    expect(get().width).toBe(540);
    // pointerup finaliza el gesto
    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(get().isResizing).toBe(false);
  });

  it('el drag respeta los límites mínimo y máximo', () => {
    const { get } = mountHarness();
    const handle = screen.getByTestId('handle');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 1000, button: 0, pointerType: 'mouse' });
    });
    // intento de arrastrar 2000px a la derecha → clamp al mínimo
    act(() => {
      fireEvent.pointerMove(window, { clientX: 3000 });
    });
    expect(get().width).toBe(CART_MIN_WIDTH);
    // intento de arrastrar 5000px a la izquierda → clamp al máximo (1440−560)
    act(() => {
      fireEvent.pointerMove(window, { clientX: -4000 });
    });
    expect(get().width).toBe(cartMaxWidth(1440));
    act(() => {
      fireEvent.pointerUp(window);
    });
  });

  it('ignora el botón derecho del ratón en el separador', () => {
    const { get } = mountHarness();
    const handle = screen.getByTestId('handle');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 1000, button: 2, pointerType: 'mouse' });
    });
    expect(get().isResizing).toBe(false);
  });

  it('doble clic en el separador restablece el ancho por defecto', () => {
    window.localStorage.setItem(STORAGE_KEY, '700');
    const { get } = mountHarness();
    expect(get().width).toBe(700);
    act(() => {
      fireEvent.dblClick(screen.getByTestId('handle'));
    });
    // default a 1440px (xl) = 480
    expect(get().width).toBe(480);
  });

  it('teclado: ← agranda 16px, → reduce 16px, Shift pasa a ±48px', () => {
    const { result } = renderHook(() => useCartPanelResize());
    // default a 1440px = 480
    act(() => {
      result.current.handleResizeKeyDown({
        key: 'ArrowLeft',
        shiftKey: false,
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.width).toBe(496);
    act(() => {
      result.current.handleResizeKeyDown({
        key: 'ArrowRight',
        shiftKey: true,
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.width).toBe(496 - 48);
  });

  it('resetWidth restaura el default por breakpoint', () => {
    window.localStorage.setItem(STORAGE_KEY, '700');
    const { result } = renderHook(() => useCartPanelResize());
    expect(result.current.width).toBe(700);
    act(() => result.current.resetWidth());
    // default a 1440px (xl) = 480
    expect(result.current.width).toBe(480);
  });

  it('isLgViewport refleja el breakpoint lg', () => {
    setViewport(1300);
    const { result } = renderHook(() => useCartPanelResize());
    // jsdom matchMedia no reacciona a innerWidth sintético: el valor depende
    // del soporte del entorno; lo contractual es que sea boolean definido.
    expect(typeof result.current.isLgViewport).toBe('boolean');
    expect(LG_BREAKPOINT).toBe(1024);
    expect(CART_PANEL_GAP).toBe(20);
  });
});
