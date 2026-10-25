/**
 * CP-ORG-003 Fase 1 — Prueba de COMPONENTE del MobileTabBar real: tabs
 * fijos y sheet «Más» bajo la doctrina canónica (rol global estricto).
 *
 * Complementa a mobile-tabbar-parity.test.ts (lógica pura) montando el
 * componente REAL con la sesión mockeada: verifica que lo que el usuario
 * VE en la bottom bar / sheet coincide con lo que el guard autoriza, que
 * las membresías NO amplían el menú móvil y que el contexto de tienda no
 * altera la visibilidad (escenario 7: cambio de tienda).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockUser: Record<string, unknown> | null = null;
let mockStores: Array<{ id: string; name: string }> = [];
const switchStoreSpy = vi.fn();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));
vi.mock('@/store', () => ({
  useUIStore: () => ({
    setCurrentView: vi.fn(), sidebarState: 'expanded', toggleSidebar: vi.fn(),
    setActiveCostSection: vi.fn(), activeCostSection: 'main',
  }),
  useAuthStore: () => ({ user: mockUser }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/ui/useStoreSwitcher', () => ({
  useStoreSwitcher: () => ({ switchStore: switchStoreSpy }),
}));
vi.mock('@/hooks/api/useStores', () => ({
  useStores: () => ({ data: mockStores, isLoading: false }),
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? children : null),
  SheetContent: ({ children }: any) => React.createElement('div', null, children),
  SheetHeader: ({ children }: any) => React.createElement('div', null, children),
  SheetTitle: ({ children }: any) => React.createElement('h2', null, children),
}));

import { MobileTabBar } from '@/components/views/terminal/MobileTabBar';

const mountTabBar = () =>
  render(
    <MobileTabBar
      navigationItems={[]}
      currentView="dashboard"
      onViewChange={vi.fn()}
    />,
    { wrapper: Wrapper },
  );

const tenantAdmin = (memberships: unknown[] = []) => ({
  id: 'ta-1', role: 'tenant_admin', roles: ['tenant_admin'],
  activeStoreId: '', memberships,
});

describe('CP-ORG-003 F1 — MobileTabBar real: tabs fijos por rol (D2)', () => {
  beforeEach(() => {
    mockUser = null;
    mockStores = [];
    switchStoreSpy.mockClear();
  });
  afterEach(() => cleanup());

  it('tenant_admin PURO: ningún tab operativo visible — solo «Más» (fin del tap→AccessDenied)', () => {
    mockUser = tenantAdmin([]);
    mountTabBar();
    expect(screen.queryByText('Vender')).toBeNull();
    expect(screen.queryByText('Recibir')).toBeNull();
    expect(screen.queryByText('Inventario')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
    // El acceso al sheet (INICIO + AYUDA) permanece.
    expect(screen.getByText('Más')).toBeTruthy();
  });

  it('tenant_admin CON membresía admin en una tienda: el menú NO se amplía (fin del visible-denied D1)', () => {
    mockUser = tenantAdmin([{ store_id: 's1', role: 'admin', status: 'active' }]);
    mountTabBar();
    expect(screen.queryByText('Vender')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
    expect(screen.getByText('Más')).toBeTruthy();
  });

  it('clerk: ve Vender y Caja; NO ve Inventario ni Recibir (el guard se los niega)', () => {
    mockUser = { id: 'c-1', role: 'clerk', roles: ['clerk'], memberships: [] };
    mountTabBar();
    expect(screen.getByText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
    expect(screen.queryByText('Inventario')).toBeNull();
    expect(screen.queryByText('Recibir')).toBeNull();
  });

  it('admin: los 4 tabs operativos se conservan (sin regresión de roles existentes)', () => {
    mockUser = { id: 'a-1', role: 'admin', roles: ['admin'], memberships: [] };
    mountTabBar();
    expect(screen.getByText('Vender')).toBeTruthy();
    expect(screen.getByText('Recibir')).toBeTruthy();
    expect(screen.getByText('Inventario')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
  });

  it('superadmin: idéntico a admin (normalización effectiveNavRole preservada)', () => {
    mockUser = { id: 'sa-1', role: 'superadmin', roles: ['superadmin'], memberships: [] };
    mountTabBar();
    expect(screen.getByText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
  });
});

describe('CP-ORG-003 F1 — MobileTabBar real: sheet «Más» por rol (D1)', () => {
  beforeEach(() => {
    mockUser = null;
    mockStores = [];
    switchStoreSpy.mockClear();
  });
  afterEach(() => cleanup());

  it('clerk con membresía admin: el sheet NO muestra entradas de SISTEMA aunque hasRole lo permita', () => {
    mockUser = {
      id: 'c-2', role: 'clerk', roles: ['clerk'],
      memberships: [{ store_id: 's1', role: 'admin', status: 'active' }],
    };
    mountTabBar();
    fireEvent.click(screen.getByText('Más'));
    // El sheet abre con los grupos del catálogo visible para clerk: AYUDA sí,
    // SISTEMA no (labels de sus ítems, p.ej. «Usuarios»/«Ajustes», ausentes).
    expect(screen.getByText('Más Opciones')).toBeTruthy();
    expect(screen.getByText('Centro de Ayuda')).toBeTruthy();
    expect(screen.queryByText('Usuarios')).toBeNull();
    expect(screen.queryByText('Organizaciones')).toBeNull();
  });

  it('tenant_admin puro: el sheet queda en Inicio + Centro de Ayuda', () => {
    mockUser = tenantAdmin([]);
    mountTabBar();
    fireEvent.click(screen.getByText('Más'));
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByText('Centro de Ayuda')).toBeTruthy();
    expect(screen.queryByText('Usuarios')).toBeNull();
  });
});

describe('CP-ORG-003 F1 — Escenario 7: cambio de tienda y persistencia del contexto', () => {
  beforeEach(() => {
    mockUser = null;
    mockStores = [
      { id: 's1', name: 'Sucursal Centro' },
      { id: 's2', name: 'Sucursal Norte' },
    ];
    switchStoreSpy.mockClear();
  });
  afterEach(() => cleanup());

  it('el selector de tiendas sigue disponible para quien tiene tiendas y NO depende del rol del menú', async () => {
    mockUser = { id: 'c-3', role: 'clerk', roles: ['clerk'], memberships: [] };
    mountTabBar();
    fireEvent.click(screen.getByText('Más'));
    // M-4: acceso rápido al selector (visible con >1 tienda, independiente
    // de la doctrina de navegación — la conmutación de tienda es de datos,
    // no de wayfinding). El sheet de tiendas abre tras un setTimeout(150).
    fireEvent.click(screen.getByText('Cambiar Sucursal'));
    expect(await screen.findByText('Sucursal Centro')).toBeTruthy();
    expect(screen.getByText('Sucursal Norte')).toBeTruthy();
  });

  it('elegir una tienda llama a switchStore con el id correcto (persistencia del contexto)', async () => {
    mockUser = { id: 'c-4', role: 'clerk', roles: ['clerk'], memberships: [] };
    mountTabBar();
    fireEvent.click(screen.getByText('Más'));
    fireEvent.click(screen.getByText('Cambiar Sucursal'));
    fireEvent.click(await screen.findByText('Sucursal Norte'));
    expect(switchStoreSpy).toHaveBeenCalledWith('s2');
  });

  it('cambiar la tienda activa NO altera la visibilidad de tabs ni sheet (lección CP-ORG-002 §6)', () => {
    mockUser = { id: 'c-5', role: 'clerk', roles: ['clerk'], activeStoreId: 's1', memberships: [] };
    const { rerender } = mountTabBar();
    expect(screen.getByText('Vender')).toBeTruthy();
    expect(screen.queryByText('Inventario')).toBeNull();

    // Misma sesión con OTRA tienda activa: visibilidad idéntica.
    mockUser = { id: 'c-5', role: 'clerk', roles: ['clerk'], activeStoreId: 's2', memberships: [] };
    rerender(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MobileTabBar, {
          navigationItems: [],
          currentView: 'dashboard',
          onViewChange: vi.fn(),
        }),
      ),
    );
    expect(screen.getByText('Vender')).toBeTruthy();
    expect(screen.queryByText('Inventario')).toBeNull();
    expect(screen.getByText('Caja')).toBeTruthy();
  });
});
