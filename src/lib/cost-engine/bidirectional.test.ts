import { describe, it, expect } from 'vitest';
import { calculateFicha, validateFicha } from './index';
import { FichaJSON } from './types';

describe('Bidirectional and Section 13 validations', () => {
    it('should allow Section 13 to reference children without HARD_RULE_VIOLATION', () => {
        const ficha: FichaJSON = {
            meta: { id: 'test', name: 'test', currency: 'CUP', decimals: 2 },
            anexos: [],
            rows: [
                {
                    id: '13',
                    classification: '13',
                    label: 'Utility',
                    type: 'MARGIN',
                    formaCalculo: 'FORMULA',
                    formula: "ref('13.1') * 2",
                },
                {
                    id: '13.1',
                    parentId: '13',
                    classification: '13.1',
                    label: 'Sub-utility',
                    type: 'MARGIN',
                    formaCalculo: 'FIJO',
                    valorHistorico: 100,
                }
            ]
        };

        const validation = validateFicha(ficha);
        const hardRuleErrors = validation.validationErrors.filter(e => e.code === 'HARD_RULE_VIOLATION');
        expect(hardRuleErrors.length).toBe(0);

        const result = calculateFicha(ficha);
        const row13 = result.rows.find(r => r.id === '13');
        expect(row13?.total).toBe(200);
    });

    it('should support vh() function and vhFormula', () => {
        const ficha: FichaJSON = {
            meta: { id: 'test', name: 'test', currency: 'CUP', decimals: 2 },
            anexos: [],
            rows: [
                {
                    id: '1',
                    classification: '1',
                    label: 'Row 1',
                    type: 'COST',
                    formaCalculo: 'FORMULA',
                    vhFormula: "ref('2') * 0.5", // VH of 1 depends on Total of 2
                    formula: "VH * valor(2)", // Total of 1 depends on its own VH
                },
                {
                    id: '2',
                    classification: '2',
                    label: 'Row 2',
                    type: 'COST',
                    formaCalculo: 'FIJO',
                    valorHistorico: 100,
                }
            ]
        };

        const result = calculateFicha(ficha);
        const row1 = result.rows.find(r => r.id === '1');
        // VH of 1 = Total of 2 * 0.5 = 100 * 0.5 = 50
        // Total of 1 = VH of 1 * 2 = 50 * 2 = 100
        expect(row1?.calculatedVH).toBe(50);
        expect(row1?.total).toBe(100);
    });

    it('should support cross-column referencing between different rows', () => {
        const ficha: FichaJSON = {
            meta: { id: 'test', name: 'test', currency: 'CUP', decimals: 2 },
            anexos: [],
            rows: [
                {
                    id: 'A',
                    classification: 'A',
                    label: 'Row A',
                    type: 'COST',
                    formaCalculo: 'FORMULA',
                    formula: "vh('B') * 0.1 + 10", // Total A depends on VH B
                },
                {
                    id: 'B',
                    classification: 'B',
                    label: 'Row B',
                    type: 'COST',
                    formaCalculo: 'FORMULA',
                    vhFormula: "ref('A') * 2", // VH B depends on Total A
                    formula: "VH",
                }
            ]
        };

        // This is a cycle: Total A -> VH B -> Total A.
        // Total A = VH B * 0.1 + 10
        // VH B = Total A * 2
        // Total A = (Total A * 2) * 0.1 + 10 = 0.2 * Total A + 10
        // 0.8 * Total A = 10 => Total A = 12.5.
        // VH B = 25.

        const result = calculateFicha(ficha, { maxIter: 40 });
        const rowA = result.rows.find(r => r.id === 'A');
        const rowB = result.rows.find(r => r.id === 'B');

        expect(rowA?.total).toBeCloseTo(12.5);
        expect(rowB?.calculatedVH).toBeCloseTo(25);
    });
});
