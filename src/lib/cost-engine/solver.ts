import { calculateFicha } from './index';
import { mapUIToFicha } from './mapper';
import { CostSheetData } from '@/types/cost-sheet';
import { produce } from 'immer';

/**
 * Solves for the coefficient needed in an annex to reach a target price.
 */
export function solveCoefficient(
  uiData: CostSheetData,
  annexId: string,
  targetPrice: number,
  options: {
    targetRowId?: string;
  } = {}
): number {
  const { targetRowId } = options;

  const simulateBase = (coef: number): any => {
    const simulatedData = produce(uiData, draft => {
      const annex = (draft.annexes as any[]).find(a => a.id === annexId);
      if (annex) {
        annex.coefficient = coef;
        annex.isAdjustmentActive = true;
      }
    });
    return calculateFicha(mapUIToFicha(simulatedData as any));
  };

  const rRef1 = simulateBase(1);
  const rRef2 = simulateBase(1.1);

  const getCandidates = (result: any) => {
    const ids = ['14.1', '14', '16.1', '16', '13.1', '12.1', '12'];
    const searchIds = targetRowId ? [targetRowId, ...ids] : ids;

    return result.rows.filter((r: any) =>
        searchIds.includes(r.id) || searchIds.includes(r.classification)
    ).sort((a: any, b: any) => {
        if (targetRowId) {
            if (a.id === targetRowId || a.classification === targetRowId) return -1;
            if (b.id === targetRowId || b.classification === targetRowId) return 1;
        }
        if (a.id === '14.1' || a.classification === '14.1') return -1;
        if (b.id === '14.1' || b.classification === '14.1') return 1;
        return 0;
    });
  };

  const candidates1 = getCandidates(rRef1);
  const candidates2 = getCandidates(rRef2);
  let resolvedTargetId = null;

  for (const c1 of candidates1) {
      const c2 = candidates2.find((c: any) => c.id === c1.id);
      if (c2 && Math.abs(c1.total - c2.total) > 0.0001) {
          resolvedTargetId = c1.id;
          break;
      }
  }
  if (!resolvedTargetId) resolvedTargetId = candidates1[0]?.id || '14.1';

  const simulate = (coef: number): number => {
    const res = simulateBase(coef);
    const row = res.rows.find((r: any) => r.id === resolvedTargetId);
    return row ? row.total : res.summary.grandTotal;
  };

  let bestCoef = 1;
  let minDiff = Infinity;

  const check = (c: number) => {
    const val = simulate(c);
    const diff = Math.abs(val - targetPrice);
    if (diff < minDiff) {
        minDiff = diff;
        bestCoef = c;
    }
  };

  for (let i = 0; i <= 5000; i++) {
      check(i / 1000);
  }

  const center = bestCoef;
  for (let i = -10; i <= 10; i++) {
      check(center + i / 10000);
  }

  return bestCoef;
}

/**
 * Solves for the utility percentage needed to reach a target price.
 * Uses a robust Goal Seek approach to account for taxes and intermediate calculations.
 */
export function solveUtility(
  uiData: CostSheetData,
  targetPrice: number,
  options: {
    targetRowId?: string;
  } = {}
): number {
  const { targetRowId = '14.1' } = options;

  const simulateBase = (utilityPercent: number): any => {
    const simulatedData = produce(uiData, draft => {
      for (const section of draft.sections) {
        const row = section.rows.find(r => ['13', '13.1'].includes(r.id));
        if (row) {
          const baseRef = row.formula?.includes('ref(\'12.1\')') ? '12.1' : '12';
          row.formula = `ref('${baseRef}') * ${(utilityPercent / 100).toFixed(6)}`;
          row.calculationMethod = 'FORMULA';
          break;
        }
      }
    });
    return calculateFicha(mapUIToFicha(simulatedData as any));
  };

  const simulate = (utilityPercent: number): number => {
    const res = simulateBase(utilityPercent);
    const row = res.rows.find((r: any) => r.id === targetRowId) ||
                res.rows.find((r: any) => r.id === '14');
    return row ? row.total : res.summary.grandTotal;
  };

  let bestPercent = 0;
  let minDiff = Infinity;

  // 1. Broad sweep (0% to 500%)
  for (let p = 0; p <= 500; p += 1) {
    const val = simulate(p);
    const diff = Math.abs(val - targetPrice);
    if (diff < minDiff) {
      minDiff = diff;
      bestPercent = p;
    }
    if (val > targetPrice && p > 0) break;
  }

  // 2. Refinement iterations
  let current = bestPercent;
  let step = 0.1;
  for (let iteration = 0; iteration < 4; iteration++) {
    const start = current - (step * 10);
    for (let i = 0; i <= 20; i++) {
      const p = start + (i * step);
      if (p < 0) continue;
      const val = simulate(p);
      const diff = Math.abs(val - targetPrice);
      if (diff < minDiff) {
        minDiff = diff;
        bestPercent = p;
      }
    }
    current = bestPercent;
    step /= 10;
  }

  return bestPercent;
}
