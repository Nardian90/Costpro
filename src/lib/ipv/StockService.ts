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
 * Proporciona una única fuente de verdad para el cálculo de existencias.
 */
export class StockService {

    /**
     * Calcula la existencia actual de un producto basándose en su stock inicial, movimientos y conciliaciones.
     * Centraliza la lógica para evitar drift entre vistas.
     */
    static async calculateCurrentStock(productCod: string): Promise<number> {
        const stats = await this.getProductDetailedStats(productCod);
        return stats.final;
    }

    /**
     * Obtiene estadísticas detalladas para un producto específico.
     */
    static async getProductDetailedStats(productCod: string): Promise<DetailedStockStats> {
        return PersistenceService.readSafe(async () => {
            const product = await db.products.where('cod').equals(productCod).first();
            if (!product) return { initial: 0, entradas: 0, salidas: 0, sales: 0, final: 0 };

            const initial = product.stock_inicial_manual || 0;

            const lines = await db.reconciliation_lines.where('product_cod').equals(productCod).toArray();
            const sales = lines.reduce((sum: number, line: any) => sum + (line.cantidad || 0), 0);

            const movementsDest = await db.product_movements.where('producto_destino_cod').equals(productCod).toArray();
            const entradas = movementsDest.reduce((sum: number, m: any) => sum + (m.cantidad_destino || 0), 0);

            const movementsOrig = await db.product_movements.where('producto_origen_cod').equals(productCod).toArray();
            const salidas = movementsOrig.reduce((sum: number, m: any) => sum + (m.cantidad_origen || 0), 0);

            return {
                initial,
                entradas,
                salidas,
                sales,
                final: initial + entradas - salidas - sales
            };
        });
    }

    /**
     * Calcula el mapa de stock completo para todos los productos en un solo pase O(N).
     * Optimizado para performance.
     */
    static async getCompleteStockMap(): Promise<Map<string, number>> {
        const statsMap = await this.getDetailedStockStatsMap();
        const map = new Map<string, number>();
        statsMap.forEach((stats, cod) => map.set(cod, stats.final));
        return map;
    }

    /**
     * Calcula el mapa detallado de stock para todos los productos en un solo pase O(N).
     */
    static async getDetailedStockStatsMap(): Promise<Map<string, DetailedStockStats>> {
        return PersistenceService.readSafe(async () => {
            const products = await db.products.toArray();
            const lines = await db.reconciliation_lines.toArray();
            const movements = await db.product_movements.toArray();

            const map = new Map<string, DetailedStockStats>();

            // 1. Inicializar
            for (const p of products) {
                map.set(p.cod, {
                    initial: p.stock_inicial_manual || 0,
                    entradas: 0,
                    salidas: 0,
                    sales: 0,
                    final: p.stock_inicial_manual || 0
                });
            }

            // 2. Movimientos
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

            // 3. Ventas (Reconciliation Lines)
            for (const l of lines) {
                const stats = map.get(l.product_cod);
                if (stats) {
                    stats.sales += (l.cantidad || 0);
                    stats.final -= (l.cantidad || 0);
                }
            }

            return map;
        });
    }

    /**
     * Valida la integridad y sincronización entre product_movements y reconciliation_lines.
     */
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
                if ((l.origen_dato === 'AUTO_MATCH' || l.origen_dato === 'CASH_FILLER') && !movementRefs.has(l.transaction_ref)) {
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

        if (snapshot && snapshot.quantity !== currentStock) {
            throw new Error(`Conflicto de concurrencia: el stock de ${productCod} ha cambiado (${snapshot.quantity} vs ${currentStock}). Reintente.`);
        }

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

        const qtyToRemove = line.cantidad < 0 ? Math.abs(line.cantidad) : 0;

        await this.validateReversal(line.product_cod, qtyToRemove, snapshot);

        await PersistenceService.transactionSafe([db.reconciliation_lines, db.product_movements, db.audit_logs], async () => {
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
