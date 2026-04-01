import { Product, db } from '../dexie';
import { StockService } from './StockService';

/**
 * Extract commission from bank observations string and returns it in CENTS.
 * Supports formats like "comi 10.50", "comis 10.50" or "Comisión: 10.50"
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
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    return dateStr;
}

/**
 * Verifica si un producto es "A Medida" (requiere stock no negativo)
 */
export function isProductAMedida(um: string): boolean {
    if (!um) return false;
    const umLower = um.toLowerCase();
    return ['m', 'm2', 'm3', 'kg', 'lb'].includes(umLower);
}

/**
 * REFACTOR: Ahora delega en StockService para mantener una fuente única de verdad.
 */
export async function calculateCurrentStock(db: any, productCod: string): Promise<number> {
    return StockService.calculateProductStock(productCod);
}

/**
 * REFACTOR: Ahora delega en StockService.
 */
export async function getCompleteStockMap(db: any): Promise<Map<string, number>> {
    return StockService.getCompleteStockMap();
}

/**
 * Recalcula toda la cadena de reportes IPV basándose en el stock inicial y las conciliaciones actuales.
 */
export async function recalculateIPVReportsChain(db: any) {
    const allProducts: Product[] = await db.products.toArray();
    const productMap = new Map<string, Product>(allProducts.map((p) => [p.cod, p]));
    const allReports = await db.ipv_reports.orderBy('fecha_reporte').toArray();
    const allMovements = await db.product_movements.toArray();

    for (let i = 0; i < allReports.length; i++) {
        const report = allReports[i];
        const reportDate = report.fecha_reporte;
        const prevReport = i > 0 ? allReports[i - 1] : null;

        const updatedFilas = report.filas.map((f: any) => {
            const product = productMap.get(f.cod);
            const totalEntries = allMovements
                .filter((m: any) => m.producto_destino_cod === f.cod && m.fecha === reportDate &&
                    ['INTELLIGENT_RECEIPT', 'DECOMPOSITION', 'MANUAL', 'IMPORT'].includes(m.tipo))
                .reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

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

        allReports[i].filas = updatedFilas;
    }
}

/**
 * Automáticamente asigna el cod_hijo para todos los productos de un grupo
 * basándose en el orden de precios (de mayor a menor).
 */
export function classifyGroupHierarchy(products: Product[]): Product[] {
    const groups = new Map<string, Product[]>();
    products.forEach(p => {
        if (p.id_grupo) {
            if (!groups.has(p.id_grupo)) groups.set(p.id_grupo, []);
            groups.get(p.id_grupo)!.push(p);
        }
    });

    const updatedProducts = [...products];
    groups.forEach((members) => {
        const sorted = [...members].sort((a, b) => b.precio_cents - a.precio_cents);
        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            const next = sorted[i + 1];
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
