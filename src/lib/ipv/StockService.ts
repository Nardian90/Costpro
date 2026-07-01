import { db, ProductMovement, ReconciliationLine, Product } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { PersistenceService } from '../persistenceService';

export interface StockSnapshot {
    productCod: string;
    quantity: number;
}

export type IntegrityStatus = 'OK' | 'DESYNC_DETECTED';

export interface IntegrityReport {
    status: IntegrityStatus;
    issues: string[];
}

export interface DetailedStockStats {
    initial: number;
    entradas: number;
    salidas: number;
    sales: number;
    final: number;
}

/**
 * Servicio centralizado para gestión de Stock e Inventario.
 */
export class StockService {

    static async calculateCurrentStock(productCod: string): Promise<number> {
        const stats = await this.getProductDetailedStats(productCod);
        return stats.final;
    }

    /**
     * Calcula las estadísticas de stock hasta una fecha específica (inclusive).
     * Si no se proporciona fecha, calcula hasta el presente.
     */
    static async getProductDetailedStats(productCod: string, upToDate?: string): Promise<DetailedStockStats> {
        return PersistenceService.readSafe(async () => {
            const product = await db.products.where('cod').equals(productCod).first();
            if (!product) return { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 };

            const initial = product.stock_inicial_manual || 0;

            let lines = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
            if (upToDate) {
                lines = lines.filter(l => l.fecha_operacion <= upToDate);
            }
            const sales = lines.reduce((sum: number, line: ReconciliationLine) => sum + (line.cantidad || 0), 0);

            let movementsDest = await db.product_movements.where('producto_destino_cod').equals(productCod).toArray();
            if (upToDate) {
                movementsDest = movementsDest.filter(m => m.fecha.split('T')[0] <= upToDate);
            }
            const entradas = movementsDest.reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

            let movementsOrig = await db.product_movements.where('producto_origen_cod').equals(productCod).toArray();
            if (upToDate) {
                movementsOrig = movementsOrig.filter(m => m.fecha.split('T')[0] <= upToDate);
            }
            const salidas = movementsOrig.reduce((sum: number, m: any) => sum + (m.cantidad_origen || 0), 0);

            // Evitar doble resta
            const salesRefsWithMovement = new Set(
                (await db.product_movements
                    .where('referencia_transaccion')
                    .anyOf(lines.map(l => l.transaction_ref))
                    .toArray())
                    .filter(m => !upToDate || m.fecha.split('T')[0] <= upToDate)
                    .map(m => m.referencia_transaccion)
            );

            const orphanSales = lines.filter(l => !salesRefsWithMovement.has(l.transaction_ref))
                                    .reduce((sum, l) => sum + (l.cantidad || 0), 0);

            return {
                initial,
                entradas,
                salidas,
                sales,
                final: initial + entradas - salidas - orphanSales
            };
        });
    }

    static async getCompleteStockMap(): Promise<Map<string, number>> {
        const statsMap = await this.getDetailedStockStatsMap();
        const map = new Map<string, number>();
        statsMap.forEach((stats, cod) => map.set(cod, stats.final));
        return map;
    }

    static async getDetailedStockStatsMap(): Promise<Map<string, DetailedStockStats>> {
        return PersistenceService.readSafe(async () => {
            const products = await db.products.toArray();
            const lines = await db.reconciliation_lines.toArray();
            const movements = await db.product_movements.toArray();

            const map = new Map<string, DetailedStockStats>();

            for (const p of products) {
                map.set(p.cod, {
                    initial: p.stock_inicial_manual || 0,
                    entradas: 0,
                    salidas: 0,
                    sales: 0,
                    final: p.stock_inicial_manual || 0
                });
            }

            for (const m of movements) {
                if (m.producto_destino_cod) {
                    const stats = map.get(m.producto_destino_cod);
                    if (stats) {
                        stats.entradas += (m.cantidad_destino || 0);
                        stats.final += (m.cantidad_destino || 0);
                    }
                }
                if (m.producto_origen_cod) {
                    const stats = map.get(m.producto_origen_cod);
                    if (stats) {
                        stats.salidas += (m.cantidad_origen || 0);
                        stats.final -= (m.cantidad_origen || 0);
                    }
                }
            }

            const lineRefs = new Set(movements.map(m => m.referencia_transaccion).filter(Boolean));
            for (const l of lines) {
                const stats = map.get(l.product_cod);
                if (stats) {
                    stats.sales += (l.cantidad || 0);
                    // Solo restar de 'final' si no hay un movimiento que ya lo haya hecho
                    if (!lineRefs.has(l.transaction_ref)) {
                        stats.final -= (l.cantidad || 0);
                    }
                }
            }

            return map;
        });
    }

