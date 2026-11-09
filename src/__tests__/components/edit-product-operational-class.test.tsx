/**
 * edit-product-operational-class.test.tsx — CP-OPERATIONAL-CLASS-001.
 *
 * Contrato del selector «Clasificación operativa» en el modal de Información
 * del producto (EditProductModal — componente de props puras), misión §1/§8:
 *  §8.1-4  un producto FÍSICO puede clasificarse como cada una de las 4
 *          opciones (aria-checked + onFormChange).
 *  §8.5    un SERVICIO conserva su tipo físico/servicio y guarda su
 *          clasificación operativa de forma INDEPENDIENTE.
 *  §8.6    la clasificación se conserva al cerrar y volver a abrir el modal
 *          (re-render con el form persistido → aria-checked correcto).
 *  §8.7    los registros históricos sin clasificar se muestran como
 *          «Sin clasificar» (estado visible, nunca un default inventado).
 *  Independencia con el tipo y la categoría comercial.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import EditProductModal, { type EditFormState } from '@/components/views/terminal/views/catalog/EditProductModal';
import type { Product, ProductOperationalClass } from '@/types';

beforeAll(() => {
  if (!(globalThis as any).IntersectionObserver) {
    (globalThis as any).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
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
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// EditProductModal consulta products.master_product_id al abrir (identidad
// compartida) — la cadena de supabase se mockea al mínimo.
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

const fisico = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Detergente Multiusos 1L',
  sku: 'DET-001',
  category: 'Limpieza',
  is_service: false,
  price: 120,
  precio_empresa: null,
  cost_price: 85,
  unit_of_measure: 'unidad',
  description: '',
  price_currency: 'CUP',
  stock_current: 5,
  // Registro histórico sin clasificar (columna nueva de la migración).
  operational_class: null,
} as unknown as Product;

const servicio = {
  ...fisico,
  id: '34f49170-6f4f-426c-a1f2-3c396c416b74',
  name: 'Servicio de mantenimiento',
  sku: '999',
  category: 'Servicios',
  is_service: true,
} as unknown as Product;

function baseForm(over: Partial<EditFormState>): EditFormState {
  return {
    name: '', sku: '', category: '', is_service: false,
    operational_class: null,
    price: 0, precio_empresa: 0, precio_empresa_currency: 'CUP',
    cost_price: 0, unit_of_measure: 'unidad', description: '',
    price_currency: 'CUP', barcode: '', barcode_type: 'EAN13',
    visible_en_tienda: false, price_visible: true, stock_visible: true, on_promotion: false,
    ...over,
  };
}

function renderModal(product: Product | null, form: EditFormState, onFormChange = vi.fn()) {
  return render(
    <EditProductModal
      product={product}
      onClose={vi.fn()}
      onSave={vi.fn()}
      isSaving={false}
      isUploadingImage={false}
      editForm={form}
      onFormChange={onFormChange}
      editImagePreview={null}
      editImage={null}
      onImageSelect={vi.fn()}
      onRemoveImage={vi.fn()}
      editVariants={[]}
      onVariantsChange={vi.fn()}
      showVariants={false}
      onToggleVariants={vi.fn()}
      onSaveVariant={vi.fn()}
      onRemoveVariant={vi.fn()}
      onAddVariant={vi.fn()}
      onUpdateVariant={vi.fn()}
    />,
  );
}

const CLASS_VALUES: ProductOperationalClass[] = ['venta', 'insumo', 'activo_fijo', 'util_herramienta'];
const CLASS_LABELS: Record<ProductOperationalClass, string> = {
  venta: 'Venta', insumo: 'Insumo', activo_fijo: 'Activo Fijo', util_herramienta: 'Útil/Herramienta',
};

describe('CP-OPERATIONAL-CLASS-001 · selector en el modal de Información del producto', () => {

  it('§1 · el selector existe, diferenciado del tipo, con estado actual visible', () => {
    renderModal(fisico, baseForm({ name: 'Detergente', sku: 'DET-001', is_service: false }));
    expect(screen.getByText('Clasificación operativa')).toBeTruthy();
    // Estado actual del registro histórico: Sin clasificar.
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Sin clasificar');
    // Las 4 opciones del selector visual.
    const group = screen.getByRole('radiogroup', { name: 'Clasificación operativa' });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(4);
    // Ambas clasificaciones conviven en el mismo modal, sin fusionarse.
    expect(screen.getByText('Tipo de artículo')).toBeTruthy();
    expect(screen.getByText('Clasificación operativa')).toBeTruthy();
  });

  it.each(CLASS_VALUES)('§8 · un producto FÍSICO puede clasificarse como «%s»', async (value) => {
    const onFormChange = vi.fn();
    renderModal(fisico, baseForm({ name: 'Detergente', sku: 'DET-001', is_service: false }), onFormChange);
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`operational-class-${value}`));
    expect(onFormChange).toHaveBeenCalledTimes(1);
    const nextForm = onFormChange.mock.calls[0][0] as EditFormState;
    expect(nextForm.operational_class).toBe(value);
    // El resto del formulario NO se pierde (guardado posterior intacto).
    expect(nextForm.name).toBe('Detergente');
    expect(nextForm.sku).toBe('DET-001');
    expect(nextForm.is_service).toBe(false);
  });

  it('§8.5 · un SERVICIO conserva su tipo y guarda la clasificación operativa de forma independiente', async () => {
    const onFormChange = vi.fn();
    renderModal(
      servicio,
      baseForm({ name: 'Servicio de mantenimiento', sku: '999', is_service: true, category: 'Servicios' }),
      onFormChange,
    );
    const user = userEvent.setup();
    // El tipo sigue siendo Servicio (selector propio, intacto)...
    const typeGroup = screen.getByRole('radiogroup', { name: 'Tipo de artículo' });
    expect((typeGroup.querySelectorAll('[role="radio"]')[1] as HTMLElement).getAttribute('aria-checked')).toBe('true');
    // ...y la clasificación operativa se puede asignar sin tocar el tipo.
    await user.click(screen.getByTestId('operational-class-venta'));
    const nextForm = onFormChange.mock.calls[0][0] as EditFormState;
    expect(nextForm.operational_class).toBe('venta');
    expect(nextForm.is_service).toBe(true);
    expect(nextForm.category).toBe('Servicios');
  });

  it.each(CLASS_VALUES)('§8.6 · «%s» se CONSERVA al cerrar y volver a abrir el modal (re-render con form persistido)', (value) => {
    // Simulación del ciclo real: handleOpenEdit hidrata el form desde el
    // producto persistido (CatalogView/InventoryView) y el modal lo refleja.
    renderModal(
      { ...fisico, operational_class: value } as unknown as Product,
      baseForm({ name: 'Detergente', sku: 'DET-001', operational_class: value }),
    );
    const btn = screen.getByTestId(`operational-class-${value}`);
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('operational-class-current').textContent).toContain(CLASS_LABELS[value]);
    // Las demás opciones NO están marcadas.
    for (const other of CLASS_VALUES.filter((v) => v !== value)) {
      expect(screen.getByTestId(`operational-class-${other}`).getAttribute('aria-checked')).toBe('false');
    }
  });

  it('§8.7 · registro histórico sin clasificar: ningún radio marcado y estado «Sin clasificar» visible', () => {
    renderModal(fisico, baseForm({ operational_class: null }));
    for (const value of CLASS_VALUES) {
      expect(screen.getByTestId(`operational-class-${value}`).getAttribute('aria-checked')).toBe('false');
    }
    expect(screen.getByTestId('operational-class-current').textContent).toContain('Sin clasificar');
    // La nota explica que es informativa (no cambia contabilidad ni ventas).
    expect(screen.getAllByText(/Clasificación informativa/i).length).toBeGreaterThan(0);
  });

  it('la modificación de la clasificación NO altera el tipo físico/servicio del form', async () => {
    const onFormChange = vi.fn();
    renderModal(fisico, baseForm({ name: 'Equipo de refrigeración', sku: 'REF-01', is_service: false }), onFormChange);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('operational-class-activo_fijo'));
    const nextForm = onFormChange.mock.calls[0][0] as EditFormState;
    expect(nextForm.operational_class).toBe('activo_fijo');
    expect(nextForm.is_service).toBe(false);
  });
});
