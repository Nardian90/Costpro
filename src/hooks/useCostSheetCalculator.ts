
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';

// Enhanced types for v3 template
interface Header { [key: string]: any; }
interface Row {
  id: string;
  label: string;
  valorHistorico?: number;
  baseDeCalculoRef?: string | null;
  coeficienteFormula?: string | null;
  totalFormula?: string | null;
  formula?: string; // For summary rows
  children?: Row[];
  [key: string]: any;
}
interface Section { id: string; rows: Row[]; }
interface Column { key: string; formula?: string; }
interface Annex { id: string; title: string; columns: Column[]; data: any[]; }
interface Template { header: Header; sections: Section[]; annexes: Annex[]; }

// Calculated value structure will be richer
interface CalculatedRowValue {
  valorHistorico: number;
  baseDeCalculoRef: string | null;
  baseValue: number;
  coeficiente: number;
  total: number;
}

// Helper to safely evaluate a formula string
const evaluateExpression = (expression: string): number => {
  if (!expression) return 0;
  try {
    const result = new Function(`return ${expression}`)();
    return isNaN(result) || !isFinite(result) ? 0 : result;
  } catch (error) {
    console.error("Formula evaluation error:", expression, error);
    return 0;
  }
};

export const useCostSheetCalculator = (template: Template) => {
  // This state will now store a map of row IDs to their full calculated values
  const [calculatedValues, setCalculatedValues] = useState<{ [key: string]: CalculatedRowValue }>({});

  const calculateAnnexRow = (rowData: any, columns: Column[]): any => {
    return produce(rowData, draft => {
      for (const col of columns) {
        if (col.formula) {
          let expression = col.formula;
          const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
          for (const key of keys) {
            expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), rowData[key]);
          }
          expression = expression.replace(/header\('([^']+)'\)/g, (_, key) => String(template.header[key] || 0));
          draft[col.key] = evaluateExpression(expression);
        }
      }
    });
  };

  const calculatedAnnexes = useMemo(() => {
    return template.annexes.map(annex => ({
      ...annex,
      data: annex.data.map(row => calculateAnnexRow(row, annex.columns))
    }));
  }, [template.annexes, template.header]);

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    for (const annex of calculatedAnnexes) {
      const totalColumn = annex.columns.find(c => c.formula || c.key === 'amount' || c.key === 'total' || c.key === 'depreciation_cost');
      if (!totalColumn) continue;
      totals[annex.id] = annex.data.reduce((acc, row) => acc + (row[totalColumn.key] || 0), 0);
    }
    return totals;
  }, [calculatedAnnexes]);

  useEffect(() => {
    const newCalculatedValues: { [key: string]: CalculatedRowValue } = {};
    const allRowsById: { [key: string]: Row } = {};

    // First, flatten all rows into a map for easy lookup
    const flattenRows = (rows: Row[]) => {
        for (const row of rows) {
            allRowsById[row.id] = row;
            if (row.children) {
                flattenRows(row.children);
            }
        }
    };
    template.sections.forEach(section => flattenRows(section.rows));


    // Recursive function to calculate a single row and its dependencies
    const calculateRow = (row: Row): CalculatedRowValue => {
        // If already calculated, return stored value to prevent re-computation
        if (newCalculatedValues[row.id]) {
            return newCalculatedValues[row.id];
        }

        let calculatedResult: CalculatedRowValue = {
            valorHistorico: row.valorHistorico || 0,
            baseDeCalculoRef: row.baseDeCalculoRef || null,
            baseValue: 0,
            coeficiente: 0,
            total: 0,
        };

        // Handle children first to sum up totals
        if (row.children && row.children.length > 0) {
            calculatedResult.total = row.children
                .map(child => calculateRow(child).total)
                .reduce((sum, current) => sum + current, 0);
        }

        // Resolve Base Value
        if (calculatedResult.baseDeCalculoRef) {
            // Check if it's a reference to an annex
            if (annexTotals[calculatedResult.baseDeCalculoRef]) {
                calculatedResult.baseValue = annexTotals[calculatedResult.baseDeCalculoRef];
            }
            // Check if it's a reference to another row
            else if (allRowsById[calculatedResult.baseDeCalculoRef]) {
                 // Important: Ensure the referenced row is calculated first
                calculatedResult.baseValue = calculateRow(allRowsById[calculatedResult.baseDeCalculoRef]).total;
            }
        }

        // Calculate Coeficiente
        if (row.coeficienteFormula) {
            let expression = row.coeficienteFormula
                .replace(/valorHistorico/g, String(calculatedResult.valorHistorico))
                .replace(/baseValue/g, String(calculatedResult.baseValue));
            calculatedResult.coeficiente = evaluateExpression(expression);
        }

        // Calculate Total
        if (row.totalFormula) {
            let expression = row.totalFormula
                .replace(/coeficiente/g, String(calculatedResult.coeficiente))
                .replace(/baseValue/g, String(calculatedResult.baseValue))
                .replace(/valorHistorico/g, String(calculatedResult.valorHistorico));
            calculatedResult.total = evaluateExpression(expression);
        }

        // For summary rows with legacy 'formula'
        if (row.formula) {
            if (row.formula === '=sum(children)') {
                 // Total is already calculated from children sum
            } else {
                 let expression = row.formula;
                 expression = expression.replace(/ref\('([^']+)'\)/g, (_, id) => {
                     // Ensure dependency is calculated
                     return String(calculateRow(allRowsById[id]).total || 0);
                 });
                  expression = expression.replace(/sum\(([^)]+)\)/g, (_, args) => {
                        const sum = args.split(',').reduce((acc: number, val: string) => acc + parseFloat(val.trim() || '0'), 0);
                        return String(sum);
                    });
                 expression = expression.startsWith('=') ? expression.substring(1) : expression;
                 calculatedResult.total = evaluateExpression(expression);
            }
        }

        // Store the result
        newCalculatedValues[row.id] = calculatedResult;
        return calculatedResult;
    };

    // Trigger calculation for all top-level rows
    template.sections.forEach(section => {
        section.rows.forEach(calculateRow);
    });

    setCalculatedValues(newCalculatedValues);

  }, [template, annexTotals]); // Rerun when the template data or annex totals change

  return { calculatedValues, annexTotals, calculatedAnnexes, /* other exports */ };
};
