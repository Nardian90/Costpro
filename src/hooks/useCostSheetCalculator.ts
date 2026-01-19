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
      // Sort columns: formula-based columns should probably come after data columns
      // but if a formula depends on another formula, we might need multiple passes or a specific order.
      // For now, assume formulas only depend on static data keys.
      for (const col of columns) {
        if (col.formula) {
          let expression = col.formula;
          // Replace placeholders with actual values
          // Using a more robust replacement to avoid partial matches (e.g., 'price' matching 'total_price')
          // We'll replace longer keys first.
          const keys = Object.keys(rowData).sort((a, b) => b.length - a.length);
          for (const key of keys) {
            // Regex to match whole word only
            expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), rowData[key]);
          }

          // Also allow header and other references in annex formulas if needed
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
      const totalColumn = annex.columns.find(c => c.formula || c.key === 'amount' || c.key === 'total');
      if (!totalColumn) continue;

      totals[annex.id] = annex.data.reduce((acc, row) => {
        return acc + (row[totalColumn.key] || 0);
      }, 0);
    }
    return totals;
  }, [calculatedAnnexes]);

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

  return { calculatedValues, annexTotals, calculatedAnnexes, calculateAnnexRow };
};
