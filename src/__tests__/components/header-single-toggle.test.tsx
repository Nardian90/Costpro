/**
 * CP-UX-SINGLE-TOGGLE (2026-11-24) — Un único botón muestra/oculta el menú lateral.
 *
 * Práctica internacional (patrón ChatGPT/Claude/Z.ai):
 *  · El botón toggle vive SIEMPRE en la barra superior (desktop y móvil),
 *    sea el menú visible o cerrado — ya no desaparece en desktop expandido.
 *  · El MISMO botón abre y cierra (clic = alternar), con aria-label y
 *    aria-expanded coherentes con el estado.
 *  · Cuando el menú se superpone a la barra (drawer móvil / temporal),
 *    `sidebarOverlaysHeader` eleva la barra (z-50) para que el botón siga
 *    siendo alcanzable y actúe de cierre.
 *  · El panel (Sidebar) NO tiene X propia — se elimina la mecánica fragmentada
 *    de "hamburguesa para abrir, X interna para cerrar".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { isMobileFlag, uiStateHolder } = vi.hoisted(() => ({
  isMobileFlag: { current: false },
  uiStateHolder: {
    current: {
      currentView: 'dashboard',
      sidebarState: 'expanded',
      sidebarPinned: true,
      ipvActiveTab: null,
      activeCostSection: null,
    },
  },
}));

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useUIStore = create(() => uiStateHolder.current);
  return { useUIStore };
});

vi.mock('@/hooks/ui/useMobile', () => ({
  useIsMobile: () => isMobileFlag.current,
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@/components/modals/SyncConflictModal', () => ({
  SyncConflictModal: () => null,
}));

vi.mock('@/components/views/terminal/StoreSelectorSheet', () => ({
  StoreSelectorSheet: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock('@/components/views/terminal/NotificationCenter', () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}));

vi.mock('@/components/views/terminal/views/help/HelpLauncher', () => ({
  HelpLauncher: () => <div data-testid="help-launcher" />,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div {...(rest as object)}>{children}</div>
  ),
}));

import { Header } from '@/components/views/terminal/Header';

const noop = () => {};

const USER = {
  id: 'u-1',
  role: 'owner',
  fullName: 'Dueño Prueba',
  email: 'owner@test.local',
  activeStoreId: 'store-1',
  memberships: [{ store_id: 'store-1', status: 'active', store: { name: 'Tienda Uno' } }],
} as unknown as Record<string, unknown>;

const NAV = [
  { id: 'dashboard', label: 'Panel', icon: () => null },
] as unknown as Array<{ id: string; label: string }>;

const mountHeader = (overrides: Record<string, unknown> = {}) => {
  const toggleSidebar = overrides.toggleSidebar ?? vi.fn();
  const view = render(
    <Header
      sidebarState={(uiStateHolder.current.sidebarState as 'expanded' | 'rail' | 'closed')}
      toggleSidebar={toggleSidebar as () => void}
      currentView="dashboard"
      navigationItems={NAV as never}
      onViewChange={noop}
      user={USER as never}
      handleSetActiveStore={noop}
      onLogout={noop}
      {...overrides}
    />,
  );
  return { view, toggleSidebar };
};

describe('CP-UX-SINGLE-TOGGLE · Header — un solo botón alterna mostrar/ocultar', () => {
  beforeEach(() => {
    isMobileFlag.current = false;
    uiStateHolder.current = {
      currentView: 'dashboard',
      sidebarState: 'expanded',
      sidebarPinned: true,
      ipvActiveTab: null,
      activeCostSection: null,
    };
  });
  afterEach(() => cleanup());

  it('desktop expandido: el botón ES visible (antes desaparecía) y ofrece ocultar', () => {
    const { toggleSidebar } = mountHeader();
    const btn = screen.getByRole('button', { name: 'Ocultar menú lateral' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('desktop cerrado: el mismo botón ofrece mostrar (aria-expanded=false)', () => {
    uiStateHolder.current.sidebarState = 'closed';
    const { toggleSidebar } = mountHeader();
    const btn = screen.getByRole('button', { name: 'Mostrar menú lateral' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('desktop rail: el botón permanece y ofrece ocultar (rail es "mostrado")', () => {
    uiStateHolder.current.sidebarState = 'rail';
    mountHeader();
    expect(screen.getByRole('button', { name: 'Ocultar menú lateral' })).toBeTruthy();
  });

  it('móvil: el botón es el mismo toggle (visible siempre), sin segundo control', () => {
    isMobileFlag.current = true;
    uiStateHolder.current.sidebarState = 'closed';
    mountHeader();
    expect(screen.getByRole('button', { name: 'Mostrar menú lateral' })).toBeTruthy();
    // No existe en toda la barra una X interna de "Cerrar menú lateral"
    expect(screen.queryByRole('button', { name: 'Cerrar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú temporal' })).toBeNull();
  });

  it('menú superpuesto (drawer móvil/temporal): la barra se eleva a z-50 con fondo sólido', () => {
    const { view } = mountHeader({ sidebarOverlaysHeader: true });
    const header = view.container.querySelector('header');
    expect(header?.className).toContain('z-50');
    expect(header?.className).toContain('bg-background');
    expect(header?.className).not.toContain('bg-background/80');
  });

  it('menú fijo visible: la barra conserva el z-30 translúcido clásico', () => {
    const { view } = mountHeader({ sidebarOverlaysHeader: false });
    const header = view.container.querySelector('header');
    expect(header?.className).toContain('z-30');
    expect(header?.className).toContain('bg-background/80');
  });
});
