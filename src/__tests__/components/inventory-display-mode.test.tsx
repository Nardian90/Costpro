/**
 * CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — Tests de componentes de la
 * vista Inventario para el selector de visualización Unitario/Importe.
 *
 * Contrato verificado (misión §2/§5/§6/§9):
 *   1. Modo Unitario (default): la tabla conserva EXACTAMENTE el comportamiento
 *      actual — encabezados «Precio/Empresa/Costo» y valores unitarios.
 *   2. Modo Importe: encabezados «Precio (importe) / Empresa (importe) /
 *      Costo (importe)» y valores = existencia × EL MISMO campo unitario.
 *   3. Alternar Importe → Unitario restaura los valores originales.
 *   4. Ordenamiento conforme al valor visible del modo seleccionado.
 *   5. Tabla móvil y tarjetas también responden al modo (etiqueta compacta).
 *   6. Cambiar el modo NO dispara callbacks de escritura (presentation-only).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import InventoryTableView from '@/components/views/terminal/views/inventory/InventoryTableView';
import InventoryMobileTable from '@/components/views/terminal/views/inventory/InventoryMobileTable';
import InventoryCardView from '@/components/views/terminal/views/inventory/InventoryCardView';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';

beforeAll(() => {
  if (!(globalThis as any).IntersectionObserver) {
    (globalThis as any).IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {}
    };
  }
  // useReducedMotion (InventoryCardView) necesita matchMedia en jsdom
  if (!(window as any).matchMedia) {
    (window as any).matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    });
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

/** Ejemplo de la misión: existencia 10 · precio 5 · costo 1 (· empresa 4). */
const product = {
  id: 'p1', name: 'Abrazadera metálica', sku: 'SKU-001', category: 'General',
  stock_current: 10, min_stock: 2, price: 5, precio_empresa: 4, cost_price: 1,
  visible_en_tienda: true, price_visible: true, stock_visible: true, on_promotion: false,
  price_currency: 'CUP', store_id: 's1',
} as any;

const productSinEmpresa = { ...product, id: 'p2', name: 'Sin empresa', precio_empresa: null } as any;

function renderTable(props: { products?: Product[]; displayMode?: 'unitario' | 'importe' } = {}) {
  return render(
    <InventoryTableView
      products={props.products ?? [product]}
      loadMore={() => {}}
      hasMore={false}
      isLoading={false}
      displayMode={props.displayMode}
    />
  );
}

function cellByLabel(container: HTMLElement, label: string): string {
  const td = container.querySelector(`td[data-label="${label}"]`);
  expect(td, `celda con data-label="${label}"`).toBeTruthy();
  return (td as HTMLElement).textContent ?? '';
}

