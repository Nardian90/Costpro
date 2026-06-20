import { describe, it, expect } from 'vitest';
import { buildVHSums, buildEngineRows, assembleFichaJSON } from '@/lib/cost-engine/shared-mapping';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';

describe('shared-mapping-expanded', () => {
  it('buildVHSums handles varied structures', () => {
    const sections = [
      {
        id: 's1',
        rows: [
          { id: 'r1', calculationMethod: 'ValorFijo', value: 100, children: [{ id: 'c1', value: 10 }] },
          { id: 'r2', calculationMethod: 'FIJO', valorHistorico: 50 },
          { id: 'r3', calculationMethod: 'MANUAL', value: 25 },
          { id: 'r4', children: [{ id: 'c2', value: 20 }, { id: 'c3', value: 30 }] }
        ]
      }
    ] as any;
    const sums = buildVHSums(sections);
    expect(sums['r1']).toBe(100);
    expect(sums['r2']).toBe(50);
    expect(sums['r3']).toBe(25);
    expect(sums['r4']).toBe(50);
    expect(sums['s1']).toBe(225);
  });

  it('buildEngineRows handles semantic types and form methods', () => {
      const data = CostSheetDataFactory.create({
          annexes: [{ id: 'annex-1', title: 'Anexo I' }],
          sections: [
              {
                  id: 's1',
                  rows: [
                      { id: '13.1', label: 'Margin' },
                      { id: '13.2', label: 'Tax' },
                      { id: '13.3', label: 'Tax2' },
                      { id: '14.1', label: 'Total' },
                      { id: '12.1', label: 'Total Cost' },
                      { id: '5', label: 'Total Section 5' },
                      { id: 'r1', label: 'A', calculationMethod: 'ANEXO', baseDeCalculoRef: 'annex-1' },
                      { id: 'r2', label: 'B', formula: '=AnexoI' },
                      { id: 'r3', label: 'C', isPercent: true, value: 0.1 },
                      { id: 'r4', label: 'D', children: [{id: 'c1', value: 10}], totalFormula: '=sum(children)' }
                  ]
              }
          ]
      }) as any;
      const engineRows = buildEngineRows(data, {});
      expect(engineRows.find(r => r.id === '13.1')?.type).toBe('MARGIN');
      expect(engineRows.find(r => r.id === 'r1')?.formaCalculo).toBe('IMPORTAR_ANEXO');
      expect(engineRows.find(r => r.id === 'r3')?.formaCalculo).toBe('COEFICIENTE');
      expect(engineRows.find(r => r.id === 'r4')?.formula).toBe('sum(children)');
  });

  it('buildEngineRows handles indirect config branches', () => {
      const data = CostSheetDataFactory.create({
          indirectConfig: {
              mode: 'fixed',
              fixedAmount: 1000,
              selectedSections: ['s1'],
              baseSection: 's2'
          },
          sections: [
              { id: 's1', rows: [{ id: 'r1', value: 100 }] },
              { id: 's2', rows: [{ id: 'r2', value: 200 }] }
          ]
      }) as any;
      const vhSums = { 's1': 100, 'r1': 100 };
      const engineRows = buildEngineRows(data, vhSums);
      const r1 = engineRows.find(r => r.id === 'r1');
      expect(r1?.formula).toContain('+ 1000.0000');
  });
});
