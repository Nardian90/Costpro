
import { describe, it, expect } from 'vitest';
import { calculateFicha } from './index';
import { FichaJSON } from './types';

describe('User provided invalid JSON validation', () => {
  it('should detect the cycle in Section 13 and missing references', () => {
    const ficha: FichaJSON = {
      meta: {
        id: 'costpro-full-v5',
        name: 'Producción de Pan Artistas',
        currency: 'CUP',
        decimals: 2,
        settings: { allowFormulas: true }
      },
      rows: [
        {
          id: '12',
          classification: '12',
          label: 'TOTAL COSTOS Y GASTOS (5+11)',
          formaCalculo: 'FORMULA',
          formula: '0',
          type: 'TOTAL'
        },
        {
          id: '13',
          classification: '13',
          label: 'Utilidad',
          formaCalculo: 'FORMULA',
          formula: "ref('12.1')",
          type: 'MARGIN'
        },
        {
          id: '13.1',
          classification: '13.1',
          label: 'Precio antes de Impuesto',
          formaCalculo: 'FORMULA',
          formula: "ref('13.1')+ref('12.1')",
          type: 'MARGIN'
        }
      ],
      anexos: []
    };

    const result = calculateFicha(ficha);
    const cycleError = result.deepValidationErrors?.find(e => e.rowId === '13.1' && e.code === 'CYCLE');
    const missingRefError13 = result.deepValidationErrors?.find(e => e.rowId === '13' && e.code === 'MISSING_REF');

    expect(cycleError).toBeDefined();
    expect(missingRefError13).toBeDefined();
    expect(result.deepValidationErrors?.some(e => e.type === 'CRITICAL')).toBe(true);
  });

  it('should detect self-reference in Section 13', () => {
    const ficha: FichaJSON = {
      meta: {
        id: 'test-13',
        name: 'Test 13',
        currency: 'CUP',
        decimals: 2,
        settings: { allowFormulas: true }
      },
      rows: [
        {
          id: '13',
          classification: '13',
          label: 'Utilidad',
          formaCalculo: 'FORMULA',
          formula: "ref('13')",
          type: 'MARGIN'
        }
      ],
      anexos: []
    };

    const result = calculateFicha(ficha);
    const cycleError = result.deepValidationErrors?.find(e => e.rowId === '13' && e.code === 'CYCLE');
    expect(cycleError).toBeDefined();
  });

  it('should not detect cycle in nested sum of children', () => {
    const ficha: FichaJSON = {
      meta: {
        id: 'nested',
        name: 'Nested',
        currency: 'CUP',
        decimals: 2,
        settings: { allowFormulas: true }
      },
      rows: [
        {
          id: '3',
          classification: '3',
          label: 'Total',
          formaCalculo: 'FORMULA',
          formula: "ref('3.1')",
          type: 'TOTAL'
        },
        {
          id: '3.1',
          classification: '3.1',
          label: 'Subtotal 1',
          parentId: '3',
          formaCalculo: 'FORMULA',
          formula: "ref('3.1.1') + ref('3.1.2')",
          type: 'COST'
        },
        {
          id: '3.1.1',
          classification: '3.1.1',
          label: 'Item 1.1',
          parentId: '3.1',
          formaCalculo: 'FIJO',
          valorHistorico: 10,
          type: 'COST'
        },
        {
          id: '3.1.2',
          classification: '3.1.2',
          label: 'Item 1.2',
          parentId: '3.1',
          formaCalculo: 'FIJO',
          valorHistorico: 20,
          type: 'COST'
        }
      ],
      anexos: []
    };

    const result = calculateFicha(ficha);
    expect(result.deepValidationErrors?.filter(e => e.code === 'CYCLE').length).toBe(0);

    const row3 = result.rows.find(r => r.id === '3');
    expect(row3?.total).toBe(30);
  });
});
