/**
 * CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24) — Comportamiento del menú lateral.
 *
 * §1.1 de la misión: el control de contraer/expandir vive DENTRO del
 * encabezado del menú (patrón ChatGPT/Z.ai); contraer deja la barra compacta
 * (rail) con iconos — NUNCA 'closed'. Indicador de sección activa en rail.
 * §1.2: en móvil, navegar a una vista funcional concreta (hoja / Inicio /
 * perfil) cierra el drawer; expandir una categoría NO lo cierra.
 *
 * CP-UX-POLISH-002 (2026-11-24): Estados A/B/C del menú — FIJO expandido,
 * FIJO contraído y TEMPORAL (overlay). El pin del encabezado cambia el
 * COMPORTAMIENTO del layout (sidebarPinned), la preferencia persiste y el
 * menú temporal se cierra al elegir una vista funcional.
 *
 * CP-UX-SINGLE-TOGGLE (2026-11-24): el eje VISIBILIDAD (closed↔visible) es
 * exclusivo del ÚNICO botón toggle de la barra superior (Header) — el panel
 * NO tiene X propia (ni móvil ni temporal). El control interno del panel
 * solo ajusta ANCHO (expanded↔rail) y el pin cambia fijo↔temporal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { isMobileFlag, setSidebarStateMock, setSidebarPinnedMock, mockUserHolder } = vi.hoisted(() => ({
  isMobileFlag: { current: false },
  setSidebarStateMock: vi.fn(),
  setSidebarPinnedMock: vi.fn(),
  mockUserHolder: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({
    get user() {
      return mockUserHolder.current;
    },
  }));
  const useUIStore = create((set: (p: Record<string, unknown>) => void) => ({
    currentView: 'dashboard',
    sidebarState: 'expanded',
    sidebarPinned: true,
    // CP-UX-NAVIGATION-POS-REPAIR-001: registra la llamada Y muta el estado
    // (re-render real, como el store genuino).
    setSidebarState: (state: string) => {
      setSidebarStateMock(state);
      set({ sidebarState: state });
    },
    // CP-UX-POLISH-002: el pin registra Y muta (comportamiento real de layout).
    setSidebarPinned: (pinned: boolean) => {
      setSidebarPinnedMock(pinned);
      set({ sidebarPinned: pinned });
    },
    isCalculatorOpen: false,
    setIsCalculatorOpen: () => {},
    activeCostSection: null,
    ipvActiveTab: null,
    setIpvActiveTab: () => {},
    setActiveCostSection: () => {},
    setCurrentView: () => {},
  }));
  return { useAuthStore, useUIStore };
});

vi.mock('@/hooks/ui/useMobile', () => ({
  useIsMobile: () => isMobileFlag.current,
}));

import Sidebar from '@/components/views/terminal/Sidebar';
import { useUIStore } from '@/store';

const noop = () => {};
const mountSidebar = () =>
  render(
    <Sidebar
      onViewChange={noop}
      onLogout={noop}
      onPrefetchView={noop}
    />,
  );

const ADMIN = {
  id: 'u-admin', role: 'admin', roles: ['admin'],
  activeStoreId: 'store-1', memberships: [],
};

describe('CP-UX-NAVIGATION-POS-REPAIR-001 · Menú lateral — §1.1 control integrado', () => {
  beforeEach(() => {
    mockUserHolder.current = ADMIN;
    isMobileFlag.current = false;
    setSidebarStateMock.mockClear();
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'dashboard' });
  });
  afterEach(() => cleanup());

  it('expandido: el toggle vive en el ENCABEZADO del propio menú (Contraer)', () => {
    mountSidebar();
    const btn = screen.getByRole('button', { name: 'Contraer menú lateral' });
    // Encabezado: precede al nav en el DOM (está dentro del contenedor del logo)
    expect(btn.closest('#sidebar-logo-container')).toBeTruthy();
  });

  it('Contraer → barra compacta (rail), JAMÁS cerrado por completo', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú lateral' }));
    expect(setSidebarStateMock).toHaveBeenCalledTimes(1);
    expect(setSidebarStateMock).toHaveBeenCalledWith('rail');
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });

  it('rail: los iconos de navegación siguen presentes (barra compacta)', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    mountSidebar();
    // Rail sin focus mode: iconos de secciones raíz con aria-label
    expect(screen.getByRole('button', { name: 'OPERACIÓN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeTruthy();
  });

  it('rail: el toggle cambia a «Expandir menú lateral» y vuelve a expanded', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menú lateral' }));
    expect(setSidebarStateMock).toHaveBeenCalledWith('expanded');
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });

  it('rail: indicador de sección activa — OPERACIÓN resaltada cuando la vista actual es pos', () => {
    useUIStore.setState({ sidebarState: 'rail', currentView: 'pos' });
    mountSidebar();
    expect(screen.getByRole('button', { name: 'OPERACIÓN' }).getAttribute('aria-current')).toBe('true');
    // Otra sección sin relación con 'pos' NO está activa
    expect(screen.getByRole('button', { name: 'AYUDA' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('CP-UX-NAVIGATION-POS-REPAIR-001 · Menú lateral — §1.2 comportamiento móvil', () => {
  beforeEach(() => {
    mockUserHolder.current = ADMIN;
    isMobileFlag.current = true;
    setSidebarStateMock.mockClear();
    setSidebarPinnedMock.mockClear();
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'pos', sidebarPinned: true });
  });
  afterEach(() => cleanup());

  it('clic en sección raíz (Operación) NO cierra el drawer (muestra opciones secundarias)', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: /OPERACIÓN/i }));
    const closedCalls = setSidebarStateMock.mock.calls.filter((c) => c[0] === 'closed');
    expect(closedCalls).toHaveLength(0);
  });

  it('clic en vista funcional concreta (Inicio) cierra el drawer', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));
    expect(setSidebarStateMock).toHaveBeenCalledWith('closed');
  });

  it('clic en Mi Perfil (vista settings) cierra el drawer', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Mi perfil' }));
    expect(setSidebarStateMock).toHaveBeenCalledWith('closed');
  });

  it('CP-UX-SINGLE-TOGGLE: el panel NO tiene X propia — el cierre vive en el toggle único de la barra', () => {
    mountSidebar();
    expect(screen.queryByRole('button', { name: 'Cerrar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contraer menú lateral' })).toBeNull();
  });

  it('móvil NO muestra el control pin (el drawer es SIEMPRE temporal — misión §1.2)', () => {
    mountSidebar();
    expect(screen.queryByRole('button', { name: /Fijar menú lateral/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desfijar menú lateral/ })).toBeNull();
  });
});

describe('CP-UX-POLISH-002 · Estados A/B/C — fijar (pin), contraer y temporal', () => {
  beforeEach(() => {
    mockUserHolder.current = ADMIN;
    isMobileFlag.current = false;
    setSidebarStateMock.mockClear();
    setSidebarPinnedMock.mockClear();
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'dashboard', sidebarPinned: true });
  });
  afterEach(() => cleanup());

  it('Estado A — fijo expandido: el pin está activo (aria-pressed) y convive con el toggle contraer', () => {
    mountSidebar();
    const pin = screen.getByRole('button', { name: 'Desfijar menú lateral (hacer temporal)' });
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(pin.closest('#sidebar-logo-container')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contraer menú lateral' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
  });

  it('Desfijar → Estado C: registra sidebarPinned=false (comportamiento real, no apariencia)', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Desfijar menú lateral (hacer temporal)' }));
    expect(setSidebarPinnedMock).toHaveBeenCalledTimes(1);
    expect(setSidebarPinnedMock).toHaveBeenCalledWith(false);
    expect(useUIStore.getState().sidebarPinned).toBe(false);
  });

  it('Estado C — temporal: muestra PinOff y ya NO ofrece toggle rail ni X propia (cierre en la barra)', () => {
    useUIStore.setState({ sidebarPinned: false });
    mountSidebar();
    const pin = screen.getByRole('button', { name: 'Fijar menú lateral' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contraer menú lateral' })).toBeNull();
  });

  it('Estado C — clic en una vista funcional (Inicio) CIERRA el menú temporal', () => {
    useUIStore.setState({ sidebarPinned: false });
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));
    expect(setSidebarStateMock).toHaveBeenCalledWith('closed');
  });

  it('Estado A — clic en una vista funcional NO cierra el menú fijo (permanece al navegar)', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));
    const closedCalls = setSidebarStateMock.mock.calls.filter((c) => c[0] === 'closed');
    expect(closedCalls).toHaveLength(0);
  });

  it('Estado C — fijar de nuevo vuelve al comportamiento fijo (sidebarPinned=true)', () => {
    useUIStore.setState({ sidebarPinned: false });
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Fijar menú lateral' }));
    expect(setSidebarPinnedMock).toHaveBeenCalledWith(true);
    expect(useUIStore.getState().sidebarPinned).toBe(true);
  });

  it('Estado B — rail: sin pin ni X de cierre (rail ≡ fijo); expandir vuelve a expanded y el pin reaparece', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    mountSidebar();
    // En la barra compacta NO existe ni el pin (implícito: fijo) ni la X del temporal
    expect(screen.queryByRole('button', { name: /Desfijar menú lateral/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
    // Expandir desde rail → estado A de nuevo (el pin vuelve a estar activo)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menú lateral' }));
    expect(setSidebarStateMock).toHaveBeenCalledWith('expanded');
    expect(useUIStore.getState().sidebarState).toBe('expanded');
    expect(screen.getByRole('button', { name: 'Desfijar menú lateral (hacer temporal)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('CP-UX-SINGLE-TOGGLE: ni en fijo ni en temporal existe «Cerrar menú temporal» — visibilidad solo en la barra', () => {
    mountSidebar();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
    useUIStore.setState({ sidebarPinned: false });
    cleanup();
    mountSidebar();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
  });
});
