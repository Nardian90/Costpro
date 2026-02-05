import { describe, it, expect } from 'vitest';
import { calculateFicha } from './index';
import { FichaJSON } from './types';

describe('Cost Engine Smart Annex', () => {
  const mockFicha: FichaJSON = {
    meta: {
      id: 'test-smart',
      name: 'Test Smart Ficha',
      currency: 'CUP',
      decimals: 2,
      settings: { allowFormulas: true }
    },
    anexos: [
      {
        id: 'A1',
        name: 'Anexo 1',
        rows: [
          { classification: '1.1', importe: 100 },
          { classification: '1.1', importe: 50 },
          { classification: '1.2', importe: 200 }
        ]
      }
    ],
    rows: []
  };

  it('should support smart Annex lookup without fallback for IMPORTAR_ANEXO, PRORRATEO and COEFICIENTE', () => {
    const smartFicha: FichaJSON = {
        ...mockFicha,
        rows: [
            {
                id: 'import_match',
                classification: '1.1',
                type: 'COST',
                label: 'Import Match',
                calculation_method: 'IMPORTAR_ANEXO',
                base_ref: { type: 'ANEXO', anexoId: 'A1' }
            },
            {
                id: 'import_no_fallback',
                classification: '9.9',
                type: 'COST',
                label: 'Import No Fallback',
                calculation_method: 'IMPORTAR_ANEXO',
                base_ref: { type: 'ANEXO', anexoId: 'A1' }
            },
            {
                id: 'prorrateo_match',
                classification: '1.2',
                type: 'COST',
                label: 'Prorrateo Match',
                calculation_method: 'PRORRATEO',
                valor_historico: 100,
                base_ref: { type: 'ANEXO', anexoId: 'A1' }
            },
            {
                id: 'coeficiente_match',
                classification: '1.1',
                type: 'COST',
                label: 'Coeficiente Match',
                calculation_method: 'COEFICIENTE',
                coeficiente: 0.1,
                base_ref: { type: 'ANEXO', anexoId: 'A1' }
            }
        ]
    };
    const result = calculateFicha(smartFicha);
    const importMatch = result.rows.find(r => r.id === 'import_match');
    const importNoFallback = result.rows.find(r => r.id === 'import_no_fallback');
    const prorrateoMatch = result.rows.find(r => r.id === 'prorrateo_match');
    const coeficienteMatch = result.rows.find(r => r.id === 'coeficiente_match');

    // 1.1 in A1 is 100 + 50 = 150
    expect(importMatch?.total).toBe(150);

    // 9.9 not in A1, should be 0 (no more fallback)
    expect(importNoFallback?.total).toBe(0);

    // Prorrateo match: classification 1.2 in A1 is 200.
    // VH = 100. BaseHist = 200. BaseTotal = 200.
    // Total = (100 / 200) * 200 = 100
    expect(prorrateoMatch?.total).toBe(100);

    // Coeficiente match: classification 1.1 in A1 is 150.
    // Coef = 0.1. BaseTotal = 150.
    // Total = 0.1 * 150 = 15
    expect(coeficienteMatch?.total).toBe(15);
  });
});
