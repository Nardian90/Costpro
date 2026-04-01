import { calculateFicha } from './index';
import { mapUIToFicha } from './mapper';
import { CostSheetData } from '@/types/cost-sheet';
import { produce } from 'immer';

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

  const simulate = (coef: number): number => {
    const simulatedData = produce(uiData, draft => {
      const annex = draft.annexes.find(a => a.id === annexId);
      if (annex) {
        annex.coefficient = coef;
        annex.isAdjustmentActive = true;
      }
    });

    const ficha = mapUIToFicha(simulatedData);
    const result = calculateFicha(ficha);

    // Target Row 14.1 (Precio Final)
    const row141 = result.rows.find(r => r.id === '14.1' || r.classification === '14.1');
    if (!row141) {
        // Fallback to grandTotal if 14.1 is not found
        return result.summary.grandTotal;
    }
    return row141.total;
  };

  const basePrice = simulate(1);
  if (Math.abs(basePrice - targetPrice) < tolerance) return 1;

  // Step-based approach to find the initial range
  // We start from 1.0 and move in increments of 0.1 to find where target lies
  let low = 0;
  let high = 1;
  let currentVal = basePrice;

  if (basePrice < targetPrice) {
    // Need to increase coefficient
    low = 1;
    high = 2;
    let iterations = 0;
    while (simulate(high) < targetPrice && iterations < 50) {
      low = high;
      high *= 2;
      iterations++;
    }
  } else {
    // Need to decrease coefficient
    low = 0;
    high = 1;
    let iterations = 0;
    while (simulate(low) > targetPrice && iterations < 50) {
      high = low;
      low /= 2;
      iterations++;
    }
  }

  // Refine with Binary Search for precision
  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const currentPrice = simulate(mid);

    if (Math.abs(currentPrice - targetPrice) < tolerance) {
      return mid;
    }

    if (currentPrice < targetPrice) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}
