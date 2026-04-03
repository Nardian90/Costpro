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
  } = {}
): number {
  const { maxIterations = 50, tolerance = 0.0001 } = options;

  const getTargetValue = (result: any): number => {
    // Priority list of rows that usually represent the final price or target
    const targetRow = result.rows.find((r: any) =>
        r.id === '14.1' || r.classification === '14.1' ||
        r.id === '14' || r.classification === '14' ||
        r.id === '16' || r.classification === '16' ||
        r.label?.toLowerCase().includes('precio final') ||
        r.label?.toLowerCase().includes('venta unitaria')
    );

    if (!targetRow) {
        // Fallback to grandTotal if no specific target row is found
        return result.summary.grandTotal;
    }
    return targetRow.total;
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

  // Try linear estimation for better bounds
  const zeroPrice = simulate(0);
  const delta = basePrice - zeroPrice;

  let low = 0;
  let high = 1;

  if (Math.abs(delta) > tolerance) {
      // Linear guess: target = zeroPrice + coef * delta
      // coef = (target - zeroPrice) / delta
      const initialGuess = (targetPrice - zeroPrice) / delta;
      if (initialGuess > 0) {
          low = Math.max(0, initialGuess * 0.8);
          high = initialGuess * 1.2;
      }
  }

  // Ensure bounds actually contain the target via exponential search if needed
  let vLow = simulate(low);
  let vHigh = simulate(high);

  let iter = 0;
  // Determine if function is increasing or decreasing with respect to coefficient
  const isIncreasing = simulate(high + 1) > vHigh;

  if (isIncreasing) {
      while (vHigh < targetPrice && iter < 15) {
          low = high;
          high = high === 0 ? 1 : high * 2;
          vHigh = simulate(high);
          iter++;
      }
      while (vLow > targetPrice && iter < 30) {
          high = low;
          low = low / 2;
          vLow = simulate(low);
          iter++;
      }
  } else {
      // Decreasing
      while (vLow < targetPrice && iter < 15) {
          high = low;
          low = low === 0 ? -1 : low * 2;
          vLow = simulate(low);
          iter++;
      }
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

    // Safety exit for precision limits
    if (Math.abs(high - low) < 1e-15) break;
  }

  return (low + high) / 2;
}
