import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Color constants ──
export const PG = [21, 128, 61] as [number, number, number];       // CostPro green
export const BLU = [21, 68, 128] as [number, number, number];      // Official blue
export const LBL = [230, 243, 255] as [number, number, number];    // Light blue bg (Res 148)
export const GRY = [245, 245, 245] as [number, number, number];    // Light gray alt rows
export const RED = [185, 28, 28] as [number, number, number];      // Red for warnings
export const AMB = [217, 119, 6] as [number, number, number];      // Amber for caution
export const TEAL = [0, 110, 120] as [number, number, number];     // Teal for accounting
export const ORG = [200, 100, 0] as [number, number, number];      // Orange for audit
export const IND = [50, 50, 150] as [number, number, number];      // Indigo for bilingual
export const CYN = [0, 140, 180] as [number, number, number];      // Cyan for scenarios
export const EMR = [0, 120, 80] as [number, number, number];       // Emerald for export

// ── Sanitize text for jsPDF — CRITICAL: prevents %Ï rendering bug ──
// jsPDF's built-in Helvetica font only supports WinAnsiEncoding (basically Latin-1).
// Any character outside this range (e.g., \u25CF ●, \u2022 •, \u00A7 §, \u2192 →)
// will render as garbled text like "%Ï" or be skipped entirely.
// This function strips or replaces such characters BEFORE passing to doc.text().
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    // Remove common Unicode bullets/symbols that jsPDF Helvetica cannot render
    .replace(/[\u25CF\u2022\u25CB\u25AA\u25AB\u2023\u2043\u2219]/g, '')  // ● • ○ ▪ ▫ ‣ ⁃ ∙
    .replace(/[\u00A7\u00B6]/g, '')                                         // § ¶
    .replace(/[\u2190\u2192\u2191\u2193]/g, '')                             // ← → ↑ ↓
    .replace(/[\u2713\u2714\u2717\u2718]/g, '')                             // ✓ ✔ ✗ ✘
    .replace(/[\u271A\u271B\u271C]/g, '')                                   // ✚ ✛ ✜
    .replace(/[\u2605\u2606\u2726\u2727]/g, '')                             // ★ ☆ ✦ ✧
    .replace(/[\u2728\u2705\u274C\u26A0]/g, '')                             // ✅ ❌ ⚠
    .replace(/[\u00B0\u2103\u2109]/g, (m) => m === '\u00B0' ? 'o' : '')    // ° ℃ ℉
    .replace(/[\u2018\u2019]/g, "'")                                         // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"')                                         // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-')                                         // En/em dashes
    .replace(/[\u00AB\u00BB]/g, '')                                          // « »
    .replace(/[\u2264\u2265\u2260]/g, (m) => m === '\u2264' ? '<=' : m === '\u2265' ? '>=' : '!=')
    .replace(/[\u00B1]/g, '+/-')                                             // ±
    .replace(/[\u2211\u220F]/g, '')                                          // Σ Π
    .replace(/[\u00BD\u2153\u2154]/g, (m) => m === '\u00BD' ? '1/2' : m === '\u2153' ? '1/3' : '2/3')
    // FIX: Remove control characters (x00-x08, x0B, x0E-x1F, x7F) that are invisible
    // but can cause rendering glitches or be interpreted as binary data by jsPDF
    .replace(/[\x00-\x08\x0B\x0E-\x1F\x7F]/g, '')
    // Catch-all: remove any remaining non-WinAnsi characters (keep Latin-1 + common)
    .replace(/[^\x09\x0A\x0D\x20-\xFF\u20AC]/g, '')  // Keep tab, LF, CR + printable Latin-1 + €
    .trim();
}

