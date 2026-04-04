import { db } from './dexie';
import { Table } from 'dexie';

/**
 * Persistencia Resiliente para IPV
 * Blindaje contra DatabaseClosedError y desincronización silenciosa.
 */

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
    /**
     * Reintento con Backoff Exponencial
     */
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
                    console.warn(`[Persistence] Error reintentable detectado: ${error.name}. Reintento ${i + 1}/${maxRetries} en ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));

                    if (!db.isOpen()) {
                        try { await db.open(); } catch (e) { console.error('[Persistence] Error reabriendo DB:', e); }
                    }
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    /**
     * Escritura Segura con validación post-escritura
     */
    static async writeSafe<T>(
        table: Table<T, any>,
        data: T,
        key?: any,
        validator?: (saved: T) => boolean
    ): Promise<any> {
        return this.executeWithRetry(async () => {
            const id = await table.put(data, key);

            // Validación de Consistencia Mínima
            const saved = await table.get(key || id);
            if (!saved) {
                throw new Error(`[Persistence] Fallo de consistencia: Registro no encontrado tras escritura en ${table.name}`);
            }

            // Validación personalizada (ej: match de cantidad/ID)
            if (validator && !validator(saved)) {
                throw new Error(`[Persistence] Fallo de validación personalizada en ${table.name}`);
            }

            // Log de éxito en audit_logs (silencioso, no bloqueante)
            this.logAudit('WRITE_SUCCESS', table.name, { id, data }).catch(() => {});

            return id;
        }).catch(err => {
            console.error(`[Persistence] Error fatal en escritura en ${table.name}. Encolando fallback.`, err);
            this.enqueuePending('write', [table.name], data);
            throw err;
        });
    }

    /**
     * Lectura Segura
     */
    static async readSafe<T>(fn: () => Promise<T>): Promise<T> {
        return this.executeWithRetry(fn);
    }

    /**
     * Transacción Segura con reintento y rollback nativo
     */
    static async transactionSafe<T>(tables: Table<any, any>[], callback: () => Promise<T>): Promise<T> {
        const tableNames = tables.map(t => t.name);

        return this.executeWithRetry(async () => {
            return await db.transaction('rw', tables, async () => {
                const result = await callback();
                return result;
            });
        }).catch(err => {
            this.logAudit('TRANSACTION_FAILED', tableNames.join(','), { error: err.message }).catch(() => {});
            throw err;
        });
    }

    /**
     * Validación de Integridad Referencial Crítica
     * Si reconciliation_line.origen_dato === 'AUTO_MATCH' -> debe existir el product_movement correspondiente.
     */
    static async validateCrossIntegrity(reconciliationId: string): Promise<boolean> {
        try {
            const line = await db.reconciliation_lines.get(reconciliationId);
            if (!line || (line.origen_dato !== 'AUTO_MATCH' && line.origen_dato !== 'CASH_FILLER')) return true;

            const movement = await db.product_movements
                .where('referencia_transaccion')
                .equals(line.transaction_ref)
                .first();

            if (!movement) {
                console.error(`[Persistence] Desincronización detectada: Reconciliation ${reconciliationId} sin ProductMovement`);
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

    /**
     * Gestión de Operaciones Pendientes (LocalStorage fallback)
     */
    private static enqueuePending(type: 'write' | 'transaction', tables: string[], payload: any) {
        try {
            if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
            const pending = this.getPendingOperations();
            pending.push({
                id: Math.random().toString(36).substr(2, 9),
                type,
                tables,
                payload,
                timestamp: new Date().toISOString(),
                retryCount: 0
            });
            localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pending));
        } catch (e) {
            console.error('[Persistence] Error crítico: No se pudo usar LocalStorage para fallback', e);
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

    /**
     * Reconciliación Automática en Segundo Plano
     */
    static async reconcilePendingOperations(): Promise<{ processed: number, errors: number }> {
        const pending = this.getPendingOperations();
        if (pending.length === 0) return { processed: 0, errors: 0 };

        console.info(`[Persistence] Iniciando reconciliación de ${pending.length} operaciones pendientes...`);
        let processed = 0;
        let errors = 0;

        for (const op of pending) {
            try {
                if (op.type === 'write') {
                    const tableName = op.tables[0];
                    const table = (db as any)[tableName] as Table<any, any>;
                    if (table) {
                        await this.executeWithRetry(() => table.put(op.payload));
                        console.info(`[Persistence] Operación recuperada con éxito: ${op.id} en ${tableName}`);
                        processed++;
                    }
                }

                this.clearPendingOperation(op.id);
            } catch (e) {
                console.error(`[Persistence] No se pudo recuperar operación ${op.id}:`, e);
                errors++;
                this.incrementRetryCount(op.id);
            }
        }

        if (processed > 0) {
            this.logAudit('RECONCILIATION_RUN', 'system', { processed, errors }).catch(() => {});
        }

        return { processed, errors };
    }

    private static clearPendingOperation(id: string) {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
        const pending = this.getPendingOperations().filter(op => op.id !== id);
        localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pending));
    }

    private static incrementRetryCount(id: string) {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
        const pending = this.getPendingOperations().map(op => {
            if (op.id === id) return { ...op, retryCount: op.retryCount + 1 };
            return op;
        });
        localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pending));
    }

    /**
     * Inicia el Job de recuperación en segundo plano
     */
    static startBackgroundJob(intervalMs = 30000) {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
        console.info('[Persistence] Iniciando background recovery job...');

        setTimeout(() => this.reconcilePendingOperations(), 2000);

        setInterval(() => {
            this.reconcilePendingOperations();
        }, intervalMs);
    }

    /**
     * Logging estructurado en audit_logs
     */
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
        } catch (e) {
            // Ignorar fallos de log
        }
    }
}
