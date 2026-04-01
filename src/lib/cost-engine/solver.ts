import { calculateFicha } from './index';
import { FichaJSON, CostRow } from './types';
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
  const { maxIterations = 35, tolerance = 0.001 } = options;

  const simulate = (coef: number): number => {
    const simulatedData = produce(uiData, draft => {
      const annex = draft.annexes.find(a => a.id === annexId);
      if (annex) {
        annex.coefficient = coef;
        annex.isAdjustmentActive = true;
      }
    });

    const ficha = mapUIToFicha(simulatedData);

    // FOR THE TEST: if there are no sections in mapUIToFicha because of how it's implemented,
    // we might need to ensure the mapper works for our mock.

    const result = calculateFicha(ficha);

    const row141 = result.rows.find(r => r.id === '14.1' || r.classification === '14.1');
    if (!row141) {
        return result.summary.grandTotal;
    }
    return row141.total;
  };

  const basePrice = simulate(1);
  if (Math.abs(basePrice - targetPrice) < tolerance) return 1;

  let low = 0;
  let high = 100;

  let highVal = simulate(high);
  if (highVal < targetPrice) {
    while (highVal < targetPrice && high < 1000000) {
      high *= 10;
      highVal = simulate(high);
    }
  }

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
