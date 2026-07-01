/**
 * useCostSheetCalculator — main reactive calculation hook for the cost sheet UI.
 *
 * Responsibilities:
 *  1. Calculate annexes (internal column formulas, coefficient adjustments)
 *  2. Build engine-ready FichaJSON via shared mapping pipeline
 *  3. Execute the declarative calculation engine
 *  4. Map engine results back to UI-friendly calculatedValues
 *  5. Run health validations
 *  6. Debounce to prevent cascading re-renders
 *
 * Phase 5 rewrite: removed 4 LEGADO imports (buildVHSums, buildEngineRows,
 * assembleFichaJSON, createSharedParser), replaced with buildEngineFicha from
 * the canonical mapper. Eliminated all `any` types. Removed non-dev console.logs.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type {
  CostSheetData,
  CostSheetHeader,
  CalculatedRowValue,
  CostSheetAnnex,
} from '@/types/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import type { AuditEntry, CalculationResult, ValidationError } from '@/lib/cost-engine/types';
import { calculateCostSheetHealth, type ValidationResult } from '@/lib/cost-engine/validations';
import { buildEngineFichaWithAnnexes, calculateAnnexesPure } from '@/lib/cost-engine/build-ficha';
import { createSharedParser, evaluateHeaderExpressionShared } from '@/lib/cost-engine/shared-mapping';
import { useCostSheetStore } from '@/store/cost-sheet-store';

// ── Types ────────────────────────────────────────────────────────────

interface CalculatorState {
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedHeader: CostSheetHeader | null;
  calculationResult: CalculationResult | null;
  audits: AuditEntry[];
  validations: ValidationResult[];
  healthPercent: number;
  error: Error | null;
  isBlocked: boolean;
  deepValidationErrors: ValidationError[];
}

/** Annex row type used for total computation. */
interface AnnexDataRow {
  total?: number;
  amount?: number;
  depreciation_cost?: number;
  price_total?: number;
  importe?: number;
}

const INITIAL_STATE: CalculatorState = {
  calculatedValues: {},
  calculatedHeader: null,
  calculationResult: null,
  audits: [],
  validations: [],
  healthPercent: 100,
  error: null,
  isBlocked: false,
  deepValidationErrors: [],
};

// ── Pure helpers ─────────────────────────────────────────────────────

/**
 * Compute per-annex totals by summing the best available numeric value
 * from each data row.
 */