describe('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — InventoryTableView', () => {

  it('modo Unitario (default): encabezados y valores unitarios EXACTAMENTE como hoy', () => {
    const { container } = renderTable(); // sin prop → default 'unitario'

    expect(screen.getByRole('button', { name: 'Precio' })).toBeTruthy();
    expect(screen.getByText('Empresa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Costo' })).toBeTruthy();
    expect(screen.queryByText('Precio (importe)')).toBeNull();

    // Valores unitarios sin alterar (§12.2: Unitario conserva el comportamiento actual)
    expect(cellByLabel(container, 'Precio')).toBe(formatCurrency(5));
    expect(cellByLabel(container, 'Empresa')).toBe(formatCurrency(4));
    expect(cellByLabel(container, 'Costo')).toBe(formatCurrency(1));
  });

  it('modo Importe: encabezados con sufijo y valores = existencia × mismo campo unitario', () => {
    const { container } = renderTable({ displayMode: 'importe' });

    expect(screen.getByRole('button', { name: 'Precio (importe)' })).toBeTruthy();
    expect(screen.getByText('Empresa (importe)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Costo (importe)' })).toBeTruthy();
    // Encabezados unitarios ya no existen en este modo
    expect(screen.queryByRole('button', { name: /^Precio$/ })).toBeNull();

    // §9.2/§9.1: 10 × 5 = 50 · 10 × 4 = 40 · 10 × 1 = 10
    expect(cellByLabel(container, 'Precio (importe)')).toBe(formatCurrency(50));
    expect(cellByLabel(container, 'Empresa (importe)')).toBe(formatCurrency(40));
    expect(cellByLabel(container, 'Costo (importe)')).toBe(formatCurrency(10));
  });

  it('precio_empresa null → «—» en ambos modos (semántica actual intacta)', () => {
    const unitario = renderTable({ products: [productSinEmpresa], displayMode: 'unitario' });
    expect(cellByLabel(unitario.container, 'Empresa')).toBe('—');
    unitario.unmount();

    const importe = renderTable({ products: [productSinEmpresa], displayMode: 'importe' });
    expect(cellByLabel(importe.container, 'Empresa (importe)')).toBe('—');
    // Las demás columnas sí muestran el importe del producto sin empresa
    expect(cellByLabel(importe.container, 'Precio (importe)')).toBe(formatCurrency(50));
  });

  it('§9.6/§9.7 · alternar Importe → Unitario restaura los valores originales', () => {
    const { container, rerender } = renderTable({ displayMode: 'importe' });
    expect(cellByLabel(container, 'Precio (importe)')).toBe(formatCurrency(50));

    rerender(
      <InventoryTableView
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="unitario"
      />
    );
    expect(cellByLabel(container, 'Precio')).toBe(formatCurrency(5));    // restaurado
    expect(cellByLabel(container, 'Costo')).toBe(formatCurrency(1));     // restaurado
    expect(screen.queryByText('Precio (importe)')).toBeNull();
  });

  it('§9.10 · ordenamiento por Precio usa el valor del modo seleccionado', async () => {
    const user = userEvent.setup();
    const A = { ...product, id: 'a', name: 'A', stock_current: 2, price: 100 };  // importe 200
    const B = { ...product, id: 'b', name: 'B', stock_current: 50, price: 5 };   // importe 250

    const { container, rerender } = render(
      <InventoryTableView
        products={[A, B]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="unitario"
      />
    );

    const rowNames = () =>
      Array.from(container.querySelectorAll('tbody tr td:first-child'))
        .map(td => (td.textContent ?? '').trim());

    // Unitario asc por precio: B (5) primero
    await user.click(screen.getByRole('button', { name: 'Precio' }));
    expect(rowNames()[0]?.startsWith('B')).toBe(true);

    // Mismo clic de columna, modo importe: A (200) primero — ordena por lo VISIBLE.
    // (Al re-renderizar el estado interno de orden persiste: reseteamos con
    // «Producto» y después ordenamos por precio en modo importe → asc.)
    rerender(
      <InventoryTableView
        products={[A, B]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="importe"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Producto' }));
    await user.click(screen.getByRole('button', { name: 'Precio (importe)' }));
    expect(rowNames()[0]?.startsWith('A')).toBe(true);
    // Y los valores visibles corresponden al modo importe
    expect(cellByLabel(container, 'Precio (importe)')).toBe(formatCurrency(200));
  });

  it('alternar el modo NO dispara escrituras: sin callbacks de mutación en la fila', async () => {
    const user = userEvent.setup();
    const onAdjust = vi.fn();
    const onToggleVisible = vi.fn();
    const { rerender } = render(
      <InventoryTableView
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="importe"
        onAdjust={onAdjust}
        onToggleVisible={onToggleVisible}
      />
    );

    // Alternar Unitario → Importe → Unitario sin tocar acciones de fila
    rerender(
      <InventoryTableView
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="unitario"
        onAdjust={onAdjust}
        onToggleVisible={onToggleVisible}
      />
    );
    expect(onAdjust).not.toHaveBeenCalled();
    expect(onToggleVisible).not.toHaveBeenCalled();

    // Una acción explícita del usuario sigue funcionando igual (menu ⋮ intacto)
    await user.click(screen.getByRole('button', { name: 'Opciones de Abrazadera metálica' }));
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(onAdjust).not.toHaveBeenCalled(); // solo abrir el menú no escribe
  });
});

describe('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — InventoryMobileTable', () => {

  it('modo Importe: encabezado compacto «Importe precio» y valor = existencia × precio', () => {
    const { container } = render(
      <InventoryMobileTable
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="importe"
      />
    );

    expect(screen.getByRole('button', { name: 'Ordenar por importe de precio' })).toBeTruthy();
    expect(screen.getByText(/Importe precio/)).toBeTruthy();
    // Valor multiplicado + sub-etiqueta de moneda SIN cambios (§5: sin conversiones)
    expect(container.textContent).toContain(formatCurrency(50));
    expect(container.textContent).toContain('CUP');
  });

  it('modo Unitario: encabezado y valor unitario intactos (comportamiento actual)', () => {
    const { container } = render(
      <InventoryMobileTable
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="unitario"
      />
    );
    expect(screen.getByRole('button', { name: 'Ordenar por precio' })).toBeTruthy();
    expect(container.textContent).toContain(formatCurrency(5));
    expect(screen.queryByText(/Importe precio/)).toBeNull();
  });
});

describe('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — InventoryCardView', () => {

  it('modo Importe: etiqueta «Importe precio» con importe = existencia × precio', () => {
    const { container } = render(
      <InventoryCardView
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="importe"
        onAdjust={vi.fn()}
      />
    );
    expect(screen.getByText('Importe precio')).toBeTruthy();
    expect(container.textContent).toContain(formatCurrency(50));
    // La existencia NO cambia entre modos (§4)
    expect(container.textContent).toContain('10');
  });

  it('modo Unitario: etiqueta «Precio» con el valor unitario de siempre', () => {
    const { container } = render(
      <InventoryCardView
        products={[product]}
        loadMore={() => {}}
        hasMore={false}
        isLoading={false}
        displayMode="unitario"
        onAdjust={vi.fn()}
      />
    );
    // La etiqueta «Precio» aparece en el chip de vitrina Y en la etiqueta
    // monetaria de la tarjeta (mismo texto exacto) — verificamos ambas vías.
    expect(screen.getAllByText('Precio').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain(formatCurrency(5));
    expect(screen.queryByText('Importe precio')).toBeNull();
  });
});
