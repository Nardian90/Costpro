import { describe, it, expect } from 'vitest';
import { calculateFicha, validateFicha } from './index';
import { FichaJSON } from './types';
import demoFixture from './fixtures/FC-DEMO-243.json';

describe('Cost Engine', () => {
  const mockFicha: FichaJSON = {
    meta: {
      id: 'test-1',
      name: 'Test Ficha',
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
    rows: [
      {
        id: 'r1',
        classification: '1.1',
        type: 'COST',
        label: 'Material A',
        formaCalculo: 'IMPORTAR_ANEXO',
        baseCalculo: { type: 'ANEXO', anexoId: 'A1' }
      },
      {
        id: 'r2',
        classification: '1.2',
        type: 'COST',
        label: 'Material B',
        formaCalculo: 'PRORRATEO',
        valorHistorico: 50,
        baseCalculo: { type: 'ANEXO', anexoId: 'A1' }
      },
      {
        id: 'r3',
        classification: '2',
        type: 'MARGIN',
        label: 'Utilidad',
        formaCalculo: 'COEFICIENTE',
        coeficiente: 0.2,
        baseCalculo: { type: 'FILA', classification: '1.1' }
      }
    ]
  };

  it('should calculate IMPORTAR_ANEXO correctly', () => {
    const result = calculateFicha(mockFicha);
    const r1 = result.rows.find(r => r.id === 'r1');
    expect(r1?.total).toBe(150);
  });

  it('should calculate PRORRATEO correctly', () => {
    const result = calculateFicha(mockFicha);
    const r2 = result.rows.find(r => r.id === 'r2');
    // Ratio = 50 / 350. Total = (50/350) * 350 = 50.
    // Wait, Anexo total is 100+50+200 = 350.
    expect(r2?.total).toBe(50);
  });

  it('should calculate COEFICIENTE from FILA correctly', () => {
    const result = calculateFicha(mockFicha);
    const r3 = result.rows.find(r => r.id === 'r3');
    expect(r3?.total).toBe(30);
  });

  it('should handle "Energía" (FIJO with base) correctly', () => {
    const energiaFicha: FichaJSON = {
        ...mockFicha,
        rows: [
            {
                id: 'energia',
                classification: '1.3',
                label: 'Energía',
                formaCalculo: 'FIJO',
                valorHistorico: 500,
                baseCalculo: { type: 'FILA', classification: '1.1' }
            }
        ]
    };
    const result = calculateFicha(energiaFicha);
    const energia = result.rows.find(r => r.id === 'energia');
    // Even if it has a base, if method is FIJO, it must use VH.
    expect(energia?.total).toBe(500);
  });

  it('should handle cycles with damping', () => {
    const cyclicFicha: FichaJSON = {
        ...mockFicha,
        rows: [
            {
                id: 'a',
                classification: 'A',
                type: 'COST',
                label: 'A',
                formaCalculo: 'COEFICIENTE',
                coeficiente: 0.5,
                baseCalculo: { type: 'FILA', classification: 'B' }
            },
            {
                id: 'b',
                classification: 'B',
                type: 'COST',
                label: 'B',
                formaCalculo: 'FORMULA',
                formula: 'BASE_TOTAL + 100',
                baseCalculo: { type: 'FILA', classification: 'A' }
            }
        ]
    };
    const result = calculateFicha(cyclicFicha, { maxIter: 50 });
    const ra = result.rows.find(r => r.id === 'a');
    const rb = result.rows.find(r => r.id === 'b');

    // a = 0.5 * b
    // b = a + 100
    // a = 0.5 * (a + 100) = 0.5a + 50 => 0.5a = 50 => a = 100
    // b = 100 + 100 = 200
    expect(ra?.total).toBeCloseTo(100, 0);
    expect(rb?.total).toBeCloseTo(200, 0);
  });

  it('should validate non-existent references', () => {
    const invalidFicha: FichaJSON = {
        ...mockFicha,
        rows: [
            {
                id: 'bad',
                classification: 'X',
                type: 'COST',
                label: 'Bad',
                formaCalculo: 'COEFICIENTE',
                baseCalculo: { type: 'FILA', classification: 'NON_EXISTENT' }
            }
        ]
    };
    const validation = validateFicha(invalidFicha);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('non-existent classification');
  });

  it('should calculate the FC-DEMO-243 fixture correctly', () => {
    const result = calculateFicha(demoFixture as any);
    expect(result.fichaId).toBe('FC-DEMO-243');

    const r1 = result.rows.find(r => r.id === 'r1');
    // Gasto Material (Prorrateo). VH=1615551.74. BaseHist (Anexo1) = 1418319.2 + 128749.02 = 1547068.22
    // Ratio = 1615551.74 / 1547068.22. Total = Ratio * 1547068.22 = 1615551.74
    expect(r1?.total).toBe(1615551.74);

    const util = result.rows.find(r => r.id === 'util');
    // Utilidad = 0.20 * Gasto Material (1615551.74) = 323110.35
    expect(util?.total).toBe(323110.35);
  });
});
