/**
 * cash-report-docx.ts — Exportación Word (.docx) del Reporte de Entrega.
 *
 * MISIÓN WORD (2026-10-27): tercera opción de exportación del Reporte Entrega
 * (junto a PDF y Excel). El documento reproduce la estructura y apariencia del
 * PDF que se previsualiza (fuente de verdad visual), dentro de las capacidades
 * reales del formato OOXML/Word:
 *
 *  · MISMA fuente de datos y parámetros que el PDF: consume el MISMO
 *    CashReportPdfContext (reporte APLICADO + ajuste de selección + conceptos)
 *    y los mismos summaries (fetchDiarioSummaries / fetchEstandarSummaries) —
 *    cero segundas lógicas de consulta o cálculo (computeDailySummary /
 *    computeCustomResultsForPdf / salesTable* / fetchSuggestedCommissionsByProduct
 *    / buildDiarioIncomeRows / buildEstandarSummaryRows compartidos con el PDF).
 *  · ESPEJO ESTRUCTURAL DEL PDF (plantillas diario y estándar/simple):
 *    encabezado con tienda + título + período, «Resumen del Día» y «Desglose
 *    de efectivo» lado a lado, caja «Efectivo esperado a entregar», pie de
 *    firmas de 3 columnas, línea de corte entre secciones, tabla de ventas
 *    con marco y ENCABEZADO REPETIDO entre páginas (tblHeader), anexo de
 *    auditoría (comparación por concepto + conciliación) y reporte de
 *    Órdenes de Trabajo.
 *  · FORMATOS numéricos idénticos a los del PDF POR PLANTILLA (Diario:
 *    es-ES / en-US sin símbolo; Estándar: formatCurrency / formatUsd).
 *    CUP y USD JAMÁS se suman entre sí; sin redondeos ni conversiones.
 *  · DOCUMENTO AUTÉNTICO Y EDITABLE: texto y tablas de Word reales (OOXML),
 *    no HTML renombrado ni imágenes rasterizadas. El logotipo (si existe) se
 *    incrusta como imagen — recurso gráfico legítimo del reporte.
 *  · LIBRERÍA: `docx` ya presente en el stack (misma que usa el Informe de
 *    Costo) — sin dependencias nuevas. Generación en cliente (patrón del
 *    PDF/Excel), sin secretos ni endpoints adicionales.
 *
 * Limitaciones documentadas del formato Word frente al PDF (§4 del brief):
 *  · El nombre de tienda largo se AJUSTA (wrap) en vez de reducir la fuente.
 *  · Las descripciones de producto se AJUSTAN a varias líneas en vez de
 *    truncarse con «…» (mejora de integridad; el PDF trunca por ancho fijo).
 *  · La flecha del período es el carácter '→' real (Word es Unicode nativo;
 *    el PDF la dibuja vectorial por la limitación WinAnsi de jsPDF).
 *  · El pie de página no puede variar POR PÁGINA dentro de una misma sección
 *    de Word: se usa una sección de Word por bloque lógico (CUP / USD /
 *    Auditoría / Órdenes) con su etiqueta — equivalente al pie dinámico del
 *    PDF a nivel de bloque.
 */

import {
  AlignmentType, BorderStyle, Document, Footer, HeightRule, ImageRun,
  PageBreak, PageNumber, PageOrientation, Packer, Paragraph, SectionType,
  ShadingType, Table, TableCell, TableRow, TableLayoutType, TextRun,
  VerticalAlign, WidthType, type ISectionOptions,
} from 'docx';
import { formatCurrency } from '@/lib/utils';
import {
  buildDiarioIncomeRows, buildEstandarSummaryRows, computeCustomResultsForPdf,
  fetchDetailRows, fetchDiarioSummaries, fetchEstandarSummaries,
  fetchSuggestedCommissionsByProduct, methodLabel, reportIdentificationLabel,
  salesTableColumns, salesTableItems, salesTableQty,
  type CashReportPdfContext, type CashReportPdfOptions, type CashReportSummaries,
  type ConceptTaggedRow,
} from './cash-report-pdf';
import { breakdownTotal, formatUsd, type Breakdown, type Currency } from './cash-report-core';
import {
  computeCuadre, computeDailySummary, cuadreLabel, type DailySummary,
} from '@/lib/cash-report/summary';
import {
  auditStatusDefinition, auditStatusLabel, type CustomCurrencyResult,
} from '@/lib/cash-report/custom-result';
import {
  hasAnySummaryConcept, isDefaultSummaryConcepts,
  type SummaryConceptsSelection,
} from '@/lib/cash-report/report-selection';
import { denomLabel } from './cash-report-pdf';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES VISUALES — espejo del PDF (cash-report-pdf.ts)
// ═══════════════════════════════════════════════════════════════════════════

/** El PDF usa helvetica; Arial es su equivalente métrico disponible en Word. */
const FONT = 'Arial';

const C_DARK = '111827';    // [17, 24, 39]
const C_BLACK = '000000';
const C_MUTED = '6B7280';   // [107, 114, 128]
const C_BORDER = 'C8C8C8';  // [200, 200, 200]
const C_SUCCESS = '16A34A'; // [22, 163, 74]
const C_PRIMARY = '16A34A';
const C_DANGER = 'DC2626';  // [220, 38, 38]
const C_WARN = 'D97706';    // [217, 119, 6]
const C_INFO = '2563EB';    // [37, 99, 235]
const C_LIGHT = 'F3F4F6';   // [243, 244, 246]
const C_WHITE = 'FFFFFF';

/** twips por milímetro (1 mm = 56.6929 twips). */
const MM = 56.6929;
const mm = (n: number) => Math.round(n * MM);

/** Grosores de línea en octavos de punto (docx): 0.4mm≈9 · 0.8mm≈18 · 0.3mm≈7. */
const W_FRAME = 9;   // marco de tablas (PDF 0.4mm)
const W_BOX = 18;    // caja «Efectivo esperado» (PDF 0.8mm)
const W_THIN = 6;    // filetes finos (PDF 0.25-0.3mm)

// ── Formatos numéricos — IDÉNTICOS a los del PDF por plantilla ──
/** Diario: agrupación es-ES, sin símbolo (PDF fmtCup). */
const fmtCup = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
/** Diario USD: agrupación en-US, sin símbolo (PDF fmtUsdFmt). */
const fmtUsdFmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
/** Estándar CUP: formatCurrency es-CU con símbolo (PDF fmt). */
const fmtStd = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;

// ── Helpers de construcción OOXML ───────────────────────────────────────────

type RunOpts = { bold?: boolean; italics?: boolean; size?: number; color?: string };

const run = (text: string, o: RunOpts = {}): TextRun =>
  new TextRun({ text, font: FONT, size: o.size ?? 16, bold: o.bold, italics: o.italics, color: o.color ?? C_DARK });

const para = (children: TextRun[], o: {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number; after?: number; keepNext?: boolean;
  bottomBorder?: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string };
} = {}): Paragraph => new Paragraph({
  children,
  alignment: o.alignment,
  spacing: { before: o.before ?? 0, after: o.after ?? 40 },
  keepNext: o.keepNext,
  border: o.bottomBorder ? { bottom: o.bottomBorder } : undefined,
});

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const noBorders = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const tableNoBorders = { ...noBorders, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const line = (color = C_BLACK, size = W_FRAME, style: (typeof BorderStyle)[keyof typeof BorderStyle] = BorderStyle.SINGLE) =>
  ({ style, size, color });

interface CellOpts {
  width: number;                     // twips
  align?: 'left' | 'right' | 'center';
  bold?: boolean; italics?: boolean; size?: number; color?: string;
  shading?: string;
  borders?: { top?: ReturnType<typeof line>; bottom?: ReturnType<typeof line>; left?: ReturnType<typeof line>; right?: ReturnType<typeof line> };
  topBorderDouble?: boolean;
  bottomBorder?: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string };
  margins?: { top: number; bottom: number; left: number; right: number };
}

function cell(text: string | TextRun[], o: CellOpts): TableCell {
  const runs = Array.isArray(text)
    ? text
    : [run(String(text), { bold: o.bold, italics: o.italics, size: o.size, color: o.color })];
  const alignment = o.align === 'right' ? AlignmentType.RIGHT : o.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const borders: Record<string, unknown> = {};
  if (o.borders) Object.assign(borders, o.borders);
  if (o.bottomBorder) borders.bottom = o.bottomBorder;
  if (o.topBorderDouble) borders.top = line(C_BLACK, 6, BorderStyle.DOUBLE);
  return new TableCell({
    width: { size: o.width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: o.shading ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shading } : undefined,
    borders: Object.keys(borders).length > 0 ? borders : noBorders,
    margins: o.margins ?? { top: 20, bottom: 20, left: 50, right: 50 },
    children: [new Paragraph({
      children: runs,
      alignment,
      spacing: { before: 0, after: 0 },
    })],
  });
}

/** Tabla de Word con columnas fijas (layout FIXED — anchos deterministas). */
function table(
  rows: TableRow[],
  columnWidths: number[],
  opts: { borders?: Record<string, unknown>; width?: number } = {},
): Table {
  return new Table({
    rows,
    width: { size: opts.width ?? columnWidths.reduce((s, w) => s + w, 0), type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: (opts.borders ?? tableNoBorders) as never,
  });
}

const row = (cells: TableCell[], opts: { header?: boolean; cantSplit?: boolean; height?: number } = {}): TableRow =>
  new TableRow({
    children: cells,
    tableHeader: opts.header === true,
    cantSplit: opts.cantSplit !== false,
    height: opts.height ? { value: opts.height, rule: HeightRule.ATLEAST } : undefined,
  });

/** Anchos de columna desde proporciones (como el PDF) sobre un ancho total. */
const widthsFrom = (props: number[], total: number): number[] => {
  const raw = props.map(p => p * total);
  const fixed = raw.map(w => Math.floor(w));
  // El último absorbe el redondeo para que la suma sea exacta.
  fixed[fixed.length - 1] += total - fixed.reduce((s, w) => s + w, 0);
  return fixed;
};

/** dataURL del logo → { data, type } para ImageRun (docx exige tipo explícito). */
function logoDataUrlToImage(dataUrl: string, sizeMm: number): ImageRun | null {
  try {
    const [meta, b64] = dataUrl.split(',');
    if (!b64) return null;
    const mime = /data:image\/(png|jpe?g)/.exec(meta)?.[1] ?? 'png';
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) data[i] = bin.charCodeAt(i);
    const px = Math.round((sizeMm / 25.4) * 96); // mm → px @96dpi (API de docx)
    return new ImageRun({ type: mime === 'png' ? 'png' : 'jpg', data, transformation: { width: px, height: px } });
  } catch {
    return null;
  }
}

