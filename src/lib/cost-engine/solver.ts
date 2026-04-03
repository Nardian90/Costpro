import { calculateFicha } from './index';
import { mapUIToFicha } from './mapper';
import { CostSheetData } from '@/types/cost-sheet';
import { produce } from 'immer';

/**
 * Solves for the coefficient needed in an annex to reach a target price.
 * Uses a hybrid approach: Linear estimation for starting bounds, followed by binary search.
 */
export function solveCoefficient(
  uiData: CostSheetData,
  annexId: string,
  targetPrice: number,
  options: {
    maxIterations?: number;
    tolerance?: number;
    targetRowId?: string;
  } = {}
): number {
  const { maxIterations = 80, tolerance = 0.000001, targetRowId } = options;

  const getTargetValue = (result: any): number => {
    // If a specific row ID was requested (e.g. from the Summary view)
    if (targetRowId) {
        const specificRow = result.rows.find((r: any) => r.id === targetRowId || r.classification === targetRowId);
        if (specificRow) return specificRow.total;
    }

    // Priority list of rows that usually represent the final price or target
    const targetIds = ['14.1', '14', '16', '13.1', '12'];
    for (const id of targetIds) {
        const row = result.rows.find((r: any) => r.id === id || r.classification === id);
        if (row) return row.total;
    }

    // Fallback to label search
    const labelTarget = result.rows.find((r: any) =>
        r.label?.toLowerCase().includes('precio final') ||
        r.label?.toLowerCase().includes('venta unitaria') ||
        r.label?.toLowerCase().includes('tarifa final')
    );

    if (labelTarget) return labelTarget.total;

    // Last resort
    return result.summary.grandTotal;
  };

  const simulate = (coef: number): number => {
    const simulatedData = produce(uiData, draft => {
      const annex = (draft.annexes as any[]).find(a => a.id === annexId);
      if (annex) {
        annex.coefficient = coef;
        annex.isAdjustmentActive = true;
      }
    });

    const ficha = mapUIToFicha(simulatedData as any);
    const result = calculateFicha(ficha);
    return getTargetValue(result);
  };

  const basePrice = simulate(1);
  if (Math.abs(basePrice - targetPrice) < tolerance) return 1;

  // Linear estimation step to get closer bounds
  const zeroPrice = simulate(0);
  const delta = basePrice - zeroPrice;

  let low = 0;
  let high = 1;

  if (Math.abs(delta) > tolerance) {
      const initialGuess = (targetPrice - zeroPrice) / delta;
      if (initialGuess > 0) {
          low = Math.max(0, initialGuess * 0.95);
          high = initialGuess * 1.05;
      }
  }

  // Bounding search
  let iter = 0;
  const isIncreasing = simulate(high + 0.1) > simulate(high);

  if (isIncreasing) {
      let vHigh = simulate(high);
      while (vHigh < targetPrice && iter < 15) {
          low = high;
          high = high === 0 ? 1 : high * 2;
          vHigh = simulate(high);
          iter++;
      }
      let vLow = simulate(low);
      while (vLow > targetPrice && iter < 30) {
          high = low;
          low = low / 2;
          vLow = simulate(low);
          iter++;
      }
  } else {
      let vLow = simulate(low);
      while (vLow < targetPrice && iter < 15) {
          high = low;
          low = low === 0 ? -1 : low * 2;
          vLow = simulate(low);
          iter++;
      }
      let vHigh = simulate(high);
      while (vHigh > targetPrice && iter < 30) {
          low = high;
          high = high * 2;
          vHigh = simulate(high);
          iter++;
      }
  }

  // Refine with Binary Search
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const currentPrice = simulate(mid);

    if (Math.abs(currentPrice - targetPrice) < tolerance) {
      return mid;
    }

    if (isIncreasing) {
        if (currentPrice < targetPrice) low = mid;
        else high = mid;
    } else {
        if (currentPrice > targetPrice) low = mid;
        else high = mid;
    }

    if (Math.abs(high - low) < 1e-15) break;
  }

  return (low + high) / 2;
}