// ── Translation map for bilingue format ──
// FIX: Expanded coverage with common cost sheet labels
export const ES_TO_EN: Record<string, string> = {
  'Gasto Material': 'Material Expense',
  'Materias primas': 'Raw Materials',
  'Materias Primas': 'Raw Materials',
  'Insumos': 'Inputs',
  'Combustibles': 'Fuels',
  'Energía': 'Energy',
  'Energia': 'Energy',
  'Salario Directo': 'Direct Labor',
  'Salario directo': 'Direct Labor',
  'Salarios': 'Wages',
  'Vacaciones': 'Vacation Pay',
  'Otros Gastos Directos': 'Other Direct Costs',
  'Otros gastos directos': 'Other Direct Costs',
  'Reparaciones': 'Repairs',
  'Depreciación': 'Depreciation',
  'Depreciacion': 'Depreciation',
  'Alquiler': 'Rent',
  'Alimentación': 'Meals',
  'Alimentacion': 'Meals',
  'Transportación': 'Transportation',
  'Transportacion': 'Transportation',
  'Gastos Asociados': 'Associated Costs',
  'Gastos asociados': 'Associated Costs',
  'Gastos Generales y de Administración': 'General & Admin Expenses',
  'Gastos generales y de administracion': 'General & Admin Expenses',
  'Gastos Generales': 'General Expenses',
  'Gastos de Distribución y Venta': 'Distribution & Sales Expenses',
  'Gastos de distribucion y venta': 'Distribution & Sales Expenses',
  'Gastos de Distribución': 'Distribution Expenses',
  'Gastos Financieros': 'Financial Expenses',
  'Gasto por Financiamiento Entregado al OSDE': 'OSDE Financing Expense',
  'Gastos Tributarios': 'Tax Expenses',
  'Seguridad Social': 'Social Security',
  'Impuesto': 'Tax',
  'Utilidad': 'Profit',
  'Precio': 'Price',
  'Costo Total': 'Total Cost',
  'Valor Histórico': 'Historical Value',
  'Valor Historico': 'Historical Value',
  'Concepto': 'Concept',
  'Combustibles y lubricantes': 'Fuels and Lubricants',
  'Agua': 'Water',
  'Unidad de Medida': 'Unit of Measure',
  'Cantidad': 'Quantity',
  'Código': 'Code',
  'Codigo': 'Code',
  'COSTO TOTAL': 'TOTAL COST',
  'TOTAL DE GASTOS': 'TOTAL EXPENSES',
  'TOTAL DE COSTOS Y GASTOS': 'TOTAL COSTS AND EXPENSES',
  'Precio o Tarifa': 'Price or Tariff',
  'Imp 10% s/ Ventas y Servicios': '10% Tax on Sales & Services',
  'Datos sobre precios de referencia': 'Reference Price Data',
  'Amortización': 'Amortization',
  'Amortizacion': 'Amortization',
  'Seguros': 'Insurance',
  'Servicios Técnicos': 'Technical Services',
  'Servicios tecnicos': 'Technical Services',
  'Pérdidas': 'Losses',
  'Perdidas': 'Losses',
  'Otros Gastos': 'Other Expenses',
  'Gasto de Personal': 'Personnel Expense',
  'Fuerza de Trabajo': 'Workforce',
  'Materiales Directos': 'Direct Materials',
  'Gastos Indirectos': 'Indirect Expenses',
  'Gastos de Fabricación': 'Manufacturing Expenses',
  'Gastos de fabricacion': 'Manufacturing Expenses',
  'Costo de Producción': 'Production Cost',
  'Costo de produccion': 'Production Cost',
  'Producto Terminado': 'Finished Product',
  'Producto en Proceso': 'Work in Progress',
  'Subproducto': 'By-product',
  'Merma': 'Shrinkage',
  'Desperdicio': 'Waste',
  'Recuperación': 'Recovery',
  'Recuperacion': 'Recovery',
};

export function translateLabel(label: string): string {
  if (!label) return '';
  for (const [es, en] of Object.entries(ES_TO_EN)) {
    if (label.toLowerCase().includes(es.toLowerCase())) return en;
  }
  return label;
}

export function safeLocale(val: number | string | undefined, decimals = 2): string {
  if (val === undefined || val === null || val === '') return '0.00';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Returns '-' for zero/empty, locale string otherwise — matches Res 148/2023 convention
export function fmtCell(val: any): string {
  const n = parseFloat(String(val));
  if (isNaN(n) || n === 0) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Returns formatted number with 4 decimal places (for contabilidad format)
export function fmtCell4(val: any): string {
  const n = parseFloat(String(val));
  if (isNaN(n) || n === 0) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// Checks if a row should be skipped (when skipZeros === true)
export function shouldSkip(row: any, calculatedValues: Record<string, any>, skipZeros: boolean): boolean {
  if (!skipZeros) return false;
  const c = calculatedValues[row.id] || {};
  // FIX: Also check calculatedVH — rows with vhFormula may have valorHistorico=0 but
  // calculatedVH > 0 (e.g. "10.1 - Contrib. Seg. Social"). Using calculatedVH prevents
  // incorrectly skipping rows that display values on the web but would be hidden in PDF.
  const vh = parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0));
  return (parseFloat(String(c.total ?? 0)) === 0) && (vh === 0);
}

// ── Calculate section total from rows ──
// FIX: Always add valid numbers (including zero) to avoid NaN propagation
// and ensure subtotals match visible table content.
export function calcSectionTotal(section: any, calculatedValues: Record<string, any>): number {
  let total = 0;
  const walk = (rows: any[]) => {
    rows.forEach((r: any) => {
      const c = calculatedValues[r.id] || {};
      const t = parseFloat(String(c.total ?? 0));
      if (!isNaN(t)) total += t;   // Include zero; guard against NaN
      if (r.children) walk(r.children);
    });
  };
  walk(section.rows || []);
  return total;
}

// ── Adds page number footer to all pages ──
export function addPageNumbers(doc: jsPDF, pageWidth: number, pageHeight: number, formatLabel: string = 'CostPro') {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140);
    doc.text(`Pag. ${i}/${pageCount}`, pageWidth / 2, pageHeight - 4, { align: 'center' });
  }
}

