import type { jsPDF } from 'jspdf';

/**
 * Creates a new jsPDF document.
 * In the browser, jspdf-autotable will automatically register itself.
 *
 * PERF-AUDIT (2026-10-11): los imports de jspdf/jspdf-autotable se movieron dentro
 * de la función. Antes eran estáticos a nivel de módulo, por lo que cualquier
 * consumidor de este módulo (POSCart, SalesCatalog, CashReportModal, IPV, etc.)
 * arrastraba ~600KB de librerías PDF al abrir la vista, aunque nunca exportara.
 * Ahora los chunks de jspdf solo se descargan en el primer uso real (clic en
 * exportar). El contrato no cambia: la función ya era async y devuelve el doc.
 * Consumidores server-side (API routes) siguen funcionando: el import() dinámico
 * también es válido en Node.
 */
export async function createPDFDocument(
  orientation?: 'p' | 'l' | 'portrait' | 'landscape',
  unit?: 'pt' | 'px' | 'in' | 'mm' | 'cm' | 'ex' | 'em' | 'pc',
  format?: string | number[],
) {
  const [{ jsPDF: JsPDF }] = await Promise.all([import('jspdf')]);
  return new JsPDF(orientation, unit, format) as jsPDF;
}
