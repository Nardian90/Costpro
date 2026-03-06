import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../logic/useCostSheetCalculator';
import { CostSheetData } from '@/contracts';

const baseTemplate: CostSheetData = {
    header: {
        name: 'Test',
        code: 'T-001',
        product_code: 'P-001',
        unit: 'u',
        quantity: 100,
        production_level: 100,
        currency: 'CUP'
    },
    sections: [],
    annexes: []
};

describe('useCostSheetCalculator', () => {
  it('should handle empty sections without errors', () => {
    const { result } = renderHook(() => useCostSheetCalculator(baseTemplate));
    expect(result.current.calculatedValues).toEqual({});
  });

  it('should calculate ValorFijo correctly', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        sections: [{
            id: 's1',
            label: 'Section 1',
            rows: [{ id: 'r1', label: 'Row 1', valorHistorico: 100, calculationMethod: 'ValorFijo' }]
        }]
    };
    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.calculatedValues['r1'].total).toBe(100);
  });

  it('should calculate health validations and percent correctly', () => {
    const template: CostSheetData = {
        ...baseTemplate,
        sections: [{
            id: 's1',
            label: 'Production',
            rows: [
                { id: '2', label: 'Salario Directo', valorHistorico: 1000, calculationMethod: 'ValorFijo' },
                { id: '4', label: 'Gasto Indirecto 1', valorHistorico: 100, calculationMethod: 'ValorFijo' },
                { id: '12', label: 'Costo Total', formula: '1100', calculationMethod: 'FORMULA' },
                { id: '13', label: 'Utilidad', formula: '100', calculationMethod: 'FORMULA' }
            ]
        }]
    };

    const { result } = renderHook(() => useCostSheetCalculator(template));
    expect(result.current.validations.length).toBeGreaterThan(0);
    // Success rate depends on the validation engine rules
    expect(result.current.validations.some(v => v.type === 'SUCCESS')).toBe(true);
  });
});
