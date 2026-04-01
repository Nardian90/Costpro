import { describe, it, expect } from 'bun:test';
import { solveCoefficient } from './solver';
import { CostSheetData } from '@/types/cost-sheet';

describe('Cost Solver', () => {
  it('should find the correct coefficient for a simple target', () => {
    const mockData: CostSheetData = {
      header: {
        code: 'TEST',
        name: 'Test Ficha',
        date: '2023-01-01',
        quantity: 1,
        currency: 'CUP',
        category: 'Test',
        type: 'Test',
        unit: 'U'
      },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: '14.1',
              label: 'Precio Final',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I',
              formula: 'TotalAnexoI'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [{ key: 'price_unit', type: 'number', label: 'PRECIO UNITARIO' }],
          data: [{ price_unit: 10, total: 10, classification: '1.1' }],
          coefficient: 1,
          isAdjustmentActive: false,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

    const coef = solveCoefficient(mockData, 'I', 25);
    expect(coef).toBeCloseTo(2.5, 1);
  });

  it('should handle complex scenarios with utility margin', () => {
    const mockData: CostSheetData = {
      header: { quantity: 1 },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: '12',
              label: 'Costo Total',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I',
              formula: 'TotalAnexoI'
            },
            {
              id: '13.1',
              label: 'Utilidad',
              formula: 'ref("12") * 0.1',
              calculationMethod: 'FORMULA'
            },
            {
              id: '14.1',
              label: 'Precio Final',
              formula: 'ref("12") + ref("13.1")',
              calculationMethod: 'FORMULA'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [{ key: 'total', type: 'number', label: 'TOTAL' }],
          data: [{ total: 100, classification: '1.1' }],
          coefficient: 1,
          isAdjustmentActive: false,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

    // Target is 220. Cost 100 * 1.1 = 110. 110 + 11 = 121 (if coef=1)
    // Target 220 means Cost should be 200 (since 200 + 20 = 220).
    // So Coef should be 2.0
    const coef = solveCoefficient(mockData, 'I', 220);
    expect(coef).toBeCloseTo(2.0, 1);
  });
});

  it('should find the correct coefficient for target 25 when initial cost is 100 (decrease coefficient)', () => {
    const mockData: CostSheetData = {
      header: { quantity: 1 },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: '14.1',
              label: 'Precio Final',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I',
              formula: 'TotalAnexoI'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [{ key: 'total', type: 'number', label: 'TOTAL' }],
          data: [{ total: 100, classification: '1.1' }],
          coefficient: 1,
          isAdjustmentActive: false,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

    const coef = solveCoefficient(mockData, 'I', 25);
    expect(coef).toBeCloseTo(0.25, 1);
  });
