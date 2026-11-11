/**
 * CORRECCIÓN FUNCIONAL — CATÁLOGO MAESTRO DE LA ORGANIZACIÓN (2026-11-12) —
 * CreateMasterProductModal: creación de productos maestros desde el diálogo
 * «Catálogo de la organización».
 *
 * Cobertura (criterios de aceptación §4/§5/§8.1/§8.2/§8.9):
 *  · El formulario permite introducir SKU + Nombre + Imagen + Descripción
 *    compartida; validaciones previas sin cerrar el diálogo ante error.
 *  · La creación usa el MISMO servicio que la pestaña «Catálogo» de
 *    Inventario: useCreateMasterProduct → RPC create_master_product con
 *    defaults de alta manual para la fila local de la tienda activa
 *    (precio 0/CUP, min_stock 1, existencia 0) — nada se copia de otras
 *    tiendas.
 *  · Dedup previo (findMasterBySku): si el SKU ya existe como maestro sin
 *    activar, OFRECE activarlo (activate_master_product) en lugar de crear
 *    una identidad duplicada; si ya está activado en esta tienda, error.
 *  · El SKU introducible SOLO en la creación; tras ella es inmutable (el
 *    propio formulario lo avisa ANTES de guardar).
 *  · Error de la RPC → mensaje traducido (ERR_MASTER_SKU_EXISTS carrera,
 *    ERR_STORE_NOT_CONNECTED) y el diálogo permanece abierto.
 *  · La imagen compartida (opcional) se aplica tras crear vía la RPC
 *    gobernada: gobernador → update_master_product (propagación inmediata);
 *    no gobernador → propose_master_change (pendiente de aprobación).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

const createMutate = vi.fn();
const activateMutate = vi.fn();
const updateMutate = vi.fn();
const proposeMutate = vi.fn();
const findMasterBySkuMock = vi.hoisted(() => vi.fn());

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

vi.mock('@/hooks/api/useMasterCatalog', () => ({
  useCreateMasterProduct: () => ({ mutateAsync: createMutate, isPending: false }),
  useActivateMasterProduct: () => ({ mutateAsync: activateMutate, isPending: false }),
  useUpdateMasterProduct: () => ({ mutateAsync: updateMutate, isPending: false }),
  useProposeMasterChange: () => ({ mutateAsync: proposeMutate, isPending: false }),
  findMasterBySku: findMasterBySkuMock,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
  },
}));

vi.mock('@/lib/utils', () => ({
  getSupabaseUrl: () => 'https://example.supabase.co/storage/v1/object/public/product-images/x',
  getProductImageUrl: () => null,
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
}));

vi.mock('@/lib/image-compress', () => ({
  validateImageFile: () => null,
  compressImage: async (f: File) => f,
}));

import { CreateMasterProductModal } from '@/components/views/terminal/views/catalog/CreateMasterProductModal';

function renderForm(isGovernor: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreateMasterProductModal
        open
        onClose={vi.fn()}
        storeId={STORE}
        isGovernor={isGovernor}
      />
    </QueryClientProvider>
  );
}

function fillForm(sku: string, name: string, description = '') {
  fireEvent.change(screen.getByTestId('create-master-sku-input'), { target: { value: sku } });
  fireEvent.change(screen.getByTestId('create-master-name-input'), { target: { value: name } });
  if (description) {
    fireEvent.change(screen.getByTestId('create-master-description-input'), { target: { value: description } });
  }
}

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({
    status: 'success',
    master_product_id: 'mm-11111111-2222-4333-8444-555555555555',
    product_id: 'pp-11111111-2222-4333-8444-555555555555',
    sku: 'SKU-NUEVO-1',
  });
  activateMutate.mockReset().mockResolvedValue({ status: 'success', already_active: false, product_id: 'p1' });
  updateMutate.mockReset().mockResolvedValue({ status: 'success', applied: [] });
  proposeMutate.mockReset().mockResolvedValue({ status: 'success', proposal_id: 'pr1' });
  findMasterBySkuMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CreateMasterProductModal — formulario de identidad compartida', () => {
  it('muestra los campos SKU (creación) + Nombre + Imagen + Descripción y el aviso de SKU inmutable', () => {
    renderForm(true);
    expect(screen.getByTestId('create-master-sku-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-master-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('create-master-description-input')).toBeInTheDocument();
    expect(screen.getByText(/Cámara/i)).toBeInTheDocument();
    // El SKU se anuncia como inmutable ANTES de guardar (revisar antes de crear).
    expect(screen.getByText(/no podrá modificarse después/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear producto/i })).toBeInTheDocument();
  });

  it('SKU vacío → error de validación SIN cerrar ni llamar al servicio de creación', async () => {
    renderForm(true);
    fillForm('', 'Nombre válido');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El SKU es obligatorio'));
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-master-sku-input')).toBeInTheDocument();
  });

  it('nombre vacío → error de validación SIN cerrar ni llamar al servicio de creación', async () => {
    renderForm(true);
    fillForm('SKU-1', '');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('El nombre es obligatorio'));
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('create-master-name-input')).toBeInTheDocument();
  });
});

describe('CreateMasterProductModal — MISMO servicio que la pestaña Catálogo (useCreateMasterProduct)', () => {
  it('crea el maestro con el payload de identidad compartida y defaults de alta manual para la tienda activa', async () => {
    renderForm(true);
    fillForm('SKU-NUEVO-1', 'Producto Nuevo Compartido', 'Descripción compartida');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith({
      sku: 'SKU-NUEVO-1',
      name: 'Producto Nuevo Compartido',
      description: 'Descripción compartida',
      // Sin datos comerciales: precio/costo/existencias se configuran DESDE
      // el inventario de la tienda (defaults de alta manual en la RPC).
      local: {},
    });
    // Éxito: producto creado + vinculado, con guía hacia el inventario.
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Producto creado en el Catálogo Maestro y vinculado a esta tienda')));
  });

  it('SKU ya existente como maestro (carrera de unicidad) → error traducido y el diálogo permanece abierto', async () => {
    createMutate.mockRejectedValueOnce(new Error('ERR_MASTER_SKU_EXISTS: mm-1234'));
    renderForm(true);
    fillForm('SKU-DUPLICADO', 'Producto duplicado');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Ya existe un producto maestro con ese SKU'));
    // Sin cierre: el usuario puede corregir el SKU.
    expect(screen.getByTestId('create-master-sku-input')).toBeInTheDocument();
  });

  it('tienda sin conexión → ERR_STORE_NOT_CONNECTED traducido (sin creación)', async () => {
    createMutate.mockRejectedValueOnce(new Error('ERR_STORE_NOT_CONNECTED: la tienda no usa el catálogo'));
    renderForm(true);
    fillForm('SKU-X', 'Producto X');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no está conectada al catálogo'));
  });
});

describe('CreateMasterProductModal — dedup previo (misma verificación que Inventario)', () => {
  it('SKU existente NO activado → ofrece ACTIVAR el maestro existente en lugar de duplicar la identidad', async () => {
    findMasterBySkuMock.mockResolvedValueOnce({ id: 'mm-existing', sku: 'SKU-EXISTE', name: 'Existente', activated: false });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderForm(true);
    fillForm('SKU-EXISTE', 'Nombre nuevo');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));

    await waitFor(() => expect(activateMutate).toHaveBeenCalledWith('mm-existing'));
    expect(createMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('activado en esta tienda')));
    confirmSpy.mockRestore();
  });

  it('SKU existente YA activado en esta tienda → error claro, sin crear ni activar', async () => {
    findMasterBySkuMock.mockResolvedValueOnce({ id: 'mm-existing', sku: 'SKU-ACTIVO', name: 'Existente', activated: true });

    renderForm(true);
    fillForm('SKU-ACTIVO', 'Nombre');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('ya existe en esta tienda como producto vinculado')));
    expect(createMutate).not.toHaveBeenCalled();
    expect(activateMutate).not.toHaveBeenCalled();
  });
});
