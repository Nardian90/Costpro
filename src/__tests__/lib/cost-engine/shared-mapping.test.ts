import { describe, it, expect } from 'vitest';
import { buildVHSums, buildEngineRows, assembleFichaJSON } from '@/lib/cost-engine/shared-mapping';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';

describe('shared-mapping', () => {
  it('buildVHSums correctly calculates sums', () => {
    const sections = [
      {
        id: 's1',
        rows: [
          { id: 'r1', value: 10 },
          { id: 'r2', children: [{ id: 'r2.1', value: 20 }, { id: 'r2.2', value: 30 }] }
        ]
      }
    ] as any;
    const sums = buildVHSums(sections);
    expect(sums['r1']).toBe(10);
    expect(sums['r2.1']).toBe(20);
    expect(sums['r2.2']).toBe(30);
    expect(sums['r2']).toBe(50);
    expect(sums['s1']).toBe(60);
  });

  it('buildEngineRows transforms UI data to engine format', () => {
    const data = CostSheetDataFactory.create({
      sections: [
        {
          id: 's1',
          label: 'S1',
          rows: [
            { id: '1.1', label: 'R1', value: 100, calculationMethod: 'Prorrateo' }
          ]
        }
      ]
    }) as any;
    const vhSums = { '1.1': 100, 's1': 100 };
    const engineRows = buildEngineRows(data, vhSums);
    expect(engineRows).toHaveLength(1);
    expect(engineRows[0].id).toBe('1.1');
    expect(engineRows[0].formaCalculo).toBe('PRORRATEO');
  });

  it('assembleFichaJSON creates a valid FichaJSON', () => {
    const header = { code: 'C1', name: 'N', quantity: 1 } as any;
    const engineRows = [{ id: 'r1', classification: '1.1', label: 'L', valorHistorico: 10 }] as any;
    const result = assembleFichaJSON(header, [], engineRows);
    expect(result.meta.id).toBe('C1');
    expect(result.rows).toHaveLength(1);
  });
});
