/**
 * useCellEditor — unified hook + shared pure functions for cost-sheet cell editing.
 *
 * Centralises ALL cell-editing logic that was previously duplicated across
 * CardView, InteractiveTable, and FlatTable (Phases 2 + 4 of the rewrite).
 *
 * Exports:
 *  • useCellEditor()   — React hook (setField, saveVH, saveTotal, setFields, applySuggested)
 *  • buildFormulaSuggestions()  — pure fn, builds autocomplete list for FormulaEditor
 *  • getRowDiagnostics()        — pure fn, extracts validation badges from a row
 */

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { isResultRow } from '@/lib/cost-engine/constants';
import reinicioTemplate from '@/lib/data/costpro-reinicio';
import type {
  CostSheetRow,
  CostSheetSection,
  CostSheetAnnex,
  CalculatedRowValue,
} from '@/types/cost-sheet';

// ── Types ────────────────────────────────────────────────────────────

export type StorePath = (string | number)[];

export interface FormulaSuggestion {
  label: string;
  value: string;
  description?: string;
}

export interface RowDiagnostics {
  isRowPercent: boolean;
  isResult: boolean;
  safeCalculated: CalculatedRowValue;
  criticalErrors: { message: string; type: string }[];
  warningErrors: { message: string; type: string }[];
  hasEngineWarnings: boolean;
}

export interface UseCellEditorReturn {
  setField: (path: StorePath, field: string, value: string | number | boolean | null) => void;
  saveVH: (path: StorePath, val: string) => void;
  saveTotal: (path: StorePath, row: CostSheetRow, val: string) => void;
  setFields: (path: StorePath, updates: Record<string, string | number | boolean | null>) => void;
  /** Look up the reinicio template for suggested formulas and apply them. */
  applySuggested: (rowId: string, path: StorePath) => void;
}

// ── Internal constants ───────────────────────────────────────────────

const FIJO_METHODS = new Set(['FIJO', 'MANUAL', 'ValorFijo']);

/** Regex: bare annex references like "AnexoI", "AnexoIV", "ANEXOii", "TotalAnexoI" */
const ANNEX_REF_RE = /^(Total)?[Aa]nexo([IVXLC]+)$/i;

const DEFAULT_CALC: CalculatedRowValue = {
  total: 0,
  valorHistorico: 0,
  calculatedVH: 0,
  baseDeCalculoRef: null,
  baseTotal: 0,
  baseValorHistorico: 0,
  coeficiente: 0,
  hasWarnings: false,
  audits: [],
  validationErrors: [],
  metadata: {},
};

// ── Pure functions (exported, no React dependency) ───────────────────

/**
 * Build the autocomplete suggestion list used by FormulaEditor.
 * Takes the current sections + annexes and returns every ref/vh/annex/keyword.
 *
 * Replaces the identical `suggestions` useMemo that was in all 3 table components.
 */
export function buildFormulaSuggestions(
  sections: CostSheetSection[],
  annexes: CostSheetAnnex[],
): FormulaSuggestion[] {
  const list: FormulaSuggestion[] = [
    ...(annexes || []).map((a) => ({
      label: `Anexo ${a.id}`,
      value: `Anexo${a.id}`,
      description: a.title,
    })),
  ];

  for (const s of sections) {
    for (const r of s.rows) {
      list.push({ label: `Fila ${r.id}`, value: `ref('${r.id}')`, description: r.label });
      list.push({
        label: `VH Fila ${r.id}`,
        value: `vh('${r.id}')`,
        description: `Valor Histórico de ${r.label}`,
      });
      if (r.children) {
        for (const c of r.children) {
          list.push({ label: `Fila ${c.id}`, value: `ref('${c.id}')`, description: c.label });
          list.push({
            label: `VH Fila ${c.id}`,
            value: `vh('${c.id}')`,
            description: `Valor Histórico de ${c.label}`,
          });
        }
      }
    }
  }

  list.push(
    { label: 'SUMA', value: 'SUMA(', description: 'Suma de valores' },
    { label: 'PCT', value: 'PCT(', description: 'Porcentaje de un valor' },
    { label: 'hijos', value: 'hijos', description: 'Referencia a filas hijas' },
  );

  return list;
}

/**
 * Extract validation diagnostics from a row + its calculated result.
 * Returns everything the UI needs to render error/warning badges.
 *
 * Replaces the identical diagnostic block that was in all 3 row components.
 */
export function getRowDiagnostics(
  row: CostSheetRow,
  calculated: CalculatedRowValue | undefined | null,
): RowDiagnostics {
  const hasChildren = !!(row.children && row.children.length > 0);
  const isRowPercent = row.isPercent ?? row.is_percent ?? false;
  const isResult = isResultRow(String(row.id)) || isRowPercent;
  const safe = calculated ?? DEFAULT_CALC;

  const errors = safe.validationErrors ?? [];
  const criticalErrors = errors.filter((e) => e.type === 'CRITICAL');
  const warningErrors = errors.filter((e) => e.type === 'WARNING');
  const hasEngineWarnings =
    safe.hasWarnings ||
    (!hasChildren &&
      !isRowPercent &&
      safe.total === 0 &&
      ((row.valorHistorico ?? 0) > 0 || !!row.baseDeCalculoRef));

  return { isRowPercent, isResult, safeCalculated: safe, criticalErrors, warningErrors, hasEngineWarnings };
}

