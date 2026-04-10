import { db } from '../dexie';

export interface ResetFilters {
    startDate?: string;
    endDate?: string;
    rules?: string[];
    states?: string[];
}

export class MatchingResetService {
    static async resetMatching(filters: ResetFilters = {}) {
        try {
            return await db.transaction('rw', [
                db.bank_statements,
                db.reconciliation_lines,
                db.product_movements,
                db.matching_logs
            ], async () => {
                let txCollection = db.bank_statements.toCollection();

                if (filters.startDate) {
                    txCollection = txCollection.filter(tx => tx.fecha >= filters.startDate!);
                }
                if (filters.endDate) {
                    txCollection = txCollection.filter(tx => tx.fecha <= filters.endDate!);
                }
                if (filters.states && filters.states.length > 0) {
                    txCollection = txCollection.filter(tx => filters.states!.includes(tx.estado_conciliacion));
                }

                let txsToReset = await txCollection.toArray();

                if (filters.rules && filters.rules.length > 0) {
                    const refs = txsToReset.map(tx => tx.referencia_origen);
                    const relevantLogs = await db.matching_logs
                        .where('transaction_ref')
                        .anyOf(refs)
                        .filter(log => log.applied_rules.some(r => filters.rules!.includes(r)))
                        .toArray();

                    const refsToKeep = new Set(relevantLogs.map(l => l.transaction_ref));
                    txsToReset = txsToReset.filter(tx => refsToKeep.has(tx.referencia_origen));
                }

                const refs = txsToReset.map(tx => tx.referencia_origen);

                if (refs.length === 0) return 0;

                await db.reconciliation_lines.where('transaction_ref').anyOf(refs).delete();
                await db.product_movements.where('referencia_transaccion').anyOf(refs).delete();
                await db.matching_logs.where('transaction_ref').anyOf(refs).delete();

                await db.bank_statements
                    .where('referencia_origen')
                    .anyOf(refs)
                    .modify({
                        estado_conciliacion: 'PENDIENTE',
                        matching_trace: [],
                        applied_rules: [],
                        matching_confidence: 0
                    });

                return refs.length;
            });
        } catch (error) {
            console.error('Error in resetMatching:', error);
            throw error;
        }
    }

    static async resetAll() {
        return await db.transaction('rw', [
            db.bank_statements,
            db.reconciliation_lines,
            db.product_movements,
            db.matching_logs
        ], async () => {
            await db.reconciliation_lines.clear();
            await db.product_movements.clear();
            await db.matching_logs.clear();
            await db.bank_statements.toCollection().modify({
                estado_conciliacion: 'PENDIENTE',
                matching_trace: [],
                applied_rules: [],
                matching_confidence: 0
            });
            return true;
        });
    }
}
