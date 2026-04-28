import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../logic/useCostSheetCalculator';
import reinicioTemplate from '../../lib/data/costpro-reinicio';
import juiceTemplate from '../../lib/data/template-juice';
import industrialTemplate from '../../lib/data/template-industrial';

describe('Templates Verification', () => {
    it('should evaluate header formulas in reinicioTemplate when formulas are set', async () => {
        const template = JSON.parse(JSON.stringify(reinicioTemplate));

        // Set formulas in header using the supported GET_ANEXO_FILA_DATO
        template.header.name = '=GET_ANEXO_FILA_DATO("I", 1, "description")';
        template.header.product_code = '=GET_ANEXO_FILA_DATO("I", 1, "code")';

        // Add one row to Annex I
        template.annexes[0].data = [{
            classification: '1.1.1',
            description: 'Producto de Prueba',
            code: 'TEST-001',
            um: 'Unidad',
            consumption_norm: 10,
            price: 100
        }];

        const { result } = renderHook(() => useCostSheetCalculator(template));

        // Give it a moment for the effect
        await new Promise(r => setTimeout(r, 200));

        const calculatedHeader = result.current.calculatedHeader;

        expect(calculatedHeader.name).toBe('Producto de Prueba');
        expect(calculatedHeader.product_code).toBe('TEST-001');
    });

    it('should correctly calculate juiceTemplate', async () => {
        const { result } = renderHook(() => useCostSheetCalculator(juiceTemplate));
        await new Promise(r => setTimeout(r, 200));

        const values = result.current.calculatedValues;
        // Section 1 (Gasto Material) should match Annex I total
        // Annex I: (1.5 * 120) + (0.1 * 100) + (0.4 * 5) = 180 + 10 + 2 = 192
        expect(values['1'].total).toBe(192);
        // Total costs (Section 12) includes Section 2 (Labor), 4 (Asociados), 6 (Admón), 7 (Dist)
        expect(values['12.1'].total).toBeGreaterThan(200);
    });

    it('should correctly calculate industrialTemplate with all annexes', async () => {
        const { result } = renderHook(() => useCostSheetCalculator(industrialTemplate));
        await new Promise(r => setTimeout(r, 200));

        const values = result.current.calculatedValues;

        // Verify Section 1 (Material)
        expect(values['1'].total).toBe(569250);

        // Verify Section 2 (Labor)
        expect(values['2.1'].total).toBe(17500);

        // Verify Section 12 (Costo Total)
        expect(values['12.1'].total).toBeGreaterThan(500000);
    });
});
