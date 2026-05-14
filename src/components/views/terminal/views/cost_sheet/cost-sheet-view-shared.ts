/**
 * Shared types, props interfaces, and utilities for Cost Sheet table views.
 *
 * Centralises the duplicated type aliases, prop definitions, and utility
 * functions that were previously copy-pasted across CardView, InteractiveTable,
 * and FlatTable (Phase 4 of the data-flow rewrite).
 */

import type {
  CostSheetRow,
  CostSheetSection,
  CostSheetAnnex,
  CalculatedRowValue,
} from '@/types/cost-sheet';
import type { StoreValue } from '@/store/cost-sheet-store';
import { toast } from 'sonner';
import { importSectionFromExcel } from '@/services/excel-service';

// ── Shared type aliases ─────────────────────────────────────────────

export type CalculatedValues = Record<string, CalculatedRowValue>;

// ── Shared props (parent components) ────────────────────────────────

export interface CostSheetViewBaseProps {
  sections: CostSheetSection[];
  groupedSections?: { id: string; label: string; sectionIds: string[] }[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  activeSubSectionId: string;
  setActiveSubSectionId: (id: string) => void;
  onOpenSections?: () => void;
  hideHeader?: boolean;
}

export type CostSheetCardViewProps = CostSheetViewBaseProps;
export type CostSheetInteractiveTableProps = CostSheetViewBaseProps;

export interface CostSheetFlatTableProps {
  sections: CostSheetSection[];
  calculatedValues: CalculatedValues;
  annexes: CostSheetAnnex[];
  onNavigateToAnnex?: (annexId: string) => void;
}

// ── Shared props (row sub-components) ───────────────────────────────

export type StorePath = (string | number)[];

export interface FormulaSuggestion {
  label: string;
  value: string;
  description?: string;
}

export interface CostSheetRowBaseProps {
  row: CostSheetRow;
  level: number;
  index: number;
  numbering: string;
  calculated: CalculatedRowValue;
  calculatedValues: CalculatedValues;
  path: StorePath;
  annexes: CostSheetAnnex[];
  suggestions: FormulaSuggestion[];
}

export type CostSheetRowCardProps = CostSheetRowBaseProps;
export type CostSheetRowTableProps = CostSheetRowBaseProps;

// ── Shared utility: section import from Excel ───────────────────────

/**
 * Import rows from an Excel file and set them on the given section index.
 * Duplicated in InteractiveTable and FlatTable — now a single shared function.
 */
export async function handleImportSectionExcel(
  e: React.ChangeEvent<HTMLInputElement>,
  index: number,
  _sections: CostSheetSection[],
  updateValue: (path: StorePath, value: StoreValue) => void,
): Promise<void> {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const rows = await importSectionFromExcel(file);
    updateValue(['sections', index, 'rows'], rows);
    toast.success('Sección importada correctamente');
  } catch (err) {
    toast.error('Error al importar sección');
    console.error(err);
  }
}
