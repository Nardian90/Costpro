import { db, ProductMovement, ReconciliationLine } from '../dexie';
import { v4 as uuidv4 } from 'uuid';

export interface StockSnapshot {
    productCod: string;
    quantity: number;
}

export class StockService {
    /**
     * Calcula la existencia actual de un producto basándose en su stock inicial y movimientos.
     * centralizada de utils.ts
     */
    static async calculateCurrentStock(productCod: string): Promise<number> {
        const product = await db.products.where('cod').equals(productCod).first();
        if (!product) return 0;

        const initialStock = product.stock_inicial_manual || 0;

        // Ventas (salidas reales)
        const lines = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
        const sales = lines.reduce((sum: number, line: any) => sum + (line.cantidad || 0), 0);

        // Entradas y salidas de inventario
        const movementsDest = await db.product_movements.where('producto_destino_cod').equals(productCod).toArray();
        const entries = movementsDest.reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

        const movementsOrig = await db.product_movements.where('producto_origen_cod').equals(productCod).toArray();
        const exits = movementsOrig.reduce((sum: number, m: any) => sum + (m.cantidad_origen || 0), 0);

        return initialStock + entries - exits - sales;
    }

    /**
     * Toma un snapshot del stock actual para control optimista
     */
    static async takeSnapshot(productCod: string): Promise<StockSnapshot> {
        const qty = await this.calculateCurrentStock(productCod);
        return { productCod, quantity: qty };
    }

    /**
     * Valida que el stock no haya cambiado (concurrencia) y que haya suficiente para revertir
     */
    private static async validateReversal(productCod: string, qtyToRemove: number, snapshot?: StockSnapshot) {
        const currentStock = await this.calculateCurrentStock(productCod);

        // 1. Control Optimista
        if (snapshot && snapshot.quantity !== currentStock) {
            throw new Error(`Conflicto de concurrencia: el stock de ${productCod} ha cambiado (${snapshot.quantity} vs ${currentStock}). Reintente.`);
        }

        // 2. Control de Consumo (Solo si la reversión implica quitar stock)
        // Ejemplo: Si revertimos una entrada de 10 unidades, qtyToRemove será 10.
        // Si el stock actual es 5, significa que ya se consumieron 5 y no podemos revertir las 10 sin dejar stock negativo inconsistente.
        if (qtyToRemove > 0 && currentStock < qtyToRemove) {
            throw new Error(`La transacción no puede revertirse porque el stock de ${productCod} ya fue utilizado en operaciones posteriores (${currentStock} disponible para revertir ${qtyToRemove}).`);
        }
    }

    /**
     * Revierte una línea de conciliación mediante compensación.
     */
    static async revertReconciliationLine(lineId: string, snapshot?: StockSnapshot): Promise<void> {
        const line = await db.reconciliation_lines.get(lineId);
        if (!line) throw new Error("Línea de conciliación no encontrada");

        // Una venta (line.cantidad > 0) al revertirse SUMA stock.
        // Una devolución (line.cantidad < 0) al revertirse QUITA stock.
        const qtyToRemove = line.cantidad < 0 ? Math.abs(line.cantidad) : 0;

        await this.validateReversal(line.product_cod, qtyToRemove, snapshot);

        await db.transaction('rw', [db.reconciliation_lines, db.product_movements], async () => {
            // NOTA: No borramos la línea original para mantener audit trail.
            // Creamos una línea compensatoria.
            const reversalLine: ReconciliationLine = {
                ...line,
                id: uuidv4(),
                cantidad: -line.cantidad,
                importe_linea_cents: -line.importe_linea_cents,
                ingreso_banco_cents: -line.ingreso_banco_cents,
                venta_real_calculada_cents: -line.venta_real_calculada_cents,
                cuadre_cents: -line.cuadre_cents,
                observaciones: `[REVERSIÓN] Compensa a ${line.id}`,
                reconciliation_hash: `REV_${line.reconciliation_hash}_${Date.now()}`,
                created_at: new Date().toISOString()
            };

            await db.reconciliation_lines.add(reversalLine);

            // Si la línea tenía movimientos asociados (aunque en este sistema parecen desacoplados
            // y recalculados en IPVReportView), aquí podríamos compensarlos si existieran.
        });
    }

    /**
     * Revierte un movimiento de inventario mediante compensación
     */
    static async revertMovement(movementId: string, snapshot?: StockSnapshot): Promise<void> {
        const m = await db.product_movements.get(movementId);
        if (!m) throw new Error("Movimiento no encontrado");

        if (m.motivo?.startsWith('[REVERSIÓN]')) {
            throw new Error("Este movimiento ya es una reversión.");
        }

        // Validamos el producto destino (donde entró stock que ahora vamos a quitar)
        if (m.cantidad_destino > 0) {
            await this.validateReversal(m.producto_destino_cod, m.cantidad_destino, snapshot);
        }

        await db.transaction('rw', [db.product_movements], async () => {
            const reversal: ProductMovement = {
                id: uuidv4(),
                fecha: new Date().toISOString(),
                producto_origen_cod: m.producto_destino_cod,
                producto_destino_cod: m.producto_origen_cod,
                cantidad_origen: m.cantidad_destino,
                cantidad_destino: m.cantidad_origen,
                tipo: m.tipo,
                referencia_transaccion: `REV_${m.id}`,
                motivo: `[REVERSIÓN] Compensa a ${m.id}`,
                created_at: new Date().toISOString()
            };
            await db.product_movements.add(reversal);
        });
    }
}
