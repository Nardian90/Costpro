import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  CostSheetData,
  CostSheetHeader,
  CalculatedRowValue
} from '@/types/cost-sheet';
import { FichaJSON, AuditEntry, CalculationResult } from '@/lib/cost-engine/types';
import {
  calculateAnnexesPure,
  evaluateHeaderExpressionShared,
  buildVHSums,
  buildEngineRows,
  assembleFichaJSON,
  createSharedParser
} from '@/lib/cost-engine/shared-mapping';

/**
 * Hook logic for cost sheet calculations.
 */
export function useCostSheetCalculator(template: CostSheetData) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);

  const sharedParser = useRef(createSharedParser()).current;

  const calculate = useCallback(async (data: CostSheetData) => {
    if (!data) return;
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

  const calculatedValues = useMemo(() => {
    if (!calculationResult) return {} as Record<string, CalculatedRowValue>;
    const values: Record<string, CalculatedRowValue> = {};
    calculationResult.rows.forEach(r => {
      values[r.id] = {
        total: r.total,
        valorHistorico: r.valorHistorico || 0,
        calculatedVH: r.calculatedVH,
        baseTotal: r.baseTotal || 0,
        baseValorHistorico: r.baseHist || 0,
        coeficiente: r.coeficiente || 0,
        baseDeCalculoRef: r.baseCalculo?.type === 'FILA' ? r.baseCalculo.classification : null,
        fuente: r.fuente,
        metadata: r.metadata,
        audits: r.audit,
        validationErrors: calculationResult.deepValidationErrors?.filter(e => e.rowId === r.id) || []
      } as any;
    });
    return values;
  }, [calculationResult]);

  const validations = useMemo(() => {
    if (!calculationResult) return { errors: [], warnings: [], healthScore: 100 };
    return {
        errors: calculationResult.validationErrors?.filter(v => v.startsWith('CRITICAL')) || [],
        warnings: calculationResult.validationErrors?.filter(v => v.startsWith('WARNING')) || [],
        healthScore: calculationResult.validationErrors?.length === 0 ? 100 : 70
    };
  }, [calculationResult]);

  return {
    isCalculating,
    calculationResult,
    calculatedValues,
    calculatedHeader: calculationResult?.metadata?.header || template?.header,
    calculatedAnnexes: calculationResult?.anexos || template?.annexes,
    audits: calculationResult?.audits || [],
    validations,
    isBlocked: calculationResult?.validationErrors?.some(v => v.startsWith('CRITICAL')) || false,
    deepValidationErrors: calculationResult?.deepValidationErrors || [],
    recalculate: () => calculate(template)
  };
}
