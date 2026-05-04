import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock stores ─────────────────────────────────────────────────────────────────

const mockCostSheetData = {
  header: { code: 'T-001', name: 'Test', date: '2025-01-01', quantity: 1, currency: 'CUP', category: '', type: '', unit: 'u' },
  sections: [
    {
      id: 's1',
      label: 'Gastos de Material',
      rows: [
        { id: '1.1', label: 'Materiales directos', valorHistorico: 500, children: [] },
        { id: '1.2', label: 'Combustible', valorHistorico: 120, children: [] },
      ],
    },
  ],
  annexes: [],
  signature: { prepared_by: '', approved_by: '' },
  scenarioConfig: { primaryScenarioId: 'v1' as const, comparisonBaseId: 'v1' as const },
  scenarios: [
    {
      id: 'v1' as const,
      label: 'Base',
      color: 'blue' as const,
      createdAt: Date.now(),
      values: { '1.1': { valorHistorico: 500 }, '1.2': { valorHistorico: 120 } },
    },
    {
      id: 'v2' as const,
      label: 'Optimizado',
      color: 'violet' as const,
      createdAt: Date.now(),
      values: { '1.1': { valorHistorico: 480 }, '1.2': { valorHistorico: 120 } },
    },
  ],
};

vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: vi.fn(() => ({
    data: mockCostSheetData,
  })),
}));

vi.mock('@/store/scenario-store', () => ({
  useScenarioStore: vi.fn(() => ({
    activeScenarioIds: ['v1', 'v2'],
  })),
  mergeScenarioValues: vi.fn((data: any, scenarioId: string) => {
    if (scenarioId === 'v2') {
      return {
        ...data,
        sections: data.sections.map((s: any) => ({
          ...s,
          rows: s.rows.map((r: any) => ({
            ...r,
            valorHistorico: r.id === '1.1' ? 480 : r.valorHistorico,
          })),
        })),
      };
    }
    return data;
  }),
}));

// Must use the full module path for vi.mock to intercept the import inside useScenarioCalculator
vi.mock('@/hooks/logic/useCostSheetCalculator', () => ({
  useCostSheetCalculator: vi.fn((data: any) => ({
    calculatedValues: Object.fromEntries(
      (data?.sections || []).flatMap((s: any) =>
        s.rows.map((r: any) => [r.id, { total: (r.valorHistorico || 0) * 1.16, valorHistorico: r.valorHistorico || 0 }])
      )
    ),
    calculationResult: { status: 'ok' },
    deepValidationErrors: [],
  })),
}));

describe('useScenarioCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna calcV1 y calcV2 cuando ambos escenarios están activos', async () => {
    const { useScenarioCalculator } = await import('../useScenarioCalculator');
    const { result } = renderHook(() => useScenarioCalculator());

    expect(result.current.calcV1).toBeDefined();
    expect(result.current.calcV2).toBeDefined();
  });

  it('retorna calcV3 como null cuando solo v1 y v2 están activos', async () => {
    const { useScenarioCalculator } = await import('../useScenarioCalculator');
    const { result } = renderHook(() => useScenarioCalculator());

    expect(result.current.calcV3).toBeUndefined();
  });

  it('getDiff calcula absoluteDiff y percentDiff correctamente', async () => {
    const { useScenarioCalculator } = await import('../useScenarioCalculator');
    const { result } = renderHook(() => useScenarioCalculator());

    const diff = result.current.getDiff('1.1', 'v1', 'v2');
    // v1 total = 500 * 1.16 = 580, v2 total = 480 * 1.16 = 556.8
    // diff = 556.8 - 580 = -23.2
    expect(diff.absoluteDiff).toBeCloseTo(-23.2, 1);
    expect(diff.percentDiff).toBeCloseTo(-4.0, 0);
    expect(diff.direction).toBe('better'); // negative = ahorro
  });

  it('getDiff direction es "equal" cuando el costo es el mismo', async () => {
    const { useScenarioCalculator } = await import('../useScenarioCalculator');
    const { result } = renderHook(() => useScenarioCalculator());

    // Compare v1 to v2 for row 1.2: same value, so direction = 'equal'
    const diff = result.current.getDiff('1.2', 'v1', 'v2');
    // v1 total = 120 * 1.16 = 139.2, v2 total = 120 * 1.16 = 139.2
    expect(diff.absoluteDiff).toBeCloseTo(0, 5);
    expect(diff.direction).toBe('equal');
  });
});
