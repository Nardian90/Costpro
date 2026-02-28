import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../logic/useCostSheetCalculator';
import { CostSheetData } from '@/types/cost-sheet';

const mockTemplate: CostSheetData = {
  header: {
    code: 'TEST-001',
    name: 'Test Ficha',
    quantity: 1,
    unit: 'U',
    currency: 'CUP',
    production_level: 100
  },
  sections: [
    {
      id: 's1',
      label: '1. GASTOS MATERIALES',
      rows: [
        {
          id: '1',
          label: 'GASTO MATERIAL',
          totalFormula: '=SUMA(hijos)',
          children: [
            { id: '1.1', label: 'Insumos', valorHistorico: 100, calculationMethod: 'ValorFijo' }
          ]
        }
      ]
    },
    {
        id: 's13',
        label: '13. UTILIDAD',
        rows: [
            { id: '12', label: 'COSTO TOTAL', valorHistorico: 1000, calculationMethod: 'ValorFijo' },
            { id: '13', label: 'UTILIDAD', totalFormula: '=ref("12") * 0.4', calculationMethod: 'FORMULA' }
        ]
    }
  ],
  annexes: []
} as any;

describe('useCostSheetCalculator', () => {
  it('should calculate validation errors for Res 148', () => {
    const { result } = renderHook(() => useCostSheetCalculator(mockTemplate));

    const utilValidation = result.current.validations.find(v => v.category === 'Rentabilidad');
    expect(utilValidation).toBeDefined();
    expect(utilValidation?.type).toBe('WARNING');
    expect(utilValidation?.message).toContain('30%');
  });

  it('should calculate correctly parent sum integrity', () => {
    const { result } = renderHook(() => useCostSheetCalculator(mockTemplate));
    const val1 = result.current.calculatedValues['1'];
    expect(val1.total).toBe(100);
  });
});
