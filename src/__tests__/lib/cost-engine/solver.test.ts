import { describe, it, expect, vi } from 'vitest';
import { solveForTarget, solveCoefficient } from '@/lib/cost-engine/solver';
import { CostSheetDataFactory } from '@/contracts/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine/index';
import { buildEngineFicha } from '@/lib/cost-engine/build-ficha';

// Mocking buildEngineFicha and calculateFicha
vi.mock('@/lib/cost-engine/index', () => ({
  calculateFicha: vi.fn()
}));

vi.mock('@/lib/cost-engine/build-ficha', () => ({
  buildEngineFicha: vi.fn()
}));

describe('solver', () => {
  const data = CostSheetDataFactory.create({
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

  it('solveForTarget should call simulate and return a result', () => {
    vi.mocked(calculateFicha).mockReturnValue({
      rows: [{ id: 'target', total: 100 }],
      summary: { grandTotal: 100 }
    } as any);
    vi.mocked(buildEngineFicha).mockReturnValue({} as any);

    const result = solveForTarget(data, 'target', 100, 'variable');
    expect(result).toBeDefined();
    expect(calculateFicha).toHaveBeenCalled();
  });

  it('solveCoefficient should run', () => {
     vi.mocked(calculateFicha).mockReturnValue({
      rows: [{ id: '14.1', total: 1000 }],
      summary: { grandTotal: 1000 }
     } as any);
     const result = solveCoefficient(data, 'annex-1', 1000);
     expect(result).toBeDefined();
  });
});
