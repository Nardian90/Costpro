import { calculateFicha } from './index';
import { mapUIToFicha } from './mapper';
import { CostSheetData } from '@/types/cost-sheet';
import { produce } from 'immer';

/**
 * Solves for the coefficient needed in an annex to reach a target price.
 *
 * This version uses an exhaustive incremental search (as requested by the user)
 * to handle the discrete step-function nature of the cost engine caused by rounding.
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

  // Step 1: Identify the Target Row
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

  // Step 2: Incremental Search (The User Way)
  // We sweep a broad range with 0.001 precision.
  let bestCoef = 1;
  let minDiff = Infinity;

  const check = (c: number) => {
    const val = simulate(c);
    const diff = Math.abs(val - targetPrice);
    if (diff < minDiff) {
        minDiff = diff;
        bestCoef = c;
    } else if (Math.abs(diff - minDiff) < 1e-10) {
        // Prefer "cleaner" numbers (fewer decimals)
        if (String(c).length < String(bestCoef).length) {
            bestCoef = c;
        }
    }
  };

  // Broad sweep: 0.000 to 5.000 with 0.001 steps
  for (let i = 0; i <= 5000; i++) {
      check(i / 1000);
  }

  // Refinement sweep: around the best found so far with 0.0001 steps
  const center = bestCoef;
  for (let i = -10; i <= 10; i++) {
      check(center + i / 10000);
  }

  return bestCoef;
}
