import { db } from './dexie';
import { Table } from 'dexie';

export interface PendingOperation {
    id: string;
    type: 'write' | 'transaction';
    tables: string[];
    payload: any;
    timestamp: string;
    retryCount: number;
}

const STORAGE_KEY_PENDING = 'ipv_pending_ops';
const MAX_RETRIES = 5;
const INITIAL_BACKOFF = 100;

export class PersistenceService {
    static async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
        let lastError: any;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                const isRetryable =
                    error.name === 'DatabaseClosedError' ||
                    error.message?.includes('Database is closed') ||
                    error.message?.includes('Transaction inactive');

                if (isRetryable && i < maxRetries - 1) {
                    const delay = Math.pow(2, i) * INITIAL_BACKOFF;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    if (!db.isOpen()) {
                        try { await db.open(); } catch (e) {}
                    }
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    static async writeSafe<T>(table: Table<T, any>, data: T, key?: any): Promise<any> {
        return this.executeWithRetry(async () => {
            const id = await table.put(data, key);
            this.logAudit('WRITE_SUCCESS', table.name, { id, data }).catch(() => {});
            return id;
        });
    }

    static async readSafe<T>(fn: () => Promise<T>): Promise<T> {
        return this.executeWithRetry(fn);
    }

    static async transactionSafe<T>(tables: Table<any, any>[], callback: () => Promise<T>): Promise<T> {
        return this.executeWithRetry(async () => {
            return await db.transaction('rw', tables, async () => {
                return await callback();
            });
        });
    }

    static async validateCrossIntegrity(reconciliationId: string): Promise<boolean> {
        try {
            const line = await db.reconciliation_lines.get(reconciliationId);
            if (!line || line.origen_dato !== 'AUTO_MATCH') return true;

            const movement = await db.product_movements
                .where('referencia_transaccion')
                .equals(line.transaction_ref)
                .first();

            if (!movement) {
                await this.logAudit('DESYNC_DETECTED', 'reconciliation_lines', {
                    reconciliationId,
                    ref: line.transaction_ref,
                    type: line.origen_dato
                });
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    static getPendingOperations(): PendingOperation[] {
        try {
            if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
            const raw = localStorage.getItem(STORAGE_KEY_PENDING);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    private static async logAudit(action: string, entity: string, metadata: any) {
        try {
            if (!db.isOpen()) return;
            await db.audit_logs.add({
                timestamp: new Date().toISOString(),
                actor: 'SYSTEM_PERSISTENCE',
                action,
                entity,
                metadata
            });
        } catch (e) {}
    }
}
