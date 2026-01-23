
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

const blankSheet = CostSheetDataFactory.create();

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
      reset: () => set({ data: CostSheetDataFactory.create() }), // Use fresh blank sheet on reset
    }),
    {
      name: 'cost-sheet-storage', // Name for the localStorage item
    }
  )
);
