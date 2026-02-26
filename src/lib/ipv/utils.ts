import { Product } from '../dexie';

/**
 * Extract commission from bank observations string.
 * Supports formats like "comi 10.50", "comis 10.50" or "Comisión: 10.50"
 * Spec Regex: Comi(?:s(?:i[óo]n)?)?:?\s*([0-9]+(?:\.[0-9]{1,2})?)
 */
export function extractCommission(observations: string): number {
    if (!observations) return 0;
    const comisMatch = observations.match(/Comi(?:s(?:i[óo]n)?)?:?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    if (comisMatch) {
        return parseFloat(comisMatch[1]);
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

    // Sumar movimientos (ventas son positivas, entradas negativas)
    const movements = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
    const totalMovement = movements.reduce((sum: number, line: any) => sum + (line.cantidad || 0), 0);


    return initialStock - totalMovement;
}

/**
 * Calcula el mapa de stock completo para todos los productos activos.
 * Útil para alimentar el motor de matching con datos en tiempo real.
 */
export async function getCompleteStockMap(db: any): Promise<Map<string, number>> {
    const products = await db.products.toArray();
    const lines = await db.reconciliation_lines.toArray();
    const map = new Map<string, number>();

    for (const p of products) {
        const netMovement = lines
            .filter((l: any) => l.product_cod === p.cod)
            .reduce((sum: number, l: any) => sum + l.cantidad, 0);
        map.set(p.cod, (p.stock_inicial_manual || 0) - netMovement);
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

    for (let i = 0; i < allReports.length; i++) {
        const report = allReports[i];
        const prevReport = i > 0 ? allReports[i - 1] : null;

        const updatedFilas = report.filas.map((f: any) => {
            const product = productMap.get(f.cod);
            const initial = prevReport
                ? (prevReport.filas.find((pf: any) => pf.cod === f.cod)?.existencia_final_qty || 0)
                : (product?.stock_inicial_manual || 0);

            const entrada = f.entrada_qty || 0;
            const salida = f.salida_qty || 0;
            const venta = f.venta_cantidad_qty;
            const totalDisponible = initial + entrada;
            const final = totalDisponible - salida - venta;

            return {
                ...f,
                saldo_inicial_qty: initial,
                entrada_qty: entrada,
                salida_qty: salida,
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
