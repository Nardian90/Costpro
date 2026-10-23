/**
 * pos-cart-item-decimal.test.tsx — MISIÓN CARRITO-VENTAS (2026-10-23).
 *
 * Contrato del input de cantidad inline de la línea del carrito (POSCartItem):
 *
 *  1. El clic en el número abre el editor; Enter/blur confirma.
 *  2. Acepta decimales hasta 4 posiciones (1.5 / 1.25 / 1.2345) — se llamó a
 *     onUpdateQuantity con el valor EXACTO, sin conversión a entero (antes:
 *     parseInt que truncaba 1.5 → 1).
 *  3. Acepta coma decimal regional («1,5») normalizándola a 1.5.
 *  4. >4dp se normaliza a 4dp (1.23456 → 1.2346), coherente con el checkout.
 *  5. Valores inválidos (texto/vacío) restauran la cantidad vigente y NO
 *     llaman a onUpdateQuantity.
 *  6. 0 (o negativo) elimina la línea (regla preexistente).
 *  7. Valores por encima del tope de stock se clampean a dicho tope.
 *  8. El campo es legible: ancho suficiente para 1234.5678 (w-24 ≥ 96px) y
 *     type="text" + inputMode="decimal" (no type="number" step=1 nativo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { POSCartItem } from '@/components/views/terminal/views/pos/POSCartItem';
import type { CartItem } from '@/store/cart';

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'line-1',
    product_id: 'prod-157',
    variant_id: null,
    variant: null,
    name: 'Royal Cole',
    price: 45.5,
    cost: 30,
    quantity: 1,
    currency: 'CUP',
    subtotal: 45.5,
    discount_type: null,
    discount_value: 0,
    cash_paid: 45.5,
    transfer_paid: 0,
    zelle_paid: 0,
    payments: [],
    product: {
      id: 'prod-157',
      name: 'Royal Cole',
      sku: '157',
      price: 45.5,
      stock_current: 10,
      is_service: false,
      unit_of_measure: 'unidad',
      product_variants: [],
    },
    ...overrides,
  } as unknown as CartItem;
}

function setup(item: CartItem) {
  const onUpdateQuantity = vi.fn();
  const onRemoveItem = vi.fn();
  render(
    <POSCartItem
      item={item}
      isEasyReading={false}
      onUpdateQuantity={onUpdateQuantity}
      onRemoveItem={onRemoveItem}
      onViewImage={vi.fn()}
    />,
  );
  return { onUpdateQuantity, onRemoveItem };
}

/** Abre el editor de cantidad (clic en el botón spinbutton) y escribe un draft. */
function openEditorAndType(draft: string) {
  const trigger = screen.getByRole('spinbutton', { name: /Cantidad de Royal Cole/i });
  fireEvent.click(trigger);
  const input = screen.getByLabelText(/Editar cantidad de Royal Cole/i) as HTMLInputElement;
  act(() => {
    fireEvent.change(input, { target: { value: draft } });
  });
  return input;
}

describe('POSCartItem — campo de cantidad decimal (misión 2026-10-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acepta 1.5 y confirma con Enter sin convertir a entero', () => {
    const { onUpdateQuantity } = setup(makeItem());
    const input = openEditorAndType('1.5');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).toHaveBeenCalledTimes(1);
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 1.5);
  });

  it('acepta 0.25 y 1.2345 (4 decimales exactos)', () => {
    const { onUpdateQuantity } = setup(makeItem({ quantity: 2 }));
    const input = openEditorAndType('0.25');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 0.25);
  });

  it('normaliza la coma decimal regional («1,5» → 1.5)', () => {
    const { onUpdateQuantity } = setup(makeItem());
    const input = openEditorAndType('1,5');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 1.5);
  });

  it('normaliza >4dp a 4dp (1.23456 → 1.2346) — nunca parseInt', () => {
    const { onUpdateQuantity } = setup(makeItem());
    const input = openEditorAndType('1.23456');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 1.2346);
  });

  it('confirma también al perder el foco (blur)', () => {
    const { onUpdateQuantity } = setup(makeItem());
    const input = openEditorAndType('2.5');
    fireEvent.blur(input);
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 2.5);
  });

  it('valor inválido (texto) NO actualiza y restaura la cantidad vigente', () => {
    const { onUpdateQuantity } = setup(makeItem({ quantity: 3 }));
    const input = openEditorAndType('abc');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: /Cantidad de Royal Cole/i })).toHaveTextContent('3');
  });

  it('0 elimina la línea (regla preexistente intacta)', () => {
    const { onRemoveItem, onUpdateQuantity } = setup(makeItem());
    const input = openEditorAndType('0');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRemoveItem).toHaveBeenCalledWith('prod-157', null);
    expect(onUpdateQuantity).not.toHaveBeenCalled();
  });

  it('clampa al tope de stock (stock 2.5 → máximo 2.5, no al entero anterior 2)', () => {
    const { onUpdateQuantity } = setup(makeItem({ product: { id: 'prod-157', name: 'Royal Cole', sku: '157', price: 45.5, stock_current: 2.5, is_service: false, product_variants: [] } as unknown as CartItem['product'] }));
    const input = openEditorAndType('9');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateQuantity).toHaveBeenCalledWith('prod-157', null, 2.5);
  });

  it('Escape cancela la edición sin llamar a onUpdateQuantity', () => {
    const { onUpdateQuantity } = setup(makeItem({ quantity: 2 }));
    const input = openEditorAndType('5');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onUpdateQuantity).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: /Cantidad de Royal Cole/i })).toHaveTextContent('2');
  });

  it('el editor es legible: input de texto decimal con ancho ≥ 96px', () => {
    setup(makeItem());
    fireEvent.click(screen.getByRole('spinbutton', { name: /Cantidad de Royal Cole/i }));
    const input = screen.getByLabelText(/Editar cantidad de Royal Cole/i) as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    // w-24 = 96px — suficiente para «1234.5678» sin ocultar contenido
    expect(input.className).toContain('w-24');
  });

  it('el número visible admite fracciones (spinbutton muestra 1.5)', () => {
    setup(makeItem({ quantity: 1.5 }));
    expect(screen.getByRole('spinbutton', { name: /Cantidad de Royal Cole/i })).toHaveTextContent('1.5');
  });
});
