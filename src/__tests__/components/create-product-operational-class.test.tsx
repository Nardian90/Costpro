/**
 * create-product-operational-class.test.tsx — CP-OPERATIONAL-CLASS-001.
 *
 * Misión §2: los NUEVOS registros creados desde la interfaz requieren una
 * clasificación operativa antes de confirmar el guardado (y viajan en el
 * payload de creación). Las importaciones/procesos automáticos NO se
 * bloquean (quedan «Sin clasificar»).
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
  createMutateAsync: vi.fn(async (..._args: unknown[]) => ({ id: 'p-new-1' })),
  findMasterBySku: vi.fn(async () => null),
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
  useCreateProduct: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useAddVariant: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/api/useMasterCatalog', () => ({
  findMasterBySku: mocks.findMasterBySku,
  useActivateMasterProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCatalogStoreLink: () => ({ data: { status: 'disconnected' }, isLoading: false }),
  useCreateMasterProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
});

describe('CP-OPERATIONAL-CLASS-001 · alta de producto con clasificación obligatoria', () => {

  it('el selector existe con las 4 opciones y arranca «Sin clasificar»', () => {
    render(<CreateProductModal />);
    expect(screen.getByText('Clasificación operativa')).toBeTruthy();
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Sin clasificar');
    const group = screen.getByRole('radiogroup', { name: 'Clasificación operativa' });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4);
  });

  it('§2 · SIN clasificación el guardado se BLOQUEA con mensaje explícito (no se crea nada)', async () => {
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    const { toast } = await import('sonner');
    expect(toast.error).toHaveBeenCalledWith(
      'La clasificación operativa es obligatoria: elige Venta, Insumo, Activo Fijo o Útil/Herramienta.',
    );
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });

  it('§2 · CON clasificación el guardado procede y la clasificación viaja en el payload', async () => {
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await fillRequiredFields(user);
    await user.click(screen.getByTestId('operational-class-venta'));
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Venta');
    await user.click(screen.getByRole('button', { name: /Crear Producto/i }));
    expect(mocks.createMutateAsync).toHaveBeenCalledTimes(1);
    const payload = (mocks.createMutateAsync.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(payload.operational_class).toBe('venta');
    expect(payload.is_service).toBe(false);
  });

  it('cada opción del selector queda marcada al elegirla (Activo Fijo como ejemplo de no-venta)', async () => {
    const user = userEvent.setup();
    render(<CreateProductModal />);
    await user.click(screen.getByTestId('operational-class-activo_fijo'));
    expect(screen.getByTestId('operational-class-activo_fijo').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Activo Fijo');
  });
});
