import { useMemo } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useScenarioStore, mergeScenarioValues } from '@/store/scenario-store';
import { useCostSheetCalculator } from './useCostSheetCalculator';
import { ScenarioId, CostSheetData } from '@/types/cost-sheet';

const EMPTY_TEMPLATE: CostSheetData = {
  header: { code: '', name: '', date: '', quantity: 1, currency: 'CUP', category: '', type: '', unit: 'u' },
  sections: [], annexes: [], signature: { prepared_by: '', approved_by: '' }
};

const useScenarioCalcSlot = (data: CostSheetData | null) => {
  return useCostSheetCalculator(data ?? EMPTY_TEMPLATE);
};

export const useScenarioCalculator = () => {
  const { data } = useCostSheetStore();
  const { activeScenarioIds } = useScenarioStore();
  const dataV1 = useMemo(() => activeScenarioIds.includes('v1') ? mergeScenarioValues(data, 'v1') : null, [data, activeScenarioIds]);
  const dataV2 = useMemo(() => activeScenarioIds.includes('v2') ? mergeScenarioValues(data, 'v2') : null, [data, activeScenarioIds]);
  const dataV3 = useMemo(() => activeScenarioIds.includes('v3') ? mergeScenarioValues(data, 'v3') : null, [data, activeScenarioIds]);
  const calcV1 = useScenarioCalcSlot(dataV1);
  const calcV2 = useScenarioCalcSlot(dataV2);
  const calcV3 = useScenarioCalcSlot(dataV3);
  return {
    calcV1: activeScenarioIds.includes('v1') ? calcV1 : null,
    calcV2: activeScenarioIds.includes('v2') ? calcV2 : null,
    calcV3: activeScenarioIds.includes('v3') ? calcV3 : null,
    getDiff: (rowId: string, baseId: ScenarioId, compareId: ScenarioId) => {
       // FIX-LOG-022: Type calcs properly instead of any
       interface CalcResult {
         calculatedValues?: Record<string, { total?: number; [key: string]: unknown } | { total?: number }>;
         [key: string]: unknown;
       }
       const calcs: Record<string, CalcResult | null> = { v1: calcV1 as CalcResult | null, v2: calcV2 as CalcResult | null, v3: calcV3 as CalcResult | null };
       const b = calcs[baseId]?.calculatedValues?.[rowId]?.total ?? 0;
       const c = calcs[compareId]?.calculatedValues?.[rowId]?.total ?? 0;
       const abs = c - b;
       // FIX-LOG-021: Cap percentDiff to prevent misleading display
       return { absoluteDiff: abs, percentDiff: b !== 0 ? Math.min(99999, Math.max(-99999, (abs/b)*100)) : 0, direction: abs < -0.01 ? 'better' : abs > 0.01 ? 'worse' : 'equal' };
    }
  };
};
