
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import {
  CostSheetDataContract,
  CostSheetRowContract,
  CostSheetColumnContract
} from '@/contracts/cost-sheet';
import { calculateFicha } from '@/lib/cost-engine';
import { mapContractToFicha } from '@/lib/cost-engine/mapper';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { Parser } from 'expr-eval';

export const useCostSheetCalculator = (template: CostSheetDataContract) => {
  const [calculatedValues, setCalculatedValues] = useState<{ [key: string]: CalculatedRowValue }>({});
  const [error, setError] = useState<Error | null>(null);

  const parser = new Parser();

  // 1. Calculate Annexes (Legacy logic kept for internal annex row formulas)
  const calculateAnnexRow = (rowData: any, columns: CostSheetColumnContract[]): any => {
    return produce(rowData, (draft: any) => {
      for (const col of columns) {
        if (col.formula) {
          try {
            const expr = parser.parse(col.formula);
            // Prepare context with row data
            const context: any = { ...rowData };
            // Header replacements if needed
            Object.keys(template.header).forEach(key => {
                context[`header_${key}`] = template.header[key];
            });
            draft[col.key] = expr.evaluate(context);
          } catch (e) {
            draft[col.key] = 0;
          }
        }
      }
    });
  };

  const calculatedAnnexes = useMemo(() => {
    if (!template || !template.annexes) return [];
    return template.annexes.map(annex => ({
      ...annex,
      data: (annex.data || []).map(row => calculateAnnexRow(row, annex.columns))
    }));
  }, [template]);

  // 2. Core Engine Integration for Main Table
  useEffect(() => {
    try {
      if (!template || !template.sections) return;

      // Map to Engine format
      const ficha = mapContractToFicha(template);

      // Execute Engine
      const result = calculateFicha(ficha, { actor: 'hook' });

      // Map back to calculatedValues state
      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      result.rows.forEach(r => {
        newCalculatedValues[r.id] = {
            total: r.total || 0,
            valorHistorico: r.valorHistorico || 0,
            baseDeCalculoRef: r.baseCalculo?.type === 'ANEXO' ? r.baseCalculo.anexoId : (r.baseCalculo?.classification || null),
            baseTotal: 0, // Not explicitly used by UI anymore but kept for type compatibility
            coeficiente: r.coeficiente || 0,
            audit: r.audit,
            fuente: r.fuente
        };
      });

      setCalculatedValues(newCalculatedValues);
      setError(null);
    } catch (e) {
      setError(e as Error);
      console.error("Engine calculation error:", e);
    }
  }, [template, calculatedAnnexes]);

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    for (const annex of calculatedAnnexes) {
      const totalColumn = annex.columns.find(c => c.formula || ['amount', 'total', 'depreciation_cost'].includes(c.key));
      if (!totalColumn) continue;
      totals[annex.id] = annex.data.reduce((acc, row) => acc + (row[totalColumn.key] || 0), 0);
    }
    return totals;
  }, [calculatedAnnexes]);

  return { calculatedValues, annexTotals, calculatedAnnexes, error };
};
