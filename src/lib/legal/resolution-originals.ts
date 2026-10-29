/**
 * MISIÓN RESOLUCIÓN 11 — ORIGINALES EN PDF DEL MARCO LEGAL (2026-10-29)
 * =====================================================================
 * Algunas resoluciones disponen del documento oficial original en formato
 * PDF, servido como archivo estático desde /public/legal (integridad
 * garantizada: copia byte a byte del documento oficial).
 *
 * El mapeo es una constante de FRONTEND (número/año → ruta pública) para
 * NO añadir columnas ni tablas a la base de datos: las resoluciones 12/2007
 * y 13/2007 se siguen leyendo de `legal_resolutions` sin ningún cambio, y
 * las entradas sin PDF en este mapa no muestran ningún botón adicional.
 *
 * Para incorporar el PDF original de otra resolución basta con:
 *  1) Copiar el archivo intacto a public/legal/ con nombre descriptivo.
 *  2) Añadir una entrada a este mapa (clave `${number}/${year}`).
 */

export const LEGAL_RESOLUTION_PDFS: Record<string, string> = {
  // Resolución No. 11/2007 MFP — Subsistema de Inventarios.
  // Documento oficial: Gaceta Oficial No. 015 Ordinaria de 12 de febrero de
  // 2007 (págs. 246–252), que incluye el Anexo Único con los modelos
  // SC-2-01 … SC-2-019 (entre ellos el SC-2-04 «Informe de Recepción»).
  '11/2007': '/legal/resolucion-11-2007-mfp-gaceta-015-2007.pdf',
};

/** Ruta del PDF original de una resolución, si está disponible. */
export function getResolutionPdfUrl(
  number: string | number | null | undefined,
  year: string | number | null | undefined,
): string | null {
  if (number == null || year == null) return null;
  return LEGAL_RESOLUTION_PDFS[`${number}/${year}`] || null;
}
