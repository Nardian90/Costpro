import { solveCoefficient } from './solver';

describe('Solver with Step Function (Rounding)', () => {
    it('finds the absolute best coefficient when rounding is involved', () => {
        // Mock UI Data
        const mockData: any = {
            annexes: [{ id: 'I', data: [{ price: 100, norm: 1 }], coefficient: 1, isAdjustmentActive: true }],
            sections: [{ rows: [{ id: '14.1', formula: 'TotalAnexoI' }] }]
        };

        // We will fake the engine calculation within simulate by mocking mapper/calculate
        // Actually, solveCoefficient calls mapUIToFicha and calculateFicha.
        // I'll just rely on the existing engine but I'll make a custom test case that is sensitive to rounding.
    });
});
