
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';
import {
  CostSheetData,
  CostSheetRow,
  CostSheetColumn,
  CalculatedRowValue
} from '@/types/cost-sheet';

// Helper to safely evaluate a formula string
const evaluateExpression = (expression: string): number => {
  if (!expression) return 0;

  // Basic sanitization: only allow math characters and numbers
  // This is a simple version for the demo.
  try {
    // If it's just a number string, return it
    if (/^-?\d*\.?\d+$/.test(expression.trim())) {
      return parseFloat(expression.trim());
    }

    // Use Function constructor as a safer alternative to eval
    const result = new Function(`return ${expression}`)();
    return isNaN(result) || !isFinite(result) ? 0 : result;
  } catch (error) {
    console.error("Formula evaluation error:", expression, error);
    return 0;
  }
};

export const useCostSheetCalculator = (template: CostSheetData) => {
  const [calculatedValues, setCalculatedValues] = useState<{ [key: string]: CalculatedRowValue }>({});
  const [error, setError] = useState<Error | null>(null);

  const calculateAnnexRow = (rowData: any, columns: CostSheetColumn[]): any => {
    return produce(rowData, (draft: any) => {
      for (const col of columns) {
        if (col.formula) {
          let expression = col.formula;
          // Sort keys by length descending to avoid partial replacements (e.g., 'price' vs 'price_total')
          const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
          for (const key of keys) {
            const val = rowData[key];
            // Use word boundaries for replacement
            expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val || 0));
          }
          // Header replacements
          expression = expression.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(template.header[key] || 0));
          draft[col.key] = evaluateExpression(expression);
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
  }, [template, template.header]);

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    for (const annex of calculatedAnnexes) {
      const totalColumn = annex.columns.find(c => c.formula || ['amount', 'total', 'depreciation_cost'].includes(c.key));
      if (!totalColumn) continue;
      totals[annex.id] = annex.data.reduce((acc, row) => acc + (row[totalColumn.key] || 0), 0);
    }
    return totals;
  }, [calculatedAnnexes]);

  useEffect(() => {
    try {
      if (!template || !template.header || !template.sections) return;

      const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
      const allRowsById: { [key: string]: CostSheetRow } = {};

    const flattenRows = (rows: CostSheetRow[]) => {
      for (const row of rows) {
        allRowsById[row.id] = row;
        if (row.children) {
          flattenRows(row.children);
        }
      }
    };
    template.sections.forEach(section => flattenRows(section.rows || []));

    const calculateRow = (row: CostSheetRow): CalculatedRowValue => {
      if (newCalculatedValues[row.id]) {
        return newCalculatedValues[row.id];
      }

      // Initialize result
      let calculatedResult: CalculatedRowValue = {
        valorHistorico: row.valorHistorico || 0,
        baseDeCalculoRef: row.baseDeCalculoRef || null,
        baseTotal: 0,
        baseValorHistorico: 0,
        coeficiente: 0,
        total: 0,
      };

      // 1. Calculate children first if they exist
      if (row.children && row.children.length > 0) {
        const childrenCalculations = row.children.map(child => calculateRow(child));
        calculatedResult.total = childrenCalculations.reduce((sum, c) => sum + c.total, 0);
        calculatedResult.valorHistorico = childrenCalculations.reduce((sum, c) => sum + c.valorHistorico, 0);
      }

      // 2. Determine the base of calculation
      if (calculatedResult.baseDeCalculoRef) {
        if (annexTotals[calculatedResult.baseDeCalculoRef] !== undefined) {
          calculatedResult.baseTotal = annexTotals[calculatedResult.baseDeCalculoRef];
          calculatedResult.baseValorHistorico = annexTotals[calculatedResult.baseDeCalculoRef];
        } else if (allRowsById[calculatedResult.baseDeCalculoRef]) {
          const baseRowCalculated = calculateRow(allRowsById[calculatedResult.baseDeCalculoRef]);
          calculatedResult.baseTotal = baseRowCalculated.total;
          calculatedResult.baseValorHistorico = baseRowCalculated.valorHistorico;
        }
      }

      // 3. Percentage-based logic (Resultado section)
      if (row.is_percent && row.base_ref) {
        const baseRow = allRowsById[row.base_ref];
        if (baseRow) {
          const baseCalc = calculateRow(baseRow);
          calculatedResult.total = baseCalc.total * (row.value || 0);
          calculatedResult.valorHistorico = baseCalc.valorHistorico * (row.value || 0);
        } else {
          calculatedResult.total = 0;
          calculatedResult.valorHistorico = row.value || 0;
        }
      } else {
        // 4. Main Calculation Methods
        switch (row.calculationMethod) {
          case 'Prorrateo':
            const baseVH = calculatedResult.baseValorHistorico;
            const baseT = calculatedResult.baseTotal;
            const rowVH = calculatedResult.valorHistorico;
            calculatedResult.coeficiente = baseVH > 0 ? rowVH / baseVH : 0;
            calculatedResult.total = calculatedResult.coeficiente * baseT;
            break;

          case 'ValorFijo':
          default:
            if (row.totalFormula) {
              let expression = (row.totalFormula || '')
                .replace(/baseValue/g, String(calculatedResult.baseTotal))
                .replace(/valorHistorico/g, String(calculatedResult.valorHistorico));
              expression = expression.replace(/header\(['"]([^'"]+)['"]\)/g, (_, key) => String(template.header[key] || 0));
              calculatedResult.total = evaluateExpression(expression);
            } else if (!row.formula && (!row.children || row.children.length === 0)) {
              calculatedResult.total = calculatedResult.valorHistorico;
            }
            break;
        }
      }

      // 5. Final formula override (for summary and reference rows)
      if (row.formula) {
        if ((row.formula || '').trim() === '=sum(children)') {
          // Handled by step 1
        } else {
          // Helper to resolve formula with a specific field (total or valorHistorico)
          const resolveFormula = (field: 'total' | 'valorHistorico') => {
            let expression = (row.formula || '').replace(/ref\(\s*['"]?([^'"]+)['"]?\s*\)/g, (_, id) => {
              const r = allRowsById[id.trim()];
              if (!r) return '0';
              const calc = calculateRow(r);
              return String(calc[field] || 0);
            });

            expression = expression.replace(/header\(\s*['"]?([^'"]+)['"]?\s*\)/g, (_, key) =>
              String(template.header[key.trim()] || 0)
            );

            // Simple sum replacement (non-nested)
            expression = expression.replace(/sum\s*\(([^)]+)\)/g, (_, args) => {
              const values = args.split(',').map((val: string) => {
                const parsed = parseFloat(val.trim());
                return isNaN(parsed) ? 0 : parsed;
              });
              return String(values.reduce((a: number, b: number) => a + b, 0));
            });

            // pct(value, percentage) -> (value * percentage / 100)
            expression = expression.replace(/pct\s*\(([^,]+),\s*([^)]+)\)/g, (_, val, p) => {
                const value = parseFloat(val.trim()) || 0;
                const percent = parseFloat(p.trim()) || 0;
                return String(value * (percent / 100));
            });

            // round2(value)
            expression = expression.replace(/round2\s*\(([^)]+)\)/g, (_, val) => {
                const value = parseFloat(val.trim()) || 0;
                return String(Math.round(value * 100) / 100);
            });

            if (expression.trim().startsWith('=')) {
              expression = expression.trim().substring(1);
            }
            return evaluateExpression(expression);
          };

          calculatedResult.total = resolveFormula('total');
          calculatedResult.valorHistorico = resolveFormula('valorHistorico');
        }
      }

      newCalculatedValues[row.id] = calculatedResult;
      return calculatedResult;
    };

    // Calculate all rows
    template.sections.forEach(section => {
      (section.rows || []).forEach(calculateRow);
    });

    setCalculatedValues(newCalculatedValues);
    setError(null);
    } catch (e) {
      setError(e as Error);
      console.error("Error calculating cost sheet:", e);
    }
  }, [template, annexTotals]);

  return { calculatedValues, annexTotals, calculatedAnnexes, error };
};
