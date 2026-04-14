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

  it('should handle vhFormula on variable row (real template scenario)', () => {
    // This mimics the real cost sheet structure:
    // 12.1 = cost (fixed 817.69)
    // 13.1 = utility = ref('12.1') * 0.3 (has vhFormula too)
    // 13.2 = price before tax = ref('12.1') + ref('13.1')
    // 13.3 = tax = ref('13.2') / 0.9 * 0.1
    // 14.1 = final price = ref('13.2') + ref('13.3')
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

    // When utilidad=0:
    // 13.2 = 817.69 + 0 = 817.69
    // 13.3 = 817.69 / 9 = 90.85
    // 14.1 = 817.69 + 90.85 = 908.54
    // Target 1999: need 14.1 = 1999
    // 14.1 = (12.1 + 13.1) * 10/9
    // 1999 = (817.69 + U) * 10/9
    // 1999 * 9/10 = 817.69 + U
    // 1799.1 = 817.69 + U
    // U = 981.41
    const targetPrice = 1999;
    const result = solveForTarget(mockData, '14.1', targetPrice, '13.1');

    // Verify: the utilidad should be approximately 981.41
    expect(result).toBeCloseTo(981.41, 0);

    // Verify by manual calculation:
    // 14.1 = (817.69 + result) + (817.69 + result) / 9
    // = (817.69 + result) * (1 + 1/9)
    // = (817.69 + result) * 10/9
    const achieved = (817.69 + result) * (10 / 9);
    expect(achieved).toBeCloseTo(targetPrice, 0);
  });
});
