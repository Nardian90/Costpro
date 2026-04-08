import { it, expect, describe, beforeEach } from 'vitest';
import { MatchingEngine, DEFAULT_MATCHING_RULES } from '../engine';
import { db } from '../../dexie';

describe('BIG BON Simulation', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.reconciliation_lines.clear();
        await db.product_movements.clear();
        await db.bank_statements.clear();
    });

    it('should decompose BIG BON CAJA -> PQT -> UNIDADES to fulfill a sale', async () => {
        const rules = DEFAULT_MATCHING_RULES.map(r => {
            if (r.tipo === 'STOCK_LIMIT') return { ...r, activo: true };
            return r;
        });

        // 1. Setup Hierarchy
        const products = [
            {
                cod: '2',
                descripcion: 'BIG BON CAJA',
                id_grupo: 'BIGBON',
                cod_hijo: '3',
                um: 'CAJA',
                precio_cents: 13825,
                prioridad_algoritmo: 1,
                activo: true,
                es_paquete: true,
                contenido_paquete: 8,
                stock_inicial_manual: 1,
                created_at: new Date().toISOString()
            },
            {
                cod: '3',
                descripcion: 'BIG BON PQT',
                id_grupo: 'BIGBON',
                cod_hijo: '4',
                um: 'PAQUETE',
                precio_cents: 1730,
                prioridad_algoritmo: 1,
                activo: true,
                es_paquete: true,
                contenido_paquete: 40,
                stock_inicial_manual: 0,
                created_at: new Date().toISOString()
            },
            {
                cod: '4',
                descripcion: 'BOMBON',
                id_grupo: 'BIGBON',
                um: 'UNIDADES',
                precio_cents: 45,
                prioridad_algoritmo: 1,
                activo: true,
                es_paquete: false,
                contenido_paquete: 1,
                stock_inicial_manual: 0,
                created_at: new Date().toISOString()
            }
        ];
        await db.products.bulkPut(products);

        // 2. Create a transaction that needs "BOMBON" (Code 4)
        const tx = {
            referencia_origen: 'tx_bigbon_sale',
            fecha: new Date().toISOString().split('T')[0],
            referencia_corta: 'REF1',
            observaciones: 'VENTA BOMBON X10 BOMBON',
            importe_cents: 450,
            tipo: 'Cr',
            estado_conciliacion: 'PENDIENTE',
            ingestion_hash: 'hash_bigbon',
            created_at: new Date().toISOString()
        };
        await db.bank_statements.add(tx as any);

        // 3. Run Engine
        const engine = new MatchingEngine(products as any, rules);
        const results = await engine.reconcileAll([tx as any]);

        for (const res of results) {
            if (res.lines.length > 0) {
                await db.reconciliation_lines.bulkAdd(res.lines);
            }
            if (res.movements.length > 0) {
                await db.product_movements.bulkAdd(res.movements);
            }
        }

        // 4. Verify results
        const reconLines = await db.reconciliation_lines.where('transaction_ref').equals('tx_bigbon_sale').toArray();
        expect(reconLines.length).toBe(1);
        expect(reconLines[0].product_cod).toBe('4');
        expect(reconLines[0].cantidad).toBe(10);

        // 5. Verify movements (Decompositions)
        const movements = await db.product_movements.toArray();
        expect(movements.length).toBeGreaterThanOrEqual(2);

        const m1 = movements.find(m => m.producto_origen_cod === '2');
        expect(m1?.producto_destino_cod).toBe('3');
        expect(m1?.cantidad_origen).toBe(1);
        expect(m1?.cantidad_destino).toBe(8);

        const m2 = movements.find(m => m.producto_origen_cod === '3');
        expect(m2?.producto_destino_cod).toBe('4');
        expect(m2?.cantidad_origen).toBe(1);
        expect(m2?.cantidad_destino).toBe(40);
    });
});
