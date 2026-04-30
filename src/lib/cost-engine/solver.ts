import { logger } from '@/lib/logger';
import { calculateFicha } from './index';
import { buildEngineFicha } from './build-ficha';
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
      row.isPercent = false;
      (row as any).is_percent = false; // backward compat
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
 * OPTIMIZED: Uses bisection and linear approximation instead of brute-force scan.
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

  // Step 1: Identify the Target Row (Targeting 14.1 by default)
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
    const row = res.rows.find((r: any) => r.id === resolvedTargetId || r.classification === resolvedTargetId);
    return row ? row.total : res.summary.grandTotal;
  };

  // ── Step 2: Solver Logic (Reusing optimized logic from solveForTarget) ──
  const y0 = simulate(0);
  const y1 = simulate(1);
  const slope = y1 - y0;

  if (Math.abs(slope) < 1e-10) {
    logger.warn('COST_SHEET', '[SOLVER]_ANNEX_COEFFICIENT_HAS_NO_MEASURABLE_EFFEC')
    return 1;
  }

  const guess = (targetPrice - y0) / slope;

  // Bisection refinement
  const TOLERANCE = 0.0001;
  const MAX_ITER = 50;

  let lo = guess - 10;
  let hi = guess + 10;

  // Ensure we bracket the root
  let fLo = simulate(lo) - targetPrice;
  let fHi = simulate(hi) - targetPrice;

  let expansion = 0;
  while (fLo * fHi > 0 && expansion < 10) {
      lo -= 100;
      hi += 100;
      fLo = simulate(lo) - targetPrice;
      fHi = simulate(hi) - targetPrice;
      expansion++;
  }

  if (fLo * fHi > 0) {
      // Fallback to scan if bisection fails to bracket
      return scanFallback(targetPrice, simulate);
  }

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fMid = simulate(mid) - targetPrice;
    if (Math.abs(fMid) < TOLERANCE) return mid;
    if (fLo * fMid <= 0) {
        hi = mid;
        fHi = fMid;
    } else {
        lo = mid;
        fLo = fMid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Goal Seek Solver: Finds the value for variableRowId that makes targetRowId's
 * total equal to targetValue.
 */
export function solveForTarget(
  uiData: CostSheetData,
  targetRowId: string,
  targetValue: number,
  variableRowId: string
): number {
  const MAX_SIMULATE_CALLS = 500;
  let callCount = 0;

  const simulate = (val: number): number => {
    const simulatedData = produce(uiData, (draft: any) => {
      for (const section of draft.sections) {
        if (applySolverModToUIData(section.rows, variableRowId, val)) break;
      }
    });

    const engineFicha = buildEngineFicha(simulatedData as any);
    callCount++;
    if (callCount > MAX_SIMULATE_CALLS) return 0;

    const result = calculateFicha(engineFicha);
    const row = result.rows.find(
      (r: any) => r.id === targetRowId || r.classification === targetRowId
    );
    return row ? row.total : result.summary.grandTotal;
  };

  const y0 = simulate(0);
  const y1 = simulate(1);
  const slope = y1 - y0;

  if (Math.abs(slope) < 1e-10) return 0;
  const guess = (targetValue - y0) / slope;
  if (!isFinite(guess)) return 0;

  return bisectRoot(guess, targetValue, simulate);
}

function bisectRoot(initial: number, target: number, simulate: (v: number) => number): number {
    const TOLERANCE = 0.005;
    const MAX_ITER = 100;

    let lo = initial - Math.max(Math.abs(initial) * 2, 10000);
    let hi = initial + Math.max(Math.abs(initial) * 2, 10000);

    let fLo = simulate(lo) - target;
    let fHi = simulate(hi) - target;

    let expansion = 0;
    while (fLo * fHi > 0 && expansion < 30) {
      const factor = Math.pow(2, expansion);
      const testLo = initial - 10000 * factor;
      const testHi = initial + 10000 * factor;
      const fTestLo = simulate(testLo) - target;
      const fTestHi = simulate(testHi) - target;

      if (fLo * fTestLo <= 0) { lo = testLo; fLo = fTestLo; break; }
      if (fLo * fTestHi <= 0) { hi = testHi; fHi = fTestHi; break; }
      lo = testLo; fLo = fTestLo;
      hi = testHi; fHi = fTestHi;
      expansion++;
    }

    if (fLo * fHi > 0) return scanFallback(target, simulate);

    for (let i = 0; i < MAX_ITER; i++) {
      const mid = (lo + hi) / 2;
      const fMid = simulate(mid) - target;
      if (Math.abs(fMid) < TOLERANCE) return mid;
      if (fLo * fMid <= 0) { hi = mid; fHi = fMid; }
      else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
}

function scanFallback(target: number, sim: (v: number) => number): number {
    let bestVal = 0;
    let minDiff = Math.abs(sim(0) - target);

    const points: number[] = [0];
    for (let exp = -2; exp <= 5; exp++) {
      const base = Math.pow(10, exp);
      for (const m of [1, 2, 5]) {
        points.push(base * m);
        points.push(-base * m);
      }
    }

    const sorted = [...new Set(points)].sort((a, b) => a - b);
    for (const v of sorted) {
      const diff = Math.abs(sim(v) - target);
      if (diff < minDiff) { minDiff = diff; bestVal = v; }
    }
    return bestVal;
}
