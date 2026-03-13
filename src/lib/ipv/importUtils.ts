import { db, type Product } from '../dexie';

/**
 * Validates and sanitizes a product hierarchy before import.
 */
export async function validateProductHierarchy(products: Product[]): Promise<{
    valid: Product[],
    errors: string[]
}> {
    const valid: Product[] = [];
    const errors: string[] = [];
    const codMap = new Map(products.map(p => [p.cod, p]));

    for (const p of products) {
        if (p.cod_hijo) {
            if (!codMap.has(p.cod_hijo)) {
                // Check if it exists in DB if not in current batch
                const exists = await db.products.get(p.cod_hijo);
                if (!exists) {
                    errors.push(`Producto ${p.cod} referencia a un hijo inexistente: ${p.cod_hijo}`);
                }
            }
        }
        valid.push(p);
    }

    return { valid, errors };
}

/**
 * Standardized importer for catalog products.
 */
export async function importCatalogProducts(products: Product[]) {
    const { valid, errors } = await validateProductHierarchy(products);

    if (errors.length > 0) {
        console.warn('[ImportUtils] Hierarchy warnings:', errors);
    }

    await db.products.bulkPut(valid);

    // Log the import event for traceability
    const movements = valid.map(p => ({
        id: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        producto_origen_cod: p.cod,
        producto_destino_cod: p.cod,
        cantidad_origen: 1,
        cantidad_destino: 1,
        tipo: 'IMPORT' as const,
        motivo: 'Importación inicial de catálogo',
        created_at: new Date().toISOString()
    }));

    // We use a simplified UUID for movements if crypto.randomUUID is not available in all envs
    // but in this project memory says crypto.randomUUID is standard.

    await db.product_movements.bulkAdd(movements as any);
}
