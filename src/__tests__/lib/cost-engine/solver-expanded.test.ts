import { describe, it, expect, vi } from 'vitest';
import { solveForTarget, solveCoefficient } from '@/lib/cost-engine/solver';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';
import * as EngineIndex from '@/lib/cost-engine/index';
import * as BuildFicha from '@/lib/cost-engine/build-ficha';

vi.mock('@/lib/cost-engine/index');
vi.mock('@/lib/cost-engine/build-ficha');

describe('solver-expanded', () => {
  const data = CostSheetDataFactory.create({
    annexes: [
        { id: 'annex-1', title: 'A1', columns: [], data: [] }
    ],
    sections: [
      {
        id: 's1',
        label: 'S1',
        rows: [
          { id: 'target', label: 'T', value: 0 },
          { id: 'variable', label: 'V', value: 0 }
        ]
      }
    ]
  }) as any;

  it('solveForTarget should find a value using bisection', () => {
    vi.mocked(EngineIndex.calculateFicha).mockImplementation((ficha: any) => {
        const val = ficha.variableValue || 0;
        return {
            rows: [{ id: 'target', total: val * 2 + 10 }],
            summary: { grandTotal: val * 2 + 10 }
        } as any;
    });
    vi.mocked(BuildFicha.buildEngineFicha).mockImplementation((ui: any) => {
        let v = 0;
        ui.sections.forEach((s: any) => s.rows.forEach((r: any) => {
            if (r.id === 'variable') v = (r.value ?? r.valorHistorico ?? 0);
        }));
        return { variableValue: v } as any;
    });

    const result = solveForTarget(data, 'target', 110, 'variable');
    expect(result).toBeCloseTo(50, 1);
  });

  it('solveCoefficient should find a coefficient', () => {
      vi.mocked(EngineIndex.calculateFicha).mockImplementation((ficha: any) => {
          const coef = ficha.coef ?? 1;
          return {
              rows: [{ id: '14.1', total: coef * 1000 }],
              summary: { grandTotal: coef * 1000 }
          } as any;
      });
      vi.mocked(BuildFicha.buildEngineFicha).mockImplementation((ui: any) => {
          const annex = ui.annexes.find((a: any) => a.id === 'annex-1');
          return { coef: annex?.coefficient ?? 1 } as any;
      });

      const result = solveCoefficient(data, 'annex-1', 1500);
      expect(result).toBeCloseTo(1.5, 2);
  });

  it('solveCoefficient handles zero slope', () => {
    vi.mocked(EngineIndex.calculateFicha).mockReturnValue({
        rows: [{ id: '14.1', total: 100 }],
        summary: { grandTotal: 100 }
    } as any);
    const result = solveCoefficient(data, 'annex-1', 500);
    expect(result).toBe(1);
  });
});