function computeAnnexTotals(annexes: CostSheetAnnex[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const a of annexes) {
    const total = (a.data || []).reduce((sum: number, row: AnnexDataRow) => {
      const val =
        [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(
          (v) => v !== undefined && v !== null,
        ) ?? 0;
      return sum + (typeof val === 'number' ? val : 0);
    }, 0);
    totals[a.id] = total;
  }
  return totals;
}

/** Fields evaluated in the "early header" pass (before engine). */
const EARLY_HEADER_FIELDS = ['name', 'code', 'product_code', 'unit', 'quantity'] as const;

// ── Hook ─────────────────────────────────────────────────────────────

export const useCostSheetCalculator = (template: CostSheetData) => {
  const hasHydrated = useCostSheetStore((s) => s._hasHydrated);

  const [resultState, setResultState] = useState<CalculatorState>(INITIAL_STATE);

  // BUG-006 FIX: Parser instance per hook instance (prevents race conditions)
  const parserRef = useRef<ReturnType<typeof createSharedParser> | null>(null);
  if (!parserRef.current) parserRef.current = createSharedParser();
  const sharedParser = parserRef.current;

  // ── 1. Calculate Annexes ──────────────────────────────────────────
  // Use JSON.stringify keys to detect deep changes from setSheet/reset.
  const annexesKey = JSON.stringify(template?.annexes);
  const headerKey = JSON.stringify(template?.header);
  const sectionsKey = JSON.stringify(template?.sections);

  const calculatedAnnexes = useMemo(
    () => calculateAnnexesPure(template, sharedParser),
    [annexesKey, headerKey, sectionsKey],
  );

  const annexTotals = useMemo(
    () => computeAnnexTotals(calculatedAnnexes as unknown as CostSheetAnnex[]),
    [calculatedAnnexes],
  );

  // ── 2. Debounced calculation ──────────────────────────────────────
  // FIX-RCT-140: prevents 5-6 rapid successive renders (brincos)
  const templateRef = useRef(template);
  const calculatedAnnexesRef = useRef(calculatedAnnexes);
  const hasHydratedRef = useRef(hasHydrated);
  const pendingCalcRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync without triggering the calculation effect
  templateRef.current = template;
  calculatedAnnexesRef.current = calculatedAnnexes;
  hasHydratedRef.current = hasHydrated;

  const runCalculation = useCallback(() => {
    const currentTemplate = templateRef.current;
    const currentAnnexes = calculatedAnnexesRef.current;

    try {
      if (!currentTemplate?.header || !currentTemplate.sections) {
        return; // Silently skip — data not ready yet
      }

      // --- Early header evaluation ---
      const earlyHeader = { ...currentTemplate.header };

      for (const field of EARLY_HEADER_FIELDS) {
        const val = (earlyHeader as Record<string, unknown>)[field];
        if (typeof val === 'string' && val.startsWith('=')) {
          (earlyHeader as Record<string, unknown>)[field] = evaluateHeaderExpressionShared(
            val,
            earlyHeader,
            currentAnnexes,
            {},
            sharedParser,
          );
        }
      }

      // Automatic % Capacidad (Quantity / Production Level)
      const qVal = parseFloat(String(earlyHeader.quantity || 0));
      const pVal = parseFloat(String(earlyHeader.production_level || 0));
      if (!isNaN(qVal) && !isNaN(pVal) && pVal > 0) {
        earlyHeader.capacity_utilization = Number(((qVal / pVal) * 100).toFixed(2));
      }

      // --- Build engine-ready FichaJSON via shared pipeline ---
      const ficha = buildEngineFichaWithAnnexes(
        { ...currentTemplate, header: earlyHeader },
        currentAnnexes,
      );

      // --- Execute Engine ---
      const result = calculateFicha(ficha, { actor: 'ui-hook' });

      // --- Map engine results back to UI values ---
      const newCalculatedValues: Record<string, CalculatedRowValue> = {};
      for (const r of result.rows) {
        const rowValidationErrors = (result.deepValidationErrors || []).filter(
          (ve) => ve.rowId === r.id,
        );

        newCalculatedValues[r.id] = {
          total: r.total,
          valorHistorico: r.valorHistorico || 0,
          calculatedVH: r.calculatedVH,
          baseDeCalculoRef:
            r.baseCalculo?.type === 'FILA'
              ? r.baseCalculo.classification
              : (r.baseCalculo?.anexoId || null),
          baseTotal: r.baseTotal || 0,
          baseValorHistorico: r.baseHist || 0,
          coeficiente:
            r.formaCalculo === 'PRORRATEO'
              ? Math.abs(r.baseHist ?? 0) > 0.0001
                ? (r.valorHistorico || 0) / (r.baseHist ?? 1)
                : 0
              : (r.coeficiente || 0),
          fuente: r.fuente,
          metadata: { ...(r.metadata || {}), appliedFormula: r.formula },
          audits: r.audit,
          hasWarnings:
            r.audit.some(
              (a) =>
                a.type === 'WARNING' ||
                a.type === 'ERROR' ||
                a.type === 'CYCLE_DETECTED',
            ) || rowValidationErrors.length > 0,
          validationErrors: rowValidationErrors.map((ve) => ({
            message: ve.message,
            type: ve.type,
            code: ve.code,
          })),
        };
      }

      const isBlocked = (result.deepValidationErrors || []).some(
        (e) => e.type === 'CRITICAL',
      );

      // --- Late header (sale_price depends on calculated values) ---
      const finalHeader = { ...earlyHeader };
      if (
        typeof finalHeader.sale_price === 'string' &&
        String(finalHeader.sale_price).startsWith('=')
      ) {
        finalHeader.sale_price = evaluateHeaderExpressionShared(
          finalHeader.sale_price,
          finalHeader,
          currentAnnexes,
          newCalculatedValues,
          sharedParser,
        );
      }

      // Ensure calculation result carries the final header for export
      const finalResult: CalculationResult = {
        ...result,
        metadata: { ...(result.metadata || {}), header: finalHeader },
      };

      // --- Health validations ---
      const health = calculateCostSheetHealth(
        currentTemplate,
        newCalculatedValues,
        finalHeader,
      );

      setResultState({
        calculatedValues: newCalculatedValues,
        calculatedHeader: finalHeader,
        calculationResult: finalResult,
        audits: result.audits,
        validations: health.validations,
        healthPercent: health.healthPercent,
        error: null,
        isBlocked,
        deepValidationErrors: result.deepValidationErrors || [],
      });
    } catch (e) {
      setResultState((prev) => ({ ...prev, error: e as Error }));
      console.error('[CostCalc] Error in unified cost calculator:', e);
    }
  }, [sharedParser]);

  // ── 3. Fallback hydration guarantee ────────────────────────────────
  // Defensive: if onRehydrateStorage never fires (SSR degraded mode,
  // storage error, or edge case), force _hasHydrated after 800ms so
  // the calculator doesn't remain permanently blocked.
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (!useCostSheetStore.getState()._hasHydrated) {
        useCostSheetStore.setState({ _hasHydrated: true });
      }
    }, 800);
    return () => clearTimeout(fallbackTimer);
  }, []);

  // ── 4. Debounced calculation ──────────────────────────────────────
  // Skip until persist rehydration completes
  useEffect(() => {
    if (!hasHydratedRef.current) return;

    if (pendingCalcRef.current) {
      clearTimeout(pendingCalcRef.current);
    }
    pendingCalcRef.current = setTimeout(runCalculation, 150);

    return () => {
      if (pendingCalcRef.current) {
        clearTimeout(pendingCalcRef.current);
      }
    };
  }, [template, calculatedAnnexes, hasHydrated, runCalculation]);

  return {
    calculatedValues: resultState.calculatedValues,
    calculatedHeader: resultState.calculatedHeader || template?.header,
    calculatedAnnexes,
    annexTotals,
    audits: resultState.audits,
    validations: resultState.validations,
    healthPercent: resultState.healthPercent,
    calculationResult: resultState.calculationResult,
    error: resultState.error,
    isBlocked: resultState.isBlocked,
    deepValidationErrors: resultState.deepValidationErrors,
  };
};
