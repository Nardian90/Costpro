import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import {
  CostSheetData as CostSheetDataContract,
  CostSheetSection as CostSheetSectionContract,
  CostSheetRow as CostSheetRowContract,
  CostSheetAnnex as CostSheetAnnexContract,
  IndirectConfig
} from '@/types/cost-sheet';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
import { costSheetDataSchema } from '@/validation/schemas';
import { toast } from 'sonner';

export interface UpdateValuePayload {
  path: (string | number)[];
  // FIX-LOG-023: Proper union type instead of any
  value: string | number | boolean | null | undefined | object;
}

interface CostSheetState {
  data: CostSheetDataContract;
  _hasHydrated: boolean;
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
  updateAnnexAdjustment: (annexId: string, coefficient: number, adjustmentColumn: string, isAdjustmentActive?: boolean) => void;
  updateIndirectConfig: (config: Partial<IndirectConfig>) => void;
}

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: reinicioTemplate as CostSheetDataContract,
      _hasHydrated: false,
      updateValue: (path: (string | number)[], value: any) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            let current: any = draft.data;
            for (let i = 0; i < path.length - 1; i++) {
              if (current[path[i]] === undefined) return;
              current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
          })
        ),
      updateValues: (updates: UpdateValuePayload[]) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            updates.forEach(({ path, value }) => {
                let current: any = draft.data;
                for (let i = 0; i < path.length - 1; i++) {
                  if (current[path[i]] === undefined) return;
                  current = current[path[i]];
                }
                current[path[path.length - 1]] = value;
            });
          })
        ),
      reorderRow: (annexId: string, rowIndex: number, direction: "up" | "down") =>
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
      reorderMainRow: (path: (string | number)[], direction: "up" | "down") =>
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
      removeMainSection: (index: number) =>
        set(
          produce((draft: CostSheetState) => {
            if (draft.data?.sections?.[index]) {
              draft.data.sections.splice(index, 1);
            }
          })
        ),
      addMainRow: (parentPath: (string | number)[]) =>
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
                const uniqueId = crypto.randomUUID();
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
      removeMainRow: (path: (string | number)[]) =>
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
      addRow: (annexId: string) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex) {
              const newRow: any = {};
              if (annex.data?.length > 0) {
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
      removeRow: (annexId: string, rowIndex: number) =>
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
      setSheet: (data: CostSheetDataContract) => {
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
          toast.error('Error: la plantilla de ejemplo tiene datos inválidos');
        }
      },
      updateAnnexAdjustment: (annexId: string, coefficient: number, adjustmentColumn: string, isAdjustmentActive?: boolean) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId
            );
            if (annex) {
              annex.coefficient = coefficient;
              annex.adjustmentColumn = adjustmentColumn;
              if (isAdjustmentActive !== undefined) {
                annex.isAdjustmentActive = isAdjustmentActive;
              }
            }
          })
        ),
      updateUtilityFormula: (percentage: number) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            for (const section of draft.data.sections) {
              const row = section.rows.find(r => ['13', '13.1'].includes(r.id));
              if (row) {
                const baseRef = row.formula?.includes('ref(\'12.1\')') ? '12.1' : '12'; row.formula = `ref('${baseRef}') * ${(percentage / 100).toFixed(4)}`;
                row.calculationMethod = 'FORMULA';
                break;
              }
            }
          })
        ),
      updateIndirectConfig: (config: Partial<IndirectConfig>) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            if (!draft.data.indirectConfig) {
              draft.data.indirectConfig = {
                mode: 'coefficient',
                selectedSections: [],
                baseSection: '2',
                coefficient: 1,
                fixedAmount: 0
              };
            }
            draft.data.indirectConfig = { ...draft.data.indirectConfig, ...config };
          })
        ),
      reset: () => {
        const resetData = JSON.parse(JSON.stringify(reinicioTemplate));
        const result = costSheetDataSchema.safeParse(resetData);
        if (result.success) {
          set({ data: result.data as CostSheetDataContract });
        } else {
          console.error('[Zod Validation Error] reset template:', result.error.format());
          toast.error('Error: la plantilla base tiene datos inválidos');
        }
      },
    }),
    {
      name: 'cost-sheet-storage',
      version: 3,
      onRehydrateStorage: () => {
        return (state) => {
          useCostSheetStore.setState({ _hasHydrated: true });
        };
      },
    }
  )
);

// Selector to check hydration without subscribing to data changes
export const useCostSheetHydrated = () =>
  useCostSheetStore((s) => s._hasHydrated);

if (typeof window !== 'undefined' && ((globalThis as any).process?.env?.NODE_ENV) === 'development') {
  (window as any).useCostSheetStore = useCostSheetStore;
}
