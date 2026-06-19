import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { produce } from 'immer';
import {
  CostSheetData,
  CostSheetAnnex as CostSheetAnnexContract,
  IndirectConfig
} from '@/types/cost-sheet';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import exampleTemplate from '@/lib/data/costpro-ejemplo';
import { costSheetDataSchema } from '@/validation/schemas';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────

/** Union of all value types a store field can hold. */
export type StoreValue = string | number | boolean | null | undefined | object;

export interface UpdateValuePayload {
  path: (string | number)[];
  value: StoreValue;
}

type StorePath = (string | number)[];

interface CostSheetState {
  data: CostSheetData;
  _hasHydrated: boolean;

  // ── Generic path-based mutation ──
  updateValue: (path: StorePath, value: StoreValue) => void;
  updateValues: (updates: UpdateValuePayload[]) => void;

  // ── Annex row CRUD ──
  reorderRow: (annexId: string, rowIndex: number, direction: 'up' | 'down') => void;
  addRow: (annexId: string) => void;
  removeRow: (annexId: string, rowIndex: number) => void;

  // ── Main section/row CRUD ──
  addMainSection: () => void;
  removeMainSection: (index: number) => void;
  addMainRow: (parentPath: StorePath) => void;
  removeMainRow: (path: StorePath) => void;
  reorderMainRow: (path: StorePath, direction: 'up' | 'down') => void;

  // ── High-level actions ──
  setSheet: (data: CostSheetData) => void;
  loadExample: () => void;
  reset: () => void;
  updateUtilityFormula: (percentage: number) => void;
  updateAnnexAdjustment: (annexId: string, coefficient: number, adjustmentColumn: string, isAdjustmentActive?: boolean) => void;
  updateIndirectConfig: (config: Partial<IndirectConfig>) => void;
}

// ── Internal helpers (module-level, not exposed) ─────────────────────

/**
 * Walk a nested path inside `root` and return the parent container
 * plus the final key. Returns `null` if any intermediate segment is
 * missing or not an object/array.
 */
function resolveParent(
  root: Record<string, unknown>,
  path: (string | number)[],
): { parent: unknown; key: string | number } | null {
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string | number, unknown>)[path[i]];
    if (current === undefined) return null;
  }
  if (current == null || typeof current !== 'object') return null;
  return { parent: current, key: path[path.length - 1] };
}

/**
 * Walk a path and return the resolved container (the parent array or
 * object before the final index/key). Useful for reorder/splice ops.
 */
function resolveContainer(
  root: Record<string, unknown>,
  path: (string | number)[],
): unknown | null {
  let current: unknown = root;
  for (const p of path) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string | number, unknown>)[p];
    if (current === undefined) return null;
  }
  return current;
}

/** Shared Zod validation + set logic used by setSheet, loadExample, reset. */
function validatedSet(
  raw: unknown,
  set: (partial: Partial<CostSheetState>) => void,
  errorMessage: string,
  sourceLabel: string,
): void {
  const result = costSheetDataSchema.safeParse(raw);
  if (result.success) {
    set({ data: result.data as CostSheetData });
  } else {
    console.error(`[Zod Validation Error] ${sourceLabel}:`, result.error.format());
    toast.error(errorMessage);
  }
}

/** Check if an annex column key is likely numeric. */
function isNumericColumnKey(key: string): boolean {
  return (
    key === 'no' ||
    key.includes('norm') ||
    key.includes('price') ||
    key.includes('value') ||
    key.includes('amount') ||
    key.includes('count') ||
    key.includes('rate') ||
    key.includes('total') ||
    key.includes('cost')
  );
}

// ── Store ────────────────────────────────────────────────────────────

