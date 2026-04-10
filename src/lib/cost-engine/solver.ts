import { calculateFicha } from './index';
import { mapUIToFicha } from './mapper';
import { CostSheetData, CostSheetRow } from '@/types/cost-sheet';
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

  // Step 2: Incremental Search
  let bestCoef = 1;
  let minDiff = Infinity;

  const check = (c: number) => {
    const val = simulate(c);
    const diff = Math.abs(val - targetPrice);
    if (diff < minDiff) {
        minDiff = diff;
        bestCoef = c;
    } else if (Math.abs(diff - minDiff) < 1e-10) {
        if (String(c).length < String(bestCoef).length) {
            bestCoef = c;
        }
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
 * Advanced Solver: Finds the value for variableRowId that makes targetRowId equal to targetValue.
 */
export function solveForTarget(
  uiData: CostSheetData,
  targetRowId: string,
  targetValue: number,
  variableRowId: string
): number {
  const findAndSetRowValue = (rows: CostSheetRow[], idOrCls: string, newValue: number): boolean => {
    for (const row of rows) {
      if (row.id === idOrCls || row.classification === idOrCls) {
        row.valorHistorico = newValue;
        row.value = newValue;
        return true;
      }
      if (row.children && findAndSetRowValue(row.children, idOrCls, newValue)) {
        return true;
      }
    }
    return false;
  };

  const simulate = (val: number): number => {
    const simulatedData = produce(uiData, draft => {
      for (const section of draft.sections) {
        if (findAndSetRowValue(section.rows, variableRowId, val)) break;
      }
    });

    // We map to ficha. mapUIToFicha will use the updated valorHistorico.
    const engineFicha = mapUIToFicha(simulatedData as any);

    // If the variable row is NOT a leaf, its total might be overwritten by calculateFicha (sum of children).
    // We force it to be a leaf in the engine for this calculation.
    const vRowIdx = engineFicha.rows.findIndex(r => r.id === variableRowId || r.classification === variableRowId);
    if (vRowIdx !== -1) {
      const vRow = engineFicha.rows[vRowIdx];
      vRow.valorHistorico = val;
      vRow.formaCalculo = 'FIJO';
      vRow.formula = undefined;
      // Also remove it from parent-child relationship so sum(children) doesn't overwrite it?
      // Actually, we want it to BE the new value.
    }

    const result = calculateFicha(engineFicha);
    const row = result.rows.find((r: any) => r.id === targetRowId || r.classification === targetRowId);
    return row ? row.total : result.summary.grandTotal;
  };

  const y0 = simulate(0);
  const testVal = 1000;
  const yTest = simulate(testVal);

  let slope = (yTest - y0) / testVal;

  if (Math.abs(slope) < 1e-10) {
    const yLarge = simulate(10000);
    slope = (yLarge - y0) / 10000;
    if (Math.abs(slope) < 1e-10) return 0;
  }

  let guess = (targetValue - y0) / slope;
  return refineValue(guess, targetValue, simulate);
}

function refineValue(guess: number, targetValue: number, simulate: (v: number) => number): number {
  if (!isFinite(guess)) return 0;

  let bestVal = guess;
  let minDiff = Math.abs(simulate(guess) - targetValue);

  const refine = (v: number) => {
    const currentRes = simulate(v);
    const diff = Math.abs(currentRes - targetValue);
    if (diff < minDiff) {
      minDiff = diff;
      bestVal = v;
    }
  };

  for (let i = -5; i <= 5; i++) {
    refine(guess + i * 0.01);
    refine(guess + i * 0.001);
    refine(guess + i * 0.0001);
  }

  return bestVal;
}
