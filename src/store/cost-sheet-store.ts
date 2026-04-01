
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
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
        // Default formulas for automated fields "a consideración del usuario"
        cleared.header.code = "=GET_ANEXO_FILA_DATO(\"I\", 1, \"code\")";
        cleared.header.name = "=GET_ANEXO_FILA_DATO(\"I\", 1, \"description\")";
        cleared.header.quantity = "=GET_ANEXO_FILA_DATO(\"I\", 1, \"consumption_norm\")";
        cleared.header.product_code = "=GET_ANEXO_FILA_DATO(\"I\", 1, \"code\")";
        cleared.header.unit = "=GET_ANEXO_FILA_DATO(\"I\", 1, \"um\")";
        cleared.header.sale_price = "=GET_FILA_DATO(\"16.1\", \"total\")";

        cleared.header.company = "";
        cleared.header.organism = "";
        cleared.header.union = "";
        cleared.header.destination = "";
        cleared.header.production_level = 0;
        cleared.header.capacity_utilization = 0;
        cleared.header.client = "";
        cleared.header.category = "";
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

interface CostSheetState {
  data: CostSheetDataContract;
  updateValue: (path: (string | number)[], value: any) => void;
  updateValues: (updates: { path: (string | number)[], value: any }[]) => void;
  addRow: (annexId: string) => void;
  removeRow: (annexId: string, rowIndex: number) => void;
  reorderRow: (annexId: string, rowIndex: number, direction: 'up' | 'down') => void;
  addMainSection: () => void;
  removeMainSection: (index: number) => void;
  addMainRow: (parentPath: (string | number)[]) => void;
  removeMainRow: (path: (string | number)[]) => void;
  reorderMainRow: (path: (string | number)[], direction: 'up' | 'down') => void;
  setSheet: (data: CostSheetDataContract) => void;
  loadExample: () => void;
  reset: () => void;
  updateUtilityFormula: (percentage: number) => void;
  updateAnnexAdjustment: (annexId: string, coefficient: number, adjustmentColumn: string, isAdjustmentActive?: boolean) => void;
}

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: reinicioTemplate,
      updateValue: (path, value) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            let current: any = draft.data;
            for (let i = 0; i < path.length - 1; i++) {
              if (current[path[i]] === undefined) return;
              current = current[path[i]];
            }
            // Only update if value actually changed to prevent redundant renders
            if (current[path[path.length - 1]] !== value) {
              current[path[path.length - 1]] = value;
            }
          })
        ),
      reorderRow: (annexId, rowIndex, direction) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex && annex.data) {
              const newIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
              if (newIndex >= 0 && newIndex < annex.data.length) {
                const temp = annex.data[rowIndex];
                annex.data[rowIndex] = annex.data[newIndex];
                annex.data[newIndex] = temp;
              }
            }
          })
        ),
      reorderMainRow: (path, direction) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1] as number;
            let current: any = draft.data;
            for (const p of parentPath) {
              if (current[p] === undefined) return;
              current = current[p];
            }
            if (Array.isArray(current)) {
              const newIndex = direction === 'up' ? index - 1 : index + 1;
              if (newIndex >= 0 && newIndex < current.length) {
                const temp = current[index];
                current[index] = current[newIndex];
                current[newIndex] = temp;
              }
            }
          })
        ),
      updateValues: (updates) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            updates.forEach(({ path, value }) => {
                let current: any = draft.data;
                for (let i = 0; i < path.length - 1; i++) {
                  if (current[path[i]] === undefined) return;
                  current = current[path[i]];
                }
                if (current[path[path.length - 1]] !== value) {
                    current[path[path.length - 1]] = value;
                }
            });
          })
        ),
      addMainSection: () =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.sections) return;
            const nextId = (draft.data.sections.length + 1).toString();
            draft.data.sections.push({
              id: nextId,
              label: `Nueva Sección ${nextId}`,
              rows: []
            });
          })
        ),
      removeMainSection: (index) =>
        set(
          produce((draft: CostSheetState) => {
            if (draft.data?.sections?.[index]) {
              draft.data.sections.splice(index, 1);
            }
          })
        ),
      addMainRow: (parentPath) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            let current: any = draft.data;
            for (const p of parentPath) {
              if (current[p] === undefined) return;
              current = current[p];
            }
            // current should be an array (rows or children)
            if (Array.isArray(current)) {
                const nextId = (current.length + 1).toString();
                // We need to generate a somewhat unique ID for the engine
                // Heuristic: use a timestamp or a combination
                const uniqueId = `new-${Date.now()}-${nextId}`;

                current.push({
                    id: uniqueId,
                    label: "Nuevo Concepto",
                    valorHistorico: 0,
                    calculationMethod: 'ValorFijo',
                    children: []
                });
            }
          })
        ),
      removeMainRow: (path) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1] as number;
            let current: any = draft.data;
            for (const p of parentPath) {
              if (current[p] === undefined) return;
              current = current[p];
            }
            if (Array.isArray(current) && current[index]) {
                current.splice(index, 1);
            }
          })
        ),
      addRow: (annexId) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
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
            if (!draft.data?.annexes) return;
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
        const example = JSON.parse(JSON.stringify(exampleTemplate));
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
      updateAnnexAdjustment: (annexId, coefficient, adjustmentColumn, isAdjustmentActive) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex) {
              if (isAdjustmentActive !== undefined) annex.isAdjustmentActive = isAdjustmentActive;
              annex.coefficient = coefficient;
              annex.adjustmentColumn = adjustmentColumn;
            }
          })
        ),
      updateUtilityFormula: (percentage) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            // Search for row with ID '13' in all sections
            for (const section of draft.data.sections) {
              const row = section.rows.find(r => r.id === '13');
              if (row) {
                row.formula = `ref('12') * ${(percentage / 100).toFixed(4)}`;
                row.calculationMethod = 'FORMULA';
                break;
              }
            }
          })
        ),
      reset: () => {
        const resetData = JSON.parse(JSON.stringify(reinicioTemplate));
        set({ data: resetData as CostSheetDataContract });
      },
    }),
    {
      name: 'cost-sheet-storage', // Name for the localStorage item
      version: 2, // Versioning to avoid issues with older structures
    }
  )
);
