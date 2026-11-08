/**
 * CP-UX-ORG-STORES-002 — Página DEDICADA de administración de organización.
 *
 * Sustituye el acceso por modal (misión §2.A): acción «Tiendas» del menú de
 * tres puntos → vista 'organization-detail' con pestañas Tiendas |
 * Clientes y Proveedores. Ambas pestañas REUTILIZAN los módulos existentes
 * (StoresManagementView scoped server-side; ClientesProveedoresView con
 * tienda ancla). Contexto sin datos residuales y estados de guardia:
 * organización no encontrada / fuera de alcance / rol sin permiso / org
 * sin tiendas en la pestaña de terceros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => {
  return {
    testUser: { id: 'user-1', role: 'admin', activeStoreId: 'store-1', memberships: [] as any[] },
    // Fake reactivo del slice de UI: el mock selector-based de zustand no
    // notifica re-render — los setters mutan y disparan los listeners.
    uiState: {
      currentView: 'organization-detail',
      organizationDetailState: { orgId: 'org-1' as string | null, tab: 'tiendas' as 'tiendas' | 'terceros' },
    },
    listeners: new Set<() => void>(),
    setCurrentViewSpy: vi.fn(),
    setOrganizationDetailTabSpy: vi.fn(),
    setOrganizationDetailStateSpy: vi.fn(),
    detailSpy: vi.fn(),
    storesManagementProps: [] as any[],
    partiesProps: [] as any[],
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel: any) => (sel ? sel({ user: h.testUser }) : { user: h.testUser }),
  useUIStore: (sel: any) => {
    const [, bump] = React.useState(0);
    React.useEffect(() => {
      const listener = () => bump((v: number) => v + 1);
      h.listeners.add(listener);
      return () => { h.listeners.delete(listener); };
    }, []);
    const state = {
      currentView: h.uiState.currentView,
      organizationDetailState: h.uiState.organizationDetailState,
      setCurrentView: h.setCurrentViewSpy,
      setOrganizationDetailTab: (tab: 'tiendas' | 'terceros') => {
        h.uiState.organizationDetailState = { ...h.uiState.organizationDetailState, tab };
        h.setOrganizationDetailTabSpy(tab);
        h.listeners.forEach(l => l());
      },
      setOrganizationDetailState: (orgId: string | null, tab: 'tiendas' | 'terceros' = 'tiendas') => {
        h.uiState.organizationDetailState = { orgId, tab };
        h.setOrganizationDetailStateSpy(orgId, tab);
        h.listeners.forEach(l => l());
      },
    };
    return sel ? sel(state) : state;
  },
}));

vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));

vi.mock('@/hooks/api/useOrganizations', () => ({
  useOrganizationDetail: (orgId: string | null) => {
    h.detailSpy(orgId);
    if (orgId === 'org-empty') {
      return {
        data: {
          organization: { id: 'org-empty', name: 'Org Sin Tiendas', owner_id: null, owner_name: null, plan: 'free', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', stores_total: 0, stores_active: 0, users: 0, subscription_status: 'active', custom_domain: null },
          stores: [],
          users: [],
        },
        isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false,
      };
    }
    return orgId === 'org-404'
      ? { data: undefined, isLoading: false, isError: true, error: new Error('Organización no encontrada'), refetch: vi.fn(), isFetching: false }
      : orgId
        ? {
            data: {
              organization: {
                id: 'org-1', name: 'Constructora del Este', owner_id: null, owner_name: null,
                plan: 'pro', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
                stores_total: 3, stores_active: 2, users: 1, subscription_status: 'active', custom_domain: null,
              },
              stores: [
                { id: 'store-1', name: 'Almacen Central', slug: null, is_active: true, is_archived: false, created_at: '2026-01-01T00:00:00Z', classifier_connected: false },
                { id: 'store-2', name: 'Tienda Conectada', slug: null, is_active: true, is_archived: false, created_at: '2026-01-02T00:00:00Z', classifier_connected: true },
                { id: 'store-3', name: 'Tienda Pausada', slug: null, is_active: false, is_archived: false, created_at: '2026-01-03T00:00:00Z', classifier_connected: true },
              ],
              users: [{ id: 'u1', full_name: 'Admin Uno', email: 'a@x.cu', role: 'admin', is_active: true }],
            },
            isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false,
          }
        : { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false };
  },
}));

vi.mock('@/components/views/terminal/views/stores/StoresManagementView', () => ({
  default: (props: any) => {
    h.storesManagementProps.push(props);
    return <div data-testid="stores-management-stub" data-org={props.organization?.id ?? ''} />;
  },
}));

vi.mock('@/components/views/terminal/views/classifier/ClientesProveedoresView', () => ({
  ClientesProveedoresView: (props: any) => {
    h.partiesProps.push(props);
    return <div data-testid="parties-stub" data-store={props.storeId ?? ''} />;
  },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const renderPage = async () => {
  const Page = (await import('@/components/views/terminal/views/organizations/OrganizationAdminPage')).default;
  render(<Page />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByRole('tablist', { name: 'Secciones de la organización' })).toBeDefined());
};

beforeEach(() => {
  vi.clearAllMocks();
  h.storesManagementProps.length = 0;
  h.partiesProps.length = 0;
  h.uiState.currentView = 'organization-detail';
  h.uiState.organizationDetailState = { orgId: 'org-1', tab: 'tiendas' };
  h.testUser.role = 'admin';
});

describe('OrganizationAdminPage — página dedicada de la organización', () => {
  it('identifica la organización en el encabezado (nombre, estado, plan, tiendas) y abre el tab Tiendas por defecto', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: /Constructora del Este/ })).toBeDefined();
    expect(screen.getByText('Activa')).toBeDefined();
    expect(screen.getByText('pro')).toBeDefined();
    expect(screen.getByText('3 tienda(s)')).toBeDefined();
    // Tab inicial: Tiendas (entrada principal desde el menú de la organización)
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Tiendas');
    await waitFor(() => expect(screen.getByTestId('stores-management-stub')).toBeDefined());
    expect(h.storesManagementProps[0].organization).toEqual({ id: 'org-1', name: 'Constructora del Este' });
  });

  it('pestaña Clientes y Proveedores: monta el módulo con la TIENDA ANCLA conectada al catálogo', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Clientes y Proveedores' }));
    await waitFor(() => expect(screen.getByTestId('parties-stub')).toBeDefined());
    // Ancla = tienda ACTIVA CONECTADA (store-2), no la primera ni la pausada
    expect(h.partiesProps[0].storeId).toBe('store-2');
    // El contexto operativo queda identificado en la página
    expect(screen.getByText(/contexto operativo:/)).toBeDefined();
  });

  it('organización SIN tiendas: estado vacío con CTA a la pestaña Tiendas', async () => {
    h.uiState.organizationDetailState = { orgId: 'org-empty', tab: 'terceros' };
    await renderPage();
    expect(await screen.findByText('Esta organización no tiene tiendas')).toBeDefined();
    expect(screen.getByText(/El Clasificador Maestro de terceros se ancla/)).toBeDefined();
    // El CTA lleva a la pestaña donde se crean tiendas
    await userEvent.click(screen.getByRole('button', { name: /Ir a la pestaña Tiendas/ }));
    await waitFor(() => expect(screen.getByTestId('stores-management-stub')).toBeDefined());
  });

  it('organización no encontrada / fuera de alcance: error con reintento y retorno al listado', async () => {
    h.uiState.organizationDetailState = { orgId: 'org-404', tab: 'tiendas' };
    const Page = (await import('@/components/views/terminal/views/organizations/OrganizationAdminPage')).default;
    render(<Page />, { wrapper: Wrapper });
    expect(await screen.findByText('No se pudo cargar la organización')).toBeDefined();
    expect(screen.getByText(/Organización no encontrada/)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: /Volver a Organizaciones/ }));
    expect(h.setCurrentViewSpy).toHaveBeenCalledWith('organizations');
  });

  it('usuario sin permiso de administración: estado «No autorizado» (la API además responde 403/404)', async () => {
    h.testUser.role = 'clerk';
    const Page = (await import('@/components/views/terminal/views/organizations/OrganizationAdminPage')).default;
    render(<Page />, { wrapper: Wrapper });
    expect(await screen.findByText('No autorizado')).toBeDefined();
    // El detalle nunca se consulta sin autorización de administrador
    expect(h.detailSpy).not.toHaveBeenCalledWith('org-1');
    // Y la vista redirige al listado (que para ese rol no es accesible)
    expect(h.setCurrentViewSpy).toHaveBeenCalledWith('organizations');
  });

  it('cambio de organización: la query del detalle se re-resuelve con la NUEVA org (sin datos residuales)', async () => {
    const Page = (await import('@/components/views/terminal/views/organizations/OrganizationAdminPage')).default;
    const first = render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(h.detailSpy).toHaveBeenLastCalledWith('org-1'));
    first.unmount();
    // El contexto del store cambia (así lo hace el menú de la lista)
    h.uiState.organizationDetailState = { orgId: 'org-9', tab: 'terceros' };
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(h.detailSpy).toHaveBeenLastCalledWith('org-9'));
  });

  it('cambio de pestaña: actualiza el contexto (que la URL sincroniza) sin re-consultar la organización', async () => {
    await renderPage();
    const callsBefore = h.detailSpy.mock.calls.length;
    await userEvent.click(screen.getByRole('tab', { name: 'Clientes y Proveedores' }));
    expect(h.setOrganizationDetailTabSpy).toHaveBeenCalledWith('terceros');
    expect(screen.getByTestId('parties-stub')).toBeDefined();
    // La misma query del detalle sirve a ambas pestañas (header + tiendas + ancla):
    // TODAS las resoluciones del hook son para la MISMA organización — el
    // contexto no se desincroniza y la caché (['organization-detail', orgId])
    // evita consultas nuevas al cambiar de pestaña.
    expect(new Set(h.detailSpy.mock.calls.map(c => c[0]))).toEqual(new Set(['org-1']));
  });
});
