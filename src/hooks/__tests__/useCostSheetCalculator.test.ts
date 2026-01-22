import { renderHook } from '@testing-library/react';
import { useCostSheetCalculator } from '../useCostSheetCalculator';
import { describe, it, expect } from 'vitest';
import { CostSheetData } from '@/types/cost-sheet';

const mockTemplate: CostSheetData = {
  header: {
    quantity: 100,
    currency: 'CUP',
  },
  sections: [
    {
      id: 'section1',
      label: 'Section 1',
      rows: [
        {
          id: 'row1',
          label: 'Row 1',
          valorHistorico: 1000,
          calculationMethod: 'ValorFijo',
        },
        {
          id: 'row2',
          label: 'Row 2',
          formula: 'ref("row1") * 0.1',
        }
      ]
    }
  ],
  annexes: [],
  signature: { prepared_by: '', approved_by: '' }
};

describe('useCostSheetCalculator', () => {
  it('should calculate values based on fixed value', () => {
    const { result } = renderHook(() => useCostSheetCalculator(mockTemplate));

    expect(result.current.calculatedValues['row1']).toBeDefined();
    expect(result.current.calculatedValues['row1'].total).toBe(1000);
  });

  it('should calculate values based on formula', () => {
    const { result } = renderHook(() => useCostSheetCalculator(mockTemplate));

    // Formula calculation might happen in useEffect, so we might need to wait or just rely on initial render if it's deterministic
    expect(result.current.calculatedValues['row2']).toBeDefined();
    expect(result.current.calculatedValues['row2'].total).toBe(100);
  });
});
