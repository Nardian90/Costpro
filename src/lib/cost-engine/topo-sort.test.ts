import { describe, it, expect } from 'vitest';
import { calculateFicha, validateFicha } from './index';
import { FichaJSON } from './types';

describe('Cost Engine - Topological Sorting & DAGs', () => {
  it('should correctly calculate linear dependencies spanning across sections (13.3 -> 14.1 -> 13.2)', () => {
    const ficha: FichaJSON = {
      meta: { id: 'test', decimals: 2 },
      header: { quantity: 1 },
      rows: [
        {
            id: '13.1',
            classification: '13.1',
            label: 'Utilidad',
            type: 'MARGIN',
            calculation_method: 'FIJO',
            valor_historico: 5000,
            audit: []
        },
        {
            id: '13.2',
            classification: '13.2',
            label: 'Precio antes de Impuesto',
            type: 'INFO',
            calculation_method: 'FORMULA',
            formula: "ref('13.1') + 10000",
            audit: []
        },
        {
            id: '13.3',
            classification: '13.3',
            label: 'Imp s/Ventas y Serv',
            type: 'TAX',
            calculation_method: 'FORMULA',
            formula: "ref('14.1') - ref('13.2')",
            audit: []
        },
        {
            id: '14.1',
            classification: '14.1',
            label: 'Precio o Tarifa Final',
            type: 'INFO',
            calculation_method: 'FORMULA',
            formula: "ref('13.2') / 0.9",
            audit: []
        }
      ],
      anexos: []
    };

    const validation = validateFicha(ficha);
    expect(validation.valid, `Validation failed: ${JSON.stringify(validation.validation_errors)}`).toBe(true);
    // Should have 2 INFO messages for external links (13.3 -> 14.1 and 14.1 -> 13.2)
    expect(validation.validation_errors.filter(e => e.type !== 'INFO')).toHaveLength(0);

    const result = calculateFicha(ficha);
    const r13_1 = result.rows.find(r => r.id === '13.1');
    const r13_2 = result.rows.find(r => r.id === '13.2');
    const r14_1 = result.rows.find(r => r.id === '14.1');
    const r13_3 = result.rows.find(r => r.id === '13.3');

    // Expected:
    // 13.1 = 5000
    // 13.2 = 15000
    // 14.1 = 15000 / 0.9 = 16666.666... -> 16666.67
    // 13.3 = 16666.67 - 15000 = 1666.67

    expect(r13_1?.total).toBe(5000);
    expect(r13_2?.total).toBe(15000);
    expect(r14_1?.total).toBe(16666.67);
    expect(r13_3?.total).toBe(1666.67);
  });

  it('should detect actual self-references in Section 13 but allow valid references to other rows', () => {
    const ficha: FichaJSON = {
      meta: { id: 'test', decimals: 2 },
      header: { quantity: 1 },
      rows: [
        {
            id: '13.1',
            classification: '13.1',
            label: 'Utilidad',
            type: 'MARGIN',
            calculation_method: 'FORMULA',
            formula: "ref('13.1') * 1.1", // SELF REFERENCE
            audit: []
        }
      ],
      anexos: []
    };

    const validation = validateFicha(ficha);
    expect(validation.valid).toBe(false);
    expect(validation.validation_errors.some(e => e.code === 'CYCLE')).toBe(true);
  });
});
