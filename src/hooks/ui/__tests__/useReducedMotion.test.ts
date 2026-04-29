import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReducedMotion, motionSafe } from '../useReducedMotion';

const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

function mockMediaQuery(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    }))
  });
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
  });

  it('devuelve false cuando prefers-reduced-motion no está activado', () => {
    mockMediaQuery(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('devuelve true cuando prefers-reduced-motion está activado', () => {
    mockMediaQuery(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('registra listener en mount y lo limpia en unmount', () => {
    mockMediaQuery(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

describe('motionSafe', () => {
  it('devuelve props de animación cuando prefersReduced es false', () => {
    const props = { initial: { opacity: 0 }, animate: { opacity: 1 } };
    expect(motionSafe(false, props)).toEqual(props);
  });

  it('devuelve objeto vacío cuando prefersReduced es true', () => {
    const props = { initial: { opacity: 0 }, animate: { opacity: 1 } };
    expect(motionSafe(true, props)).toEqual({});
  });
});
