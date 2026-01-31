
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import originalTemplate from '@/lib/data/costpro-full.json';
import { produce } from 'immer';
import {
  CostSheetDataContract,
  CostSheetDataFactory,
  CostSheetAnnexContract,
} from '@/contracts';
import { costSheetDataSchema } from '@/validation/schemas';
import { toast } from 'sonner';

const clearTemplate = (template: any) => {
    const cleared = JSON.parse(JSON.stringify(template));

    // Clear header
    if (cleared.header) {
        cleared.header.code = "";
        cleared.header.name = "";
        cleared.header.quantity = 0;
    }

    // Clear sections and rows
    const clearRows = (rows: any[]) => {
        rows.forEach(row => {
            // Clear primary numeric values
            if (row.hasOwnProperty('valorHistorico')) row.valorHistorico = 0;
            if (row.hasOwnProperty('value')) row.value = 0;

            // Clear formulas if they are actually fixed numbers
            if (row.formula && !row.formula.startsWith('=')) {
                row.formula = "0";
            }
            if (row.totalFormula && !row.totalFormula.startsWith('=')) {
                row.totalFormula = "0";
            }

            // Ensure calculation method reflects manual input if we cleared a fixed number
            if (row.calculationMethod === 'ValorFijo' || (!row.formula?.startsWith('=') && !row.totalFormula?.startsWith('='))) {
                // If it's not a real formula, ensure it's treated as a clean slate
            }

            if (row.children) clearRows(row.children);
        });
    };

    if (cleared.sections) {
        cleared.sections.forEach((s: any) => clearRows(s.rows));
    }

    // Clear annexes - Total reset to empty data as requested
    if (cleared.annexes) {
        cleared.annexes.forEach((a: any) => {
            a.data = [];
        });
    }

    return cleared;
};

const blankSheet = clearTemplate(originalTemplate);

interface CostSheetState {
  data: CostSheetDataContract;
  updateValue: (path: (string | number)[], value: string | number | boolean) => void;
  addRow: (annexId: string) => void;
  removeRow: (annexId: string, rowIndex: number) => void;
  setSheet: (data: CostSheetDataContract) => void;
  loadExample: () => void;
  reset: () => void;
}

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: blankSheet,
      updateValue: (path, value) =>
        set(
          produce((draft: CostSheetState) => {
            let current: any = draft.data;
            for (let i = 0; i < path.length - 1; i++) {
              current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
          })
        ),
      addRow: (annexId) =>
        set(
          produce((draft: CostSheetState) => {
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex) {
              const newRow: any = {};
              if (annex.data.length > 0) {
                // Clone from first row structure
                const firstRow = annex.data[0];
                Object.keys(firstRow).forEach((key) => {
                  const column = annex.columns.find((c) => c.key === key);
                  if (column && !column.formula) {
                    newRow[key] = typeof firstRow[key] === 'number' ? 0 : '';
                  } else if (!column) {
                    newRow[key] = typeof firstRow[key] === 'number' ? 0 : '';
                  } else {
                    newRow[key] = 0; // Formula column
                  }
                });
              } else {
                // Initialize from columns
                annex.columns.forEach((col) => {
                  // Heuristic for default values based on common key names
                  const isNumeric = col.key === 'no' ||
                                    col.key.includes('norm') ||
                                    col.key.includes('price') ||
                                    col.key.includes('value') ||
                                    col.key.includes('amount') ||
                                    col.key.includes('count') ||
                                    col.key.includes('rate') ||
                                    col.key.includes('total') ||
                                    col.key.includes('cost');
                  newRow[col.key] = isNumeric ? 0 : '';
                });
              }
              annex.data.push(newRow);
            }
          })
        ),
      removeRow: (annexId, rowIndex) =>
        set(
          produce((draft: CostSheetState) => {
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex && annex.data[rowIndex]) {
              annex.data.splice(rowIndex, 1);
            }
          })
        ),
      setSheet: (data) => {
        const result = costSheetDataSchema.safeParse(data);
        if (result.success) {
          set({ data: result.data as CostSheetDataContract });
        } else {
          console.error(
            '[Zod Validation Error] cost sheet data:',
            result.error.format()
          );
          toast.error('Error de validación en la ficha de costo');
        }
      },
      loadExample: () => {
        const example = JSON.parse(JSON.stringify(originalTemplate));
        const result = costSheetDataSchema.safeParse(example);
        if (result.success) {
          set({ data: result.data as CostSheetDataContract });
        } else {
          console.error(
            '[Zod Validation Error] example data:',
            result.error.format()
          );
          set({ data: example as CostSheetDataContract }); // Fallback
        }
      },
      reset: () => set({ data: clearTemplate(originalTemplate) }), // Use fresh blank sheet on reset
    }),
    {
      name: 'cost-sheet-storage', // Name for the localStorage item
      version: 2, // Versioning to avoid issues with older structures
    }
  )
);
