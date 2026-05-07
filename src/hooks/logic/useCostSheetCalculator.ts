import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  CostSheetData,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';
import { calculateCostSheetHealth, ValidationResult } from '@/lib/cost-engine/validations';
import {
  createSharedParser,
  calculateAnnexesPure,
  evaluateHeaderExpressionShared,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
} from '@/lib/cost-engine/shared-mapping';
import { useCostSheetStore } from '@/store/cost-sheet-store';

// BUG-006 FIX: Parser instance is now created per hook instance via useRef
// to prevent race conditions when multiple cost sheets are open simultaneously.
// Previously sharedParser was a module-level singleton that could be overwritten.

export const useCostSheetCalculator = (template: CostSheetData) => {
  // BUG-006 FIX: Create a parser per hook instance
  const parserRef = useRef<ReturnType<typeof createSharedParser> | null>(null);
  if (!parserRef.current) parserRef.current = createSharedParser();
  const sharedParser = parserRef.current;

  const hasHydrated = useCostSheetStore((s) => s._hasHydrated);

  const [resultState, setResultState] = useState<{
      calculatedValues: { [key: string]: CalculatedRowValue };
      calculatedHeader: any | null;
      calculationResult: CalculationResult | null;
      audits: AuditEntry[];
      validations: ValidationResult[];
      healthPercent: number;
      error: Error | null;
      isBlocked: boolean;
      deepValidationErrors: any[];
  }>({
      calculatedValues: {},
      calculatedHeader: null,
      calculationResult: null,
      audits: [],
      validations: [],
      healthPercent: 100,
      error: null,
      isBlocked: false,
      deepValidationErrors: []
  });

  // 1. Calculate Annexes first (internal formulas) — delegates to shared pure function
  const calculatedAnnexes = useMemo(() => {
    return calculateAnnexesPure(template, sharedParser);
  }, [template?.annexes, template?.header, template?.sections]);

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    calculatedAnnexes.forEach(a => {
      const total = (a.data || []).reduce((sum: number, row: any) => {
        const val = [row.total, row.amount, row.depreciation_cost, row.price_total, row.importe].find(v => v !== undefined && v !== null) ?? 0;
        return sum + (typeof val === 'number' ? val : 0);
      }, 0);
      totals[a.id] = total;
    });
    return totals;
  }, [calculatedAnnexes]);

  // FIX-RCT-140: Debounce calculation to prevent cascading re-renders.
  // Without this, initializeScenarios → data change → calc → setResultState → re-render
  // creates 5-6 rapid successive renders causing visual "jumps" (brincos).
  const templateRef = useRef(template);
  const calculatedAnnexesRef = useRef(calculatedAnnexes);
  const hasHydratedRef = useRef(hasHydrated);
  const pendingCalcRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync without triggering the effect
  useEffect(() => { templateRef.current = template; });
  useEffect(() => { calculatedAnnexesRef.current = calculatedAnnexes; });
  useEffect(() => { hasHydratedRef.current = hasHydrated; });

  const runCalculation = useCallback(() => {
    const currentTemplate = templateRef.current;
    const currentAnnexes = calculatedAnnexesRef.current;

    try {
      if (!currentTemplate || !currentTemplate.header || !currentTemplate.sections) {
          return;
      }

      // --- Calculate Early Header ---
      const earlyHeader = { ...currentTemplate.header };

      // Evaluate early formulas first (name, code, product_code, unit, quantity)
      ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
          const val = (earlyHeader as any)[field];
          if (typeof val === 'string' && val.startsWith('=')) {
              (earlyHeader as any)[field] = evaluateHeaderExpressionShared(val, earlyHeader, currentAnnexes, {}, sharedParser);
          }
      });

      // 2. Automatic % Capacidad (Quantity / Nivel Prod) - AFTER quantity formula is evaluated
      const qVal = parseFloat(String(earlyHeader.quantity || 0));
      const pVal = parseFloat(String(earlyHeader.production_level || 0));
      if (!isNaN(qVal) && !isNaN(pVal) && pVal > 0) {
          earlyHeader.capacity_utilization = Number(((qVal / pVal) * 100).toFixed(2));
      }

      // Build FichaJSON using shared mapping functions
      const vhSums = buildVHSums(currentTemplate.sections);
      const engineRows = buildEngineRows(currentTemplate, vhSums);
      const ficha: FichaJSON = assembleFichaJSON(earlyHeader, currentAnnexes, engineRows);

      // Execute Engine
      const result = calculateFicha(ficha, { actor: 'ui-hook' });

      // Map back to UI values
      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      result.rows.forEach(r => {
          const rowValidationErrors = (result.deepValidationErrors || []).filter(ve => ve.rowId === r.id);

          newCalculatedValues[r.id] = {
              total: r.total,
              valorHistorico: r.valorHistorico || 0,
              calculatedVH: r.calculatedVH,
              baseDeCalculoRef: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : (r.baseCalculo?.anexoId || null),
              baseTotal: r.baseTotal || 0,
              baseValorHistorico: r.baseHist || 0,
              coeficiente: r.formaCalculo === 'PRORRATEO'
                ? (Math.abs(r.baseHist ?? 0) > 0.0001 ? (r.valorHistorico || 0) / (r.baseHist ?? 1) : 0)
                : (r.coeficiente || 0),
              fuente: r.fuente,
              metadata: { ...(r.metadata || {}), appliedFormula: r.formula },
              audits: r.audit,
              hasWarnings: r.audit.some(a => a.type === 'WARNING' || a.type === 'ERROR' || a.type === 'CYCLE_DETECTED') || rowValidationErrors.length > 0,
              validationErrors: rowValidationErrors.map(ve => ({
                  message: ve.message,
                  type: ve.type,
                  code: ve.code
              }))
          };
      });

      const isBlocked = (result.deepValidationErrors || []).some(e => e.type === 'CRITICAL');

      // --- Calculate Late Header ---
      const finalHeader = { ...earlyHeader };
      if (typeof finalHeader.sale_price === 'string' && String(finalHeader.sale_price).startsWith('=')) {
          finalHeader.sale_price = evaluateHeaderExpressionShared(finalHeader.sale_price, finalHeader, currentAnnexes, newCalculatedValues, sharedParser);
      }

      // Ensure the calculation result contains the final calculated header for export purposes
      const finalResult = {
          ...result,
          metadata: {
              ...(result.metadata || {}),
              header: finalHeader
          }
      };

      // Calculate health validations
      const health = calculateCostSheetHealth(currentTemplate, newCalculatedValues, finalHeader);

      setResultState({
          calculatedValues: newCalculatedValues,
          calculatedHeader: finalHeader,
          calculationResult: finalResult,
          audits: result.audits,
          validations: health.validations,
          healthPercent: health.healthPercent,
          error: null,
          isBlocked,
          deepValidationErrors: result.deepValidationErrors || []
      });
    } catch (e) {
      setResultState(prev => ({ ...prev, error: e as Error }));
      console.error("Error in unified cost calculator:", e);
    }
  }, [sharedParser]);

  // 2. Run the declarative Engine for the main rows — DEBOUNCED
  useEffect(() => {
    // FIX: Skip calculation until persist rehydration completes to prevent
    // cascading re-renders (template → calc → initScenarios → template → calc)
    if (!hasHydrated) return;

    // Debounce: if another data change comes within 150ms, cancel the previous calc
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
      deepValidationErrors: resultState.deepValidationErrors
  };
};
