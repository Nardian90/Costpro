/**
 * MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11) —
 * acciones de fila en la pestaña «Catálogo» y bloqueo de SKU.
 *
 * Cobertura (criterios de aceptación §7.1/§7.2/§7.6/§7.7):
 *  · Una tienda conectada puede ACTIVAR un producto desde la pestaña
 *    «Catálogo»: la acción «Activar en esta tienda» existe en filas
 *    solo-maestro (source='master') en modo tabla y modo tarjetas, y NO
 *    existe en filas locales (no duplica la alta local).
 *  · La acción de identidad compartida está disponible en filas maestras y
 *    vinculadas; no en filas locales sin vínculo.
 *  · Estados diferenciados: badges «pendiente de activación» vs «Vinculado».
 *  · El SKU queda BLOQUEADO en EditProductModal cuando el producto tiene
 *    movimientos históricos (has_movements) — con mensaje explicativo — y
 *    editable cuando no los tiene.
 *  · El visor de imagen local rechaza filas solo-maestro (evita uploads
 *    huérfanos con el id del maestro).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? '')} />,
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', resolvedTheme: 'light' }) }));

vi.mock('@/lib/utils', () => ({
  getSupabaseUrl: () => null,
  getProductImageUrl: () => null,
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  formatCurrency: (v: unknown) => String(v),
  resolveProductImage: () => null,
  isPerformanceTheme: () => false,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    // EditProductModal consulta master_product_id para bloquear identidad.
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/services/catalog-service', () => ({
  catalogService: { uploadProductImage: vi.fn() },
}));

vi.mock('@/hooks/api/useProducts', () => ({
  useUpdateProduct: () => ({ mutateAsync: vi.fn(), isPending: false, mutate: vi.fn() }),
  useDeleteProduct: () => ({ mutateAsync: vi.fn(), isPending: false, mutate: vi.fn() }),
  useToggleProductActive: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateProduct: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateVariant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteVariant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddVariant: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import CatalogProductGrid from '@/components/views/terminal/views/catalog/CatalogProductGrid';
import EditProductModal, { type EditFormState } from '@/components/views/terminal/views/catalog/EditProductModal';
import { ProductImageViewerModal } from '@/components/views/terminal/views/catalog/ProductImageViewerModal';
import type { Product } from '@/types';

const MASTER_ROW: Product = {
  id: 'm1-11111111-2222-4333-8444-555555555555',
  name: 'Producto solo maestro',
  sku: 'SKU-M1',
  source: 'master',
  master_product_id: null,
  price: 0,
  cost_price: null,
  stock_current: 0,
  has_movements: false,
  is_complete: false,
} as unknown as Product;

const LINKED_LOCAL_ROW: Product = {
  id: 'p1-11111111-2222-4333-8444-555555555556',
  name: 'Producto local vinculado',
  sku: 'SKU-L1',
  source: 'local',
  master_product_id: 'm1-11111111-2222-4333-8444-555555555555',
  price: 100,
  cost_price: 50,
  stock_current: 5,
  has_movements: false,
  is_complete: true,
} as unknown as Product;

const PLAIN_LOCAL_ROW: Product = {
  id: 'p2-11111111-2222-4333-8444-555555555557',
  name: 'Producto local puro',
  sku: 'SKU-P2',
  source: 'local',
  master_product_id: null,
  price: 80,
  cost_price: 40,
  stock_current: 3,
  has_movements: false,
  is_complete: true,
} as unknown as Product;

const onActivate = vi.fn();
const onEditIdentity = vi.fn();
const onEdit = vi.fn();
const noop = vi.fn();

function renderGrid(layoutMode: 'table' | 'grid', products: Product[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogProductGrid
        layoutMode={layoutMode}
        products={products}
        isLoading={false}
        error={null}
        selectedIds={new Set()}
        isAllSelected={false}
        onToggleSelect={noop}
        onToggleSelectAll={noop}
        onClone={noop}
        onEdit={onEdit}
        onToggleActive={noop}
        onDelete={noop}
        onActivate={onActivate}
        activatingMasterId={null}
        onEditIdentity={onEditIdentity}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  onActivate.mockReset();
  onEditIdentity.mockReset();
  onEdit.mockReset();
});

describe('Pestaña «Catálogo» — activación de productos maestros desde la propia fila', () => {
  it('tabla: filas solo-maestro muestran «Activar en esta tienda» y delegan en la acción de activación', () => {
    renderGrid('table', [MASTER_ROW, PLAIN_LOCAL_ROW]);
    const btn = screen.getByRole('button', { name: `Activar ${MASTER_ROW.sku} en esta tienda` });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: MASTER_ROW.id, source: 'master' }));
  });

  it('tabla: filas locales NO muestran acción de activación (no duplican el alta local)', () => {
    renderGrid('table', [PLAIN_LOCAL_ROW]);
    expect(screen.queryByRole('button', { name: `Activar ${PLAIN_LOCAL_ROW.sku} en esta tienda` })).toBeNull();
  });

  it('tarjetas: filas solo-maestro muestran «Activar en esta tienda» y funcionan', () => {
    renderGrid('grid', [MASTER_ROW, PLAIN_LOCAL_ROW]);
    const btn = screen.getByRole('button', { name: `Activar ${MASTER_ROW.sku} en esta tienda` });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: MASTER_ROW.id }));
  });

  it('estados diferenciados: «pendiente de activación» vs «Vinculado al catálogo»', () => {
    renderGrid('table', [MASTER_ROW, LINKED_LOCAL_ROW]);
    expect(screen.getByText('Maestro · pendiente de activación')).toBeInTheDocument();
    expect(screen.getByText('Vinculado al catálogo')).toBeInTheDocument();
  });
});

describe('Pestaña «Catálogo» — edición de identidad compartida desde la fila', () => {
  it('tabla: filas maestras y vinculadas muestran «Editar identidad compartida»', () => {
    renderGrid('table', [MASTER_ROW, LINKED_LOCAL_ROW]);
    const btns = screen.getAllByRole('button', { name: 'Editar identidad compartida' });
    expect(btns).toHaveLength(2);
    fireEvent.click(btns[0]);
    expect(onEditIdentity).toHaveBeenCalledWith(expect.objectContaining({ id: MASTER_ROW.id }));
  });

  it('tabla: filas locales sin vínculo NO muestran edición de identidad compartida', () => {
    renderGrid('table', [PLAIN_LOCAL_ROW]);
    expect(screen.queryByRole('button', { name: 'Editar identidad compartida' })).toBeNull();
  });

  it('tarjetas: fila solo-maestro muestra «Identidad compartida» y delega', () => {
    renderGrid('grid', [MASTER_ROW]);
    const btn = screen.getByRole('button', { name: `Editar identidad compartida de ${MASTER_ROW.sku}` });
    fireEvent.click(btn);
    expect(onEditIdentity).toHaveBeenCalledWith(expect.objectContaining({ source: 'master' }));
  });
});

describe('EditProductModal — SKU bloqueado por movimientos históricos', () => {
  // Product.sku es `string | null | undefined` en el contrato de tipos.
  const baseForm = (sku: string | null | undefined): EditFormState => ({
    name: 'Producto X', sku: sku ?? '', category: 'General', is_service: false, operational_class: null,
    price: 10, precio_empresa: 0, precio_empresa_currency: 'CUP', cost_price: 5,
    unit_of_measure: 'unidad', description: '', price_currency: 'CUP',
    barcode: '', barcode_type: 'EAN13', visible_en_tienda: false,
    price_visible: true, stock_visible: true, on_promotion: false,
  });

  function renderEditModal(product: Product | null, form: EditFormState) {
    return render(
      <EditProductModal
        product={product}
        onClose={noop}
        onSave={noop}
        isSaving={false}
        isUploadingImage={false}
        editForm={form}
        onFormChange={noop}
        editImagePreview={null}
        editImage={null}
        onImageSelect={noop}
        onRemoveImage={noop}
        editVariants={[]}
        onVariantsChange={noop}
        showVariants={false}
        onToggleVariants={noop}
        onSaveVariant={noop}
        onRemoveVariant={noop}
        onAddVariant={noop}
        onUpdateVariant={noop}
      />
    );
  }

  it('producto CON movimientos: SKU deshabilitado con mensaje explicativo', () => {
    const p = { ...PLAIN_LOCAL_ROW, has_movements: true } as Product;
    renderEditModal(p, baseForm(p.sku));
    const input = screen.getByLabelText('SKU del producto') as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(screen.getByText(/tiene movimientos históricos asociados/i)).toBeInTheDocument();
  });

  it('producto SIN movimientos: SKU editable (arquitectura lo permite con unicidad BD)', () => {
    renderEditModal(PLAIN_LOCAL_ROW, baseForm(PLAIN_LOCAL_ROW.sku));
    const input = screen.getByLabelText('SKU del producto') as HTMLInputElement;
    expect(input).toBeEnabled();
    expect(screen.queryByText(/tiene movimientos históricos asociados/i)).toBeNull();
  });
});

describe('ProductImageViewerModal — filas solo-maestro', () => {
  it('rechaza la edición local con guía hacia activación/identidad compartida (sin uploads huérfanos)', () => {
    render(
      <ProductImageViewerModal
        product={MASTER_ROW}
        open
        onClose={noop}
        onImageChanged={noop}
      />
    );
    // Identificación del caso (descripción del modal) + guía de la identidad compartida.
    expect(screen.getByText('Producto del catálogo maestro de la organización')).toBeInTheDocument();
    expect(screen.getByText('catálogo maestro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
    // Sin acciones de guardado/edición local (que dejarían archivos huérfanos:
    // el id listado de una fila solo-maestro ES el del maestro, no el de products).
    expect(screen.queryByRole('button', { name: /^Guardar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Eliminar imagen/i })).toBeNull();
  });
});
