
import { describe, it, expect } from 'vitest';
import { calculateFicha } from './index';
import { FichaJSON, CostRow } from './types';

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
          formula: '0', // Simplified for this test
          type: 'TOTAL'
        },
        {
          id: '13',
          classification: '13',
          label: 'Utilidad',
          formaCalculo: 'FORMULA',
          formula: "ref('12.1')", // MISSING REF 12.1
          type: 'MARGIN'
        },
        {
          id: '13.1',
          classification: '13.1',
          label: 'Precio antes de Impuesto',
          formaCalculo: 'FORMULA',
          formula: "ref('13.1')+ref('12.1')", // CYCLE 13.1 and MISSING REF 12.1
          type: 'MARGIN'
        }
      ],
      anexos: []
    };

    const result = calculateFicha(ficha);
    const cycleError = result.deepValidationErrors?.find(e => e.rowId === '13.1' && e.code === 'CYCLE');
    const missingRefError13 = result.deepValidationErrors?.find(e => e.rowId === '13' && e.code === 'MISSING_REF');
    const missingRefError13_1 = result.deepValidationErrors?.find(e => e.rowId === '13.1' && e.code === 'MISSING_REF');

    expect(cycleError).toBeDefined();
    expect(missingRefError13).toBeDefined();
    expect(missingRefError13_1).toBeDefined();
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
          formula: "ref('13')", // SELF REF
          type: 'MARGIN'
        }
      ],
      anexos: []
    };

    const result = calculateFicha(ficha);
    const hardRuleError = result.deepValidationErrors?.find(e => e.rowId === '13' && e.code === 'HARD_RULE_VIOLATION');
    expect(hardRuleError).toBeDefined();
  });
});
