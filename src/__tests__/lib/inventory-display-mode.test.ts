/**
 * CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — Tests del módulo de
 * visualización Unitario/Importe (src/lib/inventory/display-mode.ts).
 *
 * Cubre los 14 escenarios OBLIGATORIOS de la misión (§9) a nivel de cálculo:
 *   1. Existencia 10 × costo 1  → importe al costo 10.
 *   2. Existencia 10 × precio 5 → importe a precio de venta 50.
 *   3. Existencia 0             → ambos importes 0.
 *   4. Existencia fraccionaria  → cálculo preciso.
 *   5. Valores monetarios decimales → sin redondeo prematuro.
 *   6. Cambio Unitario → Importe: valores recalculados.
 *   7. Cambio Importe → Unitario: valores originales restaurados.
 *   8. Cambio de tienda: importes con la existencia de la nueva tienda.
 *   9. Filtros: importes consistentes con las filas mostradas (pureza por fila).
 *  10. Ordenamiento: conforme al valor visible del modo seleccionado.
 *  11. Paginación/búsqueda: el modo no altera datos ni consultas (sin mutación).
 *  12. Monedas distintas: sin mezclas ni conversiones inventadas.
 *  13. Unidades de medida fraccionarias: precisión mantenida.
 *  14. Costo nominal: se usa `cost_price` (mismo campo del modo Unitario),
 *      NUNCA `cost_average`.
 */

import { describe, it, expect } from 'vitest';
import {
    inventoryDisplayValue,
    stockAmount,
    compareInventoryProducts,
    monetaryColumnLabel,
    compactMonetaryLabel,
    resolveInventoryDisplayMode,
    INVENTORY_DISPLAY_MODE_STORAGE_KEY,
    DEFAULT_INVENTORY_DISPLAY_MODE,
    type InventoryDisplayMode,
} from '@/lib/inventory/display-mode';
import type { Product } from '@/types';

function mk(overrides: Partial<Product> = {}): Product {
    return {
        id: 'p-test',
        name: 'Abrazadera metálica',
        sku: 'SKU-T1',
        category: 'General',
        stock_current: 10,
        price: 5,
        precio_empresa: null,
        cost_price: 1,
        cost_average: 999, // distractor: NUNCA debe usarse para las columnas
        price_currency: 'CUP',
        unit_of_measure: 'unidad',
        store_id: 's1',
        ...overrides,
    } as Product;
}

