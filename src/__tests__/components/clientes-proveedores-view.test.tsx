/**
 * CP-UX-ORG-STORES-002 — Primera batería de tests del módulo «Clientes y
 * Proveedores» (Clasificador Maestro de terceros; el módulo no tenía NINGÚN
 * test propio antes de esta misión).
 *
 * Contrato verificado:
 *  · Sin prop (acceso OPERACIÓN desde TerminalShell): opera sobre la TIENDA
 *    ACTIVA del usuario — comportamiento intacto.
 *  · Con prop storeId (pestaña de la página dedicada de una organización):
 *    opera sobre esa tienda ANCLA — misma fuente de datos (hooks/RPCs que ya
 *    parametrizan por storeId y derivan el tenant server-side), cero
 *    duplicación de lógica.
 *  · Gate de conexión: el alta requiere tienda conectada al catálogo maestro
 *    (party_store_links) — el botón Nuevo se deshabilita con pista de acción.
 *  · Listado: filas maestro/local con badges y contador real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  return {
    testUser: { id: 'user-1', role: 'admin', activeStoreId: 'store-active', memberships: [] as any[] },
    linkState: { status: 'connected' } as { status: string } | undefined,
    linkSpy: vi.fn(),
    searchSpy: vi.fn(),
    createConnectSpy: vi.fn(),
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
}));

vi.mock('@/hooks/api/useClassifier', () => ({
  usePartyStoreLink: (storeId: string | null) => {
    h.linkSpy(storeId);
    return { data: h.linkState, isLoading: false };
  },
  useSearchMasterParties: (storeId: string | null, search: string, kind: string, status: string) => {
    h.searchSpy(storeId, search, kind, status);
    return {
      data: PARTY_FIXTURE,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    };
  },
  usePartyChangeLog: () => ({ data: [], isLoading: false }),
  useCreateMasterParty: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMasterParty: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMasterParty: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateMasterParty: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConnectStoreClassifier: () => ({ mutateAsync: h.createConnectSpy, isPending: false }),
  useDisconnectStoreClassifier: () => ({ mutateAsync: vi.fn(), isPending: false }),
  partyClassification: (p: { is_client: boolean; is_supplier: boolean }) =>
    p.is_client && p.is_supplier ? 'ambos' : p.is_client ? 'cliente' : 'proveedor',
  translateClassifierError: (e: unknown) => String(e),
}));

const PARTY_FIXTURE = [
  {
    id: 'mp-1', master_party_id: 'mp-1', source: 'master', tenant_id: 'org-1',
    code: 'CP-0001', name: 'Materiales del Este', tax_id: '12345678901',
    is_client: true, is_supplier: false, status: 'active',
    classification: 'cliente', address: 'Calle 1', phone: '56561111', email: 'm@x.cu',
    linked_customer_id: 'c-1', linked_supplier_id: null,
  },
  {
    id: 'c-9', master_party_id: null, source: 'local', tenant_id: 'org-1',
    code: null, name: 'Cliente Local Tienda', tax_id: null,
    is_client: true, is_supplier: false, status: 'active',
    classification: 'cliente', address: null, phone: null, email: null,
    linked_customer_id: 'c-9', linked_supplier_id: null,
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const renderView = async (props: { storeId?: string | null } = {}) => {
  const { ClientesProveedoresView } = await import('@/components/views/terminal/views/classifier/ClientesProveedoresView');
  render(<ClientesProveedoresView {...props} />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Clientes y Proveedores' })).toBeDefined());
};

beforeEach(() => {
  vi.clearAllMocks();
  h.linkState = { status: 'connected' };
  h.testUser.activeStoreId = 'store-active';
});

describe('ClientesProveedoresView — módulo único con dos contextos de acceso', () => {
  it('acceso OPERACIÓN (sin prop): opera sobre la TIENDA ACTIVA del usuario', async () => {
    await renderView();
    expect(h.linkSpy).toHaveBeenCalledWith('store-active');
    expect(h.searchSpy).toHaveBeenCalledWith('store-active', '', 'all', 'active');
  });

  it('contexto ORGANIZATIVO (con prop storeId): opera sobre la tienda ancla — misma fuente de datos', async () => {
    await renderView({ storeId: 'store-anchor' });
    expect(h.linkSpy).toHaveBeenCalledWith('store-anchor');
    expect(h.searchSpy).toHaveBeenCalledWith('store-anchor', '', 'all', 'active');
  });

  it('tienda ancla conectada: botón Nuevo habilitado y conexión visible', async () => {
    await renderView({ storeId: 'store-anchor' });
    const nuevo = screen.getByRole('button', { name: /Nuevo/ }) as HTMLButtonElement;
    expect(nuevo.disabled).toBe(false);
    expect(screen.getAllByText(/conectada al Clasificador|Maestro compartido/i).length).toBeGreaterThan(0);
  });

  it('tienda ancla NO conectada: Nuevo deshabilitado con pista de acción (sin fingir alcance)', async () => {
    h.linkState = { status: 'disconnected' };
    await renderView({ storeId: 'store-anchor' });
    const nuevo = screen.getByRole('button', { name: /Nuevo/ }) as HTMLButtonElement;
    expect(nuevo.disabled).toBe(true);
    expect(nuevo.getAttribute('title')).toMatch(/Conecta la tienda/i);
  });

  it('listado: filas maestro y local con badges de origen y contador real', async () => {
    await renderView({ storeId: 'store-anchor' });
    // Tabla (desktop) y cards (móvil) renderizan en el DOM → getAllByText
    expect(screen.getAllByText('Materiales del Este').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cliente Local Tienda').length).toBeGreaterThan(0);
    expect(screen.getByText(/2 registro\(s\)/)).toBeDefined();
    const masterBadges = screen.getAllByText('Maestro');
    const localBadges = screen.getAllByText('Local');
    expect(masterBadges.length).toBeGreaterThan(0);
    expect(localBadges.length).toBeGreaterThan(0);
  });

  it('filtro por tipo: la búsqueda server-side recibe el kind seleccionado', async () => {
    await renderView({ storeId: 'store-anchor' });
    await userEvent.click(screen.getByRole('button', { name: /Clientes/i }));
    await waitFor(() => {
      const last = h.searchSpy.mock.calls[h.searchSpy.mock.calls.length - 1];
      expect(last[2]).toBe('client');
      expect(last[0]).toBe('store-anchor'); // el contexto se mantiene en cada re-consulta
    });
  });
});