/** Descarga en el navegador (patrón del PDF y del Excel: acción explícita). */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Nombre de archivo descriptivo (misma convención del Excel, extensión .docx). */
export function cashReportWordFilename(storeName: string, startDate: string): string {
  const snFile = storeName.replace(/[^a-zA-Z0-9]+/g, '_');
  return `COSTPRO_Reporte_Entrega_${snFile}_${startDate}.docx`
    .replace(/[^a-zA-Z0-9._\-]+/g, '_');
}

// ═══════════════════════════════════════════════════════════════════════════
// DATOS COMPARTIDOS (misma fuente que PDF y Excel — misión §3.2)
// ═══════════════════════════════════════════════════════════════════════════

interface WordSharedData {
  sn: string;
  startDate: string;
  endDate: string;
  orientation: 'vertical' | 'horizontal';
  options: CashReportPdfOptions;
  itemsWithCommission: any[];
  cupSummary: DailySummary;
  usdSummary: DailySummary;
  customResults: { CUP: CustomCurrencyResult; USD: CustomCurrencyResult };
  idLabel: string | null;
  salesCounts: { validas: number; seleccionadas: number };
  logoDataUrl: string | null;
  /** Ancho de contenido en twips (según orientación). */
  contentW: number;
  usdWillRender: boolean;
}

async function loadLogo(storeInfo: CashReportPdfContext['storeInfo']): Promise<string | null> {
  if (!storeInfo?.logo_url || typeof fetch !== 'function') return null;
  try {
    const r = await fetch(storeInfo.logo_url);
    const b = await r.blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLA DIARIO — espejo de buildDiarioPdf
// ═══════════════════════════════════════════════════════════════════════════

/** Encabezado de bloque (3 líneas del PDF §3/§6): tienda / título / período. */
function diarioHeader(d: WordSharedData, title: string, ctx: CashReportPdfContext): (Paragraph | Table)[] {
  const periodTxt = d.startDate === d.endDate
    ? `Período: ${d.startDate}`
    : `Período: ${d.startDate} → ${d.endDate}`;
  const orientSuffix = d.orientation === 'horizontal' ? ' · Horizontal' : '';
  const textChildren: Paragraph[] = [
    para([run(d.sn, { bold: true, size: 24 })], { after: 30 }),
    para([run(title, { bold: true, size: 21 })], { after: 30 }),
    para([run(periodTxt + orientSuffix, { color: C_MUTED, size: 18 })], { after: 30 }),
  ];
  if (ctx.selectionMeta && ctx.selectionMeta.total > 0 && ctx.selectionMeta.included < ctx.selectionMeta.total) {
    const selTxt = `Ventas incluidas: ${ctx.selectionMeta.included} de ${ctx.selectionMeta.total}`
      + (ctx.selectionMeta.filterLabel ? ` · Filtro: ${ctx.selectionMeta.filterLabel}` : '');
    textChildren.push(para([run(selTxt, { color: C_MUTED, size: 15 })], { after: 30 }));
  }
  if (d.idLabel) {
    textChildren.push(para([run(d.idLabel, { bold: true, color: C_WARN, size: 15 })], { after: 30 }));
  }
  const logo = d.logoDataUrl ? logoDataUrlToImage(d.logoDataUrl, 12) : null;
  if (logo) {
    return [table([
      row([
        new TableCell({
          width: { size: mm(16), type: WidthType.DXA },
          borders: noBorders,
          margins: { top: 0, bottom: 0, left: 0, right: 60 },
          children: [new Paragraph({ children: [logo], spacing: { before: 0, after: 0 } })],
        }),
        new TableCell({
          width: { size: d.contentW - mm(16), type: WidthType.DXA },
          borders: noBorders,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: textChildren,
        }),
      ]),
    ], [mm(16), d.contentW - mm(16)])];
  }
  return textChildren;
}

/** Bloque izquierdo: «Resumen del Día» + caja «Efectivo esperado a entregar». */
function diarioIncomeBlock(
  d: WordSharedData,
  currency: 'CUP' | 'USD',
  incomeRows: ConceptTaggedRow[],
  esperado: number,
  esperadoLabel: string,
  blockW: number,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    para([run('Resumen del Día', { bold: true, size: 20 })], { after: 60, keepNext: true }),
  ];
  const labelW = Math.round(blockW * 0.60);
  const amountW = blockW - labelW;
  const rowsR = incomeRows.map(r => {
    // Misma regla de signos del PDF (renderIncomeBlock): los egresos muestran
    // su signo contable negativo; los totales, el importe tal cual.
    const signed = r.isTotal ? (r.amount ?? 0) : ((r.amount ?? 0) < 0 ? (r.amount ?? 0) : (r.note === 'expense' ? -(r.amount ?? 0) : (r.amount ?? 0)));
    const amt = (r.isTotal || !r.note) ? fmtCup(r.amount ?? 0) : fmtCup(signed);
    const bold = r.isTotal === true || r.isSubtotal === true;
    const color = r.isSubtotal === true ? C_MUTED : C_DARK;
    return row([
      cell(r.label, { width: labelW, bold, color, size: 16 }),
      cell([run(amt, { bold, color, size: 16 })], { width: amountW, align: 'right' }),
    ]);
  });
  out.push(table(rowsR, [labelW, amountW]));
  // Caja «Efectivo esperado a entregar» — borde negro 0.8mm, negrita 10pt.
  const boxLabelW = Math.round(blockW * 0.62);
  const boxAmountW = blockW - boxLabelW;
  out.push(table([
    row([
      cell(esperadoLabel, { width: boxLabelW, bold: true, size: 20, borders: { top: line(C_BLACK, W_BOX), bottom: line(C_BLACK, W_BOX), left: line(C_BLACK, W_BOX) } }),
      cell([run(fmtCup(esperado), { bold: true, size: 20 })], {
        width: boxAmountW, align: 'right',
        borders: { top: line(C_BLACK, W_BOX), bottom: line(C_BLACK, W_BOX), right: line(C_BLACK, W_BOX) },
      }),
    ], { height: mm(7) }),
  ], [boxLabelW, boxAmountW], { borders: {
    top: line(C_BLACK, W_BOX), bottom: line(C_BLACK, W_BOX),
    left: line(C_BLACK, W_BOX), right: line(C_BLACK, W_BOX),
    insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
  } }));
  void currency; void d;
  return out;
}

/** Bloque derecho: «Desglose de efectivo» por denominaciones + cuadre. */
function diarioBreakdownBlock(
  denoms: number[],
  breakdown: Breakdown,
  totalEntregado: number,
  cuadre: number,
  currency: Currency,
  blockW: number,
  includeBreakdown: boolean,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    para([run(`Desglose de efectivo ${currency}`, { bold: true, size: 20 })], { after: 60, keepNext: true }),
  ];
  const colW = [Math.round(blockW * 0.42), Math.round(blockW * 0.22), blockW - Math.round(blockW * 0.42) - Math.round(blockW * 0.22)];
  const fmtAmt = currency === 'CUP' ? fmtCup : fmtUsdFmt;
  if (includeBreakdown) {
    // Encabezado de columnas (negrita muted + filete inferior).
    out.push(table([
      row([
        cell('Denominación', { width: colW[0], bold: true, color: C_MUTED, size: 16, borders: { bottom: line(C_BORDER, W_THIN) } }),
        cell('Cantidad', { width: colW[1], align: 'center', bold: true, color: C_MUTED, size: 16, borders: { bottom: line(C_BORDER, W_THIN) } }),
        cell('Importe', { width: colW[2], align: 'right', bold: true, color: C_MUTED, size: 16, borders: { bottom: line(C_BORDER, W_THIN) } }),
      ]),
    ], colW));
    // §8.3 del PDF: cantidad 0 → la fila NO se imprime.
    const counted = denoms.filter(dn => Number(breakdown[dn] || 0) > 0);
    if (counted.length > 0) {
      out.push(table(counted.map(dn => {
        const cnt = Number(breakdown[dn] || 0);
        return row([
          cell(denomLabel(dn, currency), { width: colW[0], size: 16 }),
          cell(String(cnt), { width: colW[1], align: 'center', size: 16 }),
          cell([run(fmtAmt(cnt * dn), { size: 16 })], { width: colW[2], align: 'right' }),
        ]);
      }), colW));
    } else {
      out.push(para([run('Sin efectivo contado', { italics: true, color: C_MUTED, size: 16 })], { after: 60 }));
    }
  }
  // Filete + contado + cuadre (mismo orden y textos que el PDF).
  const totW = [Math.round(blockW * 0.60), blockW - Math.round(blockW * 0.60)];
  const cuadreState = cuadreLabel(cuadre);
  const cuadreColor = cuadreState === 'cuadrado' ? C_SUCCESS : C_WARN;
  const cuadreTxt = cuadreState === 'cuadrado'
    ? 'Cuadre (cuadrado)'
    : `Cuadre (${cuadreState.toUpperCase()}): ${cuadre > 0 ? '+' : '-'}${fmtAmt(Math.abs(cuadre))}`;
  out.push(table([
    row([
      cell('Efectivo contado / entregado', { width: totW[0], bold: true, size: 16, borders: { top: line(C_BORDER, W_THIN) } }),
      cell([run(fmtAmt(totalEntregado), { bold: true, size: 16 })], { width: totW[1], align: 'right', borders: { top: line(C_BORDER, W_THIN) } }),
    ]),
    row([
      cell(cuadreTxt, { width: blockW, bold: true, color: cuadreColor, size: 16 }),
    ]),
  ], [totW[0], totW[1]]));
  out.push(table([row([cell('Nota:', { width: blockW, italics: true, color: C_MUTED, size: 16 })])], [blockW]));
  return out;
}

