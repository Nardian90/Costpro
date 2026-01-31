
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
            if (row.hasOwnProperty('valorHistorico')) row.valorHistorico = 0;
            if (row.hasOwnProperty('value')) row.value = row.is_percent ? row.value : 0;
            if (row.children) clearRows(row.children);
        });
    };

    if (cleared.sections) {
        cleared.sections.forEach((s: any) => clearRows(s.rows));
    }

    // Clear annexes
    if (cleared.annexes) {
        cleared.annexes.forEach((a: any) => {
            a.data = []; // Start with no data in annexes or keep one empty row?
            // User said "aunque esten en cero todos los valores pero ya sea una plantilla completa lista paraa ingresar valores"
            // Usually annexes are dynamic, but maybe we should keep the first row if it was there?
            // Actually, annexes in the template have one demo row. Let's clear its values.
            // But usually users add rows to annexes.
        });
    }

    return cleared;
};

const blankSheet = clearTemplate(originalTemplate);

interface CostSheetState {
  data: CostSheetDataContract;
  updateValue: (path: (string | number)[], value: string | number) => void;
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
            if (annex && annex.data.length > 0) {
              const firstRow = annex.data[0];
              const newRow = { ...firstRow };
              Object.keys(newRow).forEach((key) => {
                const column = annex.columns.find((c) => c.key === key);
                if (column && !column.formula) {
                  newRow[key] = typeof newRow[key] === 'number' ? 0 : '';
                }
              });
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
    }
  )
);