/**
 * Recursively search for a row by id inside nested children.
 */
function findRowById(rows: CostSheetRow[], rowId: string): CostSheetRow | null {
  for (const r of rows) {
    if (r.id === rowId) return r;
    if (r.children) {
      const found = findRowById(r.children, rowId);
      if (found) return found;
    }
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useCellEditor(): UseCellEditorReturn {
  const updateValue = useCostSheetStore((s) => s.updateValue);
  const updateValues = useCostSheetStore((s) => s.updateValues);

  const setField = useCallback(
    (path: StorePath, field: string, value: string | number | boolean | null) => {
      updateValue([...path, field], value);
    },
    [updateValue],
  );

  const setFields = useCallback(
    (path: StorePath, updates: Record<string, string | number | boolean | null>) => {
      updateValues(
        Object.entries(updates).map(([field, value]) => ({
          path: [...path, field],
          value,
        })),
      );
    },
    [updateValues],
  );

  const saveVH = useCallback(
    (path: StorePath, val: string) => {
      if (val.startsWith('=')) {
        setFields(path, { vhFormula: val, valorHistorico: 0 });
      } else {
        setFields(path, { vhFormula: null, valorHistorico: parseFloat(val) || 0 });
      }
    },
    [setFields],
  );

  const saveTotal = useCallback(
    (path: StorePath, row: CostSheetRow, val: string) => {
      const trimmed = val.trim();

      if (trimmed.startsWith('=')) {
        // ── Formula path (e.g. "=ref('1.1')*0.15", "=AnexoI") ──
        const updates: Record<string, string | number | boolean | null> = {
          formula: trimmed,
          totalFormula: trimmed,
        };
        if (row.calculationMethod && FIJO_METHODS.has(row.calculationMethod)) {
          updates.calculationMethod = 'FORMULA';
        }
        setFields(path, updates);
      } else if (ANNEX_REF_RE.test(trimmed)) {
        // ── Bare annex reference without "=" (e.g. "AnexoI", "TotalAnexoIII") ──
        // Treat as formula so the engine resolves it via FORMULA context.
        const formulaStr = '=' + trimmed;
        const updates: Record<string, string | number | boolean | null> = {
          formula: formulaStr,
          totalFormula: formulaStr,
        };
        if (row.calculationMethod && FIJO_METHODS.has(row.calculationMethod)) {
          updates.calculationMethod = 'FORMULA';
        }
        // Also set baseDeCalculoRef for IMPORTAR_ANEXO routing in buildEngineRows
        const romanMatch = trimmed.match(/([IVXLC]+)$/i);
        if (romanMatch) {
          updates.baseDeCalculoRef = romanMatch[1].toUpperCase();
        }
        setFields(path, updates);
      } else {
        // ── Fixed numeric value (e.g. "500", "0", "3.14") ──
        const numericVal = parseFloat(trimmed);
        const updates: Record<string, string | number | boolean | null> = {
          formula: null,
          totalFormula: null,
          total: numericVal || 0,
          // CRITICAL FIX: write to valorHistorico so the engine FIJO path reads it.
          // The engine computes `total = vh` for FIJO rows, where vh = valorHistorico.
          valorHistorico: numericVal || 0,
          calculationMethod: 'FIJO',
          baseDeCalculoRef: null,
        };
        if ('baseRef' in row) {
          updates.baseRef = null;
        }
        setFields(path, updates);
      }
    },
    [setFields],
  );

  /**
   * Look up the reinicio template for formulas matching `rowId`,
   * and apply totalFormula / vhFormula to the row at `path`.
   */
  const applySuggested = useCallback(
    (rowId: string, path: StorePath) => {
      const suggested = reinicioTemplate?.sections
        ? reinicioTemplate.sections.reduce(
            (acc, s) => acc ?? findRowById(s.rows, rowId),
            null as CostSheetRow | null,
          )
        : null;

      if (suggested) {
        const updates: Record<string, string | number | boolean | null> = {};
        if (suggested.totalFormula) {
          updates.totalFormula = suggested.totalFormula;
          updates.formula = suggested.totalFormula;
        }
        if (suggested.vhFormula) {
          updates.vhFormula = suggested.vhFormula;
          updates.valorHistorico = 0;
        }
        if (Object.keys(updates).length > 0) {
          setFields(path, updates);
          toast.success('Fórmulas sugeridas aplicadas');
        } else {
          toast.error('No se encontró fórmula sugerida');
        }
      } else {
        toast.error('No se encontró fórmula sugerida');
      }
    },
    [setFields],
  );

  return { setField, saveVH, saveTotal, setFields, applySuggested };
}

/**
 * Convenience hook: just the suggestions memo.
 * Replaces the 22-line useMemo that was in every table component.
 */
export function useFormulaSuggestions(
  sections: CostSheetSection[],
  annexes: CostSheetAnnex[],
): FormulaSuggestion[] {
  return useMemo(() => buildFormulaSuggestions(sections, annexes), [sections, annexes]);
}

export default useCellEditor;
