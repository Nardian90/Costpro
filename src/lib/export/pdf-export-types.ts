/**
 * @file Tipos y metadatos compartidos de la exportación PDF de Fichas de Costo.
 * @description SINGLE SOURCE OF TRUTH para PDFFormat / ExportOptions / AnnexLayout
 * y la metadata de presentación de los 10 formatos.
 *
 * FC-PDF-UNIFY (misión 2026-11-13): antes estos tipos vivían SOLO en
 * CostSheetExportModal (componente 'use client'), lo que impedía usar el motor
 * de 10 formatos (pdf-generator.ts) desde rutas de API server-side — el
 * inventario usaba un generador paralelo (generate-fc-pdf.ts, layout único)
 * y producía documentos distintos a los de la sección Fichas de Costo.
 *
 * Al mover los tipos aquí (módulo puro, sin React ni dependencias de cliente),
 * `generateCostSheetPDF` se vuelve isomorfo: el MISMO motor sirve a:
 *   1. Sección Fichas de Costo → CostSheetExportModal (cliente, doc.save)
 *   2. Inventario/Catálogo → FCPreviewModal → GET /quick-pdf (servidor)
 *   3. Vistazo → CostSheetPdfPreview (cliente, blob URL en iframe)
 *
 * El formato solo define PRESENTACIÓN: no altera cálculos, componentes ni
 * información de la ficha (misión §3.1).
 */

import type { FCPdfFormat } from '@/contracts/store-cost-template';

/** Unión de formatos PDF de FC — alias del contrato canónico (mismos 10 valores). */
export type PDFFormat = FCPdfFormat;

/** Disposición de anexos en el PDF. */
export type AnnexLayout = 'together' | 'separate';

/** Opciones de exportación (presentación del documento; no toca el cálculo). */
export interface ExportOptions {
  // Documents
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[];

  // Format
  pdfFormat: PDFFormat;
  logo?: string;

  // Advanced
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
  showDateTime: boolean;
  alwaysZip: boolean;
  annexLayout: AnnexLayout;

  // Comparison
  includeComparison?: boolean;
  scenarioId?: string;
}

/**
 * Metadata de presentación de cada formato (id, etiqueta y descripción).
 * Sin dependencias de React/íconos para poder consumirla desde servidor y
 * cliente. Los íconos visuales se asocian en el componente (CostSheetExportModal
 * / selectores de formato), no aquí.
 */
export interface PDFFormatMeta {
  id: PDFFormat;
  label: string;
  description: string;
}

export const PDF_FORMATS_META: readonly PDFFormatMeta[] = [
  { id: 'standard', label: 'Estándar', description: 'Limpio y universal' },
  { id: 'pro', label: 'Pro Corporativo', description: 'Con logo e identidad visual' },
  { id: 'res148', label: 'Res 148/2023', description: 'Formato oficial MINCIN' },
  { id: 'ejecutivo', label: 'Ejecutivo', description: 'KPIs para dirección' },
  { id: 'contabilidad', label: 'Contabilidad', description: 'Cuentas y precisión 4 decimales' },
  { id: 'auditoria', label: 'Auditoría', description: 'Trazabilidad y firmas' },
  { id: 'simplificado', label: 'Simplificado', description: 'Una sola página, totales' },
  { id: 'bilingue', label: 'Bilingüe ES/EN', description: 'Columnas español e inglés' },
  { id: 'comparativo', label: 'Escenarios', description: 'Base vs variaciones ±10%' },
  { id: 'exportacion', label: 'Exportación', description: 'CUP + USD, campos int\'l' },
] as const;

/** Mapa id → meta para búsqueda O(1). */
export const PDF_FORMAT_META_BY_ID: Readonly<Record<PDFFormat, PDFFormatMeta>> =
  Object.fromEntries(PDF_FORMATS_META.map(m => [m.id, m])) as Record<PDFFormat, PDFFormatMeta>;

/**
 * Opciones de exportación por defecto para vistas previas y generación desde
 * rutas de API — espeja los defaults iniciales de CostSheetExportModal para que
 * el PDF generado por ambos accesos sea consistente.
 */
export function defaultExportOptions(pdfFormat: PDFFormat): ExportOptions {
  return {
    includeFC: true,
    includeAudit: false,
    includeAnnexes: [],        // vacío = todos (el generador trata [] como «todos»)
    pdfFormat,
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true,
    includeUtilityNote: true,
    showDateTime: true,
    alwaysZip: false,
    annexLayout: 'together',
  };
}
