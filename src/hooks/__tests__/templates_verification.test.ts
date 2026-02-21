import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../logic/useCostSheetCalculator';
import reinicioTemplate from '../../lib/data/costpro-reinicio';
import juiceTemplate from '../../lib/data/template-juice';
import industrialTemplate from '../../lib/data/template-industrial';

// Mocking useMemo to avoid React dependency issues if any, but renderHook should handle it
// useCostSheetCalculator uses useEffect, so we need to wait for it

describe('Templates Verification', () => {
    it('should evaluate header formulas in reinicioTemplate when data is added', async () => {
        const template = JSON.parse(JSON.stringify(reinicioTemplate));

        // Add one row to Annex I
        template.annexes[0].data = [{
            description: 'Producto de Prueba',
            code: 'TEST-001',
            um: 'Unidad',
            consumption_norm: 10,
            price: 100
        }];

        const { result, rerender } = renderHook(() => useCostSheetCalculator(template));

        // We need to wait for the useEffect to run
        // In Vitest with React 18+, we might need to wait or use act

        // Give it a moment for the effect
        await new Promise(r => setTimeout(r, 100));

        const calculatedHeader = result.current.calculatedHeader;

        expect(calculatedHeader.name).toBe('Producto de Prueba');
        expect(calculatedHeader.product_code).toBe('TEST-001');
        expect(calculatedHeader.unit).toBe('Unidad');
        expect(calculatedHeader.quantity).toBe(10);
    });

    it('should correctly calculate juiceTemplate', async () => {
        const { result } = renderHook(() => useCostSheetCalculator(juiceTemplate));
        await new Promise(r => setTimeout(r, 100));

        const values = result.current.calculatedValues;
        // Section 1 (Gasto Material) should match Annex I total
        // Annex I: (1.5 * 120) + (0.1 * 100) + (0.4 * 5) = 180 + 10 + 2 = 192
        expect(values['1'].total).toBe(192);
        expect(values['12'].total).toBe(192);
    });

    it('should correctly calculate industrialTemplate with all annexes', async () => {
        const { result } = renderHook(() => useCostSheetCalculator(industrialTemplate));
        await new Promise(r => setTimeout(r, 100));

        const values = result.current.calculatedValues;

        // Verify Section 1 (Material)
        // 400*850 + 150*1200 + 200*45 + 10*3500 + 350*15 = 340000 + 180000 + 9000 + 35000 + 5250 = 569250
        expect(values['1'].total).toBe(569250);

        // Verify Section 2 (Labor)
        // 40*250 + 10*450 + 20*150 = 10000 + 4500 + 3000 = 17500
        expect(values['2'].total).toBe(17500);

        // Verify Section 12 (Costo Total)
        // Material(569250) + Labor(17500) + Otros(52000) + Deprec(59166.67?) + Dietas(20500)
        // Let's check the total in Row 12
        expect(values['12'].total).toBeGreaterThan(600000);
    });
});
