import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import {
  CostSheetData as CostSheetDataContract,
  CostSheetAnnex as CostSheetAnnexContract,
  CostSheetRow
} from '../types/cost-sheet';
import { costSheetDataSchema } from '../validation/schemas';
import { toast } from 'sonner';
import reinicioTemplate from '../lib/data/costpro-reinicio';
import exampleTemplate from '../lib/data/costpro-ejemplo';

interface UpdateValuePayload {
  path: (string | number)[];
  value: any;
}

interface CostSheetState {
  data: CostSheetDataContract;
  updateValue: (path: (string | number)[], value: any) => void;
  updateValues: (updates: UpdateValuePayload[]) => void;
  reorderRow: (annexId: string, rowIndex: number, direction: 'up' | 'down') => void;
  addRow: (annexId: string) => void;
  removeRow: (annexId: string, rowIndex: number) => void;
  addMainSection: () => void;
  removeMainSection: (index: number) => void;
  addMainRow: (parentPath: (string | number)[]) => void;
  removeMainRow: (path: (string | number)[]) => void;
  reorderMainRow: (path: (string | number)[], direction: 'up' | 'down') => void;
  setSheet: (data: CostSheetDataContract) => void;
  loadExample: () => void;
  reset: () => void;
  updateUtilityFormula: (percentage: number) => void;
  updateAnnexAdjustment: (annexId: string, coefficient: number, adjustmentColumn: string, commit?: boolean) => void;
}

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: reinicioTemplate as CostSheetDataContract,
      updateValue: (path, value) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            let current: any = draft.data;
            for (let i = 0; i < path.length - 1; i++) {
              if (current[path[i]] === undefined) return;
              current = current[path[i]];
            }
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
            if (Array.isArray(current)) {
                const nextId = (current.length + 1).toString();
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
                const firstRow = annex.data[0];
                Object.keys(firstRow).forEach((key) => {
                  const column = annex.columns.find((c) => c.key === key);
                  if (column && !column.formula) {
                    newRow[key] = typeof firstRow[key] === 'number' ? 0 : '';
                  } else if (!column) {
                    newRow[key] = typeof firstRow[key] === 'number' ? 0 : '';
                  } else {
                    newRow[key] = 0;
                  }
                });
              } else {
                annex.columns.forEach((col) => {
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
          set({ data: example as CostSheetDataContract });
        }
      },
      updateAnnexAdjustment: (annexId, coefficient, adjustmentColumn, commit = false) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex) {
              annex.coefficient = coefficient;
              annex.adjustmentColumn = adjustmentColumn;

              if (commit) {
                const colKey = adjustmentColumn === 'PRECIO UNITARIO' ? 'price_unit' :
                               (adjustmentColumn === 'VALOR' ? 'value' :
                               (adjustmentColumn === 'IMPORTE' ? 'importe' : 'price_unit'));

                annex.data.forEach((row: any) => {
                  if (row && row[colKey] !== undefined && typeof row[colKey] === 'number') {
                    row[colKey] = Number((row[colKey] * coefficient).toFixed(4));
                  }
                });

                annex.coefficient = 1;
                toast.success(`Ajuste aplicado permanentemente al Anexo ${annexId}`);
              }
            }
          })
        ),
      updateUtilityFormula: (percentage) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
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
      name: 'cost-sheet-storage',
      version: 2,
    }
  )
);
