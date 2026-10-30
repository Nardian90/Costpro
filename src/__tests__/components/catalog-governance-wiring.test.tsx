/**
 * CP-CAT-MAESTRO-002 — Fase 2/4: cableado del panel de gobernanza del catálogo
 * (pestaña «Catálogo» del detalle de Organización) y del alta con identidad
 * compartida en CreateProductModal.
 *
 * Verificación de operación (render real con hooks simulados):
 *  · Gobernador: ve botones Conectar/Desconectar y la acción delega en la
 *    mutación correcta con el id de la tienda (la RPC revalida en servidor).
 *  · No gobernador: NO ve acciones de gobierno (capa de presentación) — el
 *    control real es fail-closed en el servidor (cubierto por las RPC).
 *  · Propuestas pendientes: Aprobar/Rechazar delegan en review_master_proposal.
 *  · Cableado estático: OrganizationDetailModal monta la sección con la
 *    pestaña «Catálogo»; CreateProductModal crea maestro al estar conectada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ORG = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
const USER = '11111111-2222-4333-8444-555555555555';
const STORE_A = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const STORE_B = '7e6fe821-5465-48b1-b3f1-3aa3182edc39';

const connectMutate = vi.fn();
const disconnectMutate = vi.fn();
const reviewMutate = vi.fn();

let isGovernorValue = true;
let linksValue: Array<{ store_id: string; status: string; connected_at: string | null }>;

vi.mock('@/store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: USER } }),
  useUIStore: () => ({}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

vi.mock('@/hooks/api/useMasterCatalog', async (importOriginal) => {
  void importOriginal;
  return {
    useOrgCatalogLinks: () => ({ data: linksValue, isLoading: false }),
    useIsCatalogGovernor: () => ({ data: isGovernorValue, isLoading: false }),
    useConnectStoreCatalog: () => ({ mutateAsync: connectMutate, isPending: false }),
    useDisconnectStoreCatalog: () => ({ mutateAsync: disconnectMutate, isPending: false }),
    useOrgMasterProducts: () => ({
      data: [
        { id: 'm1', sku: 'SKU-1', name: 'Producto A', image_path: null, barcode: null, unit_of_measure: 'unidad', is_service: false, status: 'active', created_at: null },
      ],
      isLoading: false,
    }),
    useMasterProposals: () => ({
      data: [
        { id: 'pr1', master_product_id: 'm1', tenant_id: ORG, changes: { name: 'Nombre propuesto' }, status: 'pending', review_note: null, created_at: new Date().toISOString() },
      ],
    }),
    useReviewMasterProposal: () => ({ mutateAsync: reviewMutate, isPending: false }),
    useUpdateMasterProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('@/lib/utils', () => ({ getSupabaseUrl: () => null, cn: (...a: unknown[]) => a.join(' ') }));

import { CatalogGovernanceSection } from '@/components/views/terminal/views/organizations/CatalogGovernanceSection';

const STORIES = [
  { id: STORE_A, name: 'ENERVIDA de prueba', is_active: true, is_archived: false },
  { id: STORE_B, name: 'Sucursal de prueba', is_active: true, is_archived: false },
];

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogGovernanceSection orgId={ORG} stores={STORIES} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  connectMutate.mockReset().mockResolvedValue({ status: 'success' });
  disconnectMutate.mockReset().mockResolvedValue({ status: 'success' });
  reviewMutate.mockReset().mockResolvedValue({ status: 'success', decision: 'approved' });
  isGovernorValue = true;
  linksValue = [{ store_id: STORE_A, status: 'connected', connected_at: null }];
});

describe('CatalogGovernanceSection — operaciones de gobernanza', () => {
  it('gobernador: conecta una tienda no conectada y delega el id correcto en la mutación', async () => {
    renderSection();
    const btn = screen.getByRole('button', { name: /Conectar Sucursal de prueba al catálogo/ });
    fireEvent.click(btn);
    await waitFor(() => expect(connectMutate).toHaveBeenCalledWith(STORE_B));
  });

  it('gobernador: desconecta pidiendo confirmación (datos locales intactos)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Desconectar ENERVIDA de prueba del catálogo/ }));
    await waitFor(() => expect(disconnectMutate).toHaveBeenCalledWith({ storeId: STORE_A }));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('NO gobernador: no ve acciones de gobierno (ni conectar, ni editar, ni revisar)', () => {
    isGovernorValue = false;
    renderSection();
    expect(screen.queryByRole('button', { name: /Conectar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desconectar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Aprobar propuesta/ })).toBeNull();
    expect(screen.getByText(/Solo lectura/i)).toBeTruthy();
    cleanup();
  });

  it('gobernador: revisa propuestas (aprobar delega en review_master_proposal)', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar propuesta' }));
    await waitFor(() => expect(reviewMutate).toHaveBeenCalledWith({ proposalId: 'pr1', decision: 'approved' }));
  });

  it('muestra el estado de conexión por tienda (conectada / sin conexión)', () => {
    renderSection();
    expect(screen.getByText(/Conectada desde/)).toBeTruthy();
    expect(screen.getByText(/Sin conexión al catálogo maestro/)).toBeTruthy();
  });
});

describe('Cableado estático — integración en la aplicación', () => {
  it('OrganizationDetailModal incluye la pestaña Catálogo y monta la sección de gobernanza', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/views/terminal/views/organizations/OrganizationDetailModal.tsx'), 'utf8');
    expect(s).toMatch(/id: 'catalogo', label: 'Catálogo'/);
    expect(s).toMatch(/<CatalogGovernanceSection orgId=\{org\.id\}/);
  });

  it('CreateProductModal crea identidad compartida cuando la tienda está conectada', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/modals/CreateProductModal.tsx'), 'utf8');
    expect(s).toMatch(/useCreateMasterProduct/);
    expect(s).toMatch(/if \(storeConnected\)/);
    expect(s).toMatch(/createMasterProduct\.mutateAsync/);
    // El flujo legacy se conserva para tiendas no conectadas (fail-open)
    expect(s).toMatch(/createProductMutation\.mutateAsync/);
    // El dedup previo por SKU se conserva (§4.3: si existe, se activa, no se duplica)
    expect(s).toMatch(/findMasterBySku/);
  });

  it('MasterCatalogModal muestra la imagen compartida por referencia', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/modals/MasterCatalogModal.tsx'), 'utf8');
    expect(s).toMatch(/getSupabaseUrl\('product-images', m\.image_path\)/);
  });

  it('catalog-service no elimina archivos aún referenciados (GC compartido)', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/services/catalog-service.ts'), 'utf8');
    expect(s).toMatch(/master_products'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('image_path', previousFileName\)/);
    expect(s).toMatch(/imagen compartida/);
  });
});
