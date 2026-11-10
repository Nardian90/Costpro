/**
 * create-product-operational-class.test.tsx — CP-OPERATIONAL-CLASS-001/002.
 *
 * Misión §2 (obligatoria en el alta desde la interfaz) y §6/§10 de la
 * remediación (CP-OPERATIONAL-CLASS-002): la clasificación se persiste en la
 * MISMA TRANSACCIÓN que crea/activa la fila local — TRES caminos:
 *   1. Alta local: insert directo (operational_class en el payload).
 *   2. Alta con tienda conectada: create_master_product con p_operational_class.
 *   3. Activación de maestro existente: activate_master_product con
 *      p_operational_class (objeto { masterId, operationalClass }).
 * Un fallo del RPC NO genera confirmación de éxito (sin toast.success) y no
 * existen escrituras secundarias (ni console.error ocultos).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CreateProductModal } from '@/components/modals/CreateProductModal';

beforeAll(() => {
  if (!(globalThis as any).IntersectionObserver) {
    (globalThis as any).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!(window as any).PointerEvent) {
    (window as any).PointerEvent = class PointerEvent extends MouseEvent {
      pointerId = 1; pointerType = 'mouse'; isPrimary = true;
    };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

const mocks = vi.hoisted(() => ({
  createLocalMutateAsync: vi.fn(async (..._args: unknown[]) => ({ id: 'p-local-1' })),
  createMasterMutateAsync: vi.fn(async (..._args: unknown[]) => ({
    status: 'success', master_product_id: 'm-1', product_id: 'p-master-1', sku: 'REF-01',
  })),
  activateMasterMutateAsync: vi.fn(async (..._args: unknown[]) => ({
    status: 'success', already_active: false, product_id: 'p-act-1', master_product_id: 'm-1',
  })),
  findMasterBySku: vi.fn(async () => null),
  connected: false,
}));

vi.mock('@/store', () => ({
  useUIStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({
          isCreateProductModalOpen: true,
          setIsCreateProductModalOpen: vi.fn(),
          initialProductName: null,
          setInitialProductName: vi.fn(),
        })
      : {
          isCreateProductModalOpen: true,
          setIsCreateProductModalOpen: vi.fn(),
          initialProductName: null,
          setInitialProductName: vi.fn(),
        },
  useAuthStore: (sel?: (s: unknown) => unknown) =>
    sel
      ? sel({ user: { id: 'u-1', role: 'admin', activeStoreId: '11111111-1111-4111-8111-111111111111' } })
      : { user: { id: 'u-1', role: 'admin', activeStoreId: '11111111-1111-4111-8111-111111111111' } },
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useCreateProduct: () => ({ mutateAsync: mocks.createLocalMutateAsync, isPending: false }),
  useAddVariant: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/api/useMasterCatalog', () => ({
  findMasterBySku: mocks.findMasterBySku,
  useActivateMasterProduct: () => ({ mutateAsync: mocks.activateMasterMutateAsync, isPending: false }),
  // `connected` controla el camino del alta (local vs maestro) por test.
  useCatalogStoreLink: () => ({ data: { status: mocks.connected ? 'connected' : 'disconnected' }, isLoading: false }),
  useCreateMasterProduct: () => ({ mutateAsync: mocks.createMasterMutateAsync, isPending: false }),
}));

const fromMock = vi.fn((_table: string) => {
  const builder: Record<string, unknown> = {
    select: () => builder, eq: () => builder, in: () => builder,
    not: () => builder, neq: () => builder, order: () => builder, limit: () => builder,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (r: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
});
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (t: string) => fromMock(t), auth: { getSession: async () => ({ data: { session: null } }) } },
}));

vi.mock('@/services/catalog-service', () => ({
  catalogService: { uploadProductImage: vi.fn() },
}));
vi.mock('@/lib/image-compress', () => ({
  compressImage: vi.fn(), validateImageFile: () => ({ valid: true }),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre del producto'), 'Equipo de refrigeración');
  await user.type(screen.getByLabelText('SKU del producto'), 'REF-01');
  const price = screen.getByLabelText('Precio de venta por unidad base') as HTMLInputElement;
  await user.type(price, '100');
  const cost = screen.getByLabelText(/Costo del producto/i) as HTMLInputElement;
  await user.type(cost, '50');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connected = false;
  // clearAllMocks limpia el historial pero NO las implementaciones fijadas
  // con mockResolvedValue en tests previos: se restablecen las base aquí
  // para que cada test parta del estado neutro.
  mocks.findMasterBySku.mockImplementation(async () => null);
  mocks.createLocalMutateAsync.mockImplementation(async () => ({ id: 'p-local-1' }));
  mocks.createMasterMutateAsync.mockImplementation(async () => ({
    status: 'success', master_product_id: 'm-1', product_id: 'p-master-1', sku: 'REF-01',
  }));
  mocks.activateMasterMutateAsync.mockImplementation(async () => ({
    status: 'success', already_active: false, product_id: 'p-act-1', master_product_id: 'm-1',
  }));
});

describe('CP-OPERATIONAL-CLASS-001/002 · alta de producto con clasificación obligatoria', () => {

  it('TAREA 1.1 · Venta PRESELECCIONADA desde la primera apertura (4 opciones, nunca vacío)', () => {
    render(<CreateProductModal />);
    expect(screen.getByText('Clasificación operativa')).toBeTruthy();
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Venta');
    const group = screen.getByRole('radiogroup', { name: 'Clasificación operativa' });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4);
    expect(screen.getByTestId('operational-class-venta').getAttribute('aria-checked')).toBe('true');
  });

  it('TAREA 1.1 · el alta SIEMPRE envía la clasificación seleccionada (invariante de guardado)', async () => {
    // Con Venta preseleccionada el guardado no puede salir vacío: la
    // selección viaja en el payload tal cual el usuario la dejó.
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    const payload = (mocks.createLocalMutateAsync.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(payload.operational_class).toBe('venta');
    const { toast } = await import('sonner');
    expect(toast.error).not.toHaveBeenCalledWith(
      'La clasificación operativa es obligatoria: elige Venta, Insumo, Activo Fijo o Útil/Herramienta.',
    );
  });

  it('§6 · CAMINO 1 (alta local): la clasificación viaja en el INSERT (misma escritura)', async () => {
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-venta'));
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    expect(mocks.createLocalMutateAsync).toHaveBeenCalledTimes(1);
    const payload = (mocks.createLocalMutateAsync.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(payload.operational_class).toBe('venta');
    expect(mocks.createMasterMutateAsync).not.toHaveBeenCalled();
  });

  it('§6 · CAMINO 2 (tienda conectada): create_master_product recibe p_operational_class — sin UPDATE secundario', async () => {
    mocks.connected = true;
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-insumo'));
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    expect(mocks.createMasterMutateAsync).toHaveBeenCalledTimes(1);
    const payload = (mocks.createMasterMutateAsync.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(payload.operational_class).toBe('insumo');
    // La rama local NO se usa y no existe ninguna escritura secundaria.
    expect(mocks.createLocalMutateAsync).not.toHaveBeenCalled();
    const { toast } = await import('sonner');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('§6 · CAMINO 3 (activación de maestro): activate_master_product recibe { masterId, operationalClass }', async () => {
    mocks.findMasterBySku.mockResolvedValue({ id: 'm-1', sku: 'REF-01', name: 'Equipo de refrigeración', activated: false } as unknown as null);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-activo_fijo'));
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    expect(mocks.activateMasterMutateAsync).toHaveBeenCalledTimes(1);
    const input = (mocks.activateMasterMutateAsync.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(input.masterId).toBe('m-1');
    expect(input.operationalClass).toBe('activo_fijo');
    expect(mocks.createLocalMutateAsync).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
  });

  it('§10 · un FALLO del RPC no genera confirmación de éxito (sin éxito falso)', async () => {
    mocks.createMasterMutateAsync.mockRejectedValueOnce(new Error('ERR_MASTER_SKU_EXISTS: m-0'));
    mocks.connected = true;
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-venta'));
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    const { toast } = await import('sonner');
    // El catch del modal corre en microtasks posteriores al click; se espera
    // el ciclo antes de afirmar. Éxito jamás confirmado ante un fallo.
    await new Promise((r) => setTimeout(r, 150));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('§10 · un FALLO del alta local tampoco confirma éxito', async () => {
    mocks.createLocalMutateAsync.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-venta'));
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    const { toast } = await import('sonner');
    await new Promise((r) => setTimeout(r, 150));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('cada opción del selector queda marcada al elegirla (Activo Fijo como ejemplo de no-venta)', async () => {
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await user.click(screen.getByTestId('operational-class-activo_fijo'));
    expect(screen.getByTestId('operational-class-activo_fijo').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Activo Fijo');
  });
});