// ── Adds signature block ──
export function addSignatureBlock(doc: jsPDF, y: number, pageWidth: number, pageHeight: number, preparedBy?: string, approvedBy?: string): number {
  if (y > pageHeight - 35) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  const sigY = y + 4;
  const third = (pageWidth - 28) / 3;
  doc.text('Elaborado por: _______________________', 14, sigY);
  doc.text('Revisado por: _______________________', 14 + third, sigY);
  doc.text('Aprobado por: _______________________', 14 + third * 2, sigY);
  doc.setFontSize(6);
  doc.setTextColor(120);
  if (preparedBy) doc.text(preparedBy, 38, sigY + 4);
  if (approvedBy) doc.text(approvedBy, 14 + third * 2 + 24, sigY + 4);
  return sigY + 10;
}

// Adds the Res 148/2023 standard footer to every page
export function addRes148Footer(doc: jsPDF, pageWidth: number) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.height;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    doc.text(
      'FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS PARA LA EVALUACION DE PRECIOS Y TARIFAS (RES 148/2023)',
      pageWidth / 2, ph - 8, { align: 'center' }
    );
    doc.text('MINISTERIO DE FINANZAS Y PRECIOS', pageWidth / 2, ph - 4, { align: 'center' });
  }
}

// ── Draw a rounded KPI box ──
export function drawKPIBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + w / 2, y + h * 0.35, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + w / 2, y + h * 0.72, { align: 'center' });
}

