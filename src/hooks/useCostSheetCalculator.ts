// src/hooks/useCostSheetCalculator.ts
import { useState, useEffect, useMemo } from 'react';
import { produce } from 'immer';

// Define the types based on the new v2 template
interface Header { [key: string]: any; }
interface Row { id: string; formula?: string; value?: number; [key: string]: any; }
interface Section { id: string; rows: Row[]; }
interface Column { key: string; formula?: string; }
interface Annex { id: string; columns: Column[]; data: any[]; }
interface Template { header: Header; sections: Section[]; annexes: Annex[]; }

// A helper to safely evaluate a formula string
const evaluateExpression = (expression: string): number => {
    try {
        // Using Function constructor for safer evaluation than eval()
        // This is acceptable here because the formulas are defined internally in the trusted template, not from user input.
        const result = new Function(`return ${expression}`)();
        return isNaN(result) ? 0 : result;
    } catch (error) {
        console.error("Formula evaluation error:", error);
        return 0;
    }
};

export const useCostSheetCalculator = (template: Template) => {
  const [calculatedValues, setCalculatedValues] = useState<{ [key: string]: number }>({});

  const calculateAnnexRow = (rowData: any, columns: Column[]): any => {
    return produce(rowData, draft => {
        for (const col of columns) {
            if (col.formula) {
                let expression = col.formula;
                // Replace placeholders like 'consumption_norm * price' with actual values
                for (const key in rowData) {
                    expression = expression.replace(new RegExp(key, 'g'), rowData[key]);
                }
                draft[col.key] = evaluateExpression(expression);
            }
        }
    });
  };

  const annexTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    for (const annex of template.annexes) {
      const totalColumn = annex.columns.find(c => c.formula || c.key === 'amount' || c.key === 'total');
      if (!totalColumn) continue;

      totals[annex.id] = annex.data.reduce((acc, row) => {
        if (totalColumn.formula) {
            const calculatedRow = calculateAnnexRow(row, annex.columns);
            return acc + (calculatedRow[totalColumn.key] || 0);
        }
        return acc + (row[totalColumn.key] || 0); // For simple value columns like in Annex IV
      }, 0);
    }
    return totals;
  }, [template.annexes]);

  useEffect(() => {
    const newCalculatedValues: { [key: string]: number } = {};

    // Initial pass for rows with static values
    for (const section of template.sections) {
        for (const row of section.rows) {
            if (typeof row.value !== 'undefined') {
                newCalculatedValues[row.id] = row.value;
            }
        }
    }

    // Iteratively solve formulas (5 passes should be enough for dependencies)
    for (let i = 0; i < 5; i++) {
        for (const section of template.sections) {
            for (const row of section.rows) {
                if (row.formula) {
                    let expression = row.formula;

                    // Replace ref('...'), annex('...'), header('...')
                    expression = expression.replace(/ref\('([^']+)'\)/g, (_, id) => String(newCalculatedValues[id] || 0));
                    expression = expression.replace(/annex\('([^']+)'\)/g, (_, id) => String(annexTotals[id] || 0));
                    expression = expression.replace(/header\('([^']+)'\)/g, (_, key) => String(template.header[key] || 0));

                    // Handle sum(...)
                    expression = expression.replace(/sum\(([^)]+)\)/g, (_, args) => {
                        const sum = args.split(',').reduce((acc: number, val: string) => acc + parseFloat(val.trim() || '0'), 0);
                        return String(sum);
                    });

                    // Remove '=' sign for evaluation
                    expression = expression.startsWith('=') ? expression.substring(1) : expression;

                    newCalculatedValues[row.id] = evaluateExpression(expression);
                }
            }
        }
    }

    setCalculatedValues(newCalculatedValues);

  }, [template, annexTotals]);

  return { calculatedValues, annexTotals };
};
