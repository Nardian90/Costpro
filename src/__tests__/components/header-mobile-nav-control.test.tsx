/**
 * CP-SIDEBAR-RESTORATION-001 (2026-11-24) — Header: SOLO control de navegación móvil.
 *
 * El toggle mostrar/ocultar de la barra superior (PR #1700) quedó ELIMINADO:
 * era un segundo control y el único capaz de dejar SIN menú al escritorio.
 * Ahora:
 *  · Desktop (≥768px): la barra NO renderiza ningún control del menú — la
 *    inspección visual encuentra UN SOLO control en toda la app (el toggle
 *    del encabezado del propio menú).
 *  · Móvil (<768px): la barra conserva el control de navegación (§7) que
 *    ABRE el drawer temporal; el cierre vive dentro del panel.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

const { isMobileFlag } = vi.hoisted(() => ({
  isMobileFlag: { current: false },
}));

vi.mock('@/store', async () => {
  const { create } = await import('zustand');
  const useUIStore = create(() => ({
    currentView: 'dashboard',
    sidebarState: 'expanded',
    ipvActiveTab: null,
    activeCostSection: null,
  }));
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

const mountHeader = (onOpenMobileSidebar = vi.fn()) =>
  render(
    <Header
      onOpenMobileSidebar={onOpenMobileSidebar}
      currentView="dashboard"
      navigationItems={NAV as never}
      onViewChange={noop}
      user={USER as never}
      handleSetActiveStore={noop}
      onLogout={noop}
    />,
  );

describe('CP-SIDEBAR-RESTORATION-001 · Header — control de navegación móvil exclusivo', () => {
  beforeEach(() => {
    isMobileFlag.current = false;
  });
  afterEach(() => cleanup());

  it('desktop: la barra NO renderiza ningún control del menú (único control = el del menú)', () => {
    mountHeader();
    expect(screen.queryByRole('button', { name: 'Abrir menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ocultar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostrar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú lateral' })).toBeNull();
  });

  it('desktop rail: tampoco hay control (rail es un ajuste de ancho, no de visibilidad)', () => {
    // El Header ya no recibe sidebarState — ningún estado de escritorio le añade botones.
    mountHeader();
    expect(screen.queryByRole('button', { name: /menú lateral/ })).toBeNull();
  });

  it('móvil: existe el control de navegación «Abrir menú lateral» y abre el drawer', () => {
    isMobileFlag.current = true;
    const onOpenMobileSidebar = vi.fn();
    mountHeader(onOpenMobileSidebar);
    const btn = screen.getByRole('button', { name: 'Abrir menú lateral' });
    fireEvent.click(btn);
    expect(onOpenMobileSidebar).toHaveBeenCalledTimes(1);
    // El cierre vive dentro del panel — la barra no ofrece «Ocultar/Cerrar»
    expect(screen.queryByRole('button', { name: 'Ocultar menú lateral' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar menú lateral' })).toBeNull();
  });

  it('la barra conserva su z-30 clásico (sin elevaciones condicionales)', () => {
    const view = mountHeader();
    const header = view.container.querySelector('header');
    expect(header?.className).toContain('z-30');
  });
});
