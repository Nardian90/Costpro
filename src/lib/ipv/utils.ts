
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

    // Sumar ventas (salidas)
    const sales = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
    const totalSold = sales.reduce((sum: number, line: any) => sum + (line.cantidad || 0), 0);

    // TODO: En el futuro sumar entradas (ajustes/compras)

    return initialStock - totalSold;
}
