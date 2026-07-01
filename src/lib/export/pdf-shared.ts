import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Decimal from 'decimal.js';

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
export const BLK = [0, 0, 0] as [number, number, number];           // Black
export const WHT = [255, 255, 255] as [number, number, number];     // White
export const LGR = [235, 235, 235] as [number, number, number];     // Light gray (general)

// ── Ejecutivo B&W constants (shared) ──
export const E_BLK = [0, 0, 0] as [number, number, number];
export const E_DGR = [60, 60, 60] as [number, number, number];
export const E_MGR = [120, 120, 120] as [number, number, number];
export const E_LGR = [235, 235, 235] as [number, number, number];

// ── ISO 4217 Valid Currency Codes ──
const ISO_4217 = new Set([
  'USD','EUR','GBP','JPY','CUP','CNY','CAD','AUD','CHF','MXN','BRL','ARS','COP','CLP','PEN',
  'VES','UYU','PYG','BOB','DOP','GTQ','HNL','NIO','SVC','PAB','CRC','NIO','JPY','KRW','INR',
  'RUB','TRY','ZAR','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN','HRK','RSD','UAH','GEL',
  'AED','SAR','QAR','BHD','OMR','KWD','JOD','ILS','LBP','EGP','MAD','TND','DZD','NGN','KES',
  'TZS','UGX','ETB','XAF','XOF','PHP','MYR','THB','IDR','SGD','HKD','TWD','NZD','MLC',
]);

/** Validate a currency code against ISO 4217 */
export function isValidCurrency(code: string): boolean {
  return ISO_4217.has((code || '').toUpperCase().trim());
}

// ── Currency Conversion Context ──
export interface ConversionCtx {
  active: boolean;           // Whether conversion is enabled
  rate: number;              // Exchange rate (1 target = N base)
  targetCurrency: string;    // Target currency code (e.g. "USD")
  baseCurrency: string;      // Base currency code (e.g. "CUP")
  rateDate: string;          // Date of the rate
  rateSource: string;        // Source of the rate
  rateType: string;          // Type of rate (Spot/Promedio/Cierre)
}

/**
 * Build conversion context from header data.
 * Returns null if no valid exchange rate is configured.
 */
export function getConversionCtx(header: Record<string, any>): ConversionCtx | null {
  const rate = parseFloat(String(header.exchangeRate || 0));
  const target = sanitizeText(header.targetCurrency || '').toUpperCase().trim();
  if (!rate || rate <= 0 || !target || !isValidCurrency(target)) return null;
  return {
    active: true,
    rate,
    targetCurrency: target,
    baseCurrency: sanitizeText(header.currency || 'CUP').toUpperCase().trim() || 'CUP',
    rateDate: sanitizeText(header.rateDate || '') || '',
    rateSource: sanitizeText(header.rateSource || '') || '',
    rateType: sanitizeText(header.rateType || 'Spot') || 'Spot',
  };
}

/**
 * Convert a value using decimal.js ROUND_HALF_UP for consistency with the cost engine.
 * Returns converted value, or original if no conversion context.
 */