// ── Draw horizontal bar ──
export function drawBar(doc: jsPDF, x: number, y: number, width: number, height: number, color: [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.roundedRect(x, y, width, height, 1, 1, 'F');
}

// ── Add TOTAL row to annex table data ──
// Accepts optional raw numeric data for precise summation.
// When rawData is provided, sums from raw numbers (no formatting precision loss).
// Falls back to string parsing when rawData is not available.
// onlyLastNumeric: when true, only the LAST numeric column is totaled (Res 148 annexes
// where summing norms/unit-prices is meaningless — only Total/Importe should be summed).
export function addAnnexTotalRow(
  tableData: string[][],
  columns: any[],
  rawData?: any[],           // raw annex rows for precise numeric summation
  decimals: number = 2,      // decimal places for the total row
  onlyLastNumeric: boolean = false  // only total the last numeric column
): string[][] {
  const fmtFn = decimals === 4 ? fmtCell4 : fmtCell;

  // Determine which column indices are numeric
  const numericColIndices: number[] = [];
  columns.forEach((c: any, colIdx: number) => {
    const colKey = c.key || c.id;
    if (rawData && rawData.length > 0) {
      if (rawData.some((r: any) => typeof r[colKey] === 'number')) {
        numericColIndices.push(colIdx);
      }
    } else {
      const isNumeric = tableData.some((row: string[]) => {
        const cell = row[colIdx];
        return cell !== '-' && cell !== '' && !isNaN(parseFloat(String(cell).replace(/,/g, '')));
      });
      if (isNumeric) numericColIndices.push(colIdx);
    }
  });

  // If onlyLastNumeric, only total the last numeric column (e.g. Total/Importe)
  const colsToTotal = onlyLastNumeric
    ? (numericColIndices.length > 0 ? [numericColIndices[numericColIndices.length - 1]] : [])
    : numericColIndices;

  const totalRow = columns.map((c: any, colIdx: number) => {
    if (colIdx === 0) return 'TOTAL';
    if (!colsToTotal.includes(colIdx)) return '';

    const colKey = c.key || c.id;

    // Prefer raw numeric summation when rawData is available
    if (rawData && rawData.length > 0) {
      const sum = rawData.reduce((acc: number, r: any) => {
        const v = r[colKey];
        return acc + (typeof v === 'number' ? v : 0);
      }, 0);
      return fmtFn(sum);
    }

    // Fallback: parse formatted strings (may lose precision with 4+ decimals)
    const sum = tableData.reduce((acc: number, row: string[]) => {
      const cell = row[colIdx];
      const val = parseFloat(String(cell).replace(/,/g, ''));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
    return fmtFn(sum);
  });
  tableData.push(totalRow);
  return tableData;
}

// Adds the general data block with ALL header fields from templates
export function addGeneralDataFull(doc: any, header: any, y: number, pageWidth: number, isBilingual: boolean = false): number {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);

  const L = isBilingual
    ? (es: string, en: string) => `${es} / ${en}:`
    : (es: string, _en: string) => `${es}:`;

  const leftX = 14;
  const rightX = pageWidth / 2 + 2;

  const fields: [string, string, any][] = [
    [L('Resolucion', 'Resolution'), 'resolution', header.resolution || 'Res 148/2023'],
    [L('Codigo', 'Code'), 'code', header.code || '-'],
    [L('Nombre Comercial', 'Commercial Name'), 'name', sanitizeText(header.name) || 'S/N'],
    [L('Unidad de Medida', 'Unit of Measure'), 'unit', header.unit || header.um || 'U'],
    [L('Cantidad Base', 'Base Quantity'), 'quantity', header.quantity || '1'],
    [L('Nivel de Produccion', 'Production Level'), 'production_level', header.production_level || header.nivelProduccion || '1'],
    [L('Moneda', 'Currency'), 'currency', header.currency || 'CUP'],
    [L('% Capacidad Instalada', 'Capacity Utilization'), 'capacity_utilization', header.capacity_utilization || header.capacidadInstalada || '100'],
  ];

  fields.forEach(([label, _key, value], i) => {
    const x = i % 2 === 0 ? leftX : rightX;
    const yy = y + Math.floor(i / 2) * 5;
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizeText(label)!, x, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeText(String(value))!, x + doc.getTextWidth(sanitizeText(label)!) + 2, yy);
  });
  y += Math.ceil(fields.length / 2) * 5;

  // Second block: organizational fields
  const orgFields: [string, string, any][] = [
    [L('Empresa', 'Company'), 'company', header.company || header.empresa || '-'],
    [L('Organismo', 'Organism'), 'organism', header.organism || header.organismo || '-'],
    [L('Union', 'Union'), 'union', header.union || '-'],
    [L('Destino de Produccion', 'Production Destination'), 'destination', header.destination || header.destinoProduccion || 'Servicios'],
    [L('Cliente Principal', 'Main Client'), 'client', header.client || header.clientePrincipal || '-'],
    [L('Categoria de Producto', 'Product Category'), 'category', header.category || header.categoriaProducto || 'General'],
    [L('Tipo de Costo', 'Cost Type'), 'type', header.type || header.tipoCosto || 'EMPRESA'],
    [L('Precio de Venta Sugerido', 'Suggested Sale Price'), 'sale_price', header.sale_price || header.precioVentaSugerido || '0'],
  ];

  orgFields.forEach(([label, _key, value], i) => {
    const x = i % 2 === 0 ? leftX : rightX;
    const yy = y + Math.floor(i / 2) * 5;
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizeText(label)!, x, yy);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeText(String(value))!, x + doc.getTextWidth(sanitizeText(label)!) + 2, yy);
  });
  y += Math.ceil(orgFields.length / 2) * 5 + 4;

  return y;
}

// FIX: Removed unused addGeneralData() — all formats use addGeneralDataFull() instead.
// The legacy simple version was dead code with no callers.

// ── Shared context type for format modules ──
export interface FormatContext {
  doc: jsPDF;
  body: any;
  header: any;
  sections: any[];
  calculatedValues: Record<string, any>;
  calculatedHeader: any;
  calculationResult: any;
  annexes: any[];
  exportOptions: any;
  pdfFormat: string;
  skipZeros: boolean;
  includeAudit: boolean;
  showDateTime: boolean;
  includeUtilityNote: boolean;
  logo?: string;
  includedAnnexIds?: string[];
  pageWidth: number;
  pageHeight: number;
}
