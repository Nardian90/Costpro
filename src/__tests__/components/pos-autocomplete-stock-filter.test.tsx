/**
 * pos-autocomplete-stock-filter.test.tsx
 * MISIÓN POS FILTRO REAL DE STOCK (2026-10-26) — Función C (§6.3).
 *
 * «Solo con stock» debe aplicar a TODOS los resultados que ve el cajero:
 * cuadrícula (hook usePOSServerSearch) y sugerencias del autocompletado
 * (POSAutocomplete), con la excepción de servicios del modelo vigente.
 *
 * Verifica (lista principal y autocompletado):
 *  · Producto físico con stock positivo: visible.
 *  · Producto físico con stock cero: oculto cuando el filtro está activo.
 *  · Producto físico con stock negativo: oculto cuando el filtro está activo.
 *  · Producto físico agotado: visible cuando el filtro se desactiva.
 *  · Servicio sin stock: conserva la excepción del modelo de servicio.
 *  · Coincidencias por SKU, código de barras y nombre respetan la misma
 *    disponibilidad (misma regla — predicado compartido).
 *  · Cambiar el toggle actualiza inmediatamente las sugerencias sin borrar
 *    ni reescribir el término de búsqueda.
 *  · El teclado no selecciona como sugerencia un producto excluido.
 *  · El guard del carrito sigue impidiendo ventas físicas sin existencias.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock('@/components/ui/ProductImage', () => ({
  __esModule: true,
  default: () => <div data-testid="product-img" />,
}));

import { POSAutocomplete } from '@/components/views/terminal/views/pos/POSAutocomplete';
import { isPosProductVisible, usePOSServerSearch } from '@/hooks/api/usePOSServerSearch';
import { useCartStore } from '@/store/cart';
import type { Product } from '@/types';

// ── Fixture: universo completo de productos (como lo carga POSView) ─────────
const mk = (overrides: Partial<Product> & { id: string; name: string }): Product =>
  ({
    price: 10,
    stock_current: 5,
    category: 'General',
    ...overrides,
  } as Product);

const alpha = mk({ id: 'p1', name: 'Producto Alpha', sku: 'SKU-1', barcode: '111', stock_current: 5 });
const beta = mk({ id: 'p2', name: 'Producto Beta', sku: 'SKU-2', barcode: '222', stock_current: 0 });
const gamma = mk({ id: 'p3', name: 'Producto Gamma', sku: 'SKU-3', barcode: '333', stock_current: -3 });
const delta = mk({ id: 'p4', name: 'Servicio Delta', sku: 'SKU-4', barcode: '444', stock_current: 0, is_service: true });
const allProducts = [alpha, beta, gamma, delta];

function setupAutocomplete(props: { products: Product[]; query: string; hideOutOfStock?: boolean }) {
  const onSelectProduct = vi.fn();
  const utils = render(
    <>
      <input id="pos-search-input" />
      <POSAutocomplete
        products={props.products}
        query={props.query}
        onSelectProduct={onSelectProduct}
        hideOutOfStock={props.hideOutOfStock}
      />
    </>,
  );
  return { onSelectProduct, ...utils };
}

describe('MISIÓN POS — predicado compartido isPosProductVisible (una sola definición)', () => {
  it('producto físico con stock positivo: visible con filtro activo', () => {
    expect(isPosProductVisible(alpha, true)).toBe(true);
  });
  it('producto físico con stock cero: oculto con filtro activo', () => {
    expect(isPosProductVisible(beta, true)).toBe(false);
  });
  it('producto físico con stock negativo: oculto con filtro activo', () => {
    expect(isPosProductVisible(gamma, true)).toBe(false);
  });
  it('producto físico agotado: visible con filtro desactivado', () => {
    expect(isPosProductVisible(beta, false)).toBe(true);
    expect(isPosProductVisible(gamma, false)).toBe(true);
  });
  it('servicio sin stock: conserva la excepción del modelo (siempre vendible)', () => {
    expect(isPosProductVisible(delta, true)).toBe(true);
    expect(isPosProductVisible(delta, false)).toBe(true);
  });
  it('stock_current ausente se trata como sin existencias (fail-closed físico)', () => {
    expect(isPosProductVisible(mk({ id: 'x', name: 'X', stock_current: undefined as unknown as number }), true)).toBe(false);
    // ...y un producto físico con stock 0 tampoco es visible
    expect(isPosProductVisible(mk({ id: 'y', name: 'Y', is_service: false, stock_current: 0 }), true)).toBe(false);
  });
});

describe('MISIÓN POS — autocompletado obedece «Solo con stock» (§5.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('con filtro activo: solo el producto con stock aparece entre las sugerencias', () => {
    setupAutocomplete({ products: allProducts, query: 'pro', hideOutOfStock: true });
    // Alpha (stock 5) visible; Beta (0) y Gamma (-3) ocultos
    expect(screen.getByRole('option', { name: /Producto Alpha/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Producto Beta/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /Producto Gamma/ })).toBeNull();
    // El conteo del dropdown refleja SOLO los resultados visibles
    expect(screen.getByText('1 resultado')).toBeTruthy();
  });

  it('con filtro desactivado: disponibles y agotados, con sus etiquetas de disponibilidad', () => {
    setupAutocomplete({ products: allProducts, query: 'pro', hideOutOfStock: false });
    expect(screen.getByRole('option', { name: /Producto Alpha/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Producto Beta/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Producto Gamma/ })).toBeTruthy();
    // Etiquetas de disponibilidad conservadas (agotados siguen marcados)
    expect(screen.getAllByText('Sin stock').length).toBe(2);
  });

  it('servicio sin stock sigue apareciendo con el filtro activo (excepción)', () => {
    setupAutocomplete({ products: allProducts, query: 'serv', hideOutOfStock: true });
    expect(screen.getByRole('option', { name: /Servicio Delta/ })).toBeTruthy();
  });

  it('coincidencias por SKU respetan la misma disponibilidad', () => {
    // SKU del producto agotado: con filtro activo NO aparece como sugerencia
    const { ..._ } = setupAutocomplete({ products: allProducts, query: 'sku-2', hideOutOfStock: true });
    expect(screen.queryByRole('option', { name: /Producto Beta/ })).toBeNull();
    expect(screen.queryByText(/resultado/)).toBeNull(); // dropdown cerrado (0 sugerencias)
    // SKU del producto disponible: sí aparece
    setupAutocomplete({ products: allProducts, query: 'sku-1', hideOutOfStock: true });
    expect(screen.getByRole('option', { name: /Producto Alpha/ })).toBeTruthy();
    // Con el filtro desactivado, el SKU agotado vuelve a sugerirse
    setupAutocomplete({ products: allProducts, query: 'sku-2', hideOutOfStock: false });
    expect(screen.getByRole('option', { name: /Producto Beta/ })).toBeTruthy();
  });

  it('coincidencias por código de barras respetan la misma disponibilidad', () => {
    setupAutocomplete({ products: allProducts, query: '222', hideOutOfStock: true });
    expect(screen.queryByRole('option', { name: /Producto Beta/ })).toBeNull();
    setupAutocomplete({ products: allProducts, query: '111', hideOutOfStock: true });
    expect(screen.getByRole('option', { name: /Producto Alpha/ })).toBeTruthy();
    setupAutocomplete({ products: allProducts, query: '222', hideOutOfStock: false });
    expect(screen.getByRole('option', { name: /Producto Beta/ })).toBeTruthy();
  });

  it('cambiar el toggle actualiza las sugerencias INMEDIATAMENTE (sin reescribir el término)', () => {
    const onSelectProduct = vi.fn();
    const { rerender } = render(
      <>
        <input id="pos-search-input" />
        <POSAutocomplete products={allProducts} query="pro" onSelectProduct={onSelectProduct} hideOutOfStock={false} />
      </>,
    );
    // Filtro OFF: 3 resultados visibles
    expect(screen.getAllByRole('option').length).toBe(3);

    // Mismo término, filtro ON → las sugerencias se actualizan solas
    rerender(
      <>
        <input id="pos-search-input" />
        <POSAutocomplete products={allProducts} query="pro" onSelectProduct={onSelectProduct} hideOutOfStock={true} />
      </>,
    );
    expect(screen.getAllByRole('option').length).toBe(1);
    expect(screen.getByRole('option', { name: /Producto Alpha/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Producto Beta/ })).toBeNull();

    // Y de vuelta a OFF sin tocar la query
    rerender(
      <>
        <input id="pos-search-input" />
        <POSAutocomplete products={allProducts} query="pro" onSelectProduct={onSelectProduct} hideOutOfStock={false} />
      </>,
    );
    expect(screen.getAllByRole('option').length).toBe(3);
  });

  it('el teclado (Tab) no selecciona un producto excluido por el filtro', () => {
    const onSelectProduct = vi.fn();
    // Beta (agotado) PRIMERO en la lista: con filtro OFF el teclado lo
    // seleccionaría — con filtro ON debe caer en Alpha (única visible).
    const reordered = [beta, alpha, gamma, delta];
    render(
      <>
        <input id="pos-search-input" />
        <POSAutocomplete products={reordered} query="pro" onSelectProduct={onSelectProduct} hideOutOfStock={true} />
      </>,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }); });
    act(() => { fireEvent.keyDown(input, { key: 'Tab' }); });
    expect(onSelectProduct).toHaveBeenCalledTimes(1);
    expect(onSelectProduct.mock.calls[0][0].id).toBe('p1'); // Alpha, jamás Beta/Gamma
  });

  it('con filtro desactivado, el teclado selecciona el primero visible (incluye agotados)', () => {
    const onSelectProduct = vi.fn();
    const reordered = [beta, alpha, gamma, delta];
    render(
      <>
        <input id="pos-search-input" />
        <POSAutocomplete products={reordered} query="pro" onSelectProduct={onSelectProduct} hideOutOfStock={false} />
      </>,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => { fireEvent.keyDown(input, { key: 'Tab' }); });
    expect(onSelectProduct.mock.calls[0][0].id).toBe('p2'); // Beta (primera visible sin filtro)
  });

  it('un universo de sugerencias amplio no depende de la página visible del hook', () => {
    // 100 productos: el hook pagina a 60; el autocompletado filtra sobre el
    // UNIVERSO COMPLETO (producto #80 debe poder sugerirse).
    const many = Array.from({ length: 100 }, (_, i) =>
      mk({ id: `m${i}`, name: `Producto ${String(i).padStart(3, '0')}`, stock_current: 5 }),
    );
    setupAutocomplete({ products: many, query: 'producto 08', hideOutOfStock: true });
    expect(screen.getByRole('option', { name: /Producto 080/ })).toBeTruthy();
  });
});

describe('MISIÓN POS — lista principal del hook (cuadrícula/tabla/paginación)', () => {
  it('filteredProducts y allFilteredCount respetan el filtro de stock', async () => {
    const { result } = renderHook(() => usePOSServerSearch({ products: allProducts, initialPageSize: 2 }));
    // Default: hideOutOfStock = true → solo Alpha y Delta (servicio) en el universo
    expect(result.current.hideOutOfStock).toBe(true);
    expect(result.current.allFilteredCount).toBe(2);
    expect(result.current.filteredProducts.map(p => p.id).sort()).toEqual(['p1', 'p4']);

    // Desactivar el filtro: todos en el conteo real; la página visible sigue
    // limitada por la paginación (size 2) y «Ver más» expone el resto
    act(() => { result.current.setHideOutOfStock(false); });
    expect(result.current.allFilteredCount).toBe(4);
    expect(result.current.filteredProducts.length).toBe(2); // página 1 (size 2)
    expect(result.current.hasMore).toBe(true);
    expect(result.current.remainingCount).toBe(2);
    act(() => { result.current.loadMore(); });
    expect(result.current.filteredProducts.length).toBe(4);
    expect(result.current.hasMore).toBe(false);

    // Reactivar el filtro: vuelve al conjunto con stock (2) — sin agotados
    act(() => { result.current.setHideOutOfStock(true); });
    expect(result.current.allFilteredCount).toBe(2);
    expect(result.current.filteredProducts.map(p => p.id).sort()).toEqual(['p1', 'p4']);
    expect(result.current.hasMore).toBe(false);
  });

  it('la búsqueda por término + filtro combinan criterios (sin sugerencias agotadas obsoletas)', async () => {
    const { result } = renderHook(() => usePOSServerSearch({ products: allProducts }));
    act(() => { result.current.setSearchTerm('beta'); });
    // Esperar el debounce (200ms default)
    await act(async () => { await new Promise(r => setTimeout(r, 260)); });
    // Beta está agotado y el filtro está activo → 0 resultados
    expect(result.current.allFilteredCount).toBe(0);
    expect(result.current.filteredProducts.length).toBe(0);

    // Desactivar el filtro SIN cambiar la búsqueda → Beta aparece
    act(() => { result.current.setHideOutOfStock(false); });
    expect(result.current.allFilteredCount).toBe(1);
    expect(result.current.filteredProducts[0].id).toBe('p2');
  });
});

describe('MISIÓN POS — guards de checkout siguen impidiendo ventas sin stock (§5.4)', () => {
  it('el guard del carrito (addItem) rechaza productos físicos sin existencias', () => {
    useCartStore.setState({
      items: [],
      discount: null,
      appliedTaxes: [],
      storeId: '9635e633-387f-411d-bc15-7d2b6179aae4',
      globalRates: {},
      selectedPayment: 'cash',
      customerId: null,
      customerName: null,
      lastUpdated: Date.now(),
    });
    const before = useCartStore.getState().items.length;
    // Beta: físico, stock 0 → el guard del store lo rechaza
    const accepted = useCartStore.getState().addItem({
      product_id: beta.id, variant_id: null, variant: null,
      price: beta.price, cost: 0, quantity: 1, product: beta, subtotal: beta.price,
    });
    expect(accepted).toBe(false);
    expect(useCartStore.getState().items.length).toBe(before);

    // Delta: servicio sin stock → permitido (excepción del modelo)
    const acceptedService = useCartStore.getState().addItem({
      product_id: delta.id, variant_id: null, variant: null,
      price: delta.price, cost: 0, quantity: 1, product: delta, subtotal: delta.price,
    });
    expect(acceptedService).toBe(true);
  });

  it('el estado del filtro NO altera ventas ni inventario (cálculo puro, sin escrituras)', () => {
    // isPosProductVisible no muta el producto ni llama a ninguna API: es una
    // función pura de visibilidad. El toggle del hook es estado local de UI.
    const alphaBefore = JSON.stringify(alpha);
    isPosProductVisible(alpha, true);
    isPosProductVisible(alpha, false);
    expect(JSON.stringify(alpha)).toBe(alphaBefore);
  });
});
