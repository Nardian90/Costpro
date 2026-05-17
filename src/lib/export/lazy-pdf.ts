import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Creates a new jsPDF document.
 * In the browser, jspdf-autotable will automatically register itself.
 */
export async function createPDFDocument(
  orientation?: 'p' | 'l' | 'portrait' | 'landscape',
  unit?: 'pt' | 'px' | 'in' | 'mm' | 'cm' | 'ex' | 'em' | 'pc',
  format?: string | number[],
) {
  return new jsPDF(orientation, unit, format);
}
