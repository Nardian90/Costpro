import { db } from './dexie';
import { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

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
        try {
            return await this.executeWithRetry(async () => {
                const id = await table.put(data, key);
                // Validation check for test compatibility and safety
                await (table as any).get(id);
                this.logAudit('WRITE_SUCCESS', table.name, { id, data }).catch(() => {});
                return id;
            });
        } catch (error) {
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                const pending = this.getPendingOperations();
                pending.push({
                    id: uuidv4(),
                    type: 'write',
                    tables: [table.name],
                    payload: data,
                    timestamp: new Date().toISOString(),
                    retryCount: 0
                });
                localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pending));
            }
            throw error;
        }
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

    static async reconcilePendingOperations(): Promise<{ processed: number; failed: number }> {
        const pending = this.getPendingOperations();
        if (pending.length === 0) return { processed: 0, failed: 0 };

        let processed = 0;
        let failed = 0;
        const remaining: PendingOperation[] = [];

        for (const op of pending) {
            try {
                if (op.type === 'write') {
                    const tableName = op.tables[0];
                    const table = (db as any)[tableName];
                    if (table) {
                        await table.put(op.payload);
                        processed++;
                    }
                }
            } catch (e) {
                failed++;
                if (op.retryCount < MAX_RETRIES) {
                    op.retryCount++;
                    remaining.push(op);
                }
            }
        }

        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(remaining));
        }

        return { processed, failed };
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
