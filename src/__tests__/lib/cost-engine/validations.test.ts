import { describe, it, expect } from 'vitest';
import { calculateCostSheetHealth } from '@/lib/cost-engine/validations';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';

describe('validations', () => {
  it('calculateCostSheetHealth returns > 0% for valid sheet', () => {
    const data = CostSheetDataFactory.create({
      header: {
        code: 'C1', name: 'N', date: '2024-01-01', quantity: 1, currency: 'CUP', category: 'C', type: 'T', unit: 'U',
        product_code: 'P1', company: 'CO', organism: 'O', union: 'U', destination: 'D',
        production_level: 0, capacity_utilization: 0, sale_price: 0, client: 'CL'
      }
    }) as any;

    const calculatedValues: any = {
      '1.1.1': { total: 100 },
      '2.1.1': { total: 100 },
      '2.1': { total: 100 },
      '4.1.1': { total: 100 },
      '6.1.1': { total: 100 },
      '7.1.1': { total: 100 },
      '10.1': { total: 56 },
      '10.2': { total: 20 },
      '1': { total: 100 },
      '2': { total: 100 },
      '3': { total: 100 },
      '4': { total: 100 },
      '5.1': { total: 400 },
      '6': { total: 100 },
      '7': { total: 100 },
      '8': { total: 100 },
      '9': { total: 100 },
      '10': { total: 100 },
      '11.1': { total: 500 },
      '12.1': { total: 900 },
      '13.1': { total: 100 },
      '13.2': { total: 1000 },
      '13.3': { total: 111.11 },
      '14.1': { total: 1111.11 },
      '15.1': { total: 900 },
      '16.1': { total: 1111.11 }
    };

    const { healthPercent } = calculateCostSheetHealth(data, calculatedValues, data.header);
    expect(healthPercent).toBeGreaterThan(0);
  });

  it('calculateCostSheetHealth detects structural errors', () => {
    const data = CostSheetDataFactory.create({
      sections: [
        {
          id: 's1',
          label: 'S1',
          rows: [
            {
              id: 'parent',
              label: 'P',
              children: [{ id: 'child', label: 'C' }]
            }
          ]
        }
      ]
    }) as any;

    const calculatedValues: any = {
      'parent': { total: 100 },
      'child': { total: 50 } // Sum mismatch: 50 != 100
    };

    const { validations } = calculateCostSheetHealth(data, calculatedValues, data.header);
    const hasCritical = validations.some(v => v.type === 'CRITICAL');
    expect(hasCritical).toBe(true);
  });
});
