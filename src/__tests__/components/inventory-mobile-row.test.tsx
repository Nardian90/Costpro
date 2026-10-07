/**
 * REFINAMIENTO UX (iteración 2) — Tests de la fila móvil de Inventario
 * (InventoryMobileTable), módulo especial UX/UI §23/§24.
 *
 * Contrato verificado:
 *   1. Estado de vitrina VISIBLE en la fila colapsada: chips "Visible",
 *      "Precio" y "Stock" presentes sin expandir nada (§24).
 *   2. CERO icono-toggles ambiguos en la fila (Eye/EyeOff/state+action
 *      mezclados = prohibido §6) — solo el ⋮.
 *   3. UN solo punto de acciones: trigger ⋮ táctil (aria-label "Más acciones
 *      de [producto]") que abre el menú con TODAS las acciones reales.
 *   4. Cada acción ejecuta el handler preexistente con el producto de la fila.
 *   5. Sin dependencia de hover: el menú es Radix DropdownMenu (portal).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import InventoryMobileTable from '@/components/views/terminal/views/inventory/InventoryMobileTable';

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

const product = {
  id: 'p1', name: 'Producto Móvil', sku: 'SKU-M1', category: 'General',
  stock_current: 5, min_stock: 10, price: 100, precio_empresa: null, cost_price: 60,
  visible_en_tienda: true, price_visible: true, stock_visible: false, on_promotion: false,
  price_currency: 'CUP', store_id: 's1',
} as any;

function makeHandlers() {
  return {
    onAdjust: vi.fn(), onEdit: vi.fn(), onViewKardex: vi.fn(),
    onToggleVisible: vi.fn(), onTogglePriceVisible: vi.fn(),
    onToggleStockVisible: vi.fn(), onTogglePromotion: vi.fn(),
  };
}

function renderMobile(handlers: ReturnType<typeof makeHandlers>) {
  return render(
    <InventoryMobileTable
      products={[product]}
      loadMore={() => {}}
      hasMore={false}
      isLoading={false}
      {...handlers}
    />
  );
}

describe('REFINAMIENTO UX — Fila móvil de Inventario (⋮ + chips de estado)', () => {

  it('1 · estado de vitrina VISIBLE en la fila colapsada (§24)', () => {
    const handlers = makeHandlers();
    const { container } = renderMobile(handlers);

    // Chips informativos presentes SIN expandir nada
    expect(screen.getByTitle('Visible: activado')).toBeTruthy();
    expect(screen.getByTitle('Precio: activado')).toBeTruthy();
    // stock_visible=false → chip con estado desactivado
    expect(screen.getByTitle('S.oculto: desactivado')).toBeTruthy();
    // on_promotion=false → el chip Promo NO se renderiza (evita ruido)
    expect(screen.queryByTitle('Promo: activado')).toBeNull();

    // La fila existe con sus 3 columnas de datos + acciones
    expect(container.querySelector('[role="table"]')).toBeTruthy();
  });

  it('2 · cero icono-toggles ambiguos: solo existe el botón ⋮ en la fila', () => {
    const handlers = makeHandlers();
    renderMobile(handlers);

    // Único botón accesible en la fila = trigger del menú
    const triggers = screen.getAllByRole('button', { name: 'Más acciones de Producto Móvil' });
    expect(triggers).toHaveLength(1);

    // NO hay botones de toggle con aria-pressed (patrón antiguo eliminado)
    expect(document.querySelectorAll('button[aria-pressed]')).toHaveLength(0);

    // NO hay botones "Editar"/"Ajustar"/"Kardex" inline en la fila
    expect(screen.queryByRole('button', { name: 'Editar producto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajustar stock' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver kardex' })).toBeNull();
  });

  it('3 · el menú ⋮ contiene TODAS las acciones reales', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderMobile(handlers);

    await user.click(screen.getByRole('button', { name: 'Más acciones de Producto Móvil' }));

    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Editar producto/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Ajustar stock/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Ver Kardex/ })).toBeTruthy();
    // Los 4 toggles de vitrina son CheckboxItems (rol menuitemcheckbox)
    expect(screen.getByRole('menuitemcheckbox', { name: /Visible en tienda/ })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: /Precio visible/ })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: /Stock visible/ })).toBeTruthy();
    expect(screen.getByRole('menuitemcheckbox', { name: /En promoción/ })).toBeTruthy();
  });

  it('4 · cada acción ejecuta el handler preexistente', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderMobile(handlers);
    const trigger = () => screen.getByRole('button', { name: 'Más acciones de Producto Móvil' });

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Ajustar stock/ }));
    await waitFor(() => expect(handlers.onAdjust).toHaveBeenCalledWith(product));

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Editar producto/ }));
    await waitFor(() => expect(handlers.onEdit).toHaveBeenCalledWith(product));

    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Ver Kardex/ }));
    await waitFor(() => expect(handlers.onViewKardex).toHaveBeenCalledWith(product));

    // Toggle visible (visible=true → invoca con false) — CheckboxItem
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /Visible en tienda/ }));
    await waitFor(() => expect(handlers.onToggleVisible).toHaveBeenCalledWith(product, false));
  });

  it('5 · Escape cierra el menú y devuelve el foco al trigger (sin hover-dependencia)', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderMobile(handlers);
    const trigger = screen.getByRole('button', { name: 'Más acciones de Producto Móvil' });

    await user.click(trigger);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
