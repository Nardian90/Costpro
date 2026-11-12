/**
 * @file Constructor del body de generación para el PDF de la FC de un producto.
 * @description FC-PDF-UNIFY (misión 2026-11-13 — «Fichas de Costo: auditoría
 * integral»).
 *
 * Antes: /api/product-cost-sheets/quick-pdf llamaba a `generateFCPdf`
 * (generate-fc-pdf.ts — layout genérico único que IGNORABA pdf_format) y le
 * pasaba `calculatedRows` (ARRAY) donde el generador espera un Record
 * `calculatedValues` → `calculatedValues[row.id]` era siempre undefined → las
 * columnas VH/Total caían a los valores persistidos (con frecuencia 0).
 *
 * Ahora: quick-pdf construye el body con ESTE módulo y llama al motor
 * compartido `generateCostSheetPDF` (pdf-generator.ts — los mismos 10 formatos
 * con los mismos diseños que la sección Fichas de Costo). La conversión
 * calculatedRows (array) → calculatedValues (Record<rowId, valor>) es exacta.
 *
 * Módulo PURO (sin dependencias de red ni de React) para testear la
 * transformación de datos de forma aislada.
 */

import type { ExportOptions } from '@/lib/export/pdf-export-types';

/** Estructura de `product_cost_sheets.calculated_data` tal como la produce el
 *  pipeline de generación (fc-generator-service.runGenerationPipeline). */
export interface FCCalculatedData {
  header?: Record<string, unknown> | null;
  sections?: unknown[] | null;
  annexes?: unknown[] | null;
  calculatedRows?: FCRawCalculatedRow[] | null;
  summary?: Record<string, unknown> | null;
  audits?: unknown[] | null;
}

export interface FCRawCalculatedRow {
  id: string;
  classification?: string;
  label?: string;
  total?: number;
  calculatedVH?: number;
  type?: string;
  [key: string]: unknown;
}

/**
 * Convierte `calculatedRows` (array plano del JSONB) al Record
 * `Record<rowId, valor>` que esperan los renderizadores de formato
 * (`calculatedValues[row.id]`).
 */
export function calculatedRowsToValues(
  rows: FCRawCalculatedRow[] | null | undefined,
): Record<string, FCRawCalculatedRow> {
  const values: Record<string, FCRawCalculatedRow> = {};
  for (const row of rows ?? []) {
    if (row && typeof row.id === 'string') {
      values[row.id] = row;
    }
  }
  return values;
}

/**
 * Construye el body que consume `generateCostSheetPDF` a partir del
 * calculated_data persistido de la FC de un producto.
 *
 * - `data`: la ficha enriquecida (header + sections + annexes) tal como quedó
 *   tras la inyección del producto — se renderiza lo persistido, SIN recalcular.
 * - `calculatedValues`: Record<rowId, fila> (fix del array-vs-Record).
 * - `calculatedHeader`: header enriquecido + resumen del cálculo (totales)
 *   — los renderizadores hacen merge header = {...data.header, ...calculatedHeader}.
 * - `options`: presentación por defecto del endpoint (espeja defaults de
 *   CostSheetExportModal); el formato lo elige el usuario en el selector.
 */
export function buildQuickPdfBody(
  calculatedData: FCCalculatedData | Record<string, unknown> | null | undefined,
  pdfFormat: ExportOptions['pdfFormat'],
): Record<string, unknown> {
  const cd = (calculatedData ?? {}) as FCCalculatedData;
  const calculatedValues = calculatedRowsToValues(cd.calculatedRows);

  return {
    data: {
      header: cd.header ?? {},
      sections: cd.sections ?? [],
      annexes: cd.annexes ?? [],
    },
    options: {
      includeFC: true,
      includeAudit: false,
      includeAnnexes: [],          // vacío = todos (contrato del generador)
      pdfFormat,
      consolidated: true,
      skipZeros: true,
      includeFinancialSummary: true,
      includeUtilityNote: true,
      showDateTime: true,
      alwaysZip: false,
      annexLayout: 'together',
    } satisfies ExportOptions,
    calculatedValues,
    calculatedHeader: {
      ...(cd.header ?? {}),
      // Resumen del cálculo persistido (result.summary del cost-engine):
      // totalCost/grandTotal/etc. — nombres que leen los renderizadores.
      totalCost: (cd.summary?.totalCost as number | undefined) ?? undefined,
      costoTotal: (cd.summary?.totalCost as number | undefined) ?? undefined,
      salePrice: (cd.summary?.grandTotal as number | undefined) ?? undefined,
      precioVenta: (cd.summary?.grandTotal as number | undefined) ?? undefined,
    },
    calculatedAnnexes: [], // los anexos persistidos ya traen su data inyectada
    calculationResult: null,
  };
}