/** Pie de firmas de 3 columnas (Hecho por / Entregado por / Recibido por).
 *  Estructura del PDF: etiqueta ENCIMA de la línea, nombre DEBAJO (si existe;
 *  sin nombre la línea queda en blanco para rellenar a mano — INC-2026-10-19). */
function diarioFirmas(
  names: { hecho: string; entrega: string; recibe: string },
  contentW: number,
): Table {
  const colW = Math.floor(contentW / 3);
  const labels = ['Hecho por:', 'Entregado por:', 'Recibido por:'];
  const values = [names.hecho, names.entrega, names.recibe];
  return table([
    row(labels.map((lbl, i) => new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: noBorders,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [
        para([run(lbl, { bold: true, size: 18 })], { after: 200 }),
        // Línea de firma: párrafo vacío con borde inferior.
        para([run(' ', { size: 18 })], { after: 60, bottomBorder: { style: BorderStyle.SINGLE, size: W_THIN, color: C_MUTED } }),
        para([run(values[i] || ' ', { size: 18 })], { after: 0 }),
      ],
    }))),
  ], [colW, colW, colW]);
}

/** Línea de corte físico entre secciones (§3 del PDF): filete negro + aire. */
function cutSeparator(): Paragraph {
  return para([run(' ', { size: 8 })], {
    before: 160, after: 160,
    bottomBorder: { style: BorderStyle.SINGLE, size: W_THIN, color: C_BLACK },
  });
}

/** Separador de sección (doble filete — modo compacto CUP+USD, INC-2026-10-19). */
function sectionSeparator(): Paragraph {
  return para([run(' ', { size: 8 })], {
    before: 200, after: 200,
    bottomBorder: { style: BorderStyle.DOUBLE, size: W_THIN, color: C_BLACK },
  });
}

/** Tabla de movimientos (§2 del PDF): marco negro, encabezado repetido, totales. */
function diarioSalesTable(
  d: WordSharedData,
  currency: 'CUP' | 'USD',
): { children: (Paragraph | Table)[]; totCash: number; totTransfer: number; totCommission: number } {
  const includeCommission = currency === 'CUP' && d.options.includeCommissionColumn !== false;
  const colNames = salesTableColumns(currency, includeCommission);
  const proportions = currency === 'CUP'
    ? (includeCommission
      ? [0.08, 0.26, 0.07, 0.18, 0.18, 0.23]
      : [0.09, 0.33, 0.09, 0.245, 0.245])
    : [0.11, 0.38, 0.10, 0.21, 0.20];
  const colW = widthsFrom(proportions, d.contentW);
  const aligns: Array<'left' | 'right'> = colNames.map((_, i) => (i <= 1 ? 'left' : 'right'));
  const fmtAmt = currency === 'CUP' ? fmtCup : fmtUsdFmt;
  const items = salesTableItems(d.itemsWithCommission, currency);

  const headerCells = colNames.map((name, i) => cell(name, {
    width: colW[i], bold: true, size: 16,
    align: aligns[i],
    borders: { bottom: line(C_BLACK, W_FRAME) },
  }));
  const out: (Paragraph | Table)[] = [];
  let totCash = 0, totTransfer = 0, totCommission = 0, totQty = 0;

  const dataRows: TableRow[] = items.map(it => {
    // Cobros en la MONEDA REAL (columnas separadas — nunca se suman CUP y USD).
    const cash = currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0);
    const transfer = currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0);
    const commission = Number(it.commission_suggested || 0);
    const qty = salesTableQty(it, currency);
    totCash += cash; totTransfer += transfer; totCommission += commission; totQty += qty;
    const desc = `${it.has_payment_incident ? '* ' : ''}${String(it.product_name || '')}`;
    const cells = [
      cell(String(it.sku || ''), { width: colW[0], size: 16 }),
      cell(desc, { width: colW[1], size: 16 }),
      cell([run(qty.toFixed(2), { size: 16 })], { width: colW[2], align: 'right' }),
      cell([run(cash > 0 ? fmtAmt(cash) : '-', { size: 16 })], { width: colW[3], align: 'right' }),
      cell([run(transfer > 0 ? fmtAmt(transfer) : '-', { size: 16 })], { width: colW[4], align: 'right' }),
    ];
    if (includeCommission) cells.push(cell([run(commission > 0 ? fmtAmt(commission) : '-', { size: 16 })], { width: colW[5], align: 'right' }));
    return row(cells);
  });

  if (items.length === 0) {
    // Tabla vacía visible (estado vacío explícito, §10 del PDF).
    const emptyCells = [
      cell('', { width: colW[0] }),
      cell('Sin movimientos en el período', { width: colW[1], italics: true, color: C_MUTED, size: 16 }),
      ...colW.slice(2).map(w => cell('', { width: w })),
    ];
    out.push(table(
      [row(headerCells, { header: true, height: mm(6) }), row(emptyCells)],
      colW,
      { borders: frameBorders() },
    ));
    return { children: out, totCash: 0, totTransfer: 0, totCommission: 0 };
  }

  // Fila de TOTALES (negrita 9pt + borde superior doble — convención contable).
  const totalsCells = [
    cell('TOTALES', { width: colW[0], bold: true, size: 18, topBorderDouble: true }),
    cell('', { width: colW[1], topBorderDouble: true }),
    cell([run(totQty > 0 ? totQty.toFixed(2) : '-', { bold: true, size: 18 })], { width: colW[2], align: 'right', topBorderDouble: true }),
    cell([run(totCash > 0 ? fmtAmt(totCash) : '-', { bold: true, size: 18 })], { width: colW[3], align: 'right', topBorderDouble: true }),
    cell([run(totTransfer > 0 ? fmtAmt(totTransfer) : '-', { bold: true, size: 18 })], { width: colW[4], align: 'right', topBorderDouble: true }),
  ];
  if (includeCommission) totalsCells.push(cell([run(totCommission > 0 ? fmtAmt(totCommission) : '-', { bold: true, size: 18 })], { width: colW[5], align: 'right', topBorderDouble: true }));

  out.push(table(
    [row(headerCells, { header: true, height: mm(6) }), ...dataRows, row(totalsCells, { height: mm(5) })],
    colW,
    { borders: frameBorders() },
  ));
  // Leyenda de incidencias de pago documentadas (mismo texto que el PDF).
  if (currency === 'CUP' && d.itemsWithCommission.some((it: any) => it.has_payment_incident)) {
    out.push(para([run('* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).', { italics: true, color: C_MUTED, size: 14 })], { before: 60, after: 60 }));
  }
  return { children: out, totCash, totTransfer, totCommission };
}

/** Bordes de marco completo (tabla de ventas / órdenes — PDF drawTableFrame). */
function frameBorders(): Record<string, unknown> {
  return {
    top: line(C_BLACK, W_FRAME), bottom: line(C_BLACK, W_FRAME),
    left: line(C_BLACK, W_FRAME), right: line(C_BLACK, W_FRAME),
    insideHorizontal: line(C_BLACK, 4), insideVertical: line(C_BLACK, 4),
  };
}

/** Reporte COMPLETO de una moneda en dos secciones separables (espejo de
 *  renderCurrencyReport del PDF): sección 1 (resumen + desglose + firmas) +
 *  línea de corte + sección 2 (encabezado repetido + tabla de ventas + firmas). */
function diarioCurrencyReport(
  d: WordSharedData,
  ctx: CashReportPdfContext,
  currency: 'CUP' | 'USD',
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const curSummary = currency === 'CUP' ? d.cupSummary : d.usdSummary;
  const curBreakdown = currency === 'CUP' ? ctx.cupBreakdown : ctx.usdBreakdown;
  const curDenoms = currency === 'CUP' ? ctx.cupDenoms : ctx.usdDenoms;
  const curResult = currency === 'CUP' ? d.customResults.CUP : d.customResults.USD;
  const title = `Reporte de Venta ${currency}`;
  const showFirmas = d.options.includeSignature !== false;
  const showDesglose = d.options.includeCashBreakdown !== false;
  const showDenoms = d.options.includeBreakdown !== false;

  // ══ SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO ══
  out.push(...diarioHeader(d, title, ctx));
  const esperadoPersonalizado = curResult.efectivoEsperadoPersonalizado;
  const incomeRows = buildDiarioIncomeRows(currency, curSummary, curResult, ctx.concepts);
  const esperadoLabel = currency === 'CUP'
    ? (d.idLabel ? 'Efectivo esperado (personalizado)' : 'Efectivo esperado a entregar')
    : (d.idLabel ? 'Efectivo esperado (personalizado, USD)' : 'Efectivo esperado a entregar (USD)');

  const totalCounted = breakdownTotal(curBreakdown);
  const cuadre = computeCuadre(totalCounted, esperadoPersonalizado);
  const blockGap = mm(4);
  const leftW = Math.floor((d.contentW - blockGap) / 2);
  const rightW = d.contentW - leftW - blockGap;

  // Resumen (izquierda) y Desglose (derecha) LADO A LADO — tabla exterior de
  // 2 columnas sin bordes con tablas anidadas (como el layout del PDF).
  const leftCell = new TableCell({
    width: { size: leftW, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 0, bottom: 0, left: 0, right: Math.floor(blockGap / 2) },
    children: diarioIncomeBlock(d, currency, incomeRows, esperadoPersonalizado, esperadoLabel, leftW),
  });
  const rightChildren: (Paragraph | Table)[] = showDesglose
    ? diarioBreakdownBlock(
      // Denominaciones activas ∪ con conteo (displayDenoms del PDF — nada contado se oculta).
      [...new Set([...curDenoms, ...Object.keys(curBreakdown).map(Number)])].sort((a, b) => b - a),
      curBreakdown, totalCounted, cuadre, currency, rightW, showDenoms,
    )
    : [];
  const rightCell = new TableCell({
    width: { size: rightW, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 0, bottom: 0, left: Math.floor(blockGap / 2), right: 0 },
    children: rightChildren.length > 0 ? rightChildren : [para([run(' ', { size: 16 })])],
  });
  out.push(table([row([leftCell, rightCell])], [leftW, rightW]));
  out.push(para([run(' ', { size: 8 })], { before: 80, after: 80 }));

  // Pie de firmas de la SECCIÓN 1.
  if (showFirmas) {
    out.push(diarioFirmas({
      hecho: ctx.madeBy || '', entrega: ctx.deliveredBy || '', recibe: ctx.recipientName || '',
    }, d.contentW));
  }

  // ══ SEPARADOR FÍSICO entre las dos secciones (línea de corte) ══
  out.push(cutSeparator());

  // ══ SECCIÓN 2 — DETALLE DE VENTAS (encabezado COMPLETO repetido) ══
  out.push(...diarioHeader(d, title, ctx));
  out.push(...diarioSalesTable(d, currency).children);
  if (showFirmas) {
    out.push(diarioFirmas({
      hecho: ctx.madeBy || '', entrega: ctx.deliveredBy || '', recibe: ctx.recipientName || '',
    }, d.contentW));
  }
  return out;
}