    static async validateIntegrity(): Promise<IntegrityReport> {
        return PersistenceService.readSafe(async () => {
            const issues: string[] = [];
            const movements = await db.product_movements.toArray();
            const lines = await db.reconciliation_lines.toArray();

            const lineRefs = new Set(lines.map(l => l.transaction_ref));
            movements.forEach(m => {
                if (m.referencia_transaccion && !m.referencia_transaccion.startsWith('REV_') && !lineRefs.has(m.referencia_transaccion)) {
                    issues.push(`Movimiento ${m.id} tiene referencia ${m.referencia_transaccion} pero no existe conciliación asociada.`);
                }
            });

            const movementRefs = new Set(movements.map(m => m.referencia_transaccion));
            lines.forEach(l => {
                if (l.origen_dato === 'AUTO_MATCH' && !movementRefs.has(l.transaction_ref)) {
                    if (!l.observaciones?.includes('[REVERSIÓN]')) {
                        issues.push(`Conciliación ${l.id} (${l.origen_dato}) no tiene movimientos de inventario asociados.`);
                    }
                }
            });

            return {
                status: issues.length > 0 ? 'DESYNC_DETECTED' : 'OK',
                issues
            };
        });
    }

    static async takeSnapshot(productCod: string): Promise<StockSnapshot> {
        const qty = await this.calculateCurrentStock(productCod);
        return { productCod, quantity: qty };
    }

    private static async validateReversal(productCod: string, qtyToRemove: number, snapshot?: StockSnapshot) {
        const currentStock = await this.calculateCurrentStock(productCod);

        if (snapshot && snapshot.quantity !== currentStock) {
            throw new Error(`Conflicto de concurrencia: el stock de ${productCod} ha cambiado (${snapshot.quantity} vs ${currentStock}). Reintente.`);
        }

        if (qtyToRemove > 0 && currentStock < qtyToRemove) {
            throw new Error(`La transacción no puede revertirse porque el stock de ${productCod} ya fue utilizado en operaciones posteriores (${currentStock} disponible para revertir ${qtyToRemove}).`);
        }
    }

    static async revertReconciliationLine(lineId: string, snapshot?: StockSnapshot): Promise<void> {
        const line = await db.reconciliation_lines.get(lineId);
        if (!line) throw new Error("Línea de conciliación no encontrada");

        const qtyToRemove = line.cantidad < 0 ? Math.abs(line.cantidad) : 0;

        await this.validateReversal(line.product_cod, qtyToRemove, snapshot);

        await PersistenceService.transactionSafe([db.reconciliation_lines, db.product_movements, db.audit_logs], async () => {
            const reversalLine: ReconciliationLine = {
                ...line,
                id: uuidv4(),
                cantidad: -line.cantidad,
                transfer_amount_cents: -line.transfer_amount_cents,
                cash_amount_cents: -line.cash_amount_cents,
                total_amount_cents: -line.total_amount_cents,
                observaciones: `[REVERSIÓN] Compensa a ${line.id}`,
                reconciliation_hash: `REV_${line.reconciliation_hash}_${Date.now()}`,
                created_at: new Date().toISOString()
            };

            await db.reconciliation_lines.add(reversalLine);
        });
    }

    static async revertMovement(movementId: string, snapshot?: StockSnapshot): Promise<void> {
        const m = await db.product_movements.get(movementId);
        if (!m) throw new Error("Movimiento no encontrado");

        if (m.motivo?.startsWith('[REVERSIÓN]')) {
            throw new Error("Este movimiento ya es una reversión.");
        }

        if (m.cantidad_destino > 0) {
            await this.validateReversal(m.producto_destino_cod, m.cantidad_destino, snapshot);
        }

        await PersistenceService.transactionSafe([db.product_movements, db.audit_logs], async () => {
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
