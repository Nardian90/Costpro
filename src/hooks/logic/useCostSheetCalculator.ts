
import { useState, useEffect, useMemo } from 'react';
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

// Shared parser instance (created once, reused across all evaluations)
const sharedParser = createSharedParser();

export const useCostSheetCalculator = (template: CostSheetData) => {
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
  }, [template?.annexes, template?.header]);

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

  // 2. Run the declarative Engine for the main rows
  useEffect(() => {
    // FIX: Skip calculation until persist rehydration completes to prevent
    // cascading re-renders (template → calc → initScenarios → template → calc)
    if (!hasHydrated) return;

    try {
      if (!template || !template.header || !template.sections) {
          return;
      }

      // --- Calculate Early Header ---
      const earlyHeader = { ...template.header };

      // Evaluate early formulas first (name, code, product_code, unit, quantity)
      ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
          const val = (earlyHeader as any)[field];
          if (typeof val === 'string' && val.startsWith('=')) {
              (earlyHeader as any)[field] = evaluateHeaderExpressionShared(val, earlyHeader, calculatedAnnexes, {}, sharedParser);
          }
      });

      // 2. Automatic % Capacidad (Quantity / Nivel Prod) - AFTER quantity formula is evaluated
      const qVal = parseFloat(String(earlyHeader.quantity));
      const pVal = parseFloat(String(earlyHeader.production_level));
      if (!isNaN(qVal) && !isNaN(pVal) && pVal !== 0) {
          earlyHeader.capacity_utilization = Number(((qVal / pVal) * 100).toFixed(2));
      }

      // Build FichaJSON using shared mapping functions
      const vhSums = buildVHSums(template.sections);
      const engineRows = buildEngineRows(template, vhSums);
      const ficha: FichaJSON = assembleFichaJSON(earlyHeader, calculatedAnnexes, engineRows);

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
          finalHeader.sale_price = evaluateHeaderExpressionShared(finalHeader.sale_price, finalHeader, calculatedAnnexes, newCalculatedValues, sharedParser);
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
      const health = calculateCostSheetHealth(template, newCalculatedValues, finalHeader);

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
  }, [template, calculatedAnnexes, hasHydrated]);

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
