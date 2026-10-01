/**
 * REMEDIACIÓN (fix/inventory-stock-table-actions) — Tests de acciones de fila
 * del modo tabla de Inventario (InventoryTableView).
 *
 * Contrato verificado:
 *   1. La celda "Acciones" es una zona de overflow ESTABLE: UN solo botón ⋮
 *      con aria-label "Opciones de [producto]" — sin botones inline que
 *      provoquen wrap de fila.
 *   2. El menú contiene TODAS las acciones preexistentes con sus nombres
 *      reales (Kardex, Editar producto, Ajustar stock + 4 toggles de
 *      vitrina) — ninguna acción se elimina ni renombra.
 *   3. Cada acción ejecuta exactamente el handler preexistente.
 *   4. Accesibilidad: Escape cierra el menú y devuelve el foco al trigger.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import InventoryTableView from '@/components/views/terminal/views/inventory/InventoryTableView';

// ── Polyfills jsdom (IntersectionObserver / PointerEvent / scrollIntoView) ──
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
  id: 'p1', name: 'Producto Piloto', sku: 'SKU-001', category: 'General',
  stock_current: 5, min_stock: 10, price: 100, precio_empresa: null, cost_price: 60,
  visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false,
  price_currency: 'CUP', store_id: 's1',
} as any;

function makeHandlers() {
  return {
    onAdjust: vi.fn(), onEdit: vi.fn(), onViewKardex: vi.fn(),
    onToggleVisible: vi.fn(), onTogglePriceVisible: vi.fn(),
    onToggleStockVisible: vi.fn(), onTogglePromotion: vi.fn(),
  };
}

function renderTable(handlers: ReturnType<typeof makeHandlers>) {
  return render(
    <InventoryTableView
      products={[product]}
      loadMore={() => {}}
      hasMore={false}
      isLoading={false}
      {...handlers}
    />
  );
}

describe('REMEDIACIÓN — Acciones de fila de Inventario (overflow menu)', () => {

  it('1 · la celda Acciones es estable: UN botón ⋮ accesible, cero botones inline', async () => {
    const handlers = makeHandlers();
    const { container } = renderTable(handlers);

    const actionsTd = container.querySelector('td[data-label="Acciones"]') as HTMLElement;
    expect(actionsTd).toBeTruthy();

    // Un solo botón en la celda: el trigger ⋮
    const buttons = actionsTd.querySelectorAll('button');
    expect(buttons).toHaveLength(1);

    const trigger = screen.getByRole('button', { name: 'Opciones de Producto Piloto' });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    // Sin botones inline de acciones (los nombres reales ya no están en la fila)
    expect(screen.queryByTitle('Kardex')).toBeNull();
    expect(screen.queryByTitle('Editar producto')).toBeNull();
    expect(screen.queryByTitle('Ajustar stock')).toBeNull();

    // Badge informativo Bajo/OK retirado de la celda de acciones
    expect(actionsTd.textContent).not.toContain('OK');
    expect(actionsTd.textContent).not.toContain('Bajo');
  });

  it('2 · el menú contiene TODAS las acciones preexistentes con sus nombres reales', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderTable(handlers);

    await user.click(screen.getByRole('button', { name: 'Opciones de Producto Piloto' }));

    const menu = await screen.findByRole('menu');
    expect(menu).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Ver Kardex/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Editar producto/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Ajustar stock/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Visible en tienda/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Precio visible/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Stock visible/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /En promoción/ })).toBeTruthy();

    // Estado actual de los toggles visible en el menú
    expect(screen.getByRole('menuitem', { name: /Visible en tienda/ }).textContent).toContain('Sí');
    expect(screen.getByRole('menuitem', { name: /En promoción/ }).textContent).toContain('No');
  });

  it('3 · cada acción ejecuta el handler preexistente con el producto de la fila', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderTable(handlers);
    const trigger = () => screen.getByRole('button', { name: 'Opciones de Producto Piloto' });

    // Kardex
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Ver Kardex/ }));
    await waitFor(() => expect(handlers.onViewKardex).toHaveBeenCalledTimes(1));
    expect(handlers.onViewKardex).toHaveBeenCalledWith(product);

    // Editar producto
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Editar producto/ }));
    await waitFor(() => expect(handlers.onEdit).toHaveBeenCalledWith(product));

    // Ajustar stock
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Ajustar stock/ }));
    await waitFor(() => expect(handlers.onAdjust).toHaveBeenCalledWith(product));

    // Toggle visible (visible=true → invoca con false)
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /Visible en tienda/ }));
    await waitFor(() => expect(handlers.onToggleVisible).toHaveBeenCalledWith(product, false));

    // Toggle promoción (on_promotion=false → invoca handler directo)
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitem', { name: /En promoción/ }));
    await waitFor(() => expect(handlers.onTogglePromotion).toHaveBeenCalledWith(product));
  });

  it('4 · Escape cierra el menú y devuelve el foco al trigger (FASE 11)', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    renderTable(handlers);
    const trigger = screen.getByRole('button', { name: 'Opciones de Producto Piloto' });

    await user.click(trigger);
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
