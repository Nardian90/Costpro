/**
 * Exportación COMPLETA del Stock actual — misión 2026-11-06 (Objetivo 3B/3C).
 *
 * Regla de oro probada: la exportación NUNCA depende de lo renderizado en
 * pantalla — cicla la RPC paginada oficial hasta cubrir el total, y falla
 * explícitamente si no puede (sin subconjuntos silenciosos).
 */
import { describe, it, expect } from 'vitest';
import {
  fetchAllStockForExport,
  matchesStockFilter,
  describeStockFilters,
  StockExportIncompleteError,
  type StockFetcherDeps,
} from '@/lib/inventory/stock-export';

function makeRow(id: string, stock: number, min = 5) {
  return {
    id, name: `Producto ${id}`, sku: `SKU-${id}`, stock_current: stock, min_stock: min,
    price: 100, precio_empresa: null, cost_price: 50, cost_average: 30, category: 'General',
  };
}

/** Simula la RPC get_paginated_products: paginación por offset + total. */
function makeFetcher(allRows: Array<ReturnType<typeof makeRow>>, pageSize: number, failAfterTotalMismatch = false): StockFetcherDeps['fetchPage'] {
  return async (offset: number, limit: number) => {
    void failAfterTotalMismatch;
    const rows = allRows.slice(offset, offset + limit);
    return { rows, total: allRows.length };
  };
}

describe('fetchAllStockForExport — conjunto completo independiente del scroll', () => {
  it('descarga TODO el inventario ciclando por offset (páginas de 20 → 137 productos)', async () => {
    const all = Array.from({ length: 137 }, (_, i) => makeRow(`p${i}`, i % 7));
    const pages: number[] = [];
    const products = await fetchAllStockForExport({
      fetchPage: async (offset, limit) => {
        pages.push(offset);
        return { rows: all.slice(offset, offset + limit), total: all.length };
      },
      pageSize: 20,
    });
    expect(products.length).toBe(137);
    expect(pages).toEqual([0, 20, 40, 60, 80, 100, 120]);
    // Sin duplicados ni omisiones
    expect(new Set(products.map(p => p.id)).size).toBe(137);
    expect(products[136].id).toBe('p136'); // el último producto llegó
  });

  it('usa lotes grandes (500) con un solo viaje cuando el inventario cabe', async () => {
    const all = Array.from({ length: 137 }, (_, i) => makeRow(`p${i}`, i));
    let calls = 0;
    const products = await fetchAllStockForExport({
      fetchPage: async (offset, limit) => {
        calls += 1;
        expect(limit).toBe(500);
        return { rows: all.slice(offset, offset + limit), total: all.length };
      },
    });
    expect(calls).toBe(1);
    expect(products.length).toBe(137);
  });

  it('FALLA EXPLÍCITAMENTE si el tope de seguridad se alcanza sin cubrir el total (nunca parcial silencioso)', async () => {
    const all = Array.from({ length: 500 }, (_, i) => makeRow(`p${i}`, 1));
    await expect(fetchAllStockForExport({
      fetchPage: async (offset, limit) => ({
        rows: all.slice(offset, offset + limit),
        total: 10_000, // el total declarado excede el tope de páginas
      }),
      pageSize: 500,
      maxPages: 4,
    })).rejects.toBeInstanceOf(StockExportIncompleteError);
  });

  it('inventario vacío → lista vacía (sin error)', async () => {
    const products = await fetchAllStockForExport({
      fetchPage: async () => ({ rows: [], total: 0 }),
    });
    expect(products).toEqual([]);
  });

  it('dedup defensivo por id ante solapamiento de lotes', async () => {
    const products = await fetchAllStockForExport({
      fetchPage: async () => ({
        rows: [makeRow('a', 1), makeRow('a', 1), makeRow('b', 2)],
        total: 3,
      }),
      pageSize: 2,
    });
    expect(products.map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('matchesStockFilter — MISMO predicado que la pantalla', () => {
  const cases: Array<[number, number | null, boolean]> = [
    [10, 5, true],   // con stock
    [0, 5, false],   // agotado
  ];
  it.each(cases)('with_stock: stock=%i min=%s → %s', (stock, min, expected) => {
    expect(matchesStockFilter({ stock_current: stock, min_stock: min }, 'with_stock')).toBe(expected);
  });

  it('out: solo agotados', () => {
    expect(matchesStockFilter({ stock_current: 0, min_stock: 5 }, 'out')).toBe(true);
    expect(matchesStockFilter({ stock_current: 3, min_stock: 5 }, 'out')).toBe(false);
  });

  it('low: stock > 0 y stock <= min', () => {
    expect(matchesStockFilter({ stock_current: 5, min_stock: 5 }, 'low')).toBe(true);
    expect(matchesStockFilter({ stock_current: 6, min_stock: 5 }, 'low')).toBe(false);
    expect(matchesStockFilter({ stock_current: 0, min_stock: 5 }, 'low')).toBe(false);
  });

  it('normal: stock > 0 y por encima del mínimo', () => {
    expect(matchesStockFilter({ stock_current: 10, min_stock: 5 }, 'normal')).toBe(true);
    expect(matchesStockFilter({ stock_current: 3, min_stock: 0 }, 'normal')).toBe(true); // sin mínimo definido
    expect(matchesStockFilter({ stock_current: 4, min_stock: 5 }, 'normal')).toBe(false);
  });

  it('all: pasa todo', () => {
    expect(matchesStockFilter({ stock_current: 0, min_stock: 0 }, 'all')).toBe(true);
  });
});

describe('describeStockFilters — etiqueta de filtros para el PDF', () => {
  it('default con_stock se anuncia (la exportación excluye agotados y debe decirlo)', () => {
    expect(describeStockFilters('', '', 'with_stock', 'all'))
      .toBe('Con stock (excluye agotados)');
  });

  it('con filtros → descripción legible de los criterios aplicados', () => {
    const label = describeStockFilters('azúcar', 'Bebidas', 'low', 'vigente');
    expect(label).toContain('Búsqueda: «azúcar»');
    expect(label).toContain('Categoría: Bebidas');
    expect(label).toContain('Stock bajo');
    expect(label).toContain('FC vigente');
  });

  it('all → todos los estados de stock', () => {
    expect(describeStockFilters('', '', 'all', 'all')).toContain('Todos los estados de stock');
  });
});
