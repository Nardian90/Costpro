import { describe, it, expect } from 'vitest';
import { validateFicha } from './index';
import { FichaJSON } from './types';

describe('Cycle Detection in Cost Engine', () => {
  it('should detect direct self-reference', () => {
    const ficha: FichaJSON = {
      meta: { id: 'test', name: 'Test', currency: 'CUP', decimals: 2 },
      anexos: [],
      rows: [
        {
          id: '1',
          classification: '1',
          label: 'Direct Cycle',
          type: 'TOTAL',
          nodeType: 'TOTAL',
          formaCalculo: 'FORMULA',
          formula: 'ref(\'1\')'
        }
      ]
    };

    const { valid, validationErrors } = validateFicha(ficha);
    expect(valid).toBe(false);
    expect(validationErrors.some(e => e.code === 'CYCLE')).toBe(true);
    expect(validationErrors.find(e => e.code === 'CYCLE')?.message).toContain('autorreferencia directa o indirectamente');
  });

  it('should detect indirect circular dependencies', () => {
    const ficha: FichaJSON = {
      meta: { id: 'test', name: 'Test', currency: 'CUP', decimals: 2 },
      anexos: [],
      rows: [
        {
          id: '1',
          classification: '1',
          label: 'Row 1',
          type: 'TOTAL',
          nodeType: 'TOTAL',
          formaCalculo: 'FORMULA',
          formula: 'ref(\'2\')'
        },
        {
          id: '2',
          classification: '2',
          label: 'Row 2',
          type: 'BASE',
          nodeType: 'BASE',
          formaCalculo: 'FORMULA',
          formula: 'ref(\'1\')'
        }
      ]
    };

    const { valid, validationErrors } = validateFicha(ficha);
    expect(valid).toBe(false);
    expect(validationErrors.some(e => e.code === 'CYCLE')).toBe(true);
  });

  it('should allow nested totals without cycles', () => {
    const ficha: FichaJSON = {
      meta: { id: 'test', name: 'Test', currency: 'CUP', decimals: 2 },
      anexos: [],
      rows: [
        {
          id: '1',
          classification: '1',
          label: 'Grand Total',
          type: 'TOTAL',
          nodeType: 'TOTAL',
          formaCalculo: 'FORMULA',
          formula: 'ref(\'2\') + ref(\'3\')'
        },
        {
          id: '2',
          classification: '2',
          label: 'Subtotal A',
          type: 'TOTAL',
          nodeType: 'TOTAL',
          formaCalculo: 'FORMULA',
          formula: 'ref(\'4\')'
        },
        {
          id: '3',
          classification: '3',
          label: 'Base 1',
          type: 'BASE',
          nodeType: 'BASE',
          formaCalculo: 'FIJO',
          valorHistorico: 100
        },
        {
          id: '4',
          classification: '4',
          label: 'Base 2',
          type: 'BASE',
          nodeType: 'BASE',
          formaCalculo: 'FIJO',
          valorHistorico: 200
        }
      ]
    };

    const { valid, validationErrors } = validateFicha(ficha);
    expect(valid).toBe(true);
    expect(validationErrors.filter(e => e.type === 'CRITICAL').length).toBe(0);
  });
});
