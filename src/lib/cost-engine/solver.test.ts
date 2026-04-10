import { describe, it, expect } from 'vitest';
import { solveCoefficient, solveForTarget } from './solver';
import { CostSheetData } from '@/types/cost-sheet';
import templateLavar from '../data/template-lavar';
import { mapUIToFicha } from './mapper';
import { calculateFicha } from './index';

const BASE_HEADER = {
  code: 'TEST',
  name: 'Test Ficha',
  date: '2023-01-01',
  quantity: 1,
  currency: 'CUP',
  category: 'Test',
  type: 'Test',
  unit: 'U'
};

describe('Cost Solver', () => {
  it('should find the correct coefficient for a simple target', () => {
    const mockData: CostSheetData = {
      header: { ...BASE_HEADER },
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
      header: { ...BASE_HEADER },
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

  it('should find the correct coefficient for target 25 when initial cost is 100 (decrease coefficient)', () => {
    const mockData: CostSheetData = {
      header: { ...BASE_HEADER },
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

  it('should find a correct coefficient for Annex I with Spanish labels (norma/precio)', () => {
    const mockData: any = {
      header: { ...BASE_HEADER },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: '1.1',
              label: 'Costo Base',
              value: 1000,
              calculationMethod: 'FIJO'
            },
            {
              id: '14.1',
              label: 'Precio Final',
              calculationMethod: 'FORMULA',
              formula: 'ref("1.1") + TotalAnexoI'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [
              { key: 'norma', type: 'number', label: 'NORMA' },
              { key: 'precio', type: 'number', label: 'PRECIO' },
              { key: 'importe', type: 'formula', label: 'IMPORTE', formula: '=norma * precio' }
          ],
          data: [{ norma: 2, precio: 500, importe: '=norma * precio', classification: '1.1' }],
          coefficient: 1,
          isAdjustmentActive: true,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

    const coef = solveCoefficient(mockData, 'I', 2500);
    expect(coef).toBeCloseTo(1.5, 2);
  });

  it('correctly handles total: 0 fallback to norm * price in mapping and solving', () => {
    const mockData: any = {
      header: { ...BASE_HEADER },
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
          columns: [
              { key: 'consumption_norm', label: 'Norma' },
              { key: 'price', label: 'Precio' },
              { key: 'total', label: 'Total' }
          ],
          data: [{ consumption_norm: 10, price: 200, total: 0, classification: '1.1' }],
          coefficient: 1,
          isAdjustmentActive: true,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

    const target = 3000;
    const coef = solveCoefficient(mockData, 'I', target);
    expect(coef).toBeCloseTo(1.5, 3);
  });
});

describe('solveForTarget', () => {
  it('should find the correct variable value for a target row', () => {
    const mockData: CostSheetData = {
      header: { ...BASE_HEADER },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: 'V1',
              classification: '13.1',
              label: 'Variable Input',
              valorHistorico: 100,
              calculationMethod: 'ValorFijo'
            },
            {
              id: 'T1',
              classification: '14.1',
              label: 'Target Output',
              formula: 'ref("13.1") * 1.2',
              calculationMethod: 'FORMULA'
            }
          ]
        }
      ],
      annexes: [],
      signature: { prepared_by: '', approved_by: '' }
    };

    // Target is 2400. 2400 / 1.2 = 2000.
    const result = solveForTarget(mockData, '14.1', 2400, '13.1');
    expect(result).toBeCloseTo(2000, 2);
  });
});
