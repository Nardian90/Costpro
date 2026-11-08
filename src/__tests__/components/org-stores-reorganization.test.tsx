/**
 * CP-UX-ORG-STORES-001 — Tests de la reorganización Organizaciones / Gestión
 * de Tiendas.
 *
 * Cubre (misión §6):
 *  · Navegación: nuevos tabs del hub (Configuración | Resumen | Vitrina |
 *    Catálogo), default y migración de localStorage legacy ('kpis', 'stores').
 *  · Organizaciones → tab Tiendas monta StoresManagementView con el contexto
 *    de la organización (entrada directa con initialTab).
 *  · Separación de datos: el scoping llega al hook/API por organización y el
 *    banner de contexto identifica la empresa.
 *  · Configuración: la pestaña opera sobre la TIENDA ACTIVA con guards
 *    (sin tienda, tienda no disponible, solo lectura) y guardado vía
 *    useStoreEdit (el mismo camino que el resto del producto).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

// ── Estado configurable (antes de los mocks, vía vi.hoisted) ───────
const h = vi.hoisted(() => {
  return {
    testUser: {
      id: 'user-1',
      role: 'admin',
      activeStoreId: 'store-1' as string | null,
      memberships: [] as Array<{ store_id: string; role: string; status: string }>,
    },
    storesData: [] as any[],
    useStoresSpy: vi.fn(),
    editStoreWithFCSpy: vi.fn().mockResolvedValue(undefined),
    storesManagementProps: [] as any[],
    storeEditFormProps: [] as any[],
    // false → stub ligero (tests de cableado en OrganizationDetailModal);
    // true → delega en el componente REAL (tests de scoping del listado).
    useRealStoresManagement: false,
    setCurrentViewSpy: vi.fn(),
    setOrganizationDetailStateSpy: vi.fn(),
    orgRow: {
      id: 'org-1', name: 'Constructora del Este', owner_id: null, owner_name: null,
      plan: 'pro', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      stores_total: 2, stores_active: 2, users: 1,
    },
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'es',
}));

vi.mock('@/store', () => ({
  useAuthStore: (sel: any) => (sel ? sel({ user: h.testUser }) : { user: h.testUser }),
  useUIStore: (sel: any) => (sel ? sel({
    setCurrentView: h.setCurrentViewSpy,
    setOrganizationDetailState: h.setOrganizationDetailStateSpy,
    organizationDetailState: { orgId: null, tab: 'tiendas' },
  }) : { setCurrentView: h.setCurrentViewSpy, setOrganizationDetailState: h.setOrganizationDetailStateSpy }),
}));

vi.mock('@/hooks/ui/useMobile', () => ({ useIsMobile: () => false }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (r: any) => r({ data: [], error: null }) })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
  },
}));

vi.mock('@/hooks/api/useStores', () => ({
  useStores: (...args: any[]) => {
    h.useStoresSpy(...args);
    return { data: h.storesData, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useBulkStoreAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleStoreStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/api/useStoreUserCounts', () => ({ useStoreUserCounts: () => ({ data: {} }) }));
vi.mock('@/hooks/api/useMultiStoreDashboard', () => ({ useMultiStoreDashboard: () => ({ data: [] }) }));
vi.mock('@/hooks/api/useStoreHealth', () => ({ useStoreHealth: () => ({ data: undefined }) }));
vi.mock('@/hooks/ui/useStoreSwitcher', () => ({ useStoreSwitcher: () => ({ switchStore: vi.fn() }) }));
vi.mock('@/hooks/views/useStoreEdit', () => ({
  useStoreEdit: () => ({
    saveStoreCore: vi.fn(),
    saveFCTemplate: vi.fn(),
    deleteFCTemplate: vi.fn(),
    editStoreWithFC: h.editStoreWithFCSpy,
    invalidateStoreQueries: vi.fn(),
    invalidateFCsForStore: vi.fn(),
  }),
}));
vi.mock('@/hooks/api/useGlobalOperationDate', () => ({
  useGlobalOperationDate: () => ({ data: { maxDate: null }, isLoading: false }),
}));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false, bind: {} }),
}));

// Stubs de sub-vistas del hub (dinámicas). StoreSettingsView se monta REAL
// (sus dependencias ya están mockeadas); MultiStoreDashboard y las vistas
// ajenas a la misión van stub.
vi.mock('@/components/views/terminal/views/dashboard/MultiStoreDashboardView', () => ({
  default: () => <div data-testid="multi-store-dashboard-stub">MultiStoreDashboard</div>,
}));
vi.mock('@/components/views/terminal/views/stores/StorefrontConfigView', () => ({
  default: () => <div data-testid="storefront-stub">Storefront</div>,
}));
vi.mock('@/components/views/terminal/views/stores/StoreCatalogView', () => ({
  default: () => <div data-testid="catalog-stub">Catalog</div>,
}));

// StoresManagementView: stub de cableado O delegación al componente REAL
// (importOriginal) según el flag del test. El stub evita montar el grid con
// tarjetas en los tests que solo verifican el CABLEADO de props.
vi.mock('@/components/views/terminal/views/stores/StoresManagementView', async (importOriginal) => {
  const original = (await importOriginal()) as { default: React.ComponentType<any> };
  const Real = original.default;
  const Delegating = (props: any) => {
    h.storesManagementProps.push(props);
    if (h.useRealStoresManagement) return <Real {...props} />;
    return <div data-testid="stores-management-stub" data-org={props.organization?.id ?? ''} />;
  };
  return { default: Delegating };
});

// Stub del formulario de tienda (el componente REAL se prueba en
// store-edit-form.test.tsx): aquí interesa el CABLEADO (props/guardado).
vi.mock('@/components/views/terminal/views/stores/StoreEditForm', () => ({
  StoreEditForm: (props: any) => {
    h.storeEditFormProps.push(props);
    return (
      <button
        data-testid="store-edit-form-save"
        onClick={() => props.onSubmit({ name: 'Nuevo Nombre' })}
      >
        save
      </button>
    );
  },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const STORES_FIXTURE = [
  {
    id: 'store-1', name: 'Almacen Central', address: 'Calle 1', logo_url: null,
    is_active: true, is_archived: false, slug: 'almacen-central', plantilla: 'construccion',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'store-2', name: 'Tienda Este', address: 'Calle 2', logo_url: null,
    is_active: true, is_archived: false, slug: 'tienda-este', plantilla: 'moderna',
    created_at: '2026-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.useRealStoresManagement = false;
  h.setCurrentViewSpy.mockClear();
  h.setOrganizationDetailStateSpy.mockClear();
  h.storesManagementProps.length = 0;
  h.storeEditFormProps.length = 0;
  h.useStoresSpy.mockClear();
  h.editStoreWithFCSpy.mockClear();
  h.storesData = STORES_FIXTURE;
  h.testUser.role = 'admin';
  h.testUser.activeStoreId = 'store-1';
  h.testUser.memberships = [];
  if (typeof window !== 'undefined') {
    localStorage.removeItem('mgmt-hub-tab');
    localStorage.removeItem('mgmt-stores-view-mode');
  }
});

// ── 1 · Hub Gestión de Tiendas ──────────────────────────────────────

describe('ManagementHubView — tabs consolidados (CP-UX-ORG-STORES-003)', () => {
  const renderHub = async () => {
    const Hub = (await import('@/components/views/terminal/views/management_hub/ManagementHubView')).default;
    render(<Hub />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Secciones de Gestión' })).toBeDefined());
  };

  it('muestra Configuración | Vitrina | Catálogo — SIN tab Resumen y sin listado «Tiendas»', async () => {
    await renderHub();
    const labels = screen.getAllByRole('tab').map(t => t.textContent);
    expect(labels).toEqual(['Configuración', 'Vitrina', 'Catálogo']);
    expect(labels).not.toContain('Resumen');
    expect(labels).not.toContain('Tiendas');
  });

  it('el tab por defecto es Configuración (tienda activa) y monta StoreSettingsView', async () => {
    await renderHub();
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Configuración');
    await waitFor(() => expect(screen.getByTestId('store-edit-form-save')).toBeDefined());
  });

  it("migración legacy: 'kpis' aterriza en Configuración (el tablero consolidado salió de la navegación)", async () => {
    localStorage.setItem('mgmt-hub-tab', 'kpis');
    await renderHub();
    await waitFor(() => expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Configuración'));
    expect(localStorage.getItem('mgmt-hub-tab')).toBe('settings');
  });

  it("migración legacy: 'stores' aterriza en Configuración (contenido equivalente, con o sin modo persistido)", async () => {
    localStorage.setItem('mgmt-hub-tab', 'stores');
    localStorage.setItem('mgmt-stores-view-mode', 'summary');
    await renderHub();
    await waitFor(() => expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Configuración'));
    expect(localStorage.getItem('mgmt-hub-tab')).toBe('settings');
  });

  it("migración legacy: 'resumen' (hub fase 1) aterriza en Configuración", async () => {
    localStorage.setItem('mgmt-hub-tab', 'resumen');
    await renderHub();
    await waitFor(() => expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Configuración'));
    expect(localStorage.getItem('mgmt-hub-tab')).toBe('settings');
  });
});

// ── 2 · Organizaciones → Administración de la organización (CP-UX-ORG-STORES-003) ────

describe('Organizaciones — menú de tres puntos → Administración de la organización (CP-UX-ORG-STORES-003)', () => {
  vi.mock('@/hooks/api/useOrganizations', () => ({
    useOrganizations: () => ({
      data: {
        data: [h.orgRow],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        summary: { organizations: 1, active_organizations: 1, stores: 2, assigned_users: 1, unassigned_users: 0, scope: 'all' },
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(), isRefetching: false,
    }),
    useOrganizationDetail: (orgId: string | null) => ({
      data: orgId
        ? {
            organization: { ...h.orgRow, subscription_status: 'active', custom_domain: null, owner_name: null },
            stores: [
              { id: 'store-1', name: 'Almacen Central', slug: 'almacen-central', is_active: true, is_archived: false, created_at: '2026-01-01T00:00:00Z' },
              { id: 'store-2', name: 'Tienda Este', slug: 'tienda-este', is_active: true, is_archived: false, created_at: '2026-01-02T00:00:00Z' },
            ],
            users: [{ id: 'u1', full_name: 'Admin Uno', email: 'a@x.cu', role: 'admin', is_active: true }],
          }
        : undefined,
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    }),
    useDeleteOrganization: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useCreateOrganization: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useUpdateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useAssignUserOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }));

  const renderOrgList = async () => {
    const OrganizationsView = (await import('@/components/views/terminal/views/organizations/OrganizationsView')).default;
    render(<OrganizationsView />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Constructora del Este')).toBeDefined());
  };

  it('opción principal «Administración de la organización» navega a la página dedicada (tab tiendas)', async () => {
    await renderOrgList();
    await userEvent.click(screen.getByRole('button', { name: 'Opciones de Constructora del Este' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Administración de la organización' }));
    expect(h.setOrganizationDetailStateSpy).toHaveBeenCalledWith('org-1', 'tiendas');
    expect(h.setCurrentViewSpy).toHaveBeenCalledWith('organization-detail');
    expect(screen.queryByTestId('stores-management-stub')).toBeNull();
  });

  it('accesos directos «Tiendas» y «Clientes y Proveedores» abren la MISMA página en su pestaña', async () => {
    await renderOrgList();
    await userEvent.click(screen.getByRole('button', { name: 'Opciones de Constructora del Este' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Tiendas' }));
    expect(h.setOrganizationDetailStateSpy).toHaveBeenCalledWith('org-1', 'tiendas');
    await userEvent.click(screen.getByRole('button', { name: 'Opciones de Constructora del Este' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clientes y Proveedores' }));
    expect(h.setOrganizationDetailStateSpy).toHaveBeenCalledWith('org-1', 'terceros');
    expect(h.setCurrentViewSpy).toHaveBeenCalledWith('organization-detail');
  });

  it('la opción «Ver detalle» DESAPARECIÓ del menú (consolidación — sin segunda página administrativa)', async () => {
    await renderOrgList();
    await userEvent.click(screen.getByRole('button', { name: 'Opciones de Constructora del Este' }));
    expect(screen.queryByRole('menuitem', { name: 'Ver detalle' })).toBeNull();
    // Y no existe ninguna instancia del antiguo modal en el árbol renderizado
    expect(screen.queryByRole('tablist', { name: 'Secciones del detalle' })).toBeNull();
  });
});

// ── 3 · Pestaña Configuración (tienda activa) ───────────────────────

describe('StoreSettingsView — configuración de la SUCURSAL ACTIVA', () => {
  const renderSettings = async () => {
    const View = (await import('@/components/views/terminal/views/stores/StoreSettingsView')).default;
    return render(<View />, { wrapper: Wrapper });
  };

  it('carga los datos de la tienda ACTIVA en el formulario único', async () => {
    await renderSettings();
    await waitFor(() => expect(h.storeEditFormProps.length).toBeGreaterThan(0));
    expect(h.storeEditFormProps[0].store?.id).toBe('store-1');
    expect(h.storeEditFormProps[0].readOnly).toBe(false);
  });

  it('sin tienda activa: estado vacío + CTA a Organizaciones para admin', async () => {
    h.testUser.activeStoreId = null;
    await renderSettings();
    expect(await screen.findByText('settingsNoStore')).toBeDefined();
    expect(screen.getByText('settingsNoStoreAdminCta')).toBeDefined();
  });

  it('tienda activa no disponible (archivada/desactivada): estado dedicado con reintento', async () => {
    h.testUser.activeStoreId = 'store-404';
    await renderSettings();
    expect(await screen.findByText('settingsUnavailableStore')).toBeDefined();
  });

  it('sin canManageStore: modo solo lectura (banner + formulario deshabilitado)', async () => {
    h.testUser.role = 'clerk';
    h.testUser.memberships = [{ store_id: 'store-1', role: 'clerk', status: 'active' }];
    await renderSettings();
    expect(await screen.findByText('settingsReadOnly')).toBeDefined();
    await waitFor(() => expect(h.storeEditFormProps.length).toBeGreaterThan(0));
    expect(h.storeEditFormProps[0].readOnly).toBe(true);
  });

  it('guardado: usa el camino compartido useStoreEdit.editStoreWithFC con la tienda activa', async () => {
    await renderSettings();
    const save = await screen.findByTestId('store-edit-form-save');
    await userEvent.click(save);
    await waitFor(() => expect(h.editStoreWithFCSpy).toHaveBeenCalled());
    expect(h.editStoreWithFCSpy.mock.calls[0][0]).toBe('store-1');
    expect(h.editStoreWithFCSpy.mock.calls[0][1]).toEqual({ name: 'Nuevo Nombre' });
  });
});

// ── 4 · StoresManagementView scoped por organización ────────────────

describe('StoresManagementView — scoping por organización', () => {
  it('con prop organization: pide las tiendas de ESA organización y muestra el banner de contexto', async () => {
    h.useRealStoresManagement = true;
    const View = (await import('@/components/views/terminal/views/stores/StoresManagementView')).default;
    render(<View organization={{ id: 'org-1', name: 'Org Uno' }} />, { wrapper: Wrapper });
    await waitFor(() => expect(h.useStoresSpy).toHaveBeenCalled());
    const args = h.useStoresSpy.mock.calls[0];
    expect(args[4]).toBe('org-1'); // organizationId → query key + GET ?organization_id
    expect(screen.getByRole('note', { name: /Tiendas de la organización Org Uno/ })).toBeDefined();
    expect(screen.getByText('Org Uno')).toBeDefined();
  });

  it('sin prop organization: comportamiento legacy intacto (sin filtro, sin banner)', async () => {
    h.useRealStoresManagement = true;
    const View = (await import('@/components/views/terminal/views/stores/StoresManagementView')).default;
    render(<View />, { wrapper: Wrapper });
    await waitFor(() => expect(h.useStoresSpy).toHaveBeenCalled());
    expect(h.useStoresSpy.mock.calls[0][4]).toBeUndefined();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('organización sin tiendas: estado vacío con mensaje específico del contexto', async () => {
    h.useRealStoresManagement = true;
    h.storesData = [];
    const View = (await import('@/components/views/terminal/views/stores/StoresManagementView')).default;
    render(<View organization={{ id: 'org-2', name: 'Org Vacía' }} />, { wrapper: Wrapper });
    expect(await screen.findByText('Esta organización no tiene tiendas')).toBeDefined();
    expect(screen.getByText('Crea la primera tienda con las acciones de arriba')).toBeDefined();
  });
});
