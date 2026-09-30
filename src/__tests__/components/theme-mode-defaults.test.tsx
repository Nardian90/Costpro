/**
 * HOME/SALES/PERFORMANCE DEFAULTS — CAMBIO 6 / GATE 8 / GATE 9 / GATE 10.
 *
 * Tests de defaults y persistencia de Theme/Mode:
 *   - GATE 8: usuario nuevo (sin preferencia) → Modo Performance.
 *   - GATE 8: usuario con preferencia persistida → se respeta.
 *   - GATE 10: 1 click del toggle = cambio inmediato + persistido correcto.
 *   - Los utilitarios son la fuente única de verdad (modo en localStorage +
 *     clase en <html>); el override manual SIEMPRE gana sobre el SO.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// next-themes se mockea: IntelligentThemeHandler solo consume useTheme()
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: 'dark' }),
}));

import IntelligentThemeHandler, {
  toggleUIMode,
  getCurrentUIMode,
  type UIMode,
} from '@/components/IntelligentThemeHandler';
import { render, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const MODE_KEY = 'costpro-mode';
const OVERRIDE_KEY = 'costpro-mode-manual-override';

// jsdom no implementa matchMedia — stub mínimo (prefers-reduced-motion: false)
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

const htmlClass = () => document.documentElement.className;
const hasModeClass = (m: UIMode) => document.documentElement.classList.contains(`mode-${m}`);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
});

describe('getCurrentUIMode / toggleUIMode (GATE 8 — fuente única)', () => {
  it('GATE 8 — usuario nuevo (sin preferencia): el modo efectivo es performance', () => {
    expect(getCurrentUIMode()).toBe('performance');
  });

  it('GATE 8 — preferencia persistida respetada (enhanced sin override)', () => {
    localStorage.setItem(MODE_KEY, 'enhanced');
    expect(getCurrentUIMode()).toBe('enhanced');
  });

  it('GATE 8 — override manual respeta su preferencia', () => {
    localStorage.setItem(MODE_KEY, 'enhanced');
    localStorage.setItem(OVERRIDE_KEY, 'true');
    expect(getCurrentUIMode()).toBe('enhanced');
  });

  it('GATE 10 — toggle: performance → enhanced en UN click (clase + storage coherentes)', () => {
    localStorage.setItem(MODE_KEY, 'performance');
    const next = toggleUIMode();
    expect(next).toBe('enhanced');
    expect(hasModeClass('enhanced')).toBe(true);
    expect(hasModeClass('performance')).toBe(false);
    expect(localStorage.getItem(MODE_KEY)).toBe('enhanced');
    expect(localStorage.getItem(OVERRIDE_KEY)).toBe('true');
  });

  it('GATE 10 — toggle: enhanced → performance en UN click', () => {
    localStorage.setItem(MODE_KEY, 'enhanced');
    const next = toggleUIMode();
    expect(next).toBe('performance');
    expect(hasModeClass('performance')).toBe(true);
    expect(localStorage.getItem(MODE_KEY)).toBe('performance');
  });

  it('GATE 10 — toggle sin storage previo parte del default (performance) y aplica enhanced', () => {
    const next = toggleUIMode();
    expect(next).toBe('enhanced');
    expect(localStorage.getItem(MODE_KEY)).toBe('enhanced');
  });
});

describe('IntelligentThemeHandler — inicialización (GATE 8/9)', () => {
  it('GATE 8 — usuario nuevo: monta en Modo Performance y persiste el default', async () => {
    render(<IntelligentThemeHandler />);
    await waitFor(() => expect(hasModeClass('performance')).toBe(true));
    expect(localStorage.getItem(MODE_KEY)).toBe('performance');
  });

  it('GATE 8 — preferencia existente (enhanced, sin override): se respeta', async () => {
    localStorage.setItem(MODE_KEY, 'enhanced');
    render(<IntelligentThemeHandler />);
    await waitFor(() => expect(hasModeClass('enhanced')).toBe(true));
    // La preferencia persistida NO fue sobrescrita por el default
    expect(localStorage.getItem(MODE_KEY)).toBe('enhanced');
  });

  it('GATE 8 — preferencia existente (performance con override): se respeta', async () => {
    localStorage.setItem(MODE_KEY, 'performance');
    localStorage.setItem(OVERRIDE_KEY, 'true');
    render(<IntelligentThemeHandler />);
    await waitFor(() => expect(hasModeClass('performance')).toBe(true));
    expect(localStorage.getItem(MODE_KEY)).toBe('performance');
  });

  it('GATE 9/10 — re-sync: si una clase foránea desincroniza <html>, el focus re-aplica el persistido', async () => {
    localStorage.setItem(MODE_KEY, 'performance');
    const { unmount } = render(<IntelligentThemeHandler />);
    await waitFor(() => expect(hasModeClass('performance')).toBe(true));

    // Un actor externo (p. ej. una superficie con branding propio) fuerza
    // la clase contraria — exactamente el desync P0 reproducido con el landing.
    document.documentElement.classList.remove('mode-performance');
    document.documentElement.classList.add('mode-enhanced');
    expect(htmlClass()).toContain('mode-enhanced');

    // El re-sync corre en visibilitychange/focus y cura el estado visual
    await new Promise(r => setTimeout(r, 0));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(hasModeClass('performance')).toBe(true));
    expect(hasModeClass('enhanced')).toBe(false);
    // Y la preferencia persistida sigue intacta
    expect(localStorage.getItem(MODE_KEY)).toBe('performance');
    unmount();
  });
});
