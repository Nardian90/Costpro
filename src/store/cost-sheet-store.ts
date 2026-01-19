
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import originalTemplate from '@/lib/data/costpro-full.json';
import { produce } from 'immer';

// Deep clone the original template to avoid modifying it directly
const blankSheet = JSON.parse(JSON.stringify(originalTemplate));

// Clear out all user-editable values for the blank sheet
blankSheet.header.code = '';
blankSheet.header.name = '';
blankSheet.header.date = new Date().toISOString().split('T')[0];
blankSheet.header.quantity = 1.0;
blankSheet.header.currency = 'CUP';
blankSheet.header.category = '';
blankSheet.header.type = '';
blankSheet.header.unit = '';

blankSheet.sections.forEach((section: any) => {
  section.rows.forEach((row: any) => {
    // Only clear rows that have a 'value' property and are not calculated fields
    if (row.value !== undefined && !row.formula) {
      row.value = 0;
    }
  });
});

blankSheet.annexes.forEach((annex: any) => {
  // Replace existing data with a single blank row
  if (annex.data.length > 0) {
    const blankRow = { ...annex.data[0] };
    Object.keys(blankRow).forEach(key => {
      const column = annex.columns.find((c: any) => c.key === key);
      if (column && !column.formula) {
        // @ts-ignore
        blankRow[key] = typeof blankRow[key] === 'number' ? 0 : '';
      }
    });
    annex.data = [blankRow];
  } else {
    annex.data = [];
  }
});

blankSheet.signature.prepared_by = '';
blankSheet.signature.approved_by = '';


interface CostSheetState {
  data: any; // Using 'any' for flexibility with the complex template structure
  updateValue: (path: (string | number)[], value: any) => void;
  addRow: (annexId: string) => void;
  removeRow: (annexId: string, rowIndex: number) => void;
  loadExample: () => void;
  reset: () => void;
}

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: blankSheet,
      updateValue: (path, value) =>
        set(
          produce((draft) => {
            let current = draft.data;
            for (let i = 0; i < path.length - 1; i++) {
              current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
          })
        ),
      addRow: (annexId) =>
        set(
            produce((draft) => {
                const annex = draft.data.annexes.find((a: any) => a.id === annexId);
                if (annex && annex.data.length > 0) {
                    const firstRow = annex.data[0];
                    const newRow = { ...firstRow };
                     Object.keys(newRow).forEach(key => {
                        const column = annex.columns.find((c: any) => c.key === key);
                         if (column && !column.formula) {
                            // @ts-ignore
                            newRow[key] = typeof newRow[key] === 'number' ? 0 : '';
                         }
                     });
                    annex.data.push(newRow);
                }
            })
        ),
      removeRow: (annexId, rowIndex) =>
        set(
            produce((draft) => {
                const annex = draft.data.annexes.find((a: any) => a.id === annexId);
                if (annex && annex.data[rowIndex]) {
                    annex.data.splice(rowIndex, 1);
                }
            })
        ),
      loadExample: () => set({ data: originalTemplate }),
      reset: () => set({ data: blankSheet }),
    }),
    {
      name: 'cost-sheet-storage', // Name for the localStorage item
    }
  )
);
