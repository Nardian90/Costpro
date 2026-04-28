import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScenarioCalculator } from '../useScenarioCalculator';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useScenarioStore } from '@/store/scenario-store';
import { useCostSheetCalculator } from '../useCostSheetCalculator';

vi.mock('@/store/cost-sheet-store', () => ({ useCostSheetStore: vi.fn() }));
vi.mock('@/store/scenario-store', () => ({ useScenarioStore: vi.fn(), mergeScenarioValues: vi.fn((data, id) => ({ ...data, _id: id })) }));
vi.mock('../useCostSheetCalculator', () => ({ useCostSheetCalculator: vi.fn() }));

describe('useScenarioCalculator', () => {
  it('should return calculated values for active scenarios', () => {
    (useCostSheetStore as any).mockReturnValue({ data: {} });
    (useScenarioStore as any).mockReturnValue({ activeScenarioIds: ['v1', 'v2'] });
    (useCostSheetCalculator as any).mockReturnValue({ calculatedValues: {} });
    const { result } = renderHook(() => useScenarioCalculator());
    expect(result.current.calcV1).not.toBeNull();
    expect(result.current.calcV2).not.toBeNull();
    expect(result.current.calcV3).toBeNull();
  });
});
