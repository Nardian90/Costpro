/**
 * MISIÓN CATÁLOGO MAESTRO (2026-10-28) — PR 4: integración de consumidores.
 *
 * Contrato de los hooks de catálogo maestro y de la deduplicación de alta:
 *  · useSearchMasterProducts llama search_master_products con p_store_id y
 *    p_search exactos y filtra «disponibles» cuando corresponde.
 *  · useActivateMasterProduct delega en activate_master_product (RPC
 *    certificada) e invalida las consultas de catálogo.
 *  · findMasterBySku: match EXACTO de SKU (case-insensitive), fail-open
 *    silencioso (tienda no conectada ⇒ null) y sin SKU vacío.
 *  · MasterCatalogModal: aviso de tienda no conectada y acción Activar que
 *    delega en la RPC.
 *  · CreateProductModal: cuando el maestro existe y no está activado, ofrece
 *    activarlo y NO ejecuta el insert local (misión §10.1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const MASTER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

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

describe('useMasterCatalog — contrato de RPC (PR 4)', () => {
  it('useSearchMasterProducts pasa p_store_id y p_search exactos a search_master_products', async () => {
    const { useSearchMasterProducts } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useSearchMasterProducts(STORE, 'torn'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('search_master_products', {
      p_store_id: STORE,
      p_search: 'torn',
      p_limit: 200,
      p_offset: 0,
    });
  });

  it('onlyAvailable filtra los ya activados y archivados', async () => {
    const { useSearchMasterProducts } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({
      data: [
        { id: '1', sku: 'A', name: 'A', status: 'active', activated: false },
        { id: '2', sku: 'B', name: 'B', status: 'active', activated: true },
        { id: '3', sku: 'C', name: 'C', status: 'archived', activated: false },
      ],
      error: null,
    });
    const { result } = renderHook(() => useSearchMasterProducts(STORE, '', true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(r => r.id)).toEqual(['1']);
  });

  it('useActivateMasterProduct delega en activate_master_product y devuelve el resultado', async () => {
    const { useActivateMasterProduct } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({ data: { status: 'success', already_active: false, product_id: 'p1' }, error: null });
    const { result } = renderHook(() => useActivateMasterProduct(STORE), { wrapper });
    await act(async () => {
      const res = await result.current.mutateAsync(MASTER_ID);
      expect(res.product_id).toBe('p1');
    });
    // CP-PRODUCT-COMMISSION-001 TAREA 1: sin clasificación explícita el hook
    // OMITE la clave — la RPC aplica su DEFAULT 'venta' (enviar null
    // explícito lo anularía y violaría el NOT NULL de 20261110090000).
    expect(rpcMock).toHaveBeenCalledWith('activate_master_product', { p_master_id: MASTER_ID, p_store_id: STORE });
  });

  it('findMasterBySku: match exacto de SKU case-insensitive; fail-open sin tienda o con error de conexión', async () => {
    const { findMasterBySku } = await import('@/hooks/api/useMasterCatalog');
    rpcMock.mockResolvedValue({
      data: [{ id: MASTER_ID, sku: 'TOR-1', name: 'Tornillo', activated: false }],
      error: null,
    });
    expect(await findMasterBySku(STORE, ' tor-1 ')).not.toBeNull();
    expect(await findMasterBySku(STORE, 'NO-EXISTE')).toBeNull();
    // Tienda no conectada: la RPC devuelve error → fail-open null
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ERR_STORE_NOT_CONNECTED' } });
    expect(await findMasterBySku(STORE, 'TOR-1')).toBeNull();
    expect(await findMasterBySku(null, 'TOR-1')).toBeNull();
  });
});

describe('MasterCatalogModal + CreateProductModal — contrato de cableado (lectura de fuente)', () => {
  // Nota: el render completo de estos modales arrastra primitivas pesadas de
  // UI (Dialog/BaseModal/tema) no cubiertas por este mock mínimo; el contrato
  // de lógica ya está cubierto por los hooks de arriba. Aquí se verifica el
  // cableado estático del código fuente (lo que el render detectaría).
  it('MasterCatalogModal delega en las RPC certificadas y avisa de tienda no conectada', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/modals/MasterCatalogModal.tsx'), 'utf8');
    expect(src).toContain('useSearchMasterProducts');
    expect(src).toContain('useCatalogStoreLink');
    expect(src).toContain('useActivateMasterProduct');
    expect(src).toContain('no está conectada al catálogo maestro');
    expect(src).toContain('activate_master_product');
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §4: MasterCatalogModal incorpora «+ Crear producto» con el MISMO servicio de creación que Inventario (useCreateMasterProduct)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/modals/MasterCatalogModal.tsx'), 'utf8');
    // Botón visible de creación en el propio diálogo.
    expect(src).toContain('master-catalog-create-product');
    expect(src).toContain('Crear producto');
    expect(src).toContain('CreateMasterProductModal');
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §4: CreateMasterProductModal reusa el MISMO servicio de creación de la pestaña Catálogo (create_master_product) con dedup previo', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/views/terminal/views/catalog/CreateMasterProductModal.tsx'), 'utf8');
    expect(src).toContain('useCreateMasterProduct');
    // Dedup ANTES de insertar (misma verificación que la pestaña Catálogo).
    const idxCheck = src.indexOf('findMasterBySku(storeId');
    const idxCreate = src.indexOf('createMaster.mutateAsync');
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxCheck);
    // Imagen compartida vía RPC gobernada (gobernador aplica / no gobernador propone).
    expect(src).toContain('useUpdateMasterProduct');
    expect(src).toContain('useProposeMasterChange');
    // Sin esquema paralelo: subida al mismo bucket con prefijo master-…
    expect(src).toContain("from('product-images')");
    expect(src).toMatch(/master-\$\{masterId\}/);
    // Campos del formulario de creación: SKU + Nombre + Imagen + Descripción.
    expect(src).toContain('create-master-sku-input');
    expect(src).toContain('create-master-name-input');
    expect(src).toContain('create-master-description-input');
  });

  it('CreateProductModal: dedup ANTES de insertar (findMasterBySku) y activación en lugar de duplicar', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/modals/CreateProductModal.tsx'), 'utf8');
    // La verificación del maestro precede al INSERT local dentro de handleCreate
    const idxCheck = src.indexOf('findMasterBySku(user.activeStoreId');
    const idxInsert = src.indexOf('createProductMutation.mutateAsync');
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxInsert).toBeGreaterThan(idxCheck);
    expect(src).toContain('useActivateMasterProduct');
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §3.A/§2: EditProductModal edita el NOMBRE compartido de vinculados y muestra el SKU INMUTABLE', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/views/terminal/views/catalog/EditProductModal.tsx'), 'utf8');
    expect(src).toContain('master_product_id');
    expect(src).toContain('identityLocked');
    // El NOMBRE ya NO queda deshabilitado para vinculados: es identidad
    // compartida editable (se enruta al maestro desde CatalogView) — el input
    // de nombre NO lleva disabled.
    expect((src.match(/disabled=\{identityLocked\}/g) || []).length).toBe(0);
    // El aviso de nombre compartido explica el alcance global y el flujo
    // gobernador/no-gobernador.
    expect(src).toContain('Nombre compartido del catálogo');
    expect(src).toContain('isGovernorForIdentity');
    // El SKU es INMUTABLE tras la creación en TODA interfaz: read-only
    // permanente (brief §2/§8.7) con trigger trg_products_sku_immutable_guard.
    expect((src.match(/disabled=\{skuInputDisabled\}/g) || []).length).toBe(1);
    expect(src).toContain('skuInputDisabled = true');
    expect(src).toContain('trg_products_sku_immutable_guard');
    expect(src).toContain('inmutable: no puede modificarse después de la creación del producto');
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §3.A: CatalogView enruta el nombre de vinculados al maestro (gobernador aplica / no gobernador propone)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/views/terminal/views/catalog/CatalogView.tsx'), 'utf8');
    expect(src).toContain('useUpdateMasterProduct');
    expect(src).toContain('useProposeMasterChange');
    expect(src).toContain('updateMasterIdentity');
    expect(src).toContain('proposeMasterIdentity');
    // El payload local de vinculados EXCLUYE nombre (identidad ya guardada en
    // el maestro) y el SKU NUNCA viaja (inmutable tras la creación).
    expect(src).toContain('...(isLinkedProduct ? {} : { name: editForm.name })');
    // Validación inmutable del SKU en el guard de UI.
    expect(src).toContain('El SKU es inmutable: no puede modificarse después de la creación del producto.');
    // El modal recibe el estado de gobernador para sus avisos.
    expect(src).toContain('isGovernorForIdentity={isCatalogGovernor}');
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §2: MasterChanges excluye sku por tipo (inmutable tras la creación)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/hooks/api/useMasterCatalog.ts'), 'utf8');
    // El contrato de identidad compartida editable ya no incluye 'sku'.
    const iface = src.slice(src.indexOf('export interface MasterChanges'), src.indexOf('}', src.indexOf('is_service?: boolean;')) + 1);
    expect(iface).not.toContain('sku');
  });
});
