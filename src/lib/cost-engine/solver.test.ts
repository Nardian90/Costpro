import { describe, it, expect } from 'vitest';
import { solveCoefficient, solveForTarget } from './solver';
import { CostSheetData } from '@/types/cost-sheet';

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
              classification: '14.1',
              label: 'Precio Final',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [
            { key: 'price_unit', type: 'number', label: 'PRECIO UNITARIO' },
            { key: 'total', type: 'formula', label: 'TOTAL', formula: 'price_unit' }
          ],
          data: [{ price_unit: 10, classification: '14.1' }],
          coefficient: 1,
          isAdjustmentActive: true,
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
              classification: '12',
              label: 'Costo Total',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I'
            },
            {
              id: '13.1',
              classification: '13.1',
              label: 'Utilidad',
              formula: 'ref("12") * 0.1',
              calculationMethod: 'FORMULA'
            },
            {
              id: '14.1',
              classification: '14.1',
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
          columns: [
            { key: 'price_unit', type: 'number', label: 'PRECIO UNITARIO' },
            { key: 'total', type: 'formula', label: 'TOTAL', formula: 'price_unit' }
          ],
          data: [{ price_unit: 100, classification: '12' }],
          coefficient: 1,
          isAdjustmentActive: true,
          adjustmentColumn: 'PRECIO UNITARIO'
        }
      ],
      signature: { prepared_by: '', approved_by: '' }
    };

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
              classification: '14.1',
              label: 'Precio Final',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [
            { key: 'price_unit', type: 'number', label: 'PRECIO UNITARIO' },
            { key: 'total', type: 'formula', label: 'TOTAL', formula: 'price_unit' }
          ],
          data: [{ price_unit: 100, classification: '14.1' }],
          coefficient: 1,
          isAdjustmentActive: true,
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
              classification: '1.1',
              label: 'Costo Base',
              value: 1000,
              calculationMethod: 'FIJO'
            },
            {
              id: '14.1',
              classification: '14.1',
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
              { key: 'total', type: 'formula', label: 'IMPORTE', formula: 'norma * precio' }
          ],
          data: [{ norma: 2, precio: 500, classification: '14.1' }],
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
              classification: '14.1',
              label: 'Precio Final',
              calculationMethod: 'ANEXO',
              baseDeCalculoRef: 'I'
            }
          ]
        }
      ],
      annexes: [
        {
          id: 'I',
          title: 'Anexo I',
          columns: [
              { key: 'norm', label: 'Norma', type: 'number' },
              { key: 'price', label: 'Precio', type: 'number' },
              { key: 'total', label: 'Total', type: 'formula', formula: 'norm * price' }
          ],
          data: [{ norm: 10, price: 200, classification: '14.1' }],
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
              id: '13.1',
              classification: '13.1',
              label: 'Variable Input',
              valorHistorico: 100,
              calculationMethod: 'ValorFijo'
            },
            {
              id: '14.1',
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

  it('should handle vhFormula on variable row (real template scenario)', () => {
    const mockData: CostSheetData = {
      header: { ...BASE_HEADER, quantity: 1 },
      sections: [
        {
          id: 'S1',
          rows: [
            {
              id: '12.1',
              classification: '12.1',
              label: 'Total Cost',
              valorHistorico: 817.69,
              calculationMethod: 'ValorFijo'
            },
            {
              id: '13.1',
              classification: '13.1',
              label: 'Utilidad',
              formula: 'ref("12.1") * 0.3',
              vhFormula: 'vh("12.1") * 0.3',
              calculationMethod: 'FORMULA'
            },
            {
              id: '13.2',
              classification: '13.2',
              label: 'Precio antes de Impuesto',
              formula: 'ref("12.1") + ref("13.1")',
              vhFormula: 'vh("12.1") + vh("13.1")',
              calculationMethod: 'FORMULA'
            },
            {
              id: '13.3',
              classification: '13.3',
              label: 'Impuesto',
              formula: 'ref("13.2") / 0.9 * 0.1',
              vhFormula: 'vh("13.2") / 0.9 * 0.1',
              calculationMethod: 'FORMULA'
            },
            {
              id: '14.1',
              classification: '14.1',
              label: 'Precio Final',
              formula: 'ref("13.2") + ref("13.3")',
              vhFormula: 'vh("13.2") + vh("13.3")',
              calculationMethod: 'FORMULA'
            }
          ]
        }
      ],
      annexes: [],
      signature: { prepared_by: '', approved_by: '' }
    };

    const targetPrice = 1999;
    const result = solveForTarget(mockData, '14.1', targetPrice, '13.1');
    expect(result).toBeCloseTo(981.41, 0);

    const achieved = (817.69 + result) * (10 / 9);
    expect(achieved).toBeCloseTo(targetPrice, 0);
  });
});