export function convertValue(value: number, ctx: ConversionCtx | null, decimals = 2): number {
  if (!ctx || !ctx.active) return value;
  if (value === 0 || isNaN(value)) return 0;
  return new Decimal(value).div(ctx.rate).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

/** Get the display label for a unit of measure, converting to target currency if applicable */
export function convertUM(um: string, ctx: ConversionCtx | null): string {
  if (!ctx || !ctx.active) return um || '';
  // Replace base currency with target currency in UM
  const base = ctx.baseCurrency.toUpperCase();
  const target = ctx.targetCurrency;
  if (um && um.toUpperCase() === base) return target;
  return um || '';
}

/** Generate IAS 21.22 disclosure note text for PDF footers */
export function getConversionDisclosureNote(ctx: ConversionCtx): string {
  if (!ctx || !ctx.active) return '';
  let note = `CONVERSION REFERENCIAL: Valores convertidos de ${ctx.baseCurrency} a ${ctx.targetCurrency}`;
  note += ` (Tasa ${ctx.rateType}: 1 ${ctx.targetCurrency} = ${ctx.rate} ${ctx.baseCurrency}`;
  if (ctx.rateSource) note += `, Fuente: ${ctx.rateSource}`;
  if (ctx.rateDate) note += `, Fecha: ${ctx.rateDate}`;
  note += '). Los costos oficiales se expresan en la moneda base conforme a la Resolucion 148/2023 del MFP.';
  return note;
}

// ── Format-to-color map for annexes ──
// Each format uses its own theme color for annex headers and table styling,
// ensuring visual consistency with the main format body.
export const FORMAT_ANNEX_COLORS: Record<string, {
  headerText: [number, number, number];     // Annex title text color
  headFill: [number, number, number];       // Table header background
  headText: [number, number, number];       // Table header text color
  totalFill: [number, number, number];      // TOTAL row background
}> = {
  ejecutivo:     { headerText: E_DGR, headFill: E_LGR, headText: E_BLK, totalFill: E_LGR },
  contabilidad:  { headerText: TEAL, headFill: TEAL,  headText: [255,255,255], totalFill: [230, 245, 245] },
  auditoria:     { headerText: ORG,  headFill: ORG,   headText: [255,255,255], totalFill: [255, 240, 230] },
  bilingue:      { headerText: IND,  headFill: IND,   headText: [255,255,255], totalFill: LBL },
  comparativo:   { headerText: CYN,  headFill: CYN,   headText: [255,255,255], totalFill: [230, 250, 255] },
  exportacion:   { headerText: EMR,  headFill: EMR,   headText: [255,255,255], totalFill: [230, 250, 240] },
  pro:           { headerText: [40,40,40], headFill: [180,180,180], headText: [255,255,255], totalFill: GRY },
};

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

// ── Calculate section total from TOP-LEVEL rows only ──
// FIX: Do NOT recurse into children. A parent row's `total` already contains
// the computed sum of its children (e.g., row 1.1 total = 1.1.1 + 1.1.2 + …).
// Recursing would double-count: parent value + each child value.
export function calcSectionTotal(section: any, calculatedValues: Record<string, any>): number {
  let total = 0;
  (section.rows || []).forEach((r: any) => {
    const c = calculatedValues[r.id] || {};
    const t = parseFloat(String(c.total ?? 0));
    if (!isNaN(t)) total += t;
  });
  return total;
}

// ── Calculate section VH (Valor Histórico) from TOP-LEVEL rows only ──
// Same logic as calcSectionTotal but for the calculatedVH / valorHistorico column.
export function calcSectionTotalVH(section: any, calculatedValues: Record<string, any>): number {
  let total = 0;
  (section.rows || []).forEach((r: any) => {
    const c = calculatedValues[r.id] || {};
    const vh = parseFloat(String(c.calculatedVH ?? c.valorHistorico ?? 0));
    if (!isNaN(vh)) total += vh;
  });
  return total;
}

// ── Check if a section is the Utilidad section (Section 13) ──
// Section 13 contains independent summary items (Utilidad, Precio Venta, etc.)
// that must NOT be summed together. Each row is its own metric.
export function isUtilidadSection(section: any): boolean {
  const id = String(section.id || '').trim();
  const label = String(section.label || '').toLowerCase();
  // Match section id "13", "13.x", "Sección 13", "13 Utilidad", etc.
  return id === '13' || /^13[.\-]/.test(id) ||
         /^secci[oó]n?\s*13/.test(label) ||
         /^13\s/.test(label);
}

// ── Expand a section's rows as individual items (for Section 13) ──
// Returns an array of { id, label, total } for each top-level row in the section.
export function expandSectionRows(section: any, calculatedValues: Record<string, any>): { id: string; label: string; total: number }[] {
  const items: { id: string; label: string; total: number }[] = [];
  const walk = (rows: any[]) => {
    rows.forEach((r: any) => {
      const c = calculatedValues[r.id] || {};
      const t = parseFloat(String(c.total ?? 0));
      items.push({ id: String(r.id || ''), label: String(r.label || r.id || ''), total: isNaN(t) ? 0 : t });
      if (r.children) walk(r.children);
    });
  };
  walk(section.rows || []);
  return items;
}

// ── Calculate % Utilidad = 13.1 / 14.1 * 100 (rentabilidad / profit margin) ──
// Uses Precio Venta as denominator, NOT Costo Total.
// Falls back to calculatedHeader if available.
export function calcUtilidadPercent(calculatedValues: Record<string, any>, calculatedHeader?: any): number {
  const fromHeader = parseFloat(String(calculatedHeader?.utilityPercent || calculatedHeader?.porcentajeUtilidad || 0));
  if (fromHeader > 0) return fromHeader;
  const pv = parseFloat(String(calculatedValues?.['14.1']?.total || calculatedValues?.['14']?.total || 0));
  const util = parseFloat(String(calculatedValues?.['13.1']?.total || calculatedValues?.['13']?.total || 0));
  return pv > 0 ? (util / pv) * 100 : 0;
}

// ── Get cost base from Section 12 (TOTAL COSTOS Y GASTOS) ──
// Section 12 is the definitive total of all cost sections. It should be used as
// the denominator for % Costo calculations, NOT the sum of all sections
// (which double-counts Section 12 since it already contains the sum of 1-11).
export function getCostBase(sections: any[], calculatedValues: Record<string, any>, calculatedHeader?: any): number {
  // Priority 1: pre-computed in header
  const fromHeader = parseFloat(String(calculatedHeader?.totalCost || calculatedHeader?.costoTotal || 0));
  if (fromHeader > 0) return fromHeader;

  // Priority 2: calculatedValues row 12.1 or 12 (formula engine result)
  const fromCV = parseFloat(String(calculatedValues?.['12.1']?.total || calculatedValues?.['12']?.total || 0));
  if (fromCV > 0) return fromCV;

  // Priority 3: Find Section 12 in sections array by id
  const sec12 = sections.find((s: any) => {
    const id = String(s.id || '').trim();
    return id === '12' || /^12[.\-]/.test(id);
  });
  if (sec12) {
    const fromSection = calcSectionTotal(sec12, calculatedValues);
    if (fromSection > 0) return fromSection;
  }

  // Priority 4: Fall back to sum of all non-utilidad sections (legacy)
  return sections.reduce((sum: number, s: any) => {
    if (isUtilidadSection(s)) return sum;
    return sum + calcSectionTotal(s, calculatedValues);
  }, 0);
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
  // FIX: Signature text goes at y+4 and y+8. Footer is at pageHeight-8.
  // Need y+8 < pageHeight-10 (2px margin) → y < pageHeight-18, use 20 for safety.
  if (y > pageHeight - 20) {
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

// ── Unified DATOS GENERALES table ──
// Used by ALL 10 PDF format templates. Same 5-column grid layout everywhere.
// Only colors, borders, fonts vary via theme parameter.
export interface GeneralDataTheme {
  hdrFill: [number, number, number];           // Title bar background
  hdrText: [number, number, number];           // Title bar text
  fcFill: [number, number, number];            // FC badge background
  fcText: [number, number, number];            // FC badge text
  fieldText: [number, number, number];         // Normal field text
  labelText: [number, number, number];        // Label text (bold portion) — defaults to same as fieldText if not provided
  tableTheme: 'plain' | 'grid' | 'striped';   // autoTable theme
  tableLineColor?: [number, number, number];   // Border color for 'grid'
  tableLineWidth?: number;                     // Border width for 'grid'
  priceFill: [number, number, number];         // PRECIO row background
  priceText: [number, number, number];         // PRECIO row text
  showFC?: boolean;                            // Show FC badge (default: true)
}

const DEFAULT_THEME: GeneralDataTheme = {
  hdrFill: LGR, hdrText: BLK,
  fcFill: WHT, fcText: BLK,
  fieldText: [30, 30, 30],
  labelText: [60, 60, 60],
  tableTheme: 'plain',
  priceFill: LGR, priceText: BLK,
};

export function addGeneralDataTable(
  doc: jsPDF,
  header: any,
  calculatedValues: Record<string, any>,
  y: number,
  pageWidth: number,
  theme: Partial<GeneralDataTheme> = {},
): number {
  const t = { ...DEFAULT_THEME, ...theme };
  const cc = getConversionCtx(header);
  const precio = calculatedValues?.['14.1']?.total ?? calculatedValues?.['14']?.total ?? 0;
  const precioDisplay = cc ? convertValue(precio, cc) : precio;
  const moneda = cc ? cc.targetCurrency : sanitizeText(header.currency || 'CUP');

  const lv = (label: string, value: string | number, extra?: any) => ({
    content: `${label}: ${value}`,
    styles: { fontSize: 6.5, cellPadding: 1.8, textColor: [...t.fieldText], ...extra },
  });

  const hdrStyle = { fontStyle: 'bold', fontSize: 8, halign: 'center', fillColor: t.hdrFill, textColor: [...t.hdrText], cellPadding: 2 };
  const fcStyle = { fontStyle: 'bold', fontSize: 18, halign: 'center', valign: 'middle', fillColor: t.fcFill, textColor: [...t.fcText], cellPadding: 4 };

  // Build rows: base 6 rows + optional conversion info row
  const baseRows: any[][] = [
    [{ content: 'DATOS GENERALES', colSpan: 5, styles: hdrStyle }],
    [
      ...(t.showFC !== false ? [{ content: 'FC', rowSpan: 4, styles: fcStyle }] : []),
      lv('Organismo', sanitizeText(header.organism || header.organismo || '-')),
      lv('Union', sanitizeText(header.union || '-')),
      { ...lv('Cod. Empresa', sanitizeText(header.codigoEmpresa || header.code || '-')), colSpan: t.showFC !== false ? 2 : 3 },
    ],
    [
      { ...lv('Empresa', sanitizeText(header.company || header.empresa || '-')), colSpan: 2 },
      { ...lv('Cliente', sanitizeText(header.client || header.clientePrincipal || '-')), colSpan: 2 },
    ],
    [
      lv('ID', sanitizeText(header.code || header.id || '-')),
      lv('Cod. Prod', sanitizeText(header.product_code || header.code || '-')),
      { ...lv('Producto', sanitizeText(header.name || 'S/N')), colSpan: 2 },
    ],
    [
      lv('Nivel Prod.', sanitizeText(header.production_level || header.nivelProduccion || '1')),
      lv('UM', sanitizeText(header.unit || header.um || 'U')),
      lv('Cantidad', sanitizeText(header.quantity || header.cantidadBase || '1')),
      lv('Resolucion', sanitizeText(header.resolution || 'Res 148/2023')),
    ],
    [
      lv('% Util. Cap.', sanitizeText(header.capacity_utilization || header.capacidadInstalada || '100')),
      lv('Destino', sanitizeText(header.destination || header.destinoProduccion || 'Ventas')),
      lv('Tipo Costo', sanitizeText(header.type || header.tipoCosto || 'EMPRESA')),
      lv('Categoria', sanitizeText(header.category || header.categoriaProducto || 'General')),
      lv('Moneda', moneda),
    ],
    // Conversion info row (only if active)
    ...(cc ? [[
      { ...lv(`Tasa (${cc.targetCurrency})`, `1 ${cc.targetCurrency} = ${safeLocale(cc.rate)} ${cc.baseCurrency}  [${cc.rateType}${cc.rateSource ? `, ${cc.rateSource}` : ''}${cc.rateDate ? `, ${cc.rateDate}` : ''}]`), colSpan: 5, styles: { fontSize: 5.5, cellPadding: 1, textColor: [100, 100, 100], fontStyle: 'italic' } },
    ]] : []),
    [
      { content: 'PRECIO', colSpan: 4, styles: { fontStyle: 'bold', fontSize: 9, halign: 'right', fillColor: t.priceFill, textColor: [...t.priceText], cellPadding: 2 } },
      { content: `${safeLocale(precioDisplay)} ${moneda}`, styles: { fontStyle: 'bold', fontSize: 9, halign: 'left', fillColor: t.priceFill, textColor: [...t.priceText], cellPadding: 2 } },
    ],
  ];

  autoTable(doc, {
    startY: y,
    body: baseRows,
    theme: t.tableTheme,
    styles: {
      fontSize: 6.5,
      cellPadding: 1.8,
      lineColor: t.tableLineColor || [200, 200, 200],
      lineWidth: t.tableLineWidth ?? 0.3,
      textColor: [...t.fieldText],
    },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 'auto' }, 4: { cellWidth: 'auto' } },
    margin: { left: 14, right: 14 },
  });

  return (doc as any).lastAutoTable.finalY + 4;
}

// Adds the general data block with ALL header fields from templates (legacy — kept for compatibility)
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
