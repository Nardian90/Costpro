import { describe, it, expect } from 'vitest';
import { buildVHSums, buildEngineRows, assembleFichaJSON } from '@/lib/cost-engine/shared-mapping';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';

describe('shared-mapping coverage', () => {
  it('buildVHSums exhaustive paths', () => {
    const sections = [
      {
        id: 's1',
        rows: [
          {
            id: 'r1',
            calculationMethod: 'ValorFijo',
            value: '100',
            children: [{ id: 'c1', value: 10 }]
          },
          { id: 'r2', calculationMethod: 'FIJO', valorHistorico: 50 },
          { id: 'r3', children: [] }
        ]
      },
      null
    ] as any;
    const sums = buildVHSums(sections);
    expect(sums['s1']).toBe(150);
  });

  it('buildEngineRows exhaustive paths', () => {
    const data = CostSheetDataFactory.create({
      annexes: [{ id: 'I', title: 'Anexo I', columns: [], data: [] }],
      indirectConfig: {
          mode: 'fixed',
          fixedAmount: 100,
          selectedSections: ['s1'],
          baseSection: 's2',
          coefficient: 1
      },
      sections: [
        {
          id: 's1',
          label: 'S1',
          rows: [
            { id: '13.2', label: 'Tax', totalFormula: '=sum(children)', children: [{id: 'c1', value: 10}] } as any,
            { id: '12', label: 'Total', calculationMethod: 'Prorrateo', baseDeCalculoRef: 'I' } as any,
            { id: 'r1', label: 'Percent', is_percent: true, valorHistorico: 0.1 } as any,
            { id: 'r2', label: 'AnnexRef', formula: 'AnexoI' } as any
          ]
        }
      ]
    }) as any;

    const vhSums = { 's1': 100, 'c1': 10 };
    const engineRows = buildEngineRows(data, vhSums);

    expect(engineRows.find(r => r.id === '13.2')?.type).toBe('TAX');
    expect(engineRows.find(r => r.id === '12')?.type).toBe('TOTAL');
    expect(engineRows.find(r => r.id === 'r1')?.formaCalculo).toBe('COEFICIENTE');
    expect(engineRows.find(r => r.id === 'r2')?.formaCalculo).toBe('IMPORTAR_ANEXO');
  });

  it('assembleFichaJSON exhaustive paths', () => {
      const header = { code: 'C1', name: 'N', quantity: 5, currency: 'USD' } as any;
      const annexes = [
          {
              id: 'I',
              title: 'A1',
              data: [
                  { classification: 'C1 - D1', total: 100 },
                  { label: 'L2', amount: 200 },
                  { depreciation_cost: 300 },
                  { price_total: 400 },
                  { importe: 500 }
              ]
          }
      ] as any;
      const result = assembleFichaJSON(header, annexes, []);
      expect(result.meta.quantity).toBe(5);
      expect(result.meta.currency).toBe('USD');
      expect(result.anexos[0].rows[0].classification).toBe('C1');
  });
});
