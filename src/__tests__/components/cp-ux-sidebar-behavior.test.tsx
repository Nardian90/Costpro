/**
 * CP-SIDEBAR-RESTORATION-001 (2026-11-24) — Comportamiento del menú lateral.
 *
 * CONTRATO NUEVO: DOS ESTADOS en desktop y UN SOLO CONTROL.
 *  · ESTADO A (expanded): iconos + etiquetas, ocupa espacio real del layout.
 *  · ESTADO B (rail): barra compacta de iconos; jerarquía conservada mediante
 *    tooltips discretos e indicador de sección activa.
 *  · UN ÚNICO botón, integrado en el ENCABEZADO del menú, accesible también en
 *    la barra compacta; icono y tooltip según la acción siguiente.
 *  · CERO expansión automática: sin hover, sin temporizadores, sin pin, sin
 *    overlay/backdrop/Esc en desktop. El menú JAMÁS se cierra en desktop.
 *  · Móvil (§7): drawer temporal — sección raíz NO cierra, hoja funcional SÍ.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { isMobileFlag, setSidebarStateMock, mockUserHolder } = vi.hoisted(() => ({
  isMobileFlag: { current: false },
  setSidebarStateMock: vi.fn(),
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
    // CP-SIDEBAR-RESTORATION-001: registra la llamada Y muta el estado
    // (re-render real, como el store genuino). NO existe setSidebarPinned.
    setSidebarState: (state: string) => {
      setSidebarStateMock(state);
      set({ sidebarState: state });
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

const closedCalls = () => setSidebarStateMock.mock.calls.filter((c) => c[0] === 'closed');

describe('CP-SIDEBAR-RESTORATION-001 · DOS ESTADOS — control único integrado', () => {
  beforeEach(() => {
    mockUserHolder.current = ADMIN;
    isMobileFlag.current = false;
    setSidebarStateMock.mockClear();
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'dashboard' });
  });
  afterEach(() => cleanup());

  it('ESTADO A (expandido): el ÚNICO control vive en el ENCABEZADO del menú (Contraer)', () => {
    mountSidebar();
    const btn = screen.getByRole('button', { name: 'Contraer menú lateral' });
    expect(btn.closest('#sidebar-logo-container')).toBeTruthy();
    expect(btn.getAttribute('title')).toBe('Contraer menú');
    // Un solo control del menú en todo el panel
    expect(screen.getAllByRole('button', { name: /menú lateral/ })).toHaveLength(1);
  });

  it('clic en el control → ESTADO B (rail); nunca closed', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú lateral' }));
    expect(setSidebarStateMock).toHaveBeenCalledTimes(1);
    expect(setSidebarStateMock).toHaveBeenCalledWith('rail');
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });

  it('ESTADO B (rail): iconos de navegación presentes (barra compacta con jerarquía)', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    mountSidebar();
    expect(screen.getByRole('button', { name: 'OPERACIÓN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeTruthy();
  });

  it('ESTADO B: el MISMO control sigue accesible en la barra compacta y expande', () => {
    useUIStore.setState({ sidebarState: 'rail' });
    mountSidebar();
    const btn = screen.getByRole('button', { name: 'Expandir menú lateral' });
    expect(btn.closest('#sidebar-logo-container')).toBeTruthy();
    expect(btn.getAttribute('title')).toBe('Expandir menú');
    fireEvent.click(btn);
    expect(setSidebarStateMock).toHaveBeenCalledWith('expanded');
    expect(useUIStore.getState().sidebarState).toBe('expanded');
    // De nuevo un solo control
    expect(screen.getAllByRole('button', { name: /menú lateral/ })).toHaveLength(1);
  });

  it('rail: indicador de sección activa — OPERACIÓN resaltada cuando la vista es pos', () => {
    useUIStore.setState({ sidebarState: 'rail', currentView: 'pos' });
    mountSidebar();
    expect(screen.getByRole('button', { name: 'OPERACIÓN' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'AYUDA' }).getAttribute('aria-current')).toBeNull();
  });

  it('rail: clic en un icono raíz NAVEGA sin expandir (expansión solo vía el control único)', () => {
    useUIStore.setState({ sidebarState: 'rail', currentView: 'dashboard' });
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'OPERACIÓN' }));
    expect(setSidebarStateMock).not.toHaveBeenCalledWith('expanded');
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });

  it('desktop: NO existen pin, desfijar, mostrar/ocultar ni cierre temporal', () => {
    mountSidebar();
    expect(screen.queryByRole('button', { name: /Fijar menú lateral/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desfijar menú lateral/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ocultar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
    useUIStore.setState({ sidebarState: 'rail' });
    cleanup();
    mountSidebar();
    expect(screen.queryByRole('button', { name: /Fijar menú lateral/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
  });

  it('desktop: navegar a una vista funcional NUNCA cierra el menú (siempre visible)', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Inicio' }));
    expect(closedCalls()).toHaveLength(0);
  });
});

describe('CP-SIDEBAR-RESTORATION-001 · §7 comportamiento móvil (drawer temporal)', () => {
  beforeEach(() => {
    mockUserHolder.current = ADMIN;
    isMobileFlag.current = true;
    setSidebarStateMock.mockClear();
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'pos' });
  });
  afterEach(() => cleanup());

  it('drawer abierto: el ÚNICO control del panel es «Cerrar menú»', () => {
    mountSidebar();
    const btn = screen.getByRole('button', { name: 'Cerrar menú' });
    expect(btn.closest('#sidebar-logo-container')).toBeTruthy();
    fireEvent.click(btn);
    expect(setSidebarStateMock).toHaveBeenCalledWith('closed');
    // El drawer móvil no ofrece rail ni pin
    expect(screen.queryByRole('button', { name: 'Contraer menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Fijar menú lateral/ })).toBeNull();
  });

  it('clic en sección raíz (Operación) NO cierra el drawer (muestra opciones secundarias)', () => {
    mountSidebar();
    fireEvent.click(screen.getByRole('button', { name: /OPERACIÓN/i }));
    expect(closedCalls()).toHaveLength(0);
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
});
