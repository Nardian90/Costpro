import { describe, it, expect } from 'vitest';
import { calculateFicha } from './index';
import { FichaJSON } from './types';

describe('Cost Engine Accuracy', () => {
  const panArtistasFicha: FichaJSON = {
    meta: {
      id: 'FC-PAN-2026',
      name: 'Producción de Pan Artistas',
      currency: 'CUP',
      decimals: 2,
      settings: { allowFormulas: true }
    },
    anexos: [
      {
        id: 'I',
        name: 'Anexo I - MP',
        rows: [
          { classification: '1.1', importe: 15360 }
        ]
      }
    ],
    rows: [
      {
        id: '1',
        classification: '1.1',
        type: 'COST',
        label: 'GASTO MATERIAL',
        calculation_method: 'FORMULA',
        formula: 'AnexoI'
      },
      {
        id: '12',
        classification: '12.1',
        type: 'TOTAL',
        label: 'TOTAL COSTOS Y GASTOS',
        calculation_method: 'FORMULA',
        formula: 'ref("1.1")' // ref by classification
      },
      {
        id: '13',
        classification: '13.1',
        type: 'MARGIN',
        label: 'Utilidad',
        calculation_method: 'FORMULA',
        formula: 'ref("12") * 0.1' // ref by ID
      },
      {
        id: '13.1',
        classification: '13.2',
        type: 'TOTAL',
        label: 'Precio antes de Impuesto',
        calculation_method: 'FORMULA',
        formula: 'ref("12") + ref("13")'
      }
    ]
  };

  it('should resolve ref() accurately and maintain high precision', () => {
    const result = calculateFicha(panArtistasFicha);
    const row1 = result.rows.find(r => r.id === '1');
    const row12 = result.rows.find(r => r.id === '12');
    const row13 = result.rows.find(r => r.id === '13');
    const row13_1 = result.rows.find(r => r.id === '13.1');

    expect(row1?.total).toBe(15360);
    expect(row12?.total).toBe(15360);
    expect(row13?.total).toBe(1536);
    expect(row13_1?.total).toBe(15360 + 1536);
  });

  it('should handle decimal math correctly with pct and round2', () => {
    const decimalFicha: FichaJSON = {
      ...panArtistasFicha,
      rows: [
        {
          id: 'base',
          classification: 'B',
          type: 'COST',
          label: 'Base',
          calculation_method: 'FIJO',
          valor_historico: 1000.33
        },
        {
          id: 'tax',
          classification: 'T',
          type: 'TAX',
          label: 'Tax',
          calculation_method: 'FORMULA',
          formula: 'round2(pct(ref("base"), 14.5))'
        }
      ]
    };
    const result = calculateFicha(decimalFicha);
    const taxRow = result.rows.find(r => r.id === 'tax');

    // 1000.33 * 0.145 = 145.04785 -> rounded to 2 decimals = 145.05
    expect(taxRow?.total).toBe(145.05);
  });

  it('should sum multiple rows with same classification in ref()', () => {
      const multiFicha: FichaJSON = {
          ...panArtistasFicha,
          rows: [
              { id: 'a1', classification: 'A', type: 'COST', label: 'A1', calculation_method: 'FIJO', valor_historico: 100 },
              { id: 'a2', classification: 'A', type: 'COST', label: 'A2', calculation_method: 'FIJO', valor_historico: 200 },
              { id: 'sum', classification: 'S', type: 'TOTAL', label: 'Sum', calculation_method: 'FORMULA', formula: 'ref("A")' }
          ]
      };
      const result = calculateFicha(multiFicha);
      const sumRow = result.rows.find(r => r.id === 'sum');
      expect(sumRow?.total).toBe(300);
  });
});
