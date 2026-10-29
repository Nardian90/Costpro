/**
 * CP-CAT-MAESTRO-002 — Fase 2/4: contrato de los hooks nuevos de gobernanza
 * y creación con identidad compartida.
 *
 * Verifica:
 *  · useOrgCatalogLinks consulta catalog_store_links con tenant_id exacto.
 *  · useIsCatalogGovernor delega en is_catalog_governor y falla cerrado
 *    (error ⇒ false; sin capacidad no se muestran acciones de gobierno).
 *  · useCreateMasterProduct llama create_master_product con el payload
 *    mapeado (valores comerciales locales como defaults de la tienda).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const TENANT = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f';
const USER = '11111111-2222-4333-8444-555555555555';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (t: string) => fromMock(t),
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('CP-CAT-MAESTRO-002 — gobernanza (hooks)', () => {
  it('useOrgCatalogLinks consulta catalog_store_links de la organización', async () => {
    const { useOrgCatalogLinks } = await import('@/hooks/api/useMasterCatalog');
    const eqMock = vi.fn().mockResolvedValue({ data: [{ id: 'l1', store_id: STORE, status: 'connected', tenant_id: TENANT, connected_at: null, disconnected_at: null, reason: null }], error: null });
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });
    const { result } = renderHook(() => useOrgCatalogLinks(TENANT), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith('catalog_store_links');
    expect(result.current.data).toHaveLength(1);
  });

  it('useIsCatalogGovernor delega en la RPC con parámetros exactos', async () => {
    const { useIsCatalogGovernor } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useIsCatalogGovernor(TENANT, USER), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('is_catalog_governor', { p_tenant_id: TENANT, p_user_id: USER });
    expect(result.current.data).toBe(true);
  });

  it('useIsCatalogGovernor falla CERRADO: error de la RPC ⇒ false', async () => {
    const { useIsCatalogGovernor } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useIsCatalogGovernor(TENANT, USER), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });
});

describe('CP-CAT-MAESTRO-002 — alta con identidad compartida (§4.3)', () => {
  it('useCreateMasterProduct llama create_master_product con el payload mapeado', async () => {
    const { useCreateMasterProduct } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: { status: 'success', master_product_id: 'm1', product_id: 'p1', sku: 'SKU-1' }, error: null });
    const { result } = renderHook(() => useCreateMasterProduct(STORE), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        sku: 'SKU-1',
        name: 'Producto de prueba',
        description: null,
        barcode: null,
        barcode_type: null,
        unit_of_measure: 'unidad',
        is_service: false,
        local: { price: 150.5, price_currency: 'CUP', cost_price: 90, min_stock: 2, category: 'General', supplier: '' },
      });
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('create_master_product');
    expect(args.p_store_id).toBe(STORE);
    expect(args.p_sku).toBe('SKU-1');
    expect(args.p_name).toBe('Producto de prueba');
    expect(args.p_is_service).toBe(false);
    // Los valores comerciales llegan como strings por defecto de ESTA tienda
    expect(args.p_local.price).toBe('150.5');
    expect(args.p_local.price_currency).toBe('CUP');
    expect(args.p_local.cost_price).toBe('90');
    expect(args.p_local.min_stock).toBe('2');
    expect(args.p_local.category).toBe('General');
  });

  it('useCreateMasterProduct propaga el error de carrera ERR_MASTER_SKU_EXISTS', async () => {
    const { useCreateMasterProduct } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ERR_MASTER_SKU_EXISTS: 8a54…' } });
    const { result } = renderHook(() => useCreateMasterProduct(STORE), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({
        sku: 'SKU-1', name: 'X',
      })).rejects.toThrow('ERR_MASTER_SKU_EXISTS');
    });
  });
});
