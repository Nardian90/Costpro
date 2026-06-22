import { describe, it, expect } from 'vitest';
import { buildVHSums, buildEngineRows } from '@/lib/cost-engine/shared-mapping';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';

describe('shared-mapping-expanded', () => {
  it('buildVHSums handles ValorFijo', () => {
    const sections = [
      {
        id: 's1',
        rows: [
          {
            id: 'r1',
            label: 'L',
            calculationMethod: 'ValorFijo',
            value: 50,
            children: [{ id: 'c1', label: 'C', value: 10 }]
          }
        ]
      }
    ] as any;
    const sums = buildVHSums(sections);
    expect(sums['r1']).toBe(50);
  });

  it('buildEngineRows handles indirect config', () => {
    const data = CostSheetDataFactory.create({
      indirectConfig: {
        mode: 'coefficient',
        coefficient: 1.1,
        selectedSections: ['s1'],
        baseSection: 's2'
      },
      sections: [
        {
          id: 's1',
          label: 'S1',
          rows: [
            { id: '1.1', label: 'R1', value: 100 } as any
          ]
        },
        {
            id: 's2',
            label: 'S2',
            rows: [
                { id: '2.1', label: 'R2', value: 100 } as any
            ]
        }
      ]
    }) as any;
    const vhSums = { '1.1': 100, '2.1': 100, 's1': 100, 's2': 100 };
    const engineRows = buildEngineRows(data, vhSums);

    const r1 = engineRows.find(r => r.id === '1.1');
    const r2 = engineRows.find(r => r.id === '2.1');

    expect(r1?.formula || '').toContain('* 1.1');
    expect(r2?.formula || '').not.toContain('* 1.1');
  });
});
