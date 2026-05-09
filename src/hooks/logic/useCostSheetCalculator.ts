import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  CostSheetData,
  CostSheetHeader,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { FichaJSON, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';
import { calculateCostSheetHealth, ValidationResult } from '@/lib/cost-engine/validations';
import {
  calculateAnnexesPure,
  evaluateHeaderExpressionShared,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
} from '@/lib/cost-engine/shared-mapping';
import { createSharedParser } from '@/lib/cost-engine/formula-utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';

/**
 * Hook logic for cost sheet calculations.
 */
export function useCostSheetCalculator(template: CostSheetData) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);

  const sharedParser = useRef(createSharedParser()).current;

  const calculate = useCallback(async (data: CostSheetData) => {
    setIsCalculating(true);
    try {
      const currentAnnexes = calculateAnnexesPure(data);
      const earlyHeader = { ...data.header };

      ['name', 'code', 'product_code', 'unit', 'quantity'].forEach(field => {
          const val = (earlyHeader as any)[field];
          if (typeof val === 'string' && val.startsWith('=')) {
              (earlyHeader as any)[field] = evaluateHeaderExpressionShared(val, earlyHeader, currentAnnexes, {}, sharedParser);
          }
      });

      const vhSums = buildVHSums(data.sections);
      const engineRows = buildEngineRows(data, vhSums);
      const ficha = assembleFichaJSON(earlyHeader, currentAnnexes, engineRows);

      const { calculateFicha } = await import('@/lib/cost-engine/index');
      const result = calculateFicha(ficha);

      setCalculationResult(result);
    } catch (e) {
      console.error("Calculation Error:", e);
    } finally {
      setIsCalculating(false);
    }
  }, [sharedParser]);

  useEffect(() => {
    if (template) calculate(template);
  }, [template, calculate]);

  return {
    isCalculating,
    calculationResult,
    recalculate: () => calculate(template)
  };
}
