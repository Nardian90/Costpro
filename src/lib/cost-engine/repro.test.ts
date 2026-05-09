import { describe, it, expect } from 'vitest';
import { calculateFicha } from './index';
import { FichaJSON } from './types';

describe('Cost Engine Reproductions', () => {
  it('should resolve annex reference even if case varies or has prefix', () => {
    const ficha: FichaJSON = {
      meta: {
        id: 'test',
        name: 'Test',
        currency: 'CUP',
        decimals: 2,
        settings: { allowFormulas: true }
      },
      anexos: [
        {
          id: 'AnexoI',
          name: 'Anexo I',
          rows: [
            { classification: '1.1', importe: 100 }
          ]
        }
      ],
      rows: [
        {
          id: 'r1',
          classification: '1.1',
          type: 'COST',
          label: 'Row 1',
          formaCalculo: 'IMPORTAR_ANEXO',
          baseCalculo: { type: 'ANEXO', anexoId: 'AnexoI' }
        }
      ]
    };

    const result = calculateFicha(ficha);
    const r1 = result.rows.find(r => r.id === 'r1');
    expect(r1?.total).toBe(100);
  });

  it('should handle undefined or invalid inputs gracefully without breaking total', () => {
    const ficha: FichaJSON = {
      meta: {
        id: 'test',
        name: 'Test',
        currency: 'CUP',
        decimals: 2,
        settings: { allowFormulas: true }
      },
      anexos: [],
      rows: [
        {
          id: 'r1',
          classification: '1.1',
          type: 'COST',
          label: 'Row 1',
          formaCalculo: 'FIJO',
          valorHistorico: undefined as any
        }
      ]
    };

    const result = calculateFicha(ficha);
    const r1 = result.rows.find(r => r.id === 'r1');
    expect(r1?.total).toBe(0);
  });
});
