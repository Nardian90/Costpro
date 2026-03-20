import { describe, it, expect } from 'vitest';
import { calculateCosts } from '../costEngine';
import { Product, IntelligentReceipt } from '../../dexie';

describe('Cost Engine', () => {
    const mockProducts: Product[] = [
        {
            cod: 'P1',
            descripcion: 'Product 1',
            precio_cents: 1000, // 10 Pesos UNIT
            unit_level: 'UNIT',
            unit_factor: 1,
            um: 'U',
            es_paquete: false,
            contenido_paquete: 1,
            prioridad_algoritmo: 1,
            activo: true,
            stock_inicial_manual: 0,
            created_at: ''
        },
        {
            cod: 'P2',
            descripcion: 'Product 2',
            precio_cents: 1000, // 10 Pesos UNIT
            unit_level: 'BOX',
            unit_factor: 10, // 100 Pesos BOX
            um: 'C',
            es_paquete: true,
            contenido_paquete: 1,
            prioridad_algoritmo: 1,
            activo: true,
            stock_inicial_manual: 0,
            created_at: ''
        }
    ];

    const mockReceipts: IntelligentReceipt[] = [
        {
            id: 'R1',
            date: '2024-01-01',
            product_id: 'P1',
            type: 'INTELLIGENT',
            level: 'UNIT',
            quantity: 5,
            total_units: 5,
            source: 'SALES',
            mode: 'B',
            applied: false,
            created_at: ''
        },
        {
            id: 'R2',
            date: '2024-01-01',
            product_id: 'P2',
            type: 'INTELLIGENT',
            level: 'BOX',
            quantity: 1,
            total_units: 10,
            source: 'SALES',
            mode: 'B',
            applied: false,
            created_at: ''
        }
    ];

    it('should calculate costs correctly in PERCENTAGE mode', () => {
        const config = {
            type: 'PERCENTAGE' as const,
            value: 0.6,
            usuario_id: 'test'
        };

        const result = calculateCosts(mockReceipts, mockProducts, config);

        // P1: 1000 * 0.6 = 600 cents per unit
        expect(result[0].costo_unitario_cents).toBe(600);
        expect(result[0].costo_total_cents).toBe(3000);

        // P2: 1000 * 10 (factor) * 0.6 = 6000 cents per BOX
        expect(result[1].costo_unitario_cents).toBe(6000);
        expect(result[1].costo_total_cents).toBe(6000);
    });

    it('should calculate costs correctly in TARGET_PROFIT mode', () => {
        // Venta Total: (5 * 1000) + (1 * 10000) = 5000 + 10000 = 15000 cents
        // Utilidad deseada: 3000 cents
        // Costo permitido: 12000 cents
        const config = {
            type: 'TARGET_PROFIT' as const,
            value: 3000,
            usuario_id: 'test'
        };

        const result = calculateCosts(mockReceipts, mockProducts, config);

        // Peso P1: 5000 / 15000 = 1/3
        // Costo P1: 12000 * (1/3) = 4000 cents total
        // Costo Unitario P1: 4000 / 5 = 800 cents
        expect(result[0].costo_unitario_cents).toBe(800);
        expect(result[0].costo_total_cents).toBe(4000);

        // Peso P2: 10000 / 15000 = 2/3
        // Costo P2: 12000 * (2/3) = 8000 cents total
        // Costo Unitario P2: 8000 / 1 = 8000 cents (per BOX)
        expect(result[1].costo_unitario_cents).toBe(8000);
        expect(result[1].costo_total_cents).toBe(8000);
    });
});