// ── Filas de conciliación del anexo (mismas etiquetas/orden que el PDF) ─────
function auditReconciliationRows(
  rec: CustomCurrencyResult['conciliacion'],
  cur: 'CUP' | 'USD',
  fmt: (n: number) => string,
): Array<{ label: string; value: string; sub?: boolean }> {
  const sgn = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`;
  const rows: Array<{ label: string; value: string; sub?: boolean }> = [
    { label: 'Ventas totales del período (oficial)', value: fmt(rec.ventasTotalesOficial) },
    { label: 'Ventas totales del reporte personalizado', value: fmt(rec.ventasTotalesPersonalizado) },
    { label: 'Diferencia de ventas totales (personalizado − oficial)', value: sgn(rec.diferenciaVentasTotales) },
    { label: 'Saldo inicial oficial', value: fmt(rec.saldoInicialOficial) },
    { label: 'Efectivo esperado OFICIAL (fórmula completa COSTPRO)', value: fmt(rec.efectivoEsperadoOficial) },
    { label: 'Efectivo esperado PERSONALIZADO (conceptos activos)', value: fmt(rec.efectivoEsperadoPersonalizado) },
  ];
  if (cur === 'CUP') {
    rows.push(
      { label: 'Equivalencia canónica CUP oficial (contable, no billetes)', value: fmt(rec.equivalenciaOficial) },
      { label: 'Equivalencia canónica CUP configurada', value: fmt(rec.equivalenciaPersonalizada) },
      { label: 'Diferencia de equivalencia contable (personalizado − oficial)', value: sgn(rec.diferenciaEquivalencia) },
      // MISIÓN EFECTIVO FÍSICO (P0): residuo clasificado — jamás efectivo disponible.
      { label: 'Diferencia de valoración contable CUP del período (flujos en otra moneda a su tasa)', value: sgn(rec.diferenciaValoracionCup) },
      { label: '· billetes netos de otra moneda del período (físico USD)', value: fmt(rec.billetesOtraMonedaPeriodo), sub: true },
      {
        label: '· clasificación',
        value: rec.residuoValoracionSinRespaldo
          ? 'residuo SIN respaldo en billetes — valoración contable, NO efectivo disponible'
          : 'valoración contable — no son billetes CUP',
        sub: true,
      },
    );
  }
  rows.push(
    { label: 'Ingresos de caja oficiales del período', value: fmt(rec.ingresosCajaOficial) },
    { label: 'Egresos de caja oficiales del período', value: fmt(rec.egresosCajaOficial) },
    { label: 'DIFERENCIA TOTAL del efectivo esperado (personalizado − oficial)', value: sgn(rec.diferenciaTotal) },
    { label: '· efecto de conceptos desactivados (firmado, independiente)', value: sgn(rec.diferenciaPorConceptos), sub: true },
    { label: '· efecto de ventas excluidas de la selección (independiente)', value: sgn(rec.diferenciaPorVentas), sub: true },
    { label: '· suma de efectos del detalle (Σ filas del anexo)', value: sgn(rec.sumaEfectosFilas), sub: true },
    { label: '· no explicada (residuo de conciliación independiente)', value: sgn(rec.diferenciaNoExplicada), sub: true },
    { label: 'Ventas válidas / seleccionadas / excluidas', value: `${rec.ventasValidas} / ${rec.ventasSeleccionadas} / ${rec.ventasExcluidas}` },
  );
  return rows;
}

/** ANEXO DE AUDITORÍA (misión P1 — página independiente, espejo del PDF). */
function diarioAuditAnnex(d: WordSharedData, ctx: CashReportPdfContext): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(...diarioHeader(d, 'Anexo de Auditoría — Reporte Entrega', ctx));
  out.push(para([run('Documento de auditoría independiente', { bold: true, size: 18 })], { after: 60, keepNext: true }));
  const cfgConceptos = isDefaultSummaryConcepts(ctx.concepts)
    ? 'Conceptos: todos los conceptos activos (sin personalización)'
    : `Conceptos: ${d.customResults.CUP.conceptos.filter(c => c.estado === 'activo').length} activos · ${d.customResults.CUP.conceptos.filter(c => c.estado === 'omitido').length} omitidos`;
  const cfgVentas = `Ventas: ${d.salesCounts.seleccionadas} incluidas de ${d.salesCounts.validas} válidas del período`
    + (ctx.selectionMeta?.filterLabel ? ` · Filtro: ${ctx.selectionMeta.filterLabel}` : '');
  for (const l of [
    `Tienda: ${d.sn}`,
    `Período: ${d.startDate} - ${d.endDate}`,
    'Base: efectivo físico por moneda (hoja CUP y hoja USD) · equivalencias contables en línea propia',
    `Generado: ${new Date().toLocaleString('es-CU')}`,
    cfgConceptos,
    cfgVentas,
    'Convención de signos: diferencia = personalizado − oficial (positivo: el personalizado excede al oficial)',
  ]) {
    out.push(para([run(l, { color: C_MUTED, size: 15 })], { after: 30 }));
  }
  out.push(para([run('El reporte principal representa la configuración elegida por el usuario; los importes', { bold: true, color: C_WARN, size: 15 })], { before: 60, after: 20 }));
  out.push(para([run('oficiales de esta auditoría representan TODOS los movimientos aplicables de COSTPRO.', { bold: true, color: C_WARN, size: 15 })], { after: 120 }));

  for (const cur of (['CUP', 'USD'] as const)) {
    const r = d.customResults[cur];
    const fmt = (n: number) => cur === 'CUP' ? fmtCup(n) : fmtUsdFmt(n);
    const sgn = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`;
    out.push(para([run(`Hoja ${cur} — comparación por concepto`, { bold: true, size: 19 })], { before: 120, after: 60, keepNext: true }));

    // Tabla por concepto (mismas columnas/proporciones del PDF §P1).
    const props = [0.26, 0.10, 0.14, 0.14, 0.13, 0.14, 0.09];
    const colW = widthsFrom(props, d.contentW);
    const heads = ['Concepto', 'Estado', 'Importe oficial', 'En personalizado', 'Dif. importe', 'Efecto en esperado', 'Base'];
    const headerRow = row(heads.map((h, i) => cell(h, {
      width: colW[i], bold: true, color: C_WHITE, size: 13,
      align: i >= 2 && i <= 5 ? 'right' : 'left',
      shading: C_DARK,
    })), { header: true });
    const conceptRows = r.conceptos.map((c, idx) => row([
      cell(c.concepto, { width: colW[0], size: 13, shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell([run(c.estado, { bold: true, size: 13, color: c.estado === 'activo' ? C_SUCCESS : C_WARN })], { width: colW[1], size: 13, shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell([run(c.base === 'USD' ? fmtUsdFmt(c.importeOficial) : fmtCup(c.importeOficial), { size: 13 })], { width: colW[2], align: 'right', shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell([run(c.base === 'USD' ? fmtUsdFmt(c.importePersonalizado) : fmtCup(c.importePersonalizado), { size: 13 })], { width: colW[3], align: 'right', shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell([run(sgn(c.diferencia), { size: 13, color: Math.abs(c.diferencia) < 0.005 ? C_MUTED : C_WARN })], { width: colW[4], align: 'right', shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell([run(c.efecto === 'componente' ? sgn(c.efectoEsperado) : '—', { size: 13, color: Math.abs(c.efectoEsperado) < 0.005 ? C_MUTED : C_WARN })], { width: colW[5], align: 'right', shading: idx % 2 === 0 ? C_LIGHT : undefined }),
      cell(c.base === 'USD' ? 'USD' : c.base === 'CUP' ? 'CUP' : 'equiv. CUP', { width: colW[6], size: 13, color: C_MUTED, shading: idx % 2 === 0 ? C_LIGHT : undefined }),
    ]));
    out.push(table([headerRow, ...conceptRows], colW));

    // Conciliación (verificación independiente del detalle).
    out.push(para([run(`Hoja ${cur} — conciliación configurado vs oficial`, { bold: true, size: 19 })], { before: 160, after: 60, keepNext: true }));
    const recRows = auditReconciliationRows(r.conciliacion, cur, fmt);
    const lblW = Math.round(d.contentW * 0.72);
    const valW = d.contentW - lblW;
    out.push(table(recRows.map(rr => row([
      cell(rr.label.replace(/^· /, '· '), { width: lblW, size: 15, color: rr.sub ? C_MUTED : C_DARK, italics: rr.sub }),
      cell([run(rr.value, { bold: true, size: 15 })], { width: valW, align: 'right' }),
    ])), [lblW, valW]));
    // Estado tri-estado inequívoco (misión P1 §5).
    const estado = r.conciliacion.estado;
    const estadoColor = estado === 'sin-diferencias' ? C_SUCCESS : estado === 'explicadas' ? C_INFO : C_WARN;
    out.push(para([run(`Estado: ${auditStatusLabel(estado)} — ${auditStatusDefinition(estado)}`, { bold: true, size: 16, color: estadoColor })], { before: 80, after: 160 }));
  }
  return out;
}

/** Reporte de Órdenes de Trabajo (§8.1 — espejo del PDF). */
function diarioOtReport(d: WordSharedData, ctx: CashReportPdfContext, productionOrders: any[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(...diarioHeader(d, 'Reporte de Órdenes de Trabajo', ctx));
  out.push(para([run('Órdenes abiertas del período (pendientes de gestión). Las cerradas, completadas o anuladas no se listan.', { italics: true, color: C_MUTED, size: 15 })], { after: 100 }));

  const props = [0.10, 0.13, 0.45, 0.08, 0.13, 0.11];
  const colW = widthsFrom(props, d.contentW);
  const heads = ['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD'];
  const headerRow = row(heads.map((h, i) => cell(h, {
    width: colW[i], bold: true, size: 16,
    align: i >= 3 ? 'right' : 'left',
    borders: { bottom: line(C_BLACK, W_FRAME) },
  })), { header: true, height: mm(6) });

  let totCup = 0, totUsd = 0;
  const dataRows = productionOrders.map(ord => {
    const cupAmt = Number(ord.advance_currency === 'CUP' ? ord.advance_amount : (ord.budget_currency === 'CUP' ? ord.budget_total : 0));
    const usdAmt = Number(ord.advance_currency === 'USD' ? ord.advance_amount : (ord.budget_currency === 'USD' ? ord.budget_total : 0));
    totCup += cupAmt; totUsd += usdAmt;
    return row([
      cell(String(ord.order_number || ''), { width: colW[0], size: 16 }),
      cell('Trabajo', { width: colW[1], size: 16 }),
      cell(String(ord.description || ord.title || ord.customer_name || 'Orden de trabajo'), { width: colW[2], size: 16 }),
      cell([run('1.00', { size: 16 })], { width: colW[3], align: 'right' }),
      cell([run(cupAmt > 0 ? fmtCup(cupAmt) : '-', { size: 16 })], { width: colW[4], align: 'right' }),
      cell([run(usdAmt > 0 ? fmtUsdFmt(usdAmt) : '-', { size: 16 })], { width: colW[5], align: 'right' }),
    ]);
  });
  const totalsRow = row([
    cell('', { width: colW[0], topBorderDouble: true }),
    cell('', { width: colW[1], topBorderDouble: true }),
    cell('', { width: colW[2], topBorderDouble: true }),
    cell('', { width: colW[3], topBorderDouble: true }),
    cell([run(fmtCup(totCup), { bold: true, size: 18 })], { width: colW[4], align: 'right', topBorderDouble: true }),
    cell([run(totUsd > 0 ? fmtUsdFmt(totUsd) : '-', { bold: true, size: 18 })], { width: colW[5], align: 'right', topBorderDouble: true }),
  ], { height: mm(5) });
  if (productionOrders.length === 0) {
    out.push(table([headerRow, row([
      cell('', { width: colW[0] }),
      cell('Sin movimientos en el período', { width: colW[1], italics: true, color: C_MUTED, size: 16 }),
      ...colW.slice(2).map(w => cell('', { width: w })),
    ])], colW, { borders: frameBorders() }));
  } else {
    out.push(table([headerRow, ...dataRows, totalsRow], colW, { borders: frameBorders() }));
  }
  out.push(para([run(' ', { size: 8 })], { before: 80, after: 80 }));

  // «Resumen Órdenes» + caja del total (mismo bloque del PDF).
  const leftW = Math.floor((d.contentW - mm(4)) / 2);
  const rightW = d.contentW - leftW - mm(4);
  const totalCounted = breakdownTotal(ctx.cupBreakdown);
  const cuadre = computeCuadre(totalCounted, totCup);
  const leftChildren = diarioIncomeBlock(d, 'CUP', [
    { label: 'Total órdenes (CUP)', amount: totCup, isTotal: true },
  ], totCup, 'Total anticipos CUP', leftW);
  const rightChildren = d.options.includeCashBreakdown !== false
    ? diarioBreakdownBlock(
      [...new Set([...ctx.cupDenoms, ...Object.keys(ctx.cupBreakdown).map(Number)])].sort((a, b) => b - a),
      ctx.cupBreakdown, totalCounted, cuadre, 'CUP', rightW, d.options.includeBreakdown !== false,
    )
    : [para([run(' ', { size: 16 })])];
  out.push(table([row([
    new TableCell({ width: { size: leftW, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 0, right: 60 }, children: leftChildren }),
    new TableCell({ width: { size: rightW, type: WidthType.DXA }, borders: noBorders, margins: { top: 0, bottom: 0, left: 60, right: 0 }, children: rightChildren }),
  ])], [leftW, rightW]));
  if (d.options.includeSignature !== false) {
    out.push(diarioFirmas({
      hecho: ctx.madeBy || '', entrega: ctx.deliveredBy || '', recibe: ctx.recipientName || '',
    }, d.contentW));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENSAMBLAJE DEL DOCUMENTO (secciones de Word + pies con numeración)
// ═══════════════════════════════════════════════════════════════════════════

/** Pie de página del Diario (mismo texto que el PDF, con PAGE/NUMPAGES). */
function diarioFooter(d: WordSharedData, sectionLabel: string): Footer {
  const orientLbl = d.orientation === 'horizontal' ? 'Horizontal' : 'Vertical';
  const period = d.startDate === d.endDate
    ? d.startDate
    : `${d.startDate} → ${d.endDate}`;
  const prefix = `CostPro — Reporte Diario (${orientLbl}) · ${d.sn} · ${sectionLabel} · Período ${period} · `;
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: prefix, font: FONT, size: 14, color: C_MUTED }),
        new TextRun({ children: ['Página ', PageNumber.CURRENT], font: FONT, size: 14, color: C_MUTED }),
        new TextRun({ text: ' de ', font: FONT, size: 14, color: C_MUTED }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: C_MUTED }),
      ],
    })],
  });
}

/** Propiedades de página A4 (portrait/landscape) con márgenes del PDF Diario.
 *  NOTA docx v9: la librería INTERCAMBIA width/height por sí misma cuando
 *  orientation=LANDSCAPE — se pasan SIEMPRE las dimensiones de RETRATO
 *  (210×297) y ella emite w=16838 h=11906 orient="landscape". */
function diarioSectionProps(d: WordSharedData): ISectionOptions['properties'] {
  const landscape = d.orientation === 'horizontal';
  return {
    page: {
      size: {
        width: mm(210),
        height: mm(297),
        orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: { top: mm(14), bottom: mm(12), left: mm(10), right: mm(10), footer: mm(5), header: mm(5) },
    },
    type: SectionType.NEXT_PAGE,
  };
}

function diarioSection(d: WordSharedData, children: (Paragraph | Table)[], sectionLabel: string): ISectionOptions {
  return {
    properties: diarioSectionProps(d),
    footers: { default: diarioFooter(d, sectionLabel) },
    children,
  };
}

/** Ensambla las secciones de la plantilla DIARIO (espejo de buildDiarioPdf). */
function buildDiarioSections(
  d: WordSharedData,
  ctx: CashReportPdfContext,
  productionOrders: any[],
): ISectionOptions[] {
  const sections: ISectionOptions[] = [];
  const usdSeparate = d.options.usdSeparatePage !== false;
  const showOt = d.options.includeOtReport !== false;

  // Sección 1: reporte CUP (+ USD compacto si corresponde).
  const cupChildren = diarioCurrencyReport(d, ctx, 'CUP');
  if (d.usdWillRender && !usdSeparate) {
    cupChildren.push(sectionSeparator());
    cupChildren.push(...diarioCurrencyReport(d, ctx, 'USD'));
    sections.push(diarioSection(d, cupChildren, 'CUP + USD'));
  } else {
    sections.push(diarioSection(d, cupChildren, 'CUP'));
  }
  // Sección 2: reporte USD en hoja propia (§9 default).
  if (d.usdWillRender && usdSeparate) {
    sections.push(diarioSection(d, diarioCurrencyReport(d, ctx, 'USD'), 'USD'));
  }
  // Anexo de Auditoría (página independiente).
  sections.push(diarioSection(d, diarioAuditAnnex(d, ctx), 'Auditoría'));
  // Órdenes de Trabajo (opcional, página propia).
  if (showOt) {
    sections.push(diarioSection(d, diarioOtReport(d, ctx, productionOrders), 'Órdenes'));
  }
  return sections;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLA ESTÁNDAR / SIMPLE — espejo de buildEstandarPdf
// ═══════════════════════════════════════════════════════════════════════════

/** Barra de título de sección (fondo oscuro, texto blanco — sectionTitle del PDF). */
function estandarSectionTitle(d: WordSharedData, title: string, subtitle?: string): Table {
  const subW = subtitle ? Math.round(d.contentW * 0.38) : 0;
  const titleW = d.contentW - subW;
  const cells = [
    new TableCell({
      width: { size: titleW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C_DARK },
      margins: { top: 40, bottom: 40, left: 80, right: 60 },
      verticalAlign: VerticalAlign.CENTER,
      children: [para([run(title, { bold: true, color: C_WHITE, size: 20 })], { after: 0 })],
    }),
  ];
  if (subtitle) {
    cells.push(new TableCell({
      width: { size: subW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C_DARK },
      margins: { top: 40, bottom: 40, left: 60, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [para([run(subtitle, { color: C_WHITE, size: 14 })], { alignment: AlignmentType.RIGHT, after: 0 })],
    }));
  }
  return table([row(cells)], subtitle ? [titleW, subW] : [titleW], {
    borders: tableNoBorders,
    width: d.contentW,
  });
}

interface EstandarTableSpec {
  headers: string[];
  rows: (string | number)[][];
  colWidths: number[];               // twips
  align?: Array<'left' | 'right' | 'center'>;
  totalsRow?: (string | number)[];
}

/** Tabla estilo renderTable del PDF: barra oscura + filas + fila verde de totales. */
function estandarTable(d: WordSharedData, spec: EstandarTableSpec): Table {
  const { headers, rows, colWidths, align, totalsRow } = spec;
  const alignOf = (i: number) => align?.[i] ?? 'left';
  const headerCells = headers.map((h, i) => new TableCell({
    width: { size: colWidths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: C_DARK },
    margins: { top: 30, bottom: 30, left: 50, right: 50 },
    verticalAlign: VerticalAlign.CENTER,
    children: [para([run(String(h), { bold: true, color: C_WHITE, size: 15 })], { alignment: alignOf(i) === 'right' ? AlignmentType.RIGHT : alignOf(i) === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT, after: 0 })],
  }));
  const dataRows = rows.map(r => row(r.map((c, i) => cell(String(c), {
    width: colWidths[i], size: 15, align: alignOf(i),
  }))));
  const allRows = [row(headerCells, { header: true, height: mm(7) }), ...dataRows];
  if (totalsRow && totalsRow.length === headers.length) {
    allRows.push(row(totalsRow.map((c, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: C_PRIMARY },
      margins: { top: 30, bottom: 30, left: 50, right: 50 },
      verticalAlign: VerticalAlign.CENTER,
      children: [para([run(String(c), { bold: true, color: C_WHITE, size: 15 })], { alignment: alignOf(i) === 'right' ? AlignmentType.RIGHT : alignOf(i) === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT, after: 0 })],
    }), { height: mm(7) })));
  }
  return table(allRows, colWidths, {
    borders: { ...tableNoBorders, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER } },
    width: d.contentW,
  });
}

/** Encabezado de la plantilla Estándar (logo 18mm + identidad de la tienda). */
function estandarHeader(d: WordSharedData, ctx: CashReportPdfContext): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const identity: Paragraph[] = [
    para([run(d.sn, { bold: true, size: 28 })], { after: 40 }),
  ];
  if (ctx.storeInfo?.address) identity.push(para([run(ctx.storeInfo.address, { color: C_MUTED, size: 14 })], { after: 20 }));
  if (ctx.storeInfo?.phone) identity.push(para([run(`Tel: ${ctx.storeInfo.phone}`, { color: C_MUTED, size: 14 })], { after: 20 }));
  if (ctx.storeInfo?.reeup) identity.push(para([run(`REEUP: ${ctx.storeInfo.reeup}  ·  NIT: ${ctx.storeInfo?.nit || '—'}`, { color: C_MUTED, size: 14 })], { after: 20 }));
  const logo = d.logoDataUrl ? logoDataUrlToImage(d.logoDataUrl, 18) : null;
  if (logo) {
    out.push(table([row([
      new TableCell({
        width: { size: mm(22), type: WidthType.DXA }, borders: noBorders,
        margins: { top: 0, bottom: 0, left: 0, right: 100 },
        children: [new Paragraph({ children: [logo], spacing: { before: 0, after: 0 } })],
      }),
      new TableCell({
        width: { size: d.contentW - mm(22), type: WidthType.DXA }, borders: noBorders,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: identity,
      }),
    ])], [mm(22), d.contentW - mm(22)]));
  } else {
    out.push(...identity);
  }
  out.push(para([run(' ', { size: 8 })], { before: 60, after: 60, bottomBorder: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' } }));
  out.push(para([run('REPORTE DE CAJA — ENTREGA DE DINERO', { bold: true, size: 26 })], { before: 60, after: 40 }));
  out.push(para([run(`Periodo: ${d.startDate} → ${d.endDate}`, { color: C_MUTED, size: 16 })], { after: 30 }));
  if (ctx.deliveredBy || ctx.recipientName) {
    out.push(para([run(`Entrega: ${ctx.deliveredBy || '—'}    Recibe: ${ctx.recipientName || '—'}`, { color: C_MUTED, size: 16 })], { after: 30 }));
  }
  out.push(para([run(`Generado: ${new Date().toLocaleString('es-CU')}`, { color: C_MUTED, size: 16 })], { after: 40 }));
  out.push(para([run(' ', { size: 8 })], { before: 40, after: 60, bottomBorder: { style: BorderStyle.SINGLE, size: 3, color: 'E5E7EB' } }));
  return out;
}

/** Ensambla el contenido de la plantilla ESTÁNDAR (espejo de buildEstandarPdf). */
async function buildEstandarChildren(
  d: WordSharedData,
  ctx: CashReportPdfContext,
  options: CashReportPdfOptions,
  summaries: CashReportSummaries,
): Promise<(Paragraph | Table)[]> {
  const { report } = ctx;
  const out: (Paragraph | Table)[] = [];
  out.push(...estandarHeader(d, ctx));

  const { itemsSummary, commissionsSummary } = summaries.itemsSummary && summaries.commissionsSummary
    ? { itemsSummary: summaries.itemsSummary, commissionsSummary: summaries.commissionsSummary }
    : await fetchEstandarSummaries(d.startDate, d.endDate);
  const { summaryRows, sales, payments, commissions, production } = buildEstandarSummaryRows(report, ctx.concepts);

  // RESUMEN — FLUJO DE CAJA CUP
  out.push(estandarSectionTitle(d, 'RESUMEN — FLUJO DE CAJA CUP', `${sales.length} grupos de ventas · ${payments.length} grupos de pagos`));
  out.push(para([run(' ', { size: 8 })], { after: 40 }));
  const estandarCounts = ctx.salesCounts ?? {
    validas: ctx.selectionMeta?.total ?? 0,
    seleccionadas: ctx.selectionMeta?.included ?? ctx.selectionMeta?.total ?? 0,
  };
  const estandarResults = computeCustomResultsForPdf(report, ctx.officialReport, null, ctx.concepts, estandarCounts);
  const estandarIdLabel = reportIdentificationLabel(estandarResults);
  const dineroEntregar = estandarResults.CUP.efectivoEsperadoPersonalizado;
  const resumenW = widthsFrom([85, 30, 25, 40].map(v => v / 180), d.contentW);
  out.push(estandarTable(d, {
    headers: ['Concepto', 'Documentos', '', 'Monto CUP'],
    rows: summaryRows,
    colWidths: resumenW,
    align: ['left', 'left', 'right', 'right'],
    totalsRow: [estandarIdLabel ? 'DINERO A ENTREGAR (PERSONALIZADO)' : 'DINERO A ENTREGAR EN EFECTIVO', '', '', fmtStd(dineroEntregar)],
  }));
  if (estandarIdLabel) {
    out.push(para([run(`${estandarIdLabel} — resultado condicionado a los conceptos y ventas seleccionados.`, { bold: true, color: C_WARN, size: 15 })], { before: 80, after: 20 }));
    out.push(para([run('El importe oficial completo está en el Anexo de Auditoría (última hoja).', { bold: true, color: C_WARN, size: 15 })], { after: 80 }));
  }
  out.push(para([run(' ', { size: 8 })], { before: 60, after: 60 }));

  // PRODUCTOS VENDIDOS
  out.push(estandarSectionTitle(d, 'PRODUCTOS VENDIDOS', `${(itemsSummary as any)?.count || 0} productos · ${(itemsSummary as any)?.items?.reduce((s: number, i: any) => s + Number(i.transactions_count), 0) || 0} transacciones`));
  out.push(para([run(' ', { size: 8 })], { after: 40 }));
  if ((itemsSummary as any)?.items?.length > 0) {
    // INCIDENTE 2026-10-16: cobros por MONEDA REAL (columnas separadas).
    // En Word las descripciones se AJUSTAN (wrap) — no se truncan con «…».
    const productRows: (string | number)[][] = (itemsSummary as any).items.map((it: any) => [
      String(it.product_name || '—'),
      String(it.sku || '—'),
      Number(it.total_quantity).toFixed(2),
      fmtStd(Number(it.unit_price)),
      fmtStd(Number(it.total_cup)),
      fmtStd(Number(it.cash_cup ?? it.cash_paid ?? 0)),
      fmtStd(Number((it.transfer_cup ?? it.transfer_paid ?? 0)) + Number(it.zelle_cup ?? 0)),
      Number(it.usd_total || 0) > 0 ? formatUsd(Number(it.usd_total)) : '-',
    ]);
    out.push(estandarTable(d, {
      headers: ['Producto', 'SKU', 'Cant.', 'P.Unit', 'Total CUP', 'Efectivo (CUP)', 'Transfer. (CUP)', 'USD'],
      rows: productRows,
      colWidths: widthsFrom([40, 26, 13, 19, 24, 24, 24, 20].map(v => v / 190), d.contentW),
      align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
      totalsRow: [
        'TOTALES', '', '', '',
        fmtStd(Number((itemsSummary as any).total_cup)),
        fmtStd(Number((itemsSummary as any).cash_cup ?? (itemsSummary as any).total_cash ?? 0)),
        fmtStd(Number((itemsSummary as any).transfer_cup ?? (itemsSummary as any).total_transfer ?? 0) + Number((itemsSummary as any).zelle_cup ?? 0)),
        Number((itemsSummary as any).usd_total || 0) > 0 ? formatUsd(Number((itemsSummary as any).usd_total)) : '-',
      ],
    }));
  } else {
    out.push(para([run('No se vendieron productos en el periodo seleccionado.', { italics: true, color: C_MUTED, size: 18 })], { before: 60, after: 80 }));
  }
  out.push(para([run(' ', { size: 8 })], { before: 60, after: 60 }));

  // COMISIONES A TRABAJADORES
  if ((commissionsSummary as any)?.workers?.length > 0) {
    out.push(estandarSectionTitle(d, 'COMISIONES A TRABAJADORES', `${(commissionsSummary as any).count} trabajadores · ${(commissionsSummary as any).workers.reduce((s: number, w: any) => s + Number(w.count), 0)} pagos`));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
    const workerRows: (string | number)[][] = (commissionsSummary as any).workers.map((w: any) => [
      w.worker_name, w.ci, String(w.count), (w.periods as string[])?.[0] || '—',
      fmtStd(Number(w.cash_paid)), fmtStd(Number(w.transfer_paid)), fmtStd(Number(w.zelle_paid)), fmtStd(Number(w.total_amount_cup)),
    ]);
    out.push(estandarTable(d, {
      headers: ['Trabajador', 'CI', 'Pagos', 'Periodo', 'Efectivo', 'Transfer', 'Zelle', 'Total CUP'],
      rows: workerRows,
      colWidths: widthsFrom([40, 22, 12, 35, 22, 22, 18, 26].map(v => v / 197), d.contentW),
      align: ['left', 'left', 'center', 'left', 'right', 'right', 'right', 'right'],
      totalsRow: ['TOTALES', '', '', '', fmtStd(Number((commissionsSummary as any).total_cash)), fmtStd(Number((commissionsSummary as any).total_transfer)), fmtStd(Number((commissionsSummary as any).total_zelle)), fmtStd(Number((commissionsSummary as any).total_cup))],
    }));
    out.push(para([run(' ', { size: 8 })], { before: 60, after: 60 }));
  }

  // ÓRDENES DE PRODUCCIÓN/SERVICIO (opción detailProduction)
  if (options.detailProduction && production.length > 0) {
    out.push(estandarSectionTitle(d, 'ÓRDENES DE PRODUCCIÓN/SERVICIO', 'Anticipos + Liquidaciones recibidas (INGRESOS)'));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
    for (const p of production) {
      out.push(para([run(`${methodLabel(String(p.payment_method))} (${p.currency}) · ${p.ref_type === 'production_order' ? 'Producción' : 'Trabajo'}`, { bold: true, size: 18 })], { before: 60, after: 20, keepNext: true }));
      out.push(para([run(`${p.payment_count} pagos · Total: ${fmtStd(Number(p.total), String(p.currency))}`, { color: C_MUTED, size: 14 })], { after: 40 }));
      try {
        const items = await fetchDetailRows(d.startDate, d.endDate, 'payment', String(p.payment_method), String(p.currency), String(p.ref_type));
        if (items.length > 0) {
          const prodRows: (string | number)[][] = items.map((it: any) => {
            const date = String(it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
            const amt = Number(it.amount_cup || it.amount || 0);
            const ref = String(it.reference || it.notes || it.customer_name || '');
            return [date, ref, fmtStd(amt)];
          });
          out.push(estandarTable(d, {
            headers: ['Fecha', 'Referencia', 'Monto CUP'],
            rows: prodRows,
            colWidths: widthsFrom([35, 95, 35].map(v => v / 165), d.contentW),
            align: ['left', 'left', 'right'],
          }));
        }
      } catch { /* mismo comportamiento del PDF: sin detalle si falla */ }
      out.push(para([run(' ', { size: 8 })], { after: 40 }));
    }
  }

  // SALIDAS DE DINERO (opción detailPayments)
  if (options.detailPayments && payments.length > 0) {
    out.push(estandarSectionTitle(d, 'SALIDAS DE DINERO', 'Pagos a proveedores, recepciones y servicios'));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
    for (const p of payments) {
      out.push(para([run(`${methodLabel(String(p.payment_method))} (${p.currency}) · ${p.ref_type === 'receipt' ? 'Recepción de Mercancía' : 'Servicio Recibido'}`, { bold: true, size: 18 })], { before: 60, after: 20, keepNext: true }));
      out.push(para([run(`${p.payment_count} pagos · Total: -${fmtStd(Number(p.total), String(p.currency))}`, { color: C_DANGER, size: 14 })], { after: 40 }));
      try {
        const items = await fetchDetailRows(d.startDate, d.endDate, 'payment', String(p.payment_method), String(p.currency), String(p.ref_type));
        if (items.length > 0) {
          const payRows: (string | number)[][] = items.map((it: any) => {
            const date = String(it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
            const amt = Number(it.amount_cup || it.amount || 0);
            const ref = String(it.reference || it.notes || '');
            return [date, ref, `-${fmtStd(amt)}`];
          });
          out.push(estandarTable(d, {
            headers: ['Fecha', 'Referencia', 'Monto CUP'],
            rows: payRows,
            colWidths: widthsFrom([35, 95, 35].map(v => v / 165), d.contentW),
            align: ['left', 'left', 'right'],
          }));
        }
      } catch { /* mismo comportamiento del PDF */ }
      out.push(para([run(' ', { size: 8 })], { after: 30 }));
    }
  }

  // DESGLOSE DE BILLETES PARA ENTREGA
  const cupTotal = breakdownTotal(ctx.cupBreakdown);
  const expectedCup = dineroEntregar;
  const cupDifference = cupTotal - expectedCup;
  if (options.includeCashBreakdown !== false) {
    out.push(estandarSectionTitle(d, 'DESGLOSE DE BILLETES PARA ENTREGA', 'Conteo físico de efectivo'));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
  }
  if (options.includeCashBreakdown !== false && options.includeBreakdown) {
    out.push(para([run('Desglose CUP', { bold: true, size: 20 })], { before: 40, after: 40, keepNext: true }));
    const cupEntries = Object.entries(ctx.cupBreakdown).filter(([, c]) => Number(c) > 0);
    if (cupEntries.length > 0) {
      const cupRows: (string | number)[][] = cupEntries.map(([dn, c]) => [`$${dn}`, String(c), fmtStd(Number(dn) * Number(c))]);
      out.push(estandarTable(d, {
        headers: ['Denominación', 'Cantidad', 'Subtotal'],
        rows: cupRows,
        colWidths: widthsFrom([50, 50, 65].map(v => v / 165), d.contentW),
        align: ['left', 'center', 'right'],
        totalsRow: ['TOTAL CONTADO', '', fmtStd(cupTotal)],
      }));
      const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
      const dColor = cupDifference === 0 ? C_SUCCESS : cupDifference > 0 ? C_WARN : C_DANGER;
      out.push(para([run(`Diferencia: ${fmtStd(Math.abs(cupDifference))} ${dl}`, { bold: true, color: dColor, size: 18 })], { before: 80, after: 80 }));
    } else {
      out.push(para([run('(Sin desglose ingresado — use el botón "Sugerir" en la UI)', { italics: true, color: C_MUTED, size: 18 })], { before: 40, after: 60 }));
    }
  }
  if (options.includeCashBreakdown !== false && !options.includeBreakdown) {
    out.push(para([run('Desglose CUP', { bold: true, size: 20 })], { before: 40, after: 40 }));
    out.push(para([run(`Efectivo contado: ${fmtStd(cupTotal)}`, { size: 18 })], { after: 40 }));
    const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
    const dColor = cupDifference === 0 ? C_SUCCESS : cupDifference > 0 ? C_WARN : C_DANGER;
    out.push(para([run(`Diferencia: ${fmtStd(Math.abs(cupDifference))} ${dl}`, { bold: true, color: dColor, size: 18 })], { after: 60 }));
  }
  if (options.includeCashBreakdown !== false && options.includeUsd) {
    const usdCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);
    const usdTotal = breakdownTotal(ctx.usdBreakdown);
    if (usdCashSales > 0 || usdTotal > 0) {
      out.push(para([run('Desglose USD', { bold: true, size: 20 })], { before: 40, after: 40, keepNext: true }));
      const usdEntries = Object.entries(ctx.usdBreakdown).filter(([, c]) => Number(c) > 0);
      if (usdEntries.length > 0) {
        const usdRows: (string | number)[][] = usdEntries.map(([dn, c]) => [`$${dn}`, String(c), `$${(Number(dn) * Number(c)).toFixed(2)}`]);
        out.push(estandarTable(d, {
          headers: ['Denominación', 'Cantidad', 'Subtotal USD'],
          rows: usdRows,
          colWidths: widthsFrom([50, 50, 65].map(v => v / 165), d.contentW),
          align: ['left', 'center', 'right'],
          totalsRow: ['TOTAL CONTADO USD', '', `$${usdTotal.toFixed(2)}`],
        }));
      }
    }
  }

  // Firmas (2 columnas: Entrega | Recibe)
  if (options.includeSignature) {
    const halfW = Math.floor(d.contentW / 2);
    const sigCell = (label: string, name: string) => new TableCell({
      width: { size: halfW, type: WidthType.DXA }, borders: noBorders,
      margins: { top: 200, bottom: 40, left: 80, right: 80 },
      children: [
        para([run(' ', { size: 18 })], { after: 60, bottomBorder: { style: BorderStyle.SINGLE, size: W_THIN, color: C_MUTED } }),
        para([run(name || label, { color: C_MUTED, size: 16 })], { after: 20 }),
        para([run('Firma', { color: C_MUTED, size: 12 })], { after: 0 }),
      ],
    });
    out.push(table([row([
      sigCell('Entrega', ctx.deliveredBy || ''),
      sigCell('Recibe', ctx.recipientName || ''),
    ])], [halfW, halfW]));
  }

  // ANEXO DE AUDITORÍA (página propia — PageBreak al estilo addPage del PDF).
  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(estandarSectionTitle(d, 'ANEXO DE AUDITORÍA — REPORTE PERSONALIZADO', 'Independiente del reporte principal'));
  out.push(para([run(' ', { size: 8 })], { after: 40 }));
  const estCfgConceptos = isDefaultSummaryConcepts(ctx.concepts)
    ? 'Conceptos: todos los conceptos activos (sin personalización)'
    : `Conceptos: ${estandarResults.CUP.conceptos.filter(c => c.estado === 'activo').length} activos · ${estandarResults.CUP.conceptos.filter(c => c.estado === 'omitido').length} omitidos`;
  for (const l of [
    `Tienda: ${d.sn}`,
    `Período: ${d.startDate} - ${d.endDate}`,
    'Base: efectivo físico por moneda (hoja CUP y hoja USD) · equivalencias contables en línea propia',
    `Generado: ${new Date().toLocaleString('es-CU')}`,
    estCfgConceptos,
    `Ventas: ${estandarCounts.seleccionadas} incluidas de ${estandarCounts.validas} válidas del período` + (ctx.selectionMeta?.filterLabel ? ` · Filtro: ${ctx.selectionMeta.filterLabel}` : ''),
    'Convención de signos: diferencia = personalizado − oficial (positivo: el personalizado excede al oficial)',
  ]) {
    out.push(para([run(l, { color: C_MUTED, size: 15 })], { after: 30 }));
  }
  out.push(para([run('El reporte principal representa la configuración elegida por el usuario; los importes oficiales', { bold: true, color: C_WARN, size: 15 })], { before: 60, after: 20 }));
  out.push(para([run('de esta auditoría representan TODOS los movimientos aplicables de COSTPRO.', { bold: true, color: C_WARN, size: 15 })], { after: 120 }));

  for (const cur of (['CUP', 'USD'] as const)) {
    const r = estandarResults[cur];
    // Importes según SU base monetaria (mismo criterio del PDF Estándar).
    const amt = (n: number) => cur === 'USD' ? `$${n.toFixed(2)}` : fmtStd(n);
    const sgn = (n: number) => `${n >= 0 ? '+' : ''}${amt(n)}`;
    const baseLbl = (b: string) => b === 'USD' ? 'USD' : b === 'CUP' ? 'CUP' : 'equiv. CUP';
    out.push(estandarSectionTitle(d, `HOJA ${cur} — COMPARACIÓN POR CONCEPTO`, 'Oficial vs personalizado'));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
    const compRows: (string | number)[][] = r.conceptos.map(c => [
      c.concepto,
      c.estado,
      amt(c.importeOficial),
      amt(c.importePersonalizado),
      sgn(c.diferencia),
      c.efecto === 'componente' ? sgn(c.efectoEsperado) : '—',
      baseLbl(c.base),
    ]);
    out.push(estandarTable(d, {
      headers: ['Concepto', 'Estado', 'Importe oficial', 'En personalizado', 'Dif. importe (pers.−ofi.)', 'Efecto en esperado', 'Base'],
      rows: compRows,
      colWidths: widthsFrom([50, 18, 24, 24, 24, 26, 16].map(v => v / 182), d.contentW),
      align: ['left', 'left', 'right', 'right', 'right', 'right', 'left'],
    }));
    out.push(para([run(' ', { size: 8 })], { before: 60, after: 40 }));
    const recRows = auditReconciliationRows(r.conciliacion, cur, amt);
    const lblW = Math.round(d.contentW * 0.72);
    const valW = d.contentW - lblW;
    out.push(estandarSectionTitle(d, `Conciliación — hoja ${cur}`, ''));
    out.push(para([run(' ', { size: 8 })], { after: 40 }));
    out.push(table(recRows.map(rr => row([
      cell(rr.label, { width: lblW, size: 15, color: rr.sub ? C_MUTED : C_DARK, italics: rr.sub }),
      cell([run(rr.value, { bold: true, size: 15 })], { width: valW, align: 'right' }),
    ])), [lblW, valW]));
    const estado = r.conciliacion.estado;
    const estColor = estado === 'sin-diferencias' ? C_SUCCESS : estado === 'explicadas' ? C_PRIMARY : C_WARN;
    out.push(para([run(`Estado: ${auditStatusLabel(estado)} — ${auditStatusDefinition(estado)}`, { bold: true, size: 16, color: estColor })], { before: 80, after: 160 }));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// API PÚBLICA (contrato paralelo al Excel: blob + filename + descarga)
// ═══════════════════════════════════════════════════════════════════════════

/** Construye el Document Word completo (plantilla seleccionada + opciones). */
export async function buildCashReportWordDocument(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<{ doc: Document; filename: string }> {
  // Fail-closed: sin conceptos activados no se genera un reporte vacío
  // (misma guardia que el PDF y el Excel — el llamador también bloquea).
  if (!hasAnySummaryConcept(ctx.concepts)) {
    throw new Error('Selecciona al menos un concepto para el reporte.');
  }
  const { report, startDate, endDate, options } = ctx;
  const orientation = ctx.orientation === 'horizontal' ? 'horizontal' : 'vertical';
  const sn = ctx.storeInfo?.name || 'Tienda';

  // ── Mismos summaries que el PDF (fetch una vez si no vienen inyectados) ──
  const isDiario = ctx.template === 'diario';
  const summed: CashReportSummaries = (summaries && summaries.itemsSummary && summaries.commissionsSummary && summaries.paymentTotals && summaries.productionOrders !== undefined)
    ? summaries
    : (summaries && summaries.itemsSummary && summaries.commissionsSummary && !isDiario
      ? summaries
      : await (isDiario ? fetchDiarioSummaries(startDate, endDate) : fetchEstandarSummaries(startDate, endDate)));

  // ── Comisión sugerida: MISMA fuente que el PDF (sin 2ª lógica) ──
  const suggestedByProduct = suggestedCommissions ?? await fetchSuggestedCommissionsByProduct(startDate, endDate);
  const itemsWithCommission = ((((summed as Record<string, unknown>) ?? {}).itemsSummary as any)?.items || []).map((it: any) => ({
    ...it,
    commission_suggested: Number(suggestedByProduct.get(String(it.product_id)) || 0),
  }));

  // ── Resúmenes por moneda + resultado personalizado (fórmula centralizada) ──
  const cupSummary = computeDailySummary(report, 'CUP', summed.paymentTotals as never);
  const usdSummary = computeDailySummary(report, 'USD', summed.paymentTotals as never);
  const salesCounts = ctx.salesCounts ?? {
    validas: ctx.selectionMeta?.total ?? 0,
    seleccionadas: ctx.selectionMeta?.included ?? ctx.selectionMeta?.total ?? 0,
  };
  const customResults = computeCustomResultsForPdf(report, ctx.officialReport, summed.paymentTotals, ctx.concepts, salesCounts);
  const idLabel = reportIdentificationLabel(customResults);

  const contentW = orientation === 'horizontal' ? mm(297 - 20) : mm(210 - 20);
  const d: WordSharedData = {
    sn, startDate, endDate, orientation,
    options,
    itemsWithCommission,
    cupSummary, usdSummary,
    customResults, idLabel, salesCounts,
    logoDataUrl: await loadLogo(ctx.storeInfo),
    contentW,
    usdWillRender: options.includeUsd !== false && (
      usdSummary.ventasTotales > 0 || usdSummary.ventasCash > 0
      || usdSummary.saldoInicial > 0 || Math.abs(usdSummary.liquidacionBilletes) > 0.005
      || Math.abs(usdSummary.efectivoEsperado) > 0.005
      || breakdownTotal(ctx.usdBreakdown) > 0
      || itemsWithCommission.some((it: any) => (Number(it.usd_total || 0)) > 0)
    ),
  };

  let sections: ISectionOptions[];
  if (isDiario) {
    sections = buildDiarioSections(d, ctx, summed.productionOrders || []);
  } else {
    // Plantilla 'simple': fidelidad a SU descripción (sin desglose) — igual que el PDF.
    const effectiveOptions: CashReportPdfOptions = ctx.template === 'simple'
      ? { ...options, includeBreakdown: false, includeUsd: false, includeCashBreakdown: false }
      : options;
    const estandarD: WordSharedData = { ...d, options: effectiveOptions };
    const children = await buildEstandarChildren(estandarD, ctx, effectiveOptions, summed);
    const prefix = `CostPro — Reporte de Caja · ${sn} · `;
    sections = [{
      properties: {
        page: {
          size: {
            // Dimensiones de RETRATO: docx las intercambia solo si es LANDSCAPE.
            width: mm(210),
            height: mm(297),
            orientation: orientation === 'horizontal' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: { top: mm(16), bottom: mm(14), left: mm(12), right: mm(12), footer: mm(6), header: mm(6) },
        },
        type: SectionType.NEXT_PAGE,
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [
              new TextRun({ text: prefix, font: FONT, size: 12, color: C_MUTED }),
              new TextRun({ children: ['Página ', PageNumber.CURRENT], font: FONT, size: 12, color: C_MUTED }),
              new TextRun({ text: ' de ', font: FONT, size: 12, color: C_MUTED }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 12, color: C_MUTED }),
            ],
          })],
        }),
      },
      children,
    }];
  }

  const doc = new Document({
    creator: 'CostPro',
    title: `Reporte de Entrega — ${sn}`,
    description: `Reporte de Caja — Entrega (${ctx.template}) del ${startDate} al ${endDate}`,
    sections,
  });
  return { doc, filename: cashReportWordFilename(sn, startDate) };
}

/** Construye el .docx final y devuelve el Blob listo para descargar. */
export async function buildCashReportWordBlob(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<{ blob: Blob; filename: string }> {
  const { doc, filename } = await buildCashReportWordDocument(ctx, summaries, suggestedCommissions);
  // Packer.toBuffer funciona en navegador y pruebas (mismo patrón que
  // CostSheetNarrative — el export Word preexistente del repositorio).
  const buffer = await Packer.toBuffer(doc);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { blob, filename };
}

/** Descarga en el navegador (patrón del PDF y del Excel: acción explícita). */
export async function descargarCashReportWord(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<string> {
  const { blob, filename } = await buildCashReportWordBlob(ctx, summaries, suggestedCommissions);
  downloadBlob(blob, filename);
  return filename;
}