describe('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — valores por modo', () => {

    it('§9.1 · existencia 10 × costo unitario 1 → importe al costo 10', () => {
        const p = mk({ stock_current: 10, cost_price: 1 });
        expect(inventoryDisplayValue(p, 'cost', 'importe')).toBe(10);
    });

    it('§9.2 · existencia 10 × precio unitario 5 → importe a precio de venta 50', () => {
        const p = mk({ stock_current: 10, price: 5 });
        expect(inventoryDisplayValue(p, 'price', 'importe')).toBe(50);
    });

    it('§9.3 · existencia 0 → ambos importes 0', () => {
        const p = mk({ stock_current: 0, price: 5, cost_price: 1 });
        expect(inventoryDisplayValue(p, 'price', 'importe')).toBe(0);
        expect(inventoryDisplayValue(p, 'cost', 'importe')).toBe(0);
        // En unitario siguen mostrándose los valores unitarios intactos
        expect(inventoryDisplayValue(p, 'price', 'unitario')).toBe(5);
        expect(inventoryDisplayValue(p, 'cost', 'unitario')).toBe(1);
    });

    it('§9.4 · existencia fraccionaria → cálculo preciso (2.5 × 4 = 10)', () => {
        const p = mk({ stock_current: 2.5, price: 4 });
        expect(inventoryDisplayValue(p, 'price', 'importe')).toBe(10);
        const p2 = mk({ stock_current: 3.5, cost_price: 2 });
        expect(inventoryDisplayValue(p2, 'cost', 'importe')).toBe(7);
    });

    it('§9.5 · valores monetarios decimales → sin redondeo prematuro', () => {
        const p = mk({ stock_current: 3, price: 5.555 });
        const value = inventoryDisplayValue(p, 'price', 'importe') as number;
        // La multiplicación NO redondea: 16.665 (el redondeo es solo de
        // presentación y vive en formatCurrency)
        expect(value).toBeCloseTo(16.665, 10);
        expect(value).not.toBe(16.67);
        expect(value).not.toBe(16.66);
    });

    it('§9.6 · cambio Unitario → Importe: valores recalculados correctamente', () => {
        const p = mk({ stock_current: 10, price: 5, cost_price: 1 });
        const unitario: Record<string, number | null> = {
            price: inventoryDisplayValue(p, 'price', 'unitario'),
            cost: inventoryDisplayValue(p, 'cost', 'unitario'),
        };
        const importe: Record<string, number | null> = {
            price: inventoryDisplayValue(p, 'price', 'importe'),
            cost: inventoryDisplayValue(p, 'cost', 'importe'),
        };
        expect(unitario.price).toBe(5);
        expect(unitario.cost).toBe(1);
        expect(importe.price).toBe(50);   // recalculado: 10 × 5
        expect(importe.cost).toBe(10);    // recalculado: 10 × 1
    });

    it('§9.7 · cambio Importe → Unitario: valores originales restaurados (identidad)', () => {
        const p = mk({ stock_current: 10, price: 5, cost_price: 1 });
        expect(inventoryDisplayValue(p, 'price', 'unitario')).toBe(p.price);
        expect(inventoryDisplayValue(p, 'cost', 'unitario')).toBe(p.cost_price);
        // Y con existencias != 1, el modo unitario NUNCA multiplica
        const pOdd = mk({ stock_current: 7, price: 5 });
        expect(inventoryDisplayValue(pOdd, 'price', 'unitario')).toBe(5);
    });

    it('§9.8 · cambio de tienda: el importe usa la existencia de la fila/tienda recibida', () => {
        const tiendaA = mk({ store_id: 's1', stock_current: 10, price: 5 });
        const tiendaB = mk({ store_id: 's2', stock_current: 3, price: 5 });
        // Misma fuente de datos que la tabla: cada fila trae su stock_current
        expect(inventoryDisplayValue(tiendaA, 'price', 'importe')).toBe(50);
        expect(inventoryDisplayValue(tiendaB, 'price', 'importe')).toBe(15);
        // Sin mezcla entre tiendas: cada cálculo es exclusivamente por fila
        expect(inventoryDisplayValue(tiendaB, 'price', 'importe')).not.toBe(50);
    });

    it('§9.9 · filtros: el valor por fila es puro y estable (independiente del conjunto)', () => {
        const p = mk({ stock_current: 10, price: 5 });
        const solo = inventoryDisplayValue(p, 'price', 'importe');
        const enLista = [mk({ stock_current: 1 }), p, mk({ stock_current: 99 })]
            .map(x => inventoryDisplayValue(x, 'price', 'importe'));
        expect(enLista[1]).toBe(solo);
        expect(solo).toBe(50);
    });

    it('§9.10 · ordenamiento: usa el valor visible del modo seleccionado', () => {
        // A: importe 200 (2 × 100) · B: importe 250 (50 × 5)
        const A = mk({ id: 'a', name: 'A', stock_current: 2, price: 100 });
        const B = mk({ id: 'b', name: 'B', stock_current: 50, price: 5 });

        // Unitario asc por precio: B (5) antes que A (100)
        expect(compareInventoryProducts(A, B, 'price', 'asc', 'unitario')).toBeGreaterThan(0);
        // Importe asc: A (200) antes que B (250) — el orden CAMBIA con el modo
        expect(compareInventoryProducts(A, B, 'price', 'asc', 'importe')).toBeLessThan(0);

        // Costo: A: 2 × 50 = 100 · B: 50 × 3 = 150
        const A2 = mk({ id: 'a', name: 'A', stock_current: 2, cost_price: 50 });
        const B2 = mk({ id: 'b', name: 'B', stock_current: 50, cost_price: 3 });
        expect(compareInventoryProducts(A2, B2, 'cost', 'asc', 'unitario')).toBeGreaterThan(0); // 50 > 3
        expect(compareInventoryProducts(A2, B2, 'cost', 'asc', 'importe')).toBeLessThan(0);     // 100 < 150

        // name y stock no dependen del modo
        expect(compareInventoryProducts(A, B, 'stock', 'asc', 'importe'))
            .toBe(compareInventoryProducts(A, B, 'stock', 'asc', 'unitario'));
        expect(compareInventoryProducts(A, B, 'name', 'asc', 'importe')).toBeLessThan(0);

        // desc invierte
        expect(compareInventoryProducts(A, B, 'price', 'desc', 'importe')).toBeGreaterThan(0);
    });

    it('§9.11 · paginación/búsqueda: el modo es presentación pura — no muta el producto', () => {
        const p = mk({ stock_current: 10, price: 5, cost_price: 1, precio_empresa: 3 });
        const snapshot = JSON.stringify(p);
        inventoryDisplayValue(p, 'price', 'importe');
        inventoryDisplayValue(p, 'cost', 'importe');
        inventoryDisplayValue(p, 'precio_empresa', 'importe');
        compareInventoryProducts(p, mk({ id: 'x' }), 'price', 'asc', 'importe');
        expect(JSON.stringify(p)).toBe(snapshot); // cero escrituras/mutaciones
        expect(stockAmount(10, 5)).toBe(50);
    });

    it('§9.12 · monedas distintas: cada importe conserva la moneda de origen, sin conversiones', () => {
        const cup = mk({ price_currency: 'CUP', stock_current: 10, price: 5 });
        const usd = mk({ price_currency: 'USD', stock_current: 10, price: 0.5 });
        // Cada fila calcula con SUS campos: 10 × 5 = 50 y 10 × 0.5 = 5
        expect(inventoryDisplayValue(cup, 'price', 'importe')).toBe(50);
        expect(inventoryDisplayValue(usd, 'price', 'importe')).toBe(5);
        // Sin conversión inventada: el importe USD NO se multiplica por tasa alguna
        expect(inventoryDisplayValue(usd, 'price', 'importe')).not.toBe(50 * 120);
        // Las monedas quedan intactas (la presentación decide cómo mostrarlas)
        expect(cup.price_currency).toBe('CUP');
        expect(usd.price_currency).toBe('USD');
    });

    it('§9.13 · unidades fraccionarias (metros) → precisión mantenida (7.5 × 12.5 = 93.75)', () => {
        const p = mk({ stock_current: 7.5, price: 12.5, unit_of_measure: 'm' });
        expect(inventoryDisplayValue(p, 'price', 'importe')).toBe(93.75);
    });

    it('§9.14 · costo nominal: usa `cost_price` (mismo campo del modo Unitario), NUNCA cost_average', () => {
        const p = mk({ stock_current: 10, cost_price: 1, cost_average: 999 });
        expect(inventoryDisplayValue(p, 'cost', 'unitario')).toBe(1);   // cost_price
        expect(inventoryDisplayValue(p, 'cost', 'importe')).toBe(10);   // 10 × cost_price
        expect(inventoryDisplayValue(p, 'cost', 'importe')).not.toBe(9990); // NO cost_average
    });
});

