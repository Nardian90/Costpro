import { it, expect, describe, beforeEach } from 'vitest';
import { MatchingEngine } from '../engine';
import { db } from '../../dexie';

describe('BIG BON Simulation', () => {
    beforeEach(async () => {
        await db.products.clear();
        await db.reconciliation_lines.clear();
        await db.product_movements.clear();
        await db.bank_statements.clear();
    });

    it('should decompose BIG BON CAJA -> PQT -> UNIDADES to fulfill a sale', async () => {
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
                contenido_paquete: 8, // 8 PQT per CAJA
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
                contenido_paquete: 40, // 40 units per PQT
                stock_inicial_manual: 0, // No stock of packs
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
                stock_inicial_manual: 0, // No stock of units
                created_at: new Date().toISOString()
            }
        ];
        await db.products.bulkPut(products);

        // 2. Create a transaction that needs "BOMBON" (Code 4)
        // A sale of 10 units of BOMBON at 45 cents each = 450 cents
        const tx = {
            id: 'tx_bigbon_sale',
            fecha: new Date().toISOString(),
            descripcion: 'VENTA BOMBON X10',
            importe: -450, // Negative for sale
            tipo: 'TRANSFERENCIA',
            moneda: 'CUP',
            estado: 'PENDIENTE'
        };
        await db.bank_statements.add(tx as any);

        // 3. Run Engine
        await MatchingEngine.reconcileAll();

        // 4. Verify results
        const reconLines = await db.reconciliation_lines.where('transaction_id').equals('tx_bigbon_sale').toArray();
        expect(reconLines.length).toBe(1);
        expect(reconLines[0].product_cod).toBe('4');
        expect(reconLines[0].qty).toBe(10);

        // 5. Verify movements (Decompositions)
        const movements = await db.product_movements.toArray();
        // Should have 2 movements:
        // 1. CAJA (2) -> PQT (3)
        // 2. PQT (3) -> UNIT (4)
        expect(movements.length).toBe(2);

        const m1 = movements.find(m => m.product_id === '2');
        expect(m1?.target_product_id).toBe('3');
        expect(m1?.qty_converted).toBe(1);
        expect(m1?.resulting_qty).toBe(8);

        const m2 = movements.find(m => m.product_id === '3');
        expect(m2?.target_product_id).toBe('4');
        expect(m2?.qty_converted).toBe(1);
        expect(m2?.resulting_qty).toBe(40);

        console.log('Simulation successful: CAJA decomposed into units to fulfill the sale.');
    });
});
