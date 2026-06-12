/**
 * useReportValidation — Shared validation hook for the Generador de Reportes module.
 *
 * Eliminates duplicated validation logic between handleGenerate and handleExportExcel
 * in ReportsView.tsx. Returns a `validate()` function that checks prerequisites
 * and returns null if valid, or an error message string if invalid.
 *
 * Usage:
 *   const { validate } = useReportValidation(config);
 *   const errorMsg = validate('generate'); // or 'export'
 *   if (errorMsg) { toast.error(errorMsg); return; }
 */

import { useMemo } from 'react';
import { useAuthStore } from '@/store';
import type { ReportDefinition } from '@/types';
import { toast } from 'sonner';

export interface ReportValidationResult {
  /** Run all validations, returns null if OK or the error message */
  validate: (action?: 'generate' | 'export' | 'preview') => string | null;
  /** Derived booleans for quick checks */
  hasStore: boolean;
  isInvalidDateRange: boolean;
  isMissingKardexProduct: boolean;
  isMissingColumns: boolean;
}

export function useReportValidation(config: Partial<ReportDefinition>): ReportValidationResult {
  const { user } = useAuthStore();

  const hasStore = !!user?.activeStoreId;

  const isInvalidDateRange = !!(
    config.date_range?.from &&
    config.date_range?.to &&
    config.date_range.from > config.date_range.to
  );

  const isMissingKardexProduct =
    config.type === 'kardex' && !config.filters?.product_id;

  const isMissingColumns =
    !config.columns || config.columns.length === 0;

  const validate = useMemo(() => {
    return (action?: 'generate' | 'export' | 'preview'): string | null => {
      if (!hasStore) {
        return 'Seleccione una tienda activa';
      }
      if (isInvalidDateRange) {
        return 'Corrija el rango de fechas: "Desde" no puede ser posterior a "Hasta"';
      }
      if (isMissingKardexProduct) {
        return 'Debe seleccionar un producto para generar el reporte de Kardex';
      }
      if (action === 'export' && isMissingColumns) {
        return 'Seleccione al menos una columna para exportar';
      }
      return null;
    };
  }, [hasStore, isInvalidDateRange, isMissingKardexProduct, isMissingColumns]);

  return {
    validate,
    hasStore,
    isInvalidDateRange,
    isMissingKardexProduct,
    isMissingColumns,
  };
}