export const useCostSheetStore = create<CostSheetState>()(
  persist(
    (set) => ({
      data: reinicioTemplate as CostSheetData,
      _hasHydrated: false,

      // ── Generic path-based mutation ────────────────────────────────

      updateValue: (path, value) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const resolved = resolveParent(draft.data as unknown as Record<string, unknown>, path);
            if (!resolved) return;
            (resolved.parent as Record<string | number, unknown>)[resolved.key] = value;
          }),
        ),

      updateValues: (updates) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const root = draft.data as unknown as Record<string, unknown>;
            for (const { path, value } of updates) {
              const resolved = resolveParent(root, path);
              if (!resolved) return;
              (resolved.parent as Record<string | number, unknown>)[resolved.key] = value;
            }
          }),
        ),

      // ── Annex row CRUD ─────────────────────────────────────────────

      reorderRow: (annexId, rowIndex, direction) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId,
            );
            if (!annex?.data) return;
            const newIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
            if (newIndex >= 0 && newIndex < annex.data.length) {
              const temp = annex.data[rowIndex];
              annex.data[rowIndex] = annex.data[newIndex];
              annex.data[newIndex] = temp;
            }
          }),
        ),

      addRow: (annexId) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId,
            );
            if (!annex) return;

            const newRow: Record<string, string | number> = {};
            const nextNo = (annex.data?.length ?? 0) + 1;

            if (annex.data?.length > 0) {
              const firstRow = annex.data[0] as Record<string, unknown>;
              Object.keys(firstRow).forEach((key) => {
                const column = annex.columns.find((c) => c.key === key);
                // Skip formula columns (computed) and unknown columns → default 0
                if (column?.formula) {
                  newRow[key] = 0;
                } else if (key === 'no') {
                  // Auto-fill sequential number
                  newRow[key] = nextNo;
                } else {
                  newRow[key] = typeof firstRow[key] === 'number' ? 0 : '';
                }
              });
            } else {
              annex.columns.forEach((col) => {
                if (col.key === 'no') {
                  newRow[col.key] = nextNo;
                } else {
                  newRow[col.key] = isNumericColumnKey(col.key) ? 0 : '';
                }
              });
            }

            annex.data.push(newRow);
          }),
        ),

      removeRow: (annexId, rowIndex) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId,
            );
            if (annex?.data?.[rowIndex]) {
              annex.data.splice(rowIndex, 1);
            }
          }),
        ),

      // ── Main section/row CRUD ──────────────────────────────────────

      reorderMainRow: (path, direction) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1] as number;
            const container = resolveContainer(
              draft.data as unknown as Record<string, unknown>,
              parentPath,
            );
            if (!Array.isArray(container)) return;
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex >= 0 && newIndex < container.length) {
              const temp = container[index];
              container[index] = container[newIndex];
              container[newIndex] = temp;
            }
          }),
        ),

      addMainSection: () =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.sections) return;
            const nextId = (draft.data.sections.length + 1).toString();
            draft.data.sections.push({
              id: nextId,
              label: `Nueva Sección ${nextId}`,
              rows: [],
            });
          }),
        ),

      removeMainSection: (index) =>
        set(
          produce((draft: CostSheetState) => {
            if (draft.data?.sections?.[index]) {
              draft.data.sections.splice(index, 1);
            }
          }),
        ),

      addMainRow: (parentPath) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const container = resolveContainer(
              draft.data as unknown as Record<string, unknown>,
              parentPath,
            );
            if (!Array.isArray(container)) return;
            container.push({
              id: crypto.randomUUID(),
              label: 'Nuevo Concepto',
              valorHistorico: 0,
              calculationMethod: 'ValorFijo',
              children: [],
            });
          }),
        ),

      removeMainRow: (path) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1] as number;
            const container = resolveContainer(
              draft.data as unknown as Record<string, unknown>,
              parentPath,
            );
            if (Array.isArray(container) && container[index]) {
              container.splice(index, 1);
            }
          }),
        ),

      // ── High-level actions ─────────────────────────────────────────

      setSheet: (data) =>
        validatedSet(data, set, 'Error de validación en la ficha de costo', 'cost sheet data'),

      loadExample: () => {
        const cloned = JSON.parse(JSON.stringify(exampleTemplate));
        validatedSet(cloned, set, 'Error: la plantilla de ejemplo tiene datos inválidos', 'example data');
      },

      reset: () => {
        const cloned = JSON.parse(JSON.stringify(reinicioTemplate));
        validatedSet(cloned, set, 'Error: la plantilla base tiene datos inválidos', 'reset template');
      },

      updateAnnexAdjustment: (annexId, coefficient, adjustmentColumn, isAdjustmentActive) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data?.annexes) return;
            const annex = draft.data.annexes.find(
              (a: CostSheetAnnexContract) => a.id === annexId,
            );
            if (!annex) return;
            annex.coefficient = coefficient;
            annex.adjustmentColumn = adjustmentColumn;
            if (isAdjustmentActive !== undefined) {
              annex.isAdjustmentActive = isAdjustmentActive;
            }
          }),
        ),

      updateUtilityFormula: (percentage) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            for (const section of draft.data.sections) {
              const row = section.rows.find((r) => ['13', '13.1'].includes(r.id));
              if (row) {
                const baseRef = row.formula?.includes("ref('12.1')") ? '12.1' : '12';
                row.formula = `ref('${baseRef}') * ${(percentage / 100).toFixed(4)}`;
                row.calculationMethod = 'FORMULA';
                break;
              }
            }
          }),
        ),

      updateIndirectConfig: (config) =>
        set(
          produce((draft: CostSheetState) => {
            if (!draft.data) return;
            if (!draft.data.indirectConfig) {
              draft.data.indirectConfig = {
                mode: 'coefficient',
                selectedSections: [],
                baseSection: '2',
                coefficient: 1,
                fixedAmount: 0,
              };
            }
            draft.data.indirectConfig = { ...draft.data.indirectConfig, ...config };
          }),
        ),
    }),
    {
      name: 'cost-sheet-storage',
      version: 5,
      storage: createJSONStorage(() => {
        // SSR-safe: provide noop storage when localStorage is unavailable.
        // Without this, createJSONStorage returns undefined and the persist
        // middleware enters degraded mode — onRehydrateStorage NEVER fires,
        // _hasHydrated stays false, and the calculator never runs.
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      partialize: (state) => {
        // _hasHydrated is a runtime-only flag — never persist it.
        // If persisted as false and onRehydrateStorage fails, it stays false forever.
        const { _hasHydrated, ...rest } = state;
        return rest;
      },
      migrate: (persisted: unknown, version: number) => {
        if (version < 5) {
          // Force-clear to ensure clean state with passthrough schemas
          return undefined;
        }
        return persisted;
      },
      onRehydrateStorage: () => {
        return () => {
          useCostSheetStore.setState({ _hasHydrated: true });
        };
      },
    },
  ),
);

// ── Selectors ────────────────────────────────────────────────────────

/** Check hydration without subscribing to data changes. */
export const useCostSheetHydrated = () =>
  useCostSheetStore((s) => s._hasHydrated);

// ── Dev helpers ──────────────────────────────────────────────────────

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).useCostSheetStore = useCostSheetStore;
}
