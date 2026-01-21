
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import originalTemplate from '@/lib/data/costpro-full.json';
import { produce } from 'immer';

// Deep clone the original template to avoid modifying it directly
const createBlankSheet = () => {
  const sheet = JSON.parse(JSON.stringify(originalTemplate));

  // Clear header
  sheet.header.code = '';
  sheet.header.name = '';
  sheet.header.date = new Date().toISOString().split('T')[0];
  sheet.header.quantity = 1.0;
  sheet.header.currency = 'CUP';
  sheet.header.category = '';
  sheet.header.type = '';
  sheet.header.unit = '';

  // Recursive function to clear values in rows and their children
  const clearRowValues = (row: any) => {
    // Clear editable properties on the current row
    if (row.hasOwnProperty('valorHistorico')) {
      row.valorHistorico = 0;
    }
    // Handle older value fields as well for compatibility
    if (row.hasOwnProperty('value') && !row.formula) {
        row.value = 0;
    }

    // If the row has children, recurse through them
    if (row.children && Array.isArray(row.children)) {
      row.children.forEach(clearRowValues);
    }
  };

  // Clear values in all sections
  sheet.sections.forEach((section: any) => {
    section.rows.forEach(clearRowValues);
  });

  // Clear annex data
  sheet.annexes.forEach((annex: any) => {
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

  // Clear signature
  sheet.signature.prepared_by = '';
  sheet.signature.approved_by = '';

  return sheet;
};

const blankSheet = createBlankSheet();

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
      // The updateValue logic is generic enough to handle nested paths, so it doesn't need changes.
      // The path will be constructed in the component like: ['sections', 0, 'rows', 0, 'children', 0, 'valorHistorico']
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
      loadExample: () => set({ data: JSON.parse(JSON.stringify(originalTemplate)) }), // Use fresh clone on load
      reset: () => set({ data: createBlankSheet() }), // Use fresh blank sheet on reset
    }),
    {
      name: 'cost-sheet-storage', // Name for the localStorage item
    }
  )
);
