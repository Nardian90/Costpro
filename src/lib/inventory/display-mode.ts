/**
 * CP-INVENTORY-UNIT-VALUE-TO-STOCK-AMOUNT-001 — Selector de visualización
 * de valores unitarios vs importes por existencia (vista Inventario).
 *
 * CAPA DE PRESENTACIÓN — este módulo NO altera datos, costos ni valoración:
 *   - Modo «unitario»: comportamientó actual (comportamiento canónico de COSTPRO).
 *   - Modo «importe»: existencia actual × valor unitario, usando EXACTAMENTE
 *     los mismos campos que alimentan las columnas en modo Unitario:
 *       Precio  → `price`           (NO cost_average, NO precio promedio)
 *       Empresa → `precio_empresa`  (con su semántica de «—» cuando es null/0)
 *       Costo   → `cost_price`      (costo documental; NO se sustituye por
 *                                    el costo promedio ponderado `cost_average`)
 *
 * Reglas (misión §3-§7):
 *   - La existencia multiplicadora es `stock_current` de la tienda seleccionada,
 *     el mismo origen que muestra la columna Existencia. Nunca min_stock,
 *     existencia inicial ni cantidades históricas.
 *   - SIN redondeo durante la multiplicación: el redondeo es solo de
 *     presentación y lo aplica el formateador monetario existente
 *     (formatCurrency → Intl.NumberFormat es-CU, 2 decimales).
 *   - Sin conversiones ni mezclas de moneda: cada importe conserva la moneda
 *     del valor unitario de origen (el formateo de moneda no cambia).
 *   - Cálculo O(1) por fila sobre los datos ya cargados en la vista — sin
 *     consultas adicionales, sin escrituras, sin migraciones.
 */

import type { Product } from '@/types';

/** Modo de visualización monetaria de la vista Inventario. */
export type InventoryDisplayMode = 'unitario' | 'importe';

/** Columnas monetarias de la tabla de inventario. */
export type InventoryMonetaryField = 'price' | 'precio_empresa' | 'cost';

/** Clave localStorage — mismo namespace que el resto de la vista. */
export const INVENTORY_DISPLAY_MODE_STORAGE_KEY = 'costpro:inventory:displayMode';

/** Modo por defecto: Unitario (conserva el comportamiento actual). */
export const DEFAULT_INVENTORY_DISPLAY_MODE: InventoryDisplayMode = 'unitario';

/**
 * Normaliza un valor almacenado/leído a un modo válido.
 * Fail-safe: cualquier valor desconocido vuelve a «unitario» (comportamiento actual).
 */
export function resolveInventoryDisplayMode(raw: string | null | undefined): InventoryDisplayMode {
    return raw === 'importe' ? 'importe' : 'unitario';
}

/**
 * Valor monetario mostrado para una columna, según el modo de visualización.
 *
 * - `unitario`: el valor unitario tal cual (identidad — comportamiento actual).
 * - `importe`:  existencia actual × valor unitario (mismo campo fuente).
 *
 * Para `precio_empresa` devuelve `null` cuando el valor unitario es null/0 —
 * la MISMA semántica que la vista usa hoy para mostrar «—» — en ambos modos.
 */
export function inventoryDisplayValue(
    product: Pick<Product, 'stock_current' | 'price' | 'precio_empresa' | 'cost_price'>,
    field: InventoryMonetaryField,
    mode: InventoryDisplayMode,
): number | null {
    const stock = Number(product.stock_current ?? 0);

    if (field === 'precio_empresa') {
        const unit = product.precio_empresa;
        if (!unit) return null; // null/0 → «—», igual que el modo Unitario actual
        const unitNumber = Number(unit);
        return mode === 'importe' ? stock * unitNumber : unitNumber;
    }

    const unitNumber = field === 'price'
        ? Number(product.price ?? 0)
        : Number(product.cost_price ?? 0); // costo documental — NUNCA cost_average

    // Multiplicación exacta (sin toFixed/round): el redondeo es solo de
    // presentación y lo aplica formatCurrency.
    return mode === 'importe' ? stock * unitNumber : unitNumber;
}

/** Importe = existencia actual × valor unitario. Sin redondeo en la multiplicación. */
export function stockAmount(stock: number, unitValue: number): number {
    return Number(stock ?? 0) * Number(unitValue ?? 0);
}

/* ── Ordenamiento (misión §6: ordenar según el valor visible del modo) ── */

export type InventorySortKey = 'name' | 'stock' | 'price' | 'cost';
export type InventorySortDir = 'asc' | 'desc';

/**
 * Comparador compartido por tabla desktop y tabla móvil.
 * En modo «importe», Precio/Costo se ordenan por existencia × valor unitario
 * (el valor que el usuario está viendo), no por el valor unitario oculto.
 */
export function compareInventoryProducts(
    a: Product,
    b: Product,
    sortKey: InventorySortKey,
    sortDir: InventorySortDir,
    mode: InventoryDisplayMode,
): number {
    let cmp = 0;
    switch (sortKey) {
        case 'name':
            cmp = a.name.localeCompare(b.name);
            break;
        case 'stock':
            cmp = (a.stock_current ?? 0) - (b.stock_current ?? 0);
            break;
        case 'price': {
            const va = inventoryDisplayValue(a, 'price', mode) ?? 0;
            const vb = inventoryDisplayValue(b, 'price', mode) ?? 0;
            cmp = va - vb;
            break;
        }
        case 'cost': {
            const va = inventoryDisplayValue(a, 'cost', mode) ?? 0;
            const vb = inventoryDisplayValue(b, 'cost', mode) ?? 0;
            cmp = va - vb;
            break;
        }
    }
    return sortDir === 'asc' ? cmp : -cmp;
}

/**
 * Encabezado de columna monetaria: en modo importe se hace explícito que se
 * muestran importes, no valores por unidad (misión §5).
 *   monetaryColumnLabel('Precio', 'importe') → 'Precio (importe)'
 */
export function monetaryColumnLabel(base: string, mode: InventoryDisplayMode): string {
    return mode === 'importe' ? `${base} (importe)` : base;
}

/**
 * Etiqueta compacta para vistas de espacio reducido (tarjeta / tabla móvil).
 *   compactMonetaryLabel('Precio', 'importe') → 'Importe precio'
 */
export function compactMonetaryLabel(base: string, mode: InventoryDisplayMode): string {
    return mode === 'importe' ? `Importe ${base.toLowerCase()}` : base;
}
