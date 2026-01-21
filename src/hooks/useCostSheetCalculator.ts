
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';

// Enhanced types for v4 template
interface Header { [key: string]: any; }
interface Row {
  id: string;
  label: string;
  valorHistorico?: number;
  baseDeCalculoRef?: string | null;
  calculationMethod?: 'Prorrateo' | 'ValorFijo';
  totalFormula?: string | null;
  formula?: string; // For summary rows
  children?: Row[];
  [key: string]: any;
}
interface Section { id: string; rows: Row[]; }
interface Column { key: string; formula?: string; }
interface Annex { id: string; title: string; columns: Column[]; data: any[]; }
interface Template { header: Header; sections: Section[]; annexes: Annex[]; }

// Calculated value structure is now richer
interface CalculatedRowValue {
  valorHistorico: number;
  baseDeCalculoRef: string | null;
  baseTotal: number;
  baseValorHistorico: number;
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

    const flattenRows = (rows: Row[]) => {
        for (const row of rows) {
            allRowsById[row.id] = row;
            if (row.children) {
                flattenRows(row.children);
            }
        }
    };
    template.sections.forEach(section => flattenRows(section.rows));

    const calculateRow = (row: Row): CalculatedRowValue => {
        if (newCalculatedValues[row.id]) {
            return newCalculatedValues[row.id];
        }

        let calculatedResult: CalculatedRowValue = {
            valorHistorico: row.valorHistorico || 0,
            baseDeCalculoRef: row.baseDeCalculoRef || null,
            baseTotal: 0,
            baseValorHistorico: 0,
            coeficiente: 0,
            total: 0,
        };

        if (row.children && row.children.length > 0) {
            calculatedResult.total = row.children
                .map(child => calculateRow(child).total)
                .reduce((sum, current) => sum + current, 0);
        }

        if (calculatedResult.baseDeCalculoRef) {
            if (annexTotals[calculatedResult.baseDeCalculoRef]) {
                calculatedResult.baseTotal = annexTotals[calculatedResult.baseDeCalculoRef];
                calculatedResult.baseValorHistorico = annexTotals[calculatedResult.baseDeCalculoRef]; // For annexes, total and historical value are the same
            }
            else if (allRowsById[calculatedResult.baseDeCalculoRef]) {
                const baseRowCalculated = calculateRow(allRowsById[calculatedResult.baseDeCalculoRef]);
                calculatedResult.baseTotal = baseRowCalculated.total;
                calculatedResult.baseValorHistorico = baseRowCalculated.valorHistorico;
            }
        }

        // Main Calculation Logic
        if (row.is_percent && row.base_ref) {
            const baseRow = allRowsById[row.base_ref];
            const baseValue = baseRow ? calculateRow(baseRow).total : 0;
            calculatedResult.total = baseValue * (row.value || 0);
            calculatedResult.valorHistorico = row.value || 0; // In this context, value is the "historical" percentage
        } else {
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
                        let expression = row.totalFormula
                            .replace(/baseValue/g, String(calculatedResult.baseTotal))
                            .replace(/valorHistorico/g, String(calculatedResult.valorHistorico));
                        calculatedResult.total = evaluateExpression(expression);
                    } else if (!row.formula && !row.children) {
                        // If no formula and no children, and not fixed formula, total is historical value
                        calculatedResult.total = calculatedResult.valorHistorico;
                    }
                    break;
            }
        }

        if (row.formula) {
            if (row.formula === '=sum(children)') {
                 // Already calculated
            } else {
                 let expression = row.formula.replace(/ref\('([^']+)'\)/g, (_, id) => {
                    const r = allRowsById[id];
                    if (!r) return '0';
                    const calc = calculateRow(r);
                    return String(r.is_percent ? (r.value ?? r.valorHistorico ?? 0) : calc.total);
                 });
                 expression = expression.replace(/sum\(([^)]+)\)/g, (_, args) => String(args.split(',').reduce((acc: number, val: string) => acc + parseFloat(val.trim() || '0'), 0)));
                 expression = expression.startsWith('=') ? expression.substring(1) : expression;
                 calculatedResult.total = evaluateExpression(expression);
            }
        }

        newCalculatedValues[row.id] = calculatedResult;
        return calculatedResult;
    };

    template.sections.forEach(section => {
        section.rows.forEach(calculateRow);
    });

    setCalculatedValues(newCalculatedValues);

  }, [template, annexTotals]);

  return { calculatedValues, annexTotals, calculatedAnnexes };
};
