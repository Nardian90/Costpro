import crypto from 'crypto';
import { db, type Product } from '../dexie';
import { CatalogAuditService } from './catalog-audit';
import { ValidationResult } from './import-validator';

export async function validateProductHierarchy(products: Product[]): Promise<{ valid: Product[], errors: string[] }> {
    const valid: Product[] = [];
    const errors: string[] = [];
    const codMap = new Map(products.map(p => [p.cod, p]));
    for (const p of products) {
        if (p.cod_hijo && !codMap.has(p.cod_hijo)) {
            const exists = await db.products.get(p.cod_hijo);
            if (!exists) errors.push(`Producto ${p.cod} referencia a un hijo inexistente: ${p.cod_hijo}`);
        }
        valid.push(p);
    }
    return { valid, errors };
}

export async function importCatalogProducts(products: Product[], userId: string = 'system', validationResult?: ValidationResult, fileName?: string) {
    const { valid, errors } = await validateProductHierarchy(products);
    await db.products.bulkPut(valid);
    const now = new Date().toISOString();
    const movements = valid.map(p => ({
        id: crypto.randomUUID(),
        fecha: now,
        producto_origen_cod: p.cod,
        producto_destino_cod: p.cod,
        cantidad_origen: 1,
        cantidad_destino: 1,
        tipo: 'IMPORT' as const,
        motivo: `Catálogo: ${fileName || 'Importación'}`,
        created_at: now
    }));
    await db.product_movements.bulkAdd(movements as any);

    await CatalogAuditService.log({
        userId,
        action: 'IMPORT',
        fileName,
        summary: validationResult ? {
            added: validationResult.summary.added,
            updated: validationResult.summary.updated,
            deleted: 0,
            errors: validationResult.errors.length
        } : {
            added: valid.length,
            updated: 0,
            deleted: 0,
            errors: errors.length
        }
    });
    return { success: true, count: valid.length };
}