describe('CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — precio_empresa y etiquetas', () => {

    it('precio_empresa null/0 → «—» (null) en AMBOS modos, misma semántica actual', () => {
        expect(inventoryDisplayValue(mk({ precio_empresa: null }), 'precio_empresa', 'unitario')).toBeNull();
        expect(inventoryDisplayValue(mk({ precio_empresa: null }), 'precio_empresa', 'importe')).toBeNull();
        expect(inventoryDisplayValue(mk({ precio_empresa: 0 }), 'precio_empresa', 'importe')).toBeNull();
    });

    it('precio_empresa presente → misma multiplicación que el resto de columnas', () => {
        const p = mk({ stock_current: 10, precio_empresa: 4 });
        expect(inventoryDisplayValue(p, 'precio_empresa', 'unitario')).toBe(4);
        expect(inventoryDisplayValue(p, 'precio_empresa', 'importe')).toBe(40);
    });

    it('etiquetas de encabezado: sufijo (importe) solo en modo Importe (§5)', () => {
        expect(monetaryColumnLabel('Precio', 'unitario')).toBe('Precio');
        expect(monetaryColumnLabel('Precio', 'importe')).toBe('Precio (importe)');
        expect(monetaryColumnLabel('Costo', 'importe')).toBe('Costo (importe)');
        expect(monetaryColumnLabel('Empresa', 'importe')).toBe('Empresa (importe)');
        expect(compactMonetaryLabel('Precio', 'unitario')).toBe('Precio');
        expect(compactMonetaryLabel('Precio', 'importe')).toBe('Importe precio');
    });

    it('resolveInventoryDisplayMode: fail-safe al modo por defecto (Unitario)', () => {
        expect(resolveInventoryDisplayMode('importe')).toBe('importe');
        expect(resolveInventoryDisplayMode('unitario')).toBe('unitario');
        expect(resolveInventoryDisplayMode(null)).toBe(DEFAULT_INVENTORY_DISPLAY_MODE);
        expect(resolveInventoryDisplayMode(undefined)).toBe('unitario');
        expect(resolveInventoryDisplayMode('garbage')).toBe('unitario');
        expect(DEFAULT_INVENTORY_DISPLAY_MODE).toBe<InventoryDisplayMode>('unitario');
        expect(INVENTORY_DISPLAY_MODE_STORAGE_KEY).toBe('costpro:inventory:displayMode');
    });
});
