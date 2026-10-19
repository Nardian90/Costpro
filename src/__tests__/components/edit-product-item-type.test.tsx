/**
 * edit-product-item-type.test.tsx — MISIÓN TIPO-DE-ARTÍCULO (2026-10-19).
 *
 * Contrato del selector «Tipo de artículo» en el formulario de edición del
 * catálogo (EditProductModal — componente de props puras):
 *   1. El selector existe con la etiqueta visible «Tipo de artículo» y las
 *      dos opciones (Producto físico / Servicio) con texto auxiliar que
 *      explica el efecto sobre el inventario.
 *   2. Al abrir un producto con is_service=true (SKU 999), la opción
 *      «Servicio» queda seleccionada (aria-checked).
 *   3. Al abrir un producto físico, «Producto físico» queda seleccionada.
 *   4. Clic en la opción contraria emite onFormChange con is_service
 *      invertido — persistencia real vía el payload de handleSaveEdit.
 *   5. La categoría comercial permanece INDEPENDIENTE: el selector no toca
 *      el campo categoría.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import EditProductModal, { type EditFormState } from '@/components/views/terminal/views/catalog/EditProductModal';
import type { Product } from '@/types';

// ── Polyfills jsdom ──
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

const servicio999 = {
  id: '34f49170-6f4f-426c-a1f2-3c396c416b74',
  name: 'Servicio de cripiar',
  sku: '999',
  category: 'Servicios',
  is_service: true,
  price: 1,
  precio_empresa: null,
  cost_price: 0,
  unit_of_measure: 'unidad',
  description: '',
  price_currency: 'USD',
  stock_current: 0,
} as unknown as Product;

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
} as unknown as Product;

function baseForm(over: Partial<EditFormState>): EditFormState {
  return {
    name: '', sku: '', category: '', is_service: false,
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
    />
  );
}

describe('MISIÓN TIPO-DE-ARTÍCULO — selector en EditProductModal', () => {

  it('1 · el selector existe con etiqueta, dos opciones y texto auxiliar', () => {
    renderModal(fisico, baseForm({ is_service: false }));
    expect(screen.getByText('Tipo de artículo')).toBeTruthy();
    expect(screen.getByText('Producto físico')).toBeTruthy();
    expect(screen.getByText('Servicio')).toBeTruthy();
    // Texto auxiliar: explica el efecto sobre el inventario.
    expect(screen.getByText(/Intangible: se vende sin existencias propias/i)).toBeTruthy();
    expect(screen.getByText(/Controla existencias: valida y descuenta stock al vender/i)).toBeTruthy();
    // Independencia de la categoría comercial.
    expect(screen.getByText(/categoría «Servicios» NO convierte un producto físico en servicio/i)).toBeTruthy();
  });

  it('2 · SKU 999 (is_service=true) abre con «Servicio» seleccionada', () => {
    renderModal(servicio999, baseForm({ is_service: true, name: 'Servicio de cripiar', sku: '999' }));
    const radiogroup = screen.getByRole('radiogroup', { name: 'Tipo de artículo' });
    const serviceBtn = radiogroup.querySelectorAll('[role="radio"]')[1] as HTMLElement;
    const physicalBtn = radiogroup.querySelectorAll('[role="radio"]')[0] as HTMLElement;
    expect(serviceBtn.getAttribute('aria-checked')).toBe('true');
    expect(physicalBtn.getAttribute('aria-checked')).toBe('false');
  });

  it('3 · producto físico abre con «Producto físico» seleccionada', () => {
    renderModal(fisico, baseForm({ is_service: false }));
    const radiogroup = screen.getByRole('radiogroup', { name: 'Tipo de artículo' });
    const physicalBtn = radiogroup.querySelectorAll('[role="radio"]')[0] as HTMLElement;
    expect(physicalBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('4 · clic en «Servicio» emite onFormChange con is_service=true', async () => {
    const onFormChange = vi.fn();
    renderModal(fisico, baseForm({ is_service: false, name: 'Detergente', sku: 'DET-001' }), onFormChange);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: /Servicio/i }));
    expect(onFormChange).toHaveBeenCalledTimes(1);
    const nextForm = onFormChange.mock.calls[0][0] as EditFormState;
    expect(nextForm.is_service).toBe(true);
    // El resto del formulario NO se pierde al cambiar el tipo.
    expect(nextForm.name).toBe('Detergente');
    expect(nextForm.sku).toBe('DET-001');
  });

  it('5 · el selector NO toca la categoría comercial (independencia)', async () => {
    const onFormChange = vi.fn();
    renderModal(
      fisico,
      baseForm({ is_service: false, category: 'Servicios', name: 'Kit físico', sku: 'KIT-1' }),
      onFormChange,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: /Servicio/i }));
    const nextForm = onFormChange.mock.calls[0][0] as EditFormState;
    expect(nextForm.is_service).toBe(true);
    // Un producto físico en categoría «Servicios» conserva su categoría al
    // cambiar de tipo: son dimensiones independientes.
    expect(nextForm.category).toBe('Servicios');
  });
});
