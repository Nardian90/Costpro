import { describe, it, expect, beforeEach } from 'vitest';
import { StockService } from '../StockService';
import { db } from '../../dexie';
import 'fake-indexeddb/auto';

describe('StockService Reversal & Concurrency', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.product_movements.clear();
        await db.reconciliation_lines.clear();

        await db.products.add({
            cod: 'PROD1',
            descripcion: 'Test Product',
            precio_cents: 1000,
            stock_inicial_manual: 10,
            activo: 1,
            um: 'UD'
        });
    });

    it('should calculate stock correctly', async () => {
        const stock = await StockService.calculateCurrentStock('PROD1');
        expect(stock).toBe(10);
    });

    it('should revert a movement through compensation', async () => {
        // Add an entry movement
        const mId = 'm1';
        await db.product_movements.add({
            id: mId,
            fecha: new Date().toISOString(),
            producto_origen_cod: 'PROVEEDOR',
            producto_destino_cod: 'PROD1',
            cantidad_origen: 0,
            cantidad_destino: 5,
            tipo: 'IMPORT',
            created_at: new Date().toISOString()
        });

        expect(await StockService.calculateCurrentStock('PROD1')).toBe(15);

        // Revert it
        await StockService.revertMovement(mId);

        expect(await StockService.calculateCurrentStock('PROD1')).toBe(10);

        const movements = await db.product_movements.toArray();
        expect(movements.length).toBe(2);

        const rev = movements.find(m => m.motivo?.startsWith('[REVERSIÓN]'));
        expect(rev).toBeDefined();
        expect(rev?.producto_origen_cod).toBe('PROD1');
        expect(rev?.producto_destino_cod).toBe('PROVEEDOR');
    });

    it('should block reversal if stock was already consumed', async () => {
        // Entry of 5
        const mId = 'm1';
        await db.product_movements.add({
            id: mId,
            fecha: new Date().toISOString(),
            producto_origen_cod: 'PROVEEDOR',
            producto_destino_cod: 'PROD1',
            cantidad_origen: 0,
            cantidad_destino: 5,
            tipo: 'IMPORT',
            created_at: new Date().toISOString()
        });

        // Consume 12 (initial 10 + entry 5 = 15. After consume 12 = 3)
        await db.reconciliation_lines.add({
            id: 'l1',
            transaction_ref: 'tx1',
            fecha_operacion: new Date().toISOString(),
            product_cod: 'PROD1',
            cantidad: 12,
            importe_linea_cents: 12000,
            precio_unitario_cents: 1000,
            reconciliation_hash: 'h1',
            created_at: new Date().toISOString()
        } as any);

        expect(await StockService.calculateCurrentStock('PROD1')).toBe(3);

        // Try to revert the entry of 5. It should fail because only 3 are available.
        await expect(StockService.revertMovement(mId))
            .rejects.toThrow(/ya fue utilizado en operaciones posteriores/);
    });

    it('should block reversal if snapshot is stale (concurrency)', async () => {
        // Pre-existing movement to revert
        const mId = 'm1';
        await db.product_movements.add({
            id: mId,
            fecha: new Date().toISOString(),
            producto_origen_cod: 'PROVEEDOR',
            producto_destino_cod: 'PROD1',
            cantidad_origen: 0,
            cantidad_destino: 2,
            tipo: 'IMPORT',
            created_at: new Date().toISOString()
        });

        const snapshot = await StockService.takeSnapshot('PROD1');

        // Parallel change (unrelated to m1)
        await db.product_movements.add({
            id: 'm-external',
            fecha: new Date().toISOString(),
            producto_origen_cod: 'PROD1',
            producto_destino_cod: 'CONSUMO',
            cantidad_origen: 1,
            cantidad_destino: 0,
            tipo: 'MANUAL',
            created_at: new Date().toISOString()
        });

        // Original transaction attempts reversal with stale snapshot
        await expect(StockService.revertMovement(mId, snapshot))
            .rejects.toThrow(/Conflicto de concurrencia/);
    });
});
