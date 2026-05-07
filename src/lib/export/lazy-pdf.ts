
/**
 * Loads jsPDF and autoTable only when needed for export.
 * Eliminates ~300KB from the initial client bundle.
 */
export async function createPDFDocument(
  orientation?: 'p' | 'l' | 'portrait' | 'landscape',
  unit?: 'pt' | 'px' | 'in' | 'mm' | 'cm' | 'ex' | 'em' | 'pc',
  format?: string | number[],
) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  return new jsPDF(orientation, unit, format);
}
