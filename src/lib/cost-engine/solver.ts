import { calculateFicha } from './index';
import { buildEngineFicha } from './build-ficha';
import { mapUIToFicha } from './mapper';
import { CostSheetData, CostSheetRow } from '@/types/cost-sheet';
import { produce } from 'immer';

/**
 * Apply solver modifications to a UI data row — mirrors what handleSolverConfirm does.
 * This ensures the solver's simulation matches the real pipeline after confirming.
 */
function applySolverModToUIData(
  rows: CostSheetRow[],
  variableRowId: string,
  value: number,
): boolean {
  for (const row of rows) {
    if (row.id === variableRowId || row.classification === variableRowId) {
      row.valorHistorico = value;
      row.value = value;
      row.formula = undefined;
      (row as any).totalFormula = undefined;
      row.calculationMethod = 'ValorFijo';
      row.is_percent = false;
      return true;
    }
    if (row.children && applySolverModToUIData(row.children, variableRowId, value)) {
      return true;
    }
  }
  return false;
}

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
    return calculateFicha(buildEngineFicha(simulatedData as any));
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
 * Goal Seek Solver: Finds the value for variableRowId that makes targetRowId's
 * total equal to targetValue.
 *
 * CRITICAL: Uses buildEngineFicha (same pipeline as useCostSheetCalculator) instead
 * of mapUIToFicha to ensure the simulation matches what happens after confirming.
 */
export function solveForTarget(
  uiData: CostSheetData,
  targetRowId: string,
  targetValue: number,
  variableRowId: string
): number {
  // Helper: simulate a value through the FULL engine pipeline (same as normal UI)
  const simulate = (val: number): number => {
    // Deep clone and apply ALL modifications that handleSolverConfirm would do
    const simulatedData = produce(uiData, (draft: any) => {
      for (const section of draft.sections) {
        if (applySolverModToUIData(section.rows, variableRowId, val)) break;
      }
    });

    // Build engine Ficha using the SAME pipeline as useCostSheetCalculator
    const engineFicha = buildEngineFicha(simulatedData as any);

    const result = calculateFicha(engineFicha);
    const row = result.rows.find(
      (r: any) => r.id === targetRowId || r.classification === targetRowId
    );
    return row ? row.total : result.summary.grandTotal;
  };

  // ── Step 1: Sensitivity probe ──
  const y0 = simulate(0);
  const y1 = simulate(1);
  const slope = y1 - y0;

  if (Math.abs(slope) < 1e-10) {
    console.warn('[Solver] Variable has no measurable effect on target.', {
      variableRowId,
      targetRowId,
      y0,
      y1,
    });
    return 0;
  }

  // ── Step 2: Linear estimate ──
  const guess = (targetValue - y0) / slope;

  if (!isFinite(guess)) {
    console.warn('[Solver] Linear guess is not finite. Returning 0.');
    return 0;
  }

  // ── Step 3: Bisection refinement ──
  const TOLERANCE = 0.005;
  const MAX_ITER = 100;

  const bisect = (initial: number): number => {
    let lo = initial - Math.max(Math.abs(initial) * 2, 10000);
    let hi = initial + Math.max(Math.abs(initial) * 2, 10000);

    let fLo = simulate(lo) - targetValue;
    let fHi = simulate(hi) - targetValue;

    let expansion = 0;
    while (fLo * fHi > 0 && expansion < 60) {
      const factor = Math.pow(2, expansion);
      const testLo = initial - Math.max(Math.abs(initial), 10000) * factor;
      const testHi = initial + Math.max(Math.abs(initial), 10000) * factor;
      const fTestLo = simulate(testLo) - targetValue;
      const fTestHi = simulate(testHi) - targetValue;

      if (fLo * fTestLo <= 0) {
        lo = testLo; fLo = fTestLo;
        break;
      }
      if (fLo * fTestHi <= 0) {
        hi = testHi; fHi = fTestHi;
        break;
      }
      if (fTestLo * fTestHi <= 0) {
        lo = testLo; fLo = fTestLo;
        hi = testHi; fHi = fTestHi;
        break;
      }

      lo = testLo; fLo = fTestLo;
      hi = testHi; fHi = fTestHi;
      expansion++;
    }

    if (fLo * fHi > 0) {
      console.warn('[Solver] Could not bracket root after expansion. Falling back to scan.');
      return scanFallback(targetValue, simulate);
    }

    for (let i = 0; i < MAX_ITER; i++) {
      const mid = (lo + hi) / 2;
      const fMid = simulate(mid) - targetValue;

      if (Math.abs(fMid) < TOLERANCE) return mid;
      if (Math.abs(hi - lo) < TOLERANCE * 0.001) return mid;

      if (fLo * fMid <= 0) {
        hi = mid;
        fHi = fMid;
      } else {
        lo = mid;
        fLo = fMid;
      }
    }

    return (lo + hi) / 2;
  };

  // ── Step 4: Scan fallback ──
  const scanFallback = (target: number, sim: (v: number) => number): number => {
    let bestVal = 0;
    let minDiff = Math.abs(sim(0) - target);

    const points: number[] = [0];
    for (let exp = -4; exp <= 7; exp++) {
      const base = Math.pow(10, exp);
      for (const m of [1, 2, 5]) {
        points.push(base * m);
        points.push(-base * m);
      }
    }

    const sorted = [...new Set(points)].sort((a, b) => a - b);
    for (const v of sorted) {
      const diff = Math.abs(sim(v) - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestVal = v;
      }
    }

    const step = Math.max(Math.abs(bestVal) * 0.001, 0.01);
    for (let i = -30; i <= 30; i++) {
      const v = bestVal + i * step;
      const diff = Math.abs(sim(v) - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestVal = v;
      }
    }

    return bestVal;
  };

  // ── Execute ──
  const bisected = bisect(guess);

  let bestVal = bisected;
  let minDiff = Math.abs(simulate(bisected) - targetValue);

  const polish = (v: number) => {
    const diff = Math.abs(simulate(v) - targetValue);
    if (diff < minDiff) {
      minDiff = diff;
      bestVal = v;
    }
  };

  const scales = [0.1, 0.01, 0.001, 0.0001];
  let center = bestVal;
  for (const scale of scales) {
    const step = Math.max(Math.abs(center) * scale, scale * 0.01);
    for (let i = -10; i <= 10; i++) {
      polish(center + i * step);
    }
    center = bestVal;
  }

  const achieved = simulate(bestVal);
  console.log('[Solver] ✅ Result:', {
    variable: variableRowId,
    value: bestVal.toFixed(4),
    target: targetValue,
    achieved: achieved.toFixed(2),
    diff: Math.abs(achieved - targetValue).toFixed(4),
    guess: guess.toFixed(4),
  });

  return bestVal;
}
