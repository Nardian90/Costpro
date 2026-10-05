/**
 * useSidebarHoverExpand — unit tests (Fase hover-expand)
 *
 * Cobertura:
 *  - hoverProps vacío cuando no aplica (expandido, móvil, sin puntero fino).
 *  - Expansión tras expandDelayMs (sin clic) y contracción tras collapseDelayMs.
 *  - Anti-flapping: re-entrada durante el delay de contracción cancela el colapso;
 *    salida durante el delay de expansión cancela la expansión.
 *  - El hook NUNCA escribe en stores (solo estado local efímero).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { useSidebarHoverExpand } from '@/hooks/ui/useSidebarHoverExpand';

const hoverState = { finePointer: true };

// jsdom no implementa matchMedia — stub controlable.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('hover: hover') ? hoverState.finePointer : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

const setViewport = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
};

const fire = (props: Pick<React.HTMLAttributes<HTMLElement>, 'onMouseEnter' | 'onMouseLeave'>) => ({
  enter: () => act(() => { props.onMouseEnter?.({} as React.MouseEvent<HTMLElement>); }),
  leave: () => act(() => { props.onMouseLeave?.({} as React.MouseEvent<HTMLElement>); }),
});

describe('useSidebarHoverExpand', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hoverState.finePointer = true;
    setViewport(1280);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expande tras expandDelayMs (sin clic) y contrae tras collapseDelayMs', () => {
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: true }));
    expect(Object.keys(result.current.hoverProps)).toHaveLength(2);
    const h = fire(result.current.hoverProps);

    h.enter();
    act(() => vi.advanceTimersByTime(99));
    expect(result.current.hoverExpanded).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.hoverExpanded).toBe(true);

    h.leave();
    act(() => vi.advanceTimersByTime(179));
    expect(result.current.hoverExpanded).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('anti-flapping: re-entrada durante el delay de contracción cancela el colapso', () => {
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: true }));
    const h = fire(result.current.hoverProps);

    h.enter();
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.hoverExpanded).toBe(true);

    h.leave();
    act(() => vi.advanceTimersByTime(100)); // < collapseDelayMs
    h.enter(); // re-entra → cancela colapso
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.hoverExpanded).toBe(true);

    h.leave();
    act(() => vi.advanceTimersByTime(180));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('salida durante el delay de expansión cancela la expansión (paso efímero)', () => {
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: true }));
    const h = fire(result.current.hoverProps);

    h.enter();
    act(() => vi.advanceTimersByTime(50)); // < expandDelayMs
    h.leave();
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('no aplica con estado expandido (hoverProps vacío, sin expansión)', () => {
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: false }));
    expect(Object.keys(result.current.hoverProps)).toHaveLength(0);
    const h = fire(result.current.hoverProps);
    h.enter();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('no aplica en móvil (<768px) — touch conserva el patrón botón → drawer', () => {
    setViewport(375);
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: true }));
    expect(Object.keys(result.current.hoverProps)).toHaveLength(0);
    const h = fire(result.current.hoverProps);
    h.enter();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('no aplica sin puntero fino (media query hover:hover/pointer:fine)', () => {
    hoverState.finePointer = false;
    const { result } = renderHook(() => useSidebarHoverExpand({ collapsed: true }));
    expect(Object.keys(result.current.hoverProps)).toHaveLength(0);
    const h = fire(result.current.hoverProps);
    h.enter();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.hoverExpanded).toBe(false);
  });

  it('si deja de aplicar a mitad de ciclo (pin del usuario), resetea el estado temporal', () => {
    const { result, rerender } = renderHook(
      ({ collapsed }) => useSidebarHoverExpand({ collapsed }),
      { initialProps: { collapsed: true } },
    );
    const h = fire(result.current.hoverProps);
    h.enter();
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.hoverExpanded).toBe(true);

    // El usuario fija el sidebar expandido → collapsed pasa a false.
    rerender({ collapsed: false });
    expect(result.current.hoverExpanded).toBe(false);
  });
});
