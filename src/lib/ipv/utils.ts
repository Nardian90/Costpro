import { Product } from '../dexie';

/**
 * Extract commission from bank observations string and returns it in CENTS.
 * Supports formats like "comi 10.50", "comis 10.50" or "Comisión: 10.50"
 * Spec Regex: Comi(?:s(?:i[óo]n)?)?:?\s*([0-9]+(?:\.[0-9]{1,2})?)
 */
export function extractCommission(observations: string): number {
    if (!observations) return 0;
    const comisMatch = observations.match(/Comi(?:s(?:i[óo]n)?)?:?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    if (comisMatch) {
        return Math.round(parseFloat(comisMatch[1]) * 100);
    }
    return 0;
}

/**
 * Normaliza una fecha a formato YYYY-MM-DD
 */
export function standardizeDate(dateStr: string): string {
    if (!dateStr) return '';
    // Handle DD/MM/YYYY or DD/MM/YY
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    // Already YYYY-MM-DD or other
    return dateStr;
}

/**
 * Verifica si un producto es "A Medida" (requiere stock no negativo)
 */
export function isProductAMedida(um: string): boolean {
    if (!um) return false;
    const umLower = um.toLowerCase();
    return umLower === 'm' || umLower === 'm2' || umLower === 'm3' || umLower === 'kg' || umLower === 'lb';
}

/**
 * Calcula la existencia actual de un producto basándose en su stock inicial y movimientos
 */
export async function calculateCurrentStock(db: any, productCod: string): Promise<number> {
    const product = await db.products.where('cod').equals(productCod).first();
    if (!product) return 0;

    const initialStock = product.stock_inicial_manual || 0;

    // Ventas (salidas reales)
    const lines = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
    const sales = lines.reduce((sum: number, line: any) => sum + (line.cantidad || 0), 0);

    // Entradas y salidas de inventario (incluyendo recepciones inteligentes y descomposiciones)
    const movementsDest = await db.product_movements.where('producto_destino_cod').equals(productCod).toArray();
    const entries = movementsDest.reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

    const movementsOrig = await db.product_movements.where('producto_origen_cod').equals(productCod).toArray();
    const exits = movementsOrig.reduce((sum: number, m: any) => sum + (m.cantidad_origen || 0), 0);

    return initialStock + entries - exits - sales;
}


/**
 * Calcula el mapa de stock completo para todos los productos activos.
 * Útil para alimentar el motor de matching con datos en tiempo real.
 */
export async function getCompleteStockMap(db: any): Promise<Map<string, number>> {
    const products = await db.products.toArray();
    const lines = await db.reconciliation_lines.toArray();
    const allMovements = await db.product_movements.toArray();
    const map = new Map<string, number>();

    for (const p of products) {
        const sales = lines
            .filter((l: any) => l.product_cod === p.cod)
            .reduce((sum: number, l: any) => sum + l.cantidad, 0);

        const entries = allMovements
            .filter((m: any) => m.producto_destino_cod === p.cod)
            .reduce((sum: number, m: any) => sum + m.cantidad_destino, 0);

        const exits = allMovements
            .filter((m: any) => m.producto_origen_cod === p.cod)
            .reduce((sum: number, m: any) => sum + m.cantidad_origen, 0);

        map.set(p.cod, (p.stock_inicial_manual || 0) + entries - exits - sales);
    }

    return map;
}

/**
 * Recalcula toda la cadena de reportes IPV basándose en el stock inicial y las conciliaciones actuales.
 */
export async function recalculateIPVReportsChain(db: any) {
    const allProducts: Product[] = await db.products.toArray();
    const productMap = new Map<string, Product>(allProducts.map((p) => [p.cod, p]));
    const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();

    // Pre-fetch all movements for the period
    const allMovements = await db.product_movements.toArray();

    for (let i = 0; i < allReports.length; i++) {
        const report = allReports[i];
        const reportDate = report.fecha_reporte;
        const prevReport = i > 0 ? allReports[i - 1] : null;

        const updatedFilas = report.filas.map((f: any) => {
            const product = productMap.get(f.cod);

            // Sumar todas las entradas registradas en product_movements para esta fecha
            const totalEntries = allMovements
                .filter((m: any) => m.producto_destino_cod === f.cod && m.fecha === reportDate &&
                    ['INTELLIGENT_RECEIPT', 'DECOMPOSITION', 'MANUAL', 'IMPORT'].includes(m.tipo))
                .reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

            // Sumar todas las salidas registradas en product_movements para esta fecha
            const totalExits = allMovements
                .filter((m: any) => m.producto_origen_cod === f.cod && m.fecha === reportDate &&
                    ['DECOMPOSITION', 'MANUAL'].includes(m.tipo))
                .reduce((sum: number, m: any) => sum + (m.cantidad_origen || 0), 0);

            const initial = prevReport
                ? (prevReport.filas.find((pf: any) => pf.cod === f.cod)?.existencia_final_qty || 0)
                : (product?.stock_inicial_manual || 0);

            const venta = f.venta_cantidad_qty || 0;
            const totalDisponible = initial + totalEntries;
            const final = totalDisponible - totalExits - venta;

            return {
                ...f,
                saldo_inicial_qty: initial,
                entrada_qty: totalEntries,
                salida_qty: totalExits,
                entrada_salida_qty: totalEntries - totalExits,
                total_disponible_qty: totalDisponible,
                existencia_final_qty: final
            };
        });

        await db.ipv_reports.update(report.id, {
            filas: updatedFilas,
            updated_at: new Date().toISOString()
        });

        // Actualizamos el objeto en memoria para el siguiente paso del bucle
        allReports[i].filas = updatedFilas;
    }
}

/**
 * Automáticamente asigna el cod_hijo para todos los productos de un grupo
 * basándose en el orden de precios (de mayor a menor).
 */
export function classifyGroupHierarchy(products: Product[]): Product[] {
    const groups = new Map<string, Product[]>();

    // Agrupar por id_grupo
    products.forEach(p => {
        if (p.id_grupo) {
            if (!groups.has(p.id_grupo)) groups.set(p.id_grupo, []);
            groups.get(p.id_grupo)!.push(p);
        }
    });

    // Para cada grupo, ordenar por precio descendente y asignar cod_hijo
    const updatedProducts = [...products];

    groups.forEach((members) => {
        const sorted = [...members].sort((a, b) => b.precio_cents - a.precio_cents);
        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            const next = sorted[i + 1];

            // Si ya tiene un cod_hijo manual que existe en el grupo, respetarlo?
            // El usuario pidió que el sistema clasifique inteligentemente.
            // Vamos a asignar el siguiente si el cod_hijo actual está vacío.

            const productInOriginalArray = updatedProducts.find(p => p.cod === current.cod);
            if (productInOriginalArray) {
                if (!productInOriginalArray.cod_hijo || productInOriginalArray.cod_hijo === '') {
                    productInOriginalArray.cod_hijo = next ? next.cod : undefined;
                }
            }
        }
    });

    return updatedProducts;
}
