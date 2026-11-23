/**
 * CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24) — Comportamiento del menú lateral.
 *
 * §1.1 de la misión: el control de contraer/expandir vive DENTRO del
 * encabezado del menú (patrón ChatGPT/Z.ai); contraer deja la barra compacta
 * (rail) con iconos — NUNCA 'closed'. Indicador de sección activa en rail.
 * §1.2: en móvil, navegar a una vista funcional concreta (hoja / Inicio /
 * perfil) cierra el drawer; expandir una categoría NO lo cierra.
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
    // CP-UX-NAVIGATION-POS-REPAIR-001: registra la llamada Y muta el estado
    // (re-render real, como el store genuino).
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
      onClose={noop}
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
    useUIStore.setState({ sidebarState: 'expanded', currentView: 'pos' });
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

  it('móvil conserva la X del encabezado para cerrar el drawer (sin toggle rail duplicado)', () => {
    mountSidebar();
    expect(screen.getByRole('button', { name: 'Cerrar menú lateral' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Contraer menú lateral' })).toBeNull();
  });
});
