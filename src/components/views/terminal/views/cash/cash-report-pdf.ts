/**
 * cash-report-pdf.ts — Generadores PDF del Reporte de Caja — Entrega.
 *
 * CAMBIO 2026-10 (vista dedicada CashReportView): portado del antiguo
 * CashReportModal SIN alterar el documento producido (fidelidad de layout,
 * importes, firmas y paginación). Diferencias deliberadas:
 *
 *  1. SIN import estático de jspdf: usa createPDFDocument() de lib/export/
 *     lazy-pdf (import dinámico). El chunk de jspdf (~600KB) solo descarga
 *     al previsualizar o exportar — nunca al abrir la vista (W2/W3).
 *  2. Los builders DEVUELVEN el documento: la vista puede hacer doc.save()
 *     (descarga explícita) o doc.output('bloburl') (vista previa en iframe)
 *     desde la MISMA fuente de presentación — sin duplicar reglas.
 *  3. Plantilla 'simple': su descripción promete "Resumen básico sin desglose".
 *     Hoy (bug preexistente) renderizaba idéntico a 'estándar'. Se implementa
 *     forzando includeBreakdown/includeUsd=false SOLO para esta plantilla —
 *     cambio de presentación, no contable (el desglose es conteo del usuario,
 *     no datos del sistema).
 *  4. Toggles detailSales/detailCommissions del panel eran muertos (las
     * secciones PRODUCTOS VENDIDOS y COMISIONES ya se incluían siempre).
 *     Se eliminan del panel; el documento no cambia.
 *  5. El bloque de desglose de la plantilla Diario lista las denominaciones
 *     ACTIVAS del usuario (defaults activadas + personalizadas) en vez de
 *     listas fijas [1000..1] — para reflejar 2000/5000 y las personalizadas.
 *     Totales sin cambio: los subtotales provienen del mismo conteo.
 */

import { formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { COLLECTION_EPS } from '@/lib/cash-report/collection-currency';
import type { jsPDF } from 'jspdf';
import type { CashReport } from '@/types';
import {
  breakdownTotal, formatUsd, LS_KEYS,
  type Breakdown, type PdfTemplate, type Currency, type PdfOrientation,
} from './cash-report-core';
import {
  computeDailySummary, computeCuadre, cuadreLabel, splitItemPortion, lineTotalCup,
  type DailySummary, type TxSplit,
} from '@/lib/cash-report/summary';

export interface CashReportStoreInfo {
  name: string; logo_url: string | null; address: string | null;
  phone: string | null; email: string | null; reeup: string | null; nit: string | null;
}

export interface CashReportPdfOptions {
  detailPayments: boolean;      // detalle de pagos a proveedores
  detailProduction: boolean;    // detalle de órdenes de producción/servicios
  includeBreakdown: boolean;    // desglose de billetes CUP
  includeUsd: boolean;          // cuadre USD si hay
  includeSignature: boolean;    // líneas de firma
  /** §8.1 del brief: incluir la página/sección «Reporte de Órdenes de Trabajo». */
  includeOtReport: boolean;
  /** §8.2: mostrar la columna «Comisión» en la tabla de movimientos (el cálculo del resumen se conserva). */
  includeCommissionColumn: boolean;
  /** §9: false = CUP y USD en la misma hoja (corrido/compacto) · true = USD en página propia. */
  usdSeparatePage: boolean;
  /** MISIÓN 2026-10-22 (Parte A/B): «Desglose de efectivo» — controla el bloque
   *  de desglose (denominaciones + contado + cuadre) de forma consistente en
   *  UI, PDF y Excel. DISTINTO de includeBreakdown («Desglose de billetes»):
   *  este omite las FILAS por denominación dentro del bloque; includeCashBreakdown
   *  omite el bloque completo. Valor inicial true = coherente con el
   *  comportamiento pre-existente (Diario renderizaba el bloque incondicionalmente). */
  includeCashBreakdown: boolean;
}

export const DEFAULT_PDF_OPTIONS: CashReportPdfOptions = {
  detailPayments: false,
  detailProduction: false,
  includeBreakdown: true,
  includeUsd: true,
  includeSignature: true,
  includeOtReport: true,
  includeCommissionColumn: true,
  usdSeparatePage: true,
  includeCashBreakdown: true,
};

// ── Persistencia de las opciones del documento (MISIÓN 2026-10-22 · Parte A) ─
// Clave: LS_KEYS.pdfOptions = 'costpro:cash-report:pdf-options:v1' (core).
// Esquema: { [clave de CashReportPdfOptions]: boolean } — se valida clave a
// clave contra las conocidas del dominio; los defaults SOLO se aplican cuando
// no existe preferencia guardada VÁLIDA para esa clave (regla B-1). Un JSON
// antiguo/corrupto se recupera con los defaults en las claves afectadas, sin
// bloquear la interfaz (try/catch, mismo patrón que loadPdfTemplate).
const PDF_OPTION_KEYS = Object.keys(DEFAULT_PDF_OPTIONS) as Array<keyof CashReportPdfOptions>;

export function loadPdfOptions(): CashReportPdfOptions {
  if (typeof window === 'undefined') return { ...DEFAULT_PDF_OPTIONS };
  try {
    const raw = window.localStorage.getItem(LS_KEYS.pdfOptions);
    if (!raw) return { ...DEFAULT_PDF_OPTIONS };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_PDF_OPTIONS };
    const obj = parsed as Record<string, unknown>;
    const out = { ...DEFAULT_PDF_OPTIONS };
    for (const key of PDF_OPTION_KEYS) {
      const v = obj[key];
      if (typeof v === 'boolean') out[key] = v; // válido → preferencia guardada
      // ausente/no boolean → conserva el default (no sobrescribe con basura)
    }
    return out;
  } catch {
    return { ...DEFAULT_PDF_OPTIONS };
  }
}

export function savePdfOptions(options: CashReportPdfOptions): void {
  if (typeof window === 'undefined') return;
  try {
    // Solo claves conocidas y valores booleanos: el esquema queda estable aunque
    // el objeto crezca en futuras versiones (la clave v1 se documenta en core).
    const out: Record<string, boolean> = {};
    for (const key of PDF_OPTION_KEYS) out[key] = options[key] === true;
    window.localStorage.setItem(LS_KEYS.pdfOptions, JSON.stringify(out));
  } catch {}
}

export interface CashReportPdfContext {
  report: CashReport;
  template: PdfTemplate;
  startDate: string;
  endDate: string;
  storeInfo: CashReportStoreInfo | null;
  deliveredBy: string;
  recipientName: string;
  /** INC-2026-10-19: nombre «Hecho por» del pie de firmas (Diario). Opcional
   *  para no romper llamadas existentes; viene de la UI (nunca hardcodeado). */
  madeBy?: string;
  /** Denominaciones activas CUP (defaults activadas + personalizadas, desc). */
  cupDenoms: number[];
  /** Denominaciones activas USD. */
  usdDenoms: number[];
  cupBreakdown: Breakdown;
  usdBreakdown: Breakdown;
  options: CashReportPdfOptions;
  /** §1 del brief: orientación del documento (persistida en core). */
  orientation?: PdfOrientation;
}

/** Datos auxiliares que los builders necesitan (fetchables fuera para cachearlos).
 *  Tipado any: refleja las respuestas de apiFetch (igual que el modal original). */
export interface CashReportSummaries {
  itemsSummary?: any;
  commissionsSummary?: any;
  paymentTotals?: any;
  productionOrders?: any[];
}

export function periodISO(startDate: string, endDate: string) {
  return {
    sISO: new Date(startDate + 'T00:00:00').toISOString(),
    eISO: new Date(endDate + 'T23:59:59.999').toISOString(),
  };
}

/** Fetch de resúmenes para la plantilla DIARIO (productos, pagos, comisiones, órdenes). */
export async function fetchDiarioSummaries(startDate: string, endDate: string): Promise<Required<CashReportSummaries>> {
  const { sISO, eISO } = periodISO(startDate, endDate);
  const [itemsSummary, paymentTotalsRes, commissionsRes, productionOrders] = await Promise.all([
    apiFetch(`/api/cash-report/items-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 })),
    apiFetch(`/api/cash-report/payment-totals?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ totals: {} })),
    apiFetch(`/api/cash-report/commissions-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ workers: [], total_cup: 0 })),
    // MISIÓN 2026-10-23 (§7): listado OPERATIVO — órdenes creadas en el
    // período cuyo estado NO es terminal (cerradas/completadas/anuladas no
    // requieren entrega ni gestión → fuera del reporte; los registros
    // históricos se conservan íntegros en la base). El API ahora RESPETA
    // start_date/end_date/limit (antes los descartaba y devolvía las 200
    // órdenes más recientes de cualquier estado — causa raíz de «aparecen
    // numerosas órdenes de trabajo» en el Reporte Entrega).
    apiFetch(`/api/production-orders?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}&status_group=operative&limit=100`).then(d => Array.isArray(d) ? d : (d?.data || d?.orders || [])).catch(() => []),
  ]);
  return { itemsSummary, paymentTotals: paymentTotalsRes, commissionsSummary: commissionsRes, productionOrders };
}

/** Fetch de resúmenes para la plantilla ESTÁNDAR (productos + comisiones). */
export async function fetchEstandarSummaries(startDate: string, endDate: string): Promise<Pick<CashReportSummaries, 'itemsSummary' | 'commissionsSummary'>> {
  const { sISO, eISO } = periodISO(startDate, endDate);
  const [itemsSummary, commissionsSummary] = await Promise.all([
    apiFetch(`/api/cash-report/items-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 })),
    apiFetch(`/api/cash-report/commissions-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ workers: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 })),
  ]);
  return { itemsSummary, commissionsSummary };
}

/**
 * Construye el documento PDF según la plantilla. Devuelve el doc sin guardar:
 *   descarga → doc.save(nombre) ; vista previa → doc.output('bloburl').
 */
export async function buildCashReportPdf(ctx: CashReportPdfContext, summaries?: CashReportSummaries): Promise<jsPDF> {
  // §1 del brief: la orientación afecta al documento completo (p = vertical, l = horizontal).
  const orientation: 'p' | 'l' = ctx.orientation === 'horizontal' ? 'l' : 'p';
  const doc = await createPDFDocument(orientation, 'mm', 'a4');
  // Plantilla 'simple': fidelidad a SU descripción (sin desglose) — ver cabecera.
  const effectiveOptions: CashReportPdfOptions = ctx.template === 'simple'
    ? { ...ctx.options, includeBreakdown: false, includeUsd: false, includeCashBreakdown: false }
    : ctx.options;
  if (ctx.template === 'diario') {
    return buildDiarioPdf(doc, ctx, summaries);
  }
  return buildEstandarPdf(doc, ctx, effectiveOptions, summaries);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLA ESTÁNDAR (portado 1:1 del modal — refactor 2026-07-20)
// ═══════════════════════════════════════════════════════════════════════════
async function buildEstandarPdf(doc: jsPDF, ctx: CashReportPdfContext, options: CashReportPdfOptions, summaries?: CashReportSummaries): Promise<jsPDF> {
  const { report, startDate, endDate, storeInfo, deliveredBy, recipientName, cupBreakdown, usdBreakdown, cupDenoms } = ctx;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12; let y = 18;
  const sn = storeInfo?.name || 'Tienda';
  const es = (need: number) => { if (y + need > ph - m) { doc.addPage(); y = m; } };
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;

  const C_PRIMARY: [number, number, number] = [22, 163, 74];
  const C_DARK: [number, number, number] = [17, 24, 39];
  const C_MUTED: [number, number, number] = [107, 114, 128];
  const C_LIGHT: [number, number, number] = [243, 244, 246];
  const C_BORDER: [number, number, number] = [229, 231, 235];
  const C_SUCCESS: [number, number, number] = [22, 163, 74];
  const C_DANGER: [number, number, number] = [220, 38, 38];
  const C_WARN: [number, number, number] = [217, 119, 6];

  const setFill = (c: [number, number, number]) => { doc.setFillColor(c[0], c[1], c[2]); };
  const setText = (c: [number, number, number]) => { doc.setTextColor(c[0], c[1], c[2]); };
  const setDraw = (c: [number, number, number]) => { doc.setDrawColor(c[0], c[1], c[2]); };
  const hr = (color: [number, number, number] = C_BORDER, w: number = 0.3) => {
    setDraw(color); doc.setLineWidth(w); doc.line(m, y, pw - m, y); y += 3;
  };
  const sectionTitle = (title: string, subtitle?: string) => {
    es(12);
    setFill(C_DARK);
    doc.rect(m, y - 1, pw - 2 * m, 7, 'F');
    setText([255, 255, 255]);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(title, m + 2, y + 4);
    if (subtitle) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(subtitle, pw - m - 2, y + 4, { align: 'right' });
    }
    y += 8;
    setText(C_DARK);
  };
  const renderTable = (
    headers: string[],
    rows: (string | number)[][],
    colWidths: number[],
    opts: { align?: ('left' | 'right' | 'center')[]; totalsRow?: (string | number)[] } = {}
  ) => {
    const rowH = 6;
    const headerH = 7;
    const tableW = colWidths.reduce((s, w) => s + w, 0);
    const startX = m;
    if (y + headerH + rows.length * rowH > ph - m - 10) { doc.addPage(); y = m; }
    setFill(C_DARK);
    doc.rect(startX, y, tableW, headerH, 'F');
    setText([255, 255, 255]);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    let cx = startX;
    headers.forEach((h, i) => {
      const align = opts.align?.[i] || 'left';
      if (align === 'right') doc.text(h, cx + colWidths[i] - 1, y + 5, { align: 'right' });
      else if (align === 'center') doc.text(h, cx + colWidths[i] / 2, y + 5, { align: 'center' });
      else doc.text(h, cx + 1, y + 5);
      cx += colWidths[i];
    });
    y += headerH;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    rows.forEach((row, ri) => {
      if (y + rowH > ph - m - 5) {
        doc.addPage(); y = m;
        setFill(C_DARK);
        doc.rect(startX, y, tableW, headerH, 'F');
        setText([255, 255, 255]);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        cx = startX;
        headers.forEach((h, i) => {
          const align = opts.align?.[i] || 'left';
          if (align === 'right') doc.text(h, cx + colWidths[i] - 1, y + 5, { align: 'right' });
          else if (align === 'center') doc.text(h, cx + colWidths[i] / 2, y + 5, { align: 'center' });
          else doc.text(h, cx + 1, y + 5);
          cx += colWidths[i];
        });
        y += headerH;
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      }
      if (ri % 2 === 0) { setFill(C_LIGHT); doc.rect(startX, y, tableW, rowH, 'F'); }
      setText(C_DARK);
      cx = startX;
      row.forEach((cell, i) => {
        const align = opts.align?.[i] || 'left';
        const txt = String(cell);
        if (align === 'right') doc.text(txt, cx + colWidths[i] - 1, y + 4.5, { align: 'right' });
        else if (align === 'center') doc.text(txt, cx + colWidths[i] / 2, y + 4.5, { align: 'center' });
        else doc.text(txt, cx + 1, y + 4.5);
        cx += colWidths[i];
      });
      y += rowH;
    });
    if (opts.totalsRow && opts.totalsRow.length === headers.length) {
      setFill(C_PRIMARY);
      doc.rect(startX, y, tableW, rowH + 1, 'F');
      setText([255, 255, 255]);
      doc.setFont('helvetica', 'bold');
      cx = startX;
      opts.totalsRow.forEach((cell, i) => {
        const align = opts.align?.[i] || 'left';
        const txt = String(cell);
        if (align === 'right') doc.text(txt, cx + colWidths[i] - 1, y + 5, { align: 'right' });
        else if (align === 'center') doc.text(txt, cx + colWidths[i] / 2, y + 5, { align: 'center' });
        else doc.text(txt, cx + 1, y + 5);
        cx += colWidths[i];
      });
      y += rowH + 1 + 3;
    } else {
      y += 2;
    }
    setText(C_DARK);
  };

  // ── P1: header + resumen ──
  if (storeInfo?.logo_url) {
    try {
      const r = await fetch(storeInfo.logo_url);
      const b = await r.blob();
      const du = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b); });
      doc.addImage(du, 'PNG', m, y - 4, 18, 18);
    } catch {}
  }
  setText(C_DARK);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(sn, m + (storeInfo?.logo_url ? 22 : 0), y + 2);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
  let addrY = y + 6;
  if (storeInfo?.address) { doc.text(storeInfo.address, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
  if (storeInfo?.phone) { doc.text(`Tel: ${storeInfo.phone}`, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
  if (storeInfo?.reeup) { doc.text(`REEUP: ${storeInfo.reeup}  ·  NIT: ${storeInfo?.nit || '—'}`, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
  y = Math.max(y + 18, addrY);
  hr(C_BORDER, 0.5);
  es(8);
  setText(C_DARK);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE CAJA — ENTREGA DE DINERO', m, y); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
  // MISIÓN 2026-10-23 (§6): período con flecha VECTORIAL (la fuente estándar
  // no codifica U+2192 en WinAnsi — el texto salía corrupto) y SIN truncar.
  drawTextWithArrow(doc, m, y, `Periodo: ${startDate}`, endDate, startDate === endDate, { fontSize: 8, color: C_MUTED }); y += 3.5;
  if (deliveredBy || recipientName) {
    doc.text(`Entrega: ${deliveredBy || '—'}    Recibe: ${recipientName || '—'}`, m, y); y += 3.5;
  }
  doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, m, y); y += 6;
  hr(C_BORDER, 0.3);

  const { itemsSummary, commissionsSummary } = summaries?.itemsSummary && summaries?.commissionsSummary
    ? { itemsSummary: summaries.itemsSummary, commissionsSummary: summaries.commissionsSummary }
    : await fetchEstandarSummaries(startDate, endDate);

  const sales: any[] = report.sales || [];
  const payments: any[] = report.payments || [];
  const commissions: any[] = report.commissions || [];
  const production: any[] = (report as any).production || [];

  const cupCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupTransferSales = sales.filter((s: any) => s.payment_method === 'transfer' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupZelleSales = sales.filter((s: any) => s.payment_method === 'zelle' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupCashPayments = payments.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupTransferPayments = payments.filter((p: any) => p.payment_method === 'transfer' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupCashCommissions = commissions.filter((c: any) => c.payment_method === 'cash' && c.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupCashProduction = production.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
  const cupTransferProduction = production.filter((p: any) => p.payment_method === 'transfer' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);

  sectionTitle('RESUMEN — FLUJO DE CAJA CUP', `${sales.length} grupos de ventas · ${payments.length} grupos de pagos`);
  const summaryRows: (string | number)[][] = [
    ['INGRESOS', '', '', ''],
    ['  Ventas en Efectivo', `${sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.transaction_count), 0)} txs`, '', fmt(cupCashSales)],
    ['  Ventas por Transferencia', `${sales.filter((s: any) => s.payment_method === 'transfer' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.transaction_count), 0)} txs`, '', fmt(cupTransferSales)],
    ...(cupZelleSales > 0 ? [['  Ventas por Zelle', `${sales.filter((s: any) => s.payment_method === 'zelle' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.transaction_count), 0)} txs`, '', fmt(cupZelleSales)]] : []),
    ['  Anticipos/Liquidaciones de Órdenes', `${production.reduce((s: number, x: any) => s + Number(x.payment_count), 0)} pagos`, '', fmt(cupCashProduction + cupTransferProduction)],
    ['SUBTOTAL INGRESOS', '', '', fmt(cupCashSales + cupTransferSales + cupZelleSales + cupCashProduction + cupTransferProduction)],
    ['', '', '', ''],
    ['EGRESOS (-)', '', '', ''],
    ['  Pagos a Proveedores (Recepciones)', `${payments.filter((p: any) => p.ref_type === 'receipt').reduce((s: number, x: any) => s + Number(x.payment_count), 0)} pagos`, '', fmt(payments.filter((p: any) => p.ref_type === 'receipt').reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['  Pagos por Servicios Recibidos', `${payments.filter((p: any) => p.ref_type === 'service').reduce((s: number, x: any) => s + Number(x.payment_count), 0)} pagos`, '', fmt(payments.filter((p: any) => p.ref_type === 'service').reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['  Comisiones a Trabajadores', `${commissions.reduce((s: number, x: any) => s + Number(x.commission_count), 0)} pagos`, '', fmt(commissions.reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['SUBTOTAL EGRESOS', '', '', fmt(cupCashPayments + cupTransferPayments + cupCashCommissions)],
    ['', '', '', ''],
    ['(-) Transferencias (no se entregan en efectivo)', '', '', fmt(cupTransferSales + cupTransferProduction)],
  ];
  const dineroEntregar = cupCashSales + cupCashProduction - cupCashPayments - cupCashCommissions;
  renderTable(
    ['Concepto', 'Documentos', '', 'Monto CUP'],
    summaryRows,
    [85, 30, 25, 40],
    { align: ['left', 'left', 'right', 'right'], totalsRow: ['DINERO A ENTREGAR EN EFECTIVO', '', '', fmt(dineroEntregar)] }
  );
  y += 6;

  if (y + 40 > ph - m - 10) { doc.addPage(); y = m; }
  sectionTitle('PRODUCTOS VENDIDOS', `${(itemsSummary as any)?.count || 0} productos · ${(itemsSummary as any)?.items?.reduce((s: number, i: any) => s + Number(i.transactions_count), 0) || 0} transacciones`);
  if ((itemsSummary as any)?.items?.length > 0) {
    // INCIDENTE 2026-10-16: cobros por MONEDA REAL — Efectivo/Transfer en CUP y
    // columna USD con el cobro original en USD (sin mezclar monedas).
    const productRows: (string | number)[][] = (itemsSummary as any).items.map((it: any) => [
      ((it.product_name as string) || '—').length > 30 ? (it.product_name as string).substring(0, 28) + '…' : ((it.product_name as string) || '—'),
      ((it.sku as string) || '—').length > 18 ? (it.sku as string).substring(0, 16) + '…' : ((it.sku as string) || '—'),
      Number(it.total_quantity).toFixed(2),
      fmt(Number(it.unit_price)),
      fmt(Number(it.total_cup)),
      fmt(Number(it.cash_cup ?? it.cash_paid ?? 0)),
      fmt(Number((it.transfer_cup ?? it.transfer_paid ?? 0)) + Number(it.zelle_cup ?? 0)),
      Number(it.usd_total || 0) > 0 ? formatUsd(Number(it.usd_total)) : '-',
    ]);
    renderTable(
      ['Producto', 'SKU', 'Cant.', 'P.Unit', 'Total CUP', 'Efectivo (CUP)', 'Transfer. (CUP)', 'USD'],
      productRows,
      [40, 26, 13, 19, 24, 24, 24, 20],
      {
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
        totalsRow: [
          'TOTALES', '', '', '',
          fmt(Number((itemsSummary as any).total_cup)),
          fmt(Number((itemsSummary as any).cash_cup ?? (itemsSummary as any).total_cash ?? 0)),
          fmt(Number((itemsSummary as any).transfer_cup ?? (itemsSummary as any).total_transfer ?? 0) + Number((itemsSummary as any).zelle_cup ?? 0)),
          Number((itemsSummary as any).usd_total || 0) > 0 ? formatUsd(Number((itemsSummary as any).usd_total)) : '-',
        ],
      }
    );
  } else {
    doc.setFontSize(9); setText(C_MUTED); doc.setFont('helvetica', 'italic');
    doc.text('No se vendieron productos en el periodo seleccionado.', m, y + 4); y += 8;
  }
  y += 6;

  if ((commissionsSummary as any)?.workers?.length > 0) {
    const minSpaceNeeded = 8 + 7 + 6 * 3;
    if (y + minSpaceNeeded > ph - m - 10) { doc.addPage(); y = m; }
    sectionTitle('COMISIONES A TRABAJADORES', `${(commissionsSummary as any).count} trabajadores · ${(commissionsSummary as any).workers.reduce((s: number, w: any) => s + Number(w.count), 0)} pagos`);
    const workerRows: (string | number)[][] = (commissionsSummary as any).workers.map((w: any) => [
      w.worker_name, w.ci, String(w.count), ((w.periods as string[])?.[0] || '—').substring(0, 22),
      fmt(Number(w.cash_paid)), fmt(Number(w.transfer_paid)), fmt(Number(w.zelle_paid)), fmt(Number(w.total_amount_cup)),
    ]);
    renderTable(
      ['Trabajador', 'CI', 'Pagos', 'Periodo', 'Efectivo', 'Transfer', 'Zelle', 'Total CUP'],
      workerRows,
      [40, 22, 12, 35, 22, 22, 18, 26],
      {
        align: ['left', 'left', 'center', 'left', 'right', 'right', 'right', 'right'],
        totalsRow: ['TOTALES', '', '', '', fmt(Number((commissionsSummary as any).total_cash)), fmt(Number((commissionsSummary as any).total_transfer)), fmt(Number((commissionsSummary as any).total_zelle)), fmt(Number((commissionsSummary as any).total_cup))],
      }
    );
    y += 6;
  }

  if (options.detailProduction && production.length > 0) {
    if (y + 30 > ph - m - 10) { doc.addPage(); y = m; }
    sectionTitle('ÓRDENES DE PRODUCCIÓN/SERVICIO', 'Anticipos + Liquidaciones recibidas (INGRESOS)');
    for (const p of production) {
      es(12);
      setText(C_DARK);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(`${methodLabel(String(p.payment_method))} (${p.currency}) · ${p.ref_type === 'production_order' ? 'Producción' : 'Trabajo'}`, m, y); y += 4;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
      doc.text(`${p.payment_count} pagos · Total: ${fmt(Number(p.total), String(p.currency))}`, m, y); y += 5;
      try {
        const items = await fetchDetailRows(startDate, endDate, 'payment', String(p.payment_method), String(p.currency), String(p.ref_type));
        if (items.length > 0) {
          const prodRows: (string | number)[][] = items.map((it: any) => {
            const date = String(it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
            const amt = Number(it.amount_cup || it.amount || 0);
            const ref = String(it.reference || it.notes || it.customer_name || '');
            return [date, ref.substring(0, 35), fmt(amt)];
          });
          renderTable(['Fecha', 'Referencia', 'Monto CUP'], prodRows, [35, 95, 35], { align: ['left', 'left', 'right'] });
        }
      } catch {}
      y += 4;
    }
  }

  if (options.detailPayments && payments.length > 0) {
    if (y + 30 > ph - m - 10) { doc.addPage(); y = m; }
    sectionTitle('SALIDAS DE DINERO', 'Pagos a proveedores, recepciones y servicios');
    for (const p of payments) {
      es(12);
      setText(C_DARK);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(`${methodLabel(String(p.payment_method))} (${p.currency}) · ${p.ref_type === 'receipt' ? 'Recepción de Mercancía' : 'Servicio Recibido'}`, m, y); y += 4;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_DANGER);
      doc.text(`${p.payment_count} pagos · Total: -${fmt(Number(p.total), String(p.currency))}`, m, y); y += 5;
      try {
        const items = await fetchDetailRows(startDate, endDate, 'payment', String(p.payment_method), String(p.currency), String(p.ref_type));
        if (items.length > 0) {
          const payRows: (string | number)[][] = items.map((it: any) => {
            const date = String(it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
            const amt = Number(it.amount_cup || it.amount || 0);
            const ref = String(it.reference || it.notes || '');
            return [date, ref.substring(0, 35), `-${fmt(amt)}`];
          });
          renderTable(['Fecha', 'Referencia', 'Monto CUP'], payRows, [35, 95, 35], { align: ['left', 'left', 'right'] });
        }
      } catch {}
      y += 3;
    }
  }

  // ── Desglose + firmas ──
  // MISIÓN 2026-10-22 (Parte B): «Desglose de efectivo» (includeCashBreakdown)
  // gobierna la SECCIÓN completa; «Desglose de billetes» (includeBreakdown)
  // gobierna las tablas por denominación DENTRO de la sección.
  if (options.includeCashBreakdown !== false) {
    if (y + 80 > ph - m - 10) { doc.addPage(); y = m; }
    sectionTitle('DESGLOSE DE BILLETES PARA ENTREGA', 'Conteo físico de efectivo');
  }
  const cupTotal = breakdownTotal(cupBreakdown);
  const expectedCup = report?.cash_balance_cup ?? (report?.totals as any | undefined)?.balance_cup as number ?? 0;
  const cupDifference = cupTotal - expectedCup;

  if (options.includeCashBreakdown !== false && options.includeBreakdown) {
    es(8);
    setText(C_DARK); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Desglose CUP', m, y); y += 5;
    const cupEntries = Object.entries(cupBreakdown).filter(([, c]) => Number(c) > 0);
    if (cupEntries.length > 0) {
      const cupRows: (string | number)[][] = cupEntries.map(([d, c]) => [`$${d}`, String(c), fmt(Number(d) * Number(c))]);
      renderTable(
        ['Denominación', 'Cantidad', 'Subtotal'],
        cupRows, [50, 50, 65],
        { align: ['left', 'center', 'right'], totalsRow: ['TOTAL CONTADO', '', fmt(cupTotal)] }
      );
      es(6);
      setText(cupDifference === 0 ? C_SUCCESS : cupDifference > 0 ? C_WARN : C_DANGER);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
      doc.text(`Diferencia: ${fmt(Math.abs(cupDifference))} ${dl}`, m, y); y += 8;
    } else {
      setText(C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      doc.text('(Sin desglose ingresado — use el botón "Sugerir" en la UI)', m, y); y += 6;
    }
  }

  if (options.includeCashBreakdown !== false && !options.includeBreakdown) {
    // Bloque presente sin filas por denominación: totales y cuadre directos.
    es(6);
    setText(C_DARK); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Desglose CUP', m, y); y += 5;
    setText(C_DARK); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Efectivo contado: ${fmt(cupTotal)}`, m, y); y += 5;
    setText(cupDifference === 0 ? C_SUCCESS : cupDifference > 0 ? C_WARN : C_DANGER);
    doc.setFont('helvetica', 'bold');
    const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
    doc.text(`Diferencia: ${fmt(Math.abs(cupDifference))} ${dl}`, m, y); y += 6;
  }

  if (options.includeCashBreakdown !== false && options.includeUsd) {
    const usdCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);
    const usdTotal = breakdownTotal(usdBreakdown);
    if (usdCashSales > 0 || usdTotal > 0) {
      es(8);
      setText(C_DARK); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text('Desglose USD', m, y); y += 5;
      const usdEntries = Object.entries(usdBreakdown).filter(([, c]) => Number(c) > 0);
      if (usdEntries.length > 0) {
        const usdRows: (string | number)[][] = usdEntries.map(([d, c]) => [`$${d}`, String(c), `$${(Number(d) * Number(c)).toFixed(2)}`]);
        renderTable(
          ['Denominación', 'Cantidad', 'Subtotal USD'],
          usdRows, [50, 50, 65],
          { align: ['left', 'center', 'right'], totalsRow: ['TOTAL CONTADO USD', '', `$${usdTotal.toFixed(2)}`] }
        );
      }
    }
  }

  if (options.includeSignature) {
    es(30);
    setDraw(C_MUTED); doc.setLineWidth(0.3);
    const sigY = Math.max(y + 15, ph - 35);
    doc.line(m, sigY, m + 80, sigY);
    doc.line(pw - m - 80, sigY, pw - m, sigY);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
    doc.text(deliveredBy || 'Entrega', m, sigY + 5);
    doc.text(recipientName || 'Recibe', pw - m - 80, sigY + 5);
    doc.setFontSize(6); setText(C_MUTED);
    doc.text('Firma', m, sigY + 9);
    doc.text('Firma', pw - m - 80, sigY + 9);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6); setText(C_MUTED); doc.setFont('helvetica', 'normal');
    doc.text(`CostPro — Reporte de Caja · ${sn} · Página ${i} de ${pageCount}`, pw / 2, ph - 5, { align: 'center' });
  }
  return doc;
}

// ── helpers compartidos ─────────────────────────────────────────────────────
export const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 2026-10-19 — «Entrega en tienda» (defectos A y B):
// helpers PUROS de la tabla por producto de la plantilla Diario (hojas CUP/USD).
// Exportados para testeabilidad sin renderizar el PDF.
// ═══════════════════════════════════════════════════════════════════════════

export type SalesTableCurrency = 'CUP' | 'USD';

/**
 * Columnas de la tabla por hoja (defecto A): la hoja CUP presenta EXCLUSIVAMENTE
 * importes en CUP + comisión — el detalle en USD vive íntegro en la hoja USD
 * ([Efectivo (USD) | Zelle]). La columna «USD» se eliminó de la hoja CUP porque
 * duplicaba la presentación de la hoja USD (redundancia, sin doble conteo
 * contable subyacente). La plantilla Estándar (una sola hoja, sin hoja USD)
 * conserva SU columna USD propia — allí no es redundante.
 */
export function salesTableColumns(currency: SalesTableCurrency, includeCommission: boolean): string[] {
  if (currency === 'CUP') {
    return includeCommission
      ? ['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión']
      : ['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)'];
  }
  return ['Código', 'Descripción', 'Cant.', 'Efectivo (USD)', 'Zelle'];
}

/**
 * Pertenencia de cada producto a la hoja (defecto A): la hoja CUP incluye los
 * productos con cobros en CUP y también los SIN cobros USD (ventas total 0 con
 * incidencia — no tendrían hoja USD propia); los productos SOLO-USD viven
 * exclusivamente en la hoja USD. La hoja USD mantiene su criterio preexistente
 * (cobros en USD > ε).
 */
export function salesTableItems(items: any[], currency: SalesTableCurrency): any[] {
  if (currency === 'CUP') {
    return items.filter((it) => {
      const cupTotal = Number(it.cash_cup || 0) + Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0);
      const usdTotal = Number(it.cash_usd || 0) + Number(it.transfer_usd || 0) + Number(it.zelle_usd || 0);
      return cupTotal > COLLECTION_EPS || usdTotal <= COLLECTION_EPS;
    });
  }
  return items.filter((it) =>
    (Number(it.cash_usd || 0) + Number(it.transfer_usd || 0) + Number(it.zelle_usd || 0)) > COLLECTION_EPS);
}

/**
 * Cantidad de la fila en la moneda de la hoja (defecto B): qty_cup/qty_usd de
 * items-summary (cantidad atribuible a cobros de ESA moneda). Fallback
 * defensivo al total físico si el endpoint aún no expone el campo.
 */
export function salesTableQty(it: any, currency: SalesTableCurrency): number {
  const q = Number(currency === 'CUP' ? it.qty_cup : it.qty_usd);
  return Number.isFinite(q) ? q : Number(it.total_quantity || 0);
}

async function fetchDetailRows(startDate: string, endDate: string, type: string, method: string, currency: string, refType?: string): Promise<any[]> {
  const { sISO, eISO } = periodISO(startDate, endDate);
  let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${sISO}&end_date=${eISO}`;
  if (refType) url += `&ref_type=${refType}`;
  const data = await apiFetch(url);
  return Array.isArray(data) ? data : (data?.data || []);
}

/** Denominaciones a listar en los bloques del Diario: activas + cualquier denominación con conteo (nada contado se oculta). */
function displayDenoms(enabled: number[], breakdown: Breakdown, currency: Currency): number[] {
  const set = new Set<number>([...enabled, ...Object.keys(breakdown).map(Number)]);
  return [...set].sort((a, b) => b - a);
}

export function denomLabel(d: number, currency: Currency): string {
  return currency === 'CUP' ? `${d.toLocaleString('es-ES')}.00` : `${d.toFixed(2)}`;
}

// ── MISIÓN 2026-10-23 (§6): FLECHA DEL PERÍODO 100% IMPRIMIBLE ──────────────
// Causa raíz corregida: '→' (U+2192) NO existe en WinAnsiEncoding (la
// codificación de las fuentes estándar de jsPDF) → el texto salía corrupto
// ("!'" en vez de la flecha) y el período aparecía cortado/parcial. La flecha
// se dibuja AHORA como vector (línea + triángulo relleno): idéntica en
// pantalla, impresión y cualquier visor PDF, sin depender de la codificación.
// Verificado empíricamente: pdftoppm + VLM mostraban el carácter roto.
interface ArrowTextOpts {
  align?: 'left' | 'right' | 'center';
  fontSize?: number;
  bold?: boolean;
  color?: [number, number, number];
}

/** Ancho total que ocupará `before [→] after` con la fuente activa (mm). */
export function arrowTextWidth(doc: jsPDF, before: string, after: string, single: boolean): number {
  const wBefore = doc.getTextWidth(before);
  const wAfter = single ? 0 : doc.getTextWidth(after);
  return single ? wBefore : wBefore + 4.4 + wAfter;
}

/**
 * Dibuja `before [→] after` (o solo `before` cuando single=true) con la flecha
 * como gráfico vectorial. El color de la flecha acompaña al del texto.
 */
export function drawTextWithArrow(
  doc: jsPDF,
  x: number,
  y: number,
  before: string,
  after: string,
  single: boolean,
  opts: ArrowTextOpts = {},
): void {
  const fs = opts.fontSize ?? 9;
  doc.setFontSize(fs);
  doc.setFont('helvetica', opts.bold === true ? 'bold' : 'normal');
  const color = opts.color ?? [17, 24, 39];
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(color[0], color[1], color[2]);
  const wBefore = doc.getTextWidth(before);
  const wAfter = single ? 0 : doc.getTextWidth(after);
  const total = single ? wBefore : wBefore + 4.4 + wAfter;
  let sx = x;
  if (opts.align === 'right') sx = x - total;
  else if (opts.align === 'center') sx = x - total / 2;
  doc.text(before, sx, y);
  if (single) return;
  // Flecha vectorial: caña fina + punta sólida, centrada en la altura media
  // de la línea (aprox. un tercio del tamaño de fuente por encima de la base).
  const midY = y - fs * 0.30;
  const ax = sx + wBefore + 0.9;            // inicio de la caña
  const aw = 2.6;                            // largo de la caña
  const headW = 1.15;
  const headH = fs * 0.26;
  doc.setLineWidth(0.32);
  doc.line(ax, midY, ax + aw, midY);
  doc.triangle(ax + aw + headW, midY, ax + aw, midY - headH, ax + aw, midY + headH, 'F');
  doc.text(after, sx + wBefore + 4.4, y);
}

/** ¿El período es un solo día? (sin flecha — solo la fecha) */
export function isSingleDayPeriod(startDate: string, endDate: string): boolean {
  return startDate === endDate;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLA DIARIO (portado 1:1 del modal — estilo reporte diario de empresa)
// ═══════════════════════════════════════════════════════════════════════════
async function buildDiarioPdf(doc: jsPDF, ctx: CashReportPdfContext, summaries?: CashReportSummaries): Promise<jsPDF> {
  const { report, startDate, endDate, storeInfo, deliveredBy, recipientName, madeBy, cupBreakdown, usdBreakdown, cupDenoms, usdDenoms, options } = ctx;
  const orientation: PdfOrientation = ctx.orientation === 'horizontal' ? 'horizontal' : 'vertical';
  // Geometría dinámica: funciona igual en vertical (210×297) y horizontal (297×210).
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10; let y = 14;
  const contentW = pw - 2 * m;
  const sn = storeInfo?.name || 'Tienda';
  // §10: identificación del PERÍODO del reporte (antes: fecha de hoy — defecto).
  // MISIÓN 2026-10-23 (§6): la representación del período se compone con la
  // flecha VECTORIAL (drawTextWithArrow) — sin '→' literal (U+2192 no existe
  // en WinAnsi y jsPDF lo codificaba como basura visible "!'").

  const C_DARK: [number, number, number] = [17, 24, 39];
  const C_BLACK: [number, number, number] = [0, 0, 0];
  const C_MUTED: [number, number, number] = [107, 114, 128];
  const C_BORDER: [number, number, number] = [200, 200, 200];
  const C_SUCCESS: [number, number, number] = [22, 163, 74];
  const C_WARN: [number, number, number] = [217, 119, 6];

  const setText = (c: [number, number, number]) => { doc.setTextColor(c[0], c[1], c[2]); };
  const setDraw = (c: [number, number, number]) => { doc.setDrawColor(c[0], c[1], c[2]); };
  const fmtCup = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
  const fmtUsdFmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });

  // ── Resúmenes (fetch una vez, cacheable por el llamador) ──
  let { itemsSummary, paymentTotals, commissionsSummary, productionOrders } = (summaries && summaries.itemsSummary && summaries.commissionsSummary && summaries.paymentTotals && summaries.productionOrders)
    ? summaries as Required<CashReportSummaries>
    : await fetchDiarioSummaries(startDate, endDate);

  // ── AUDITORÍA 2026-10: resumen por moneda con la FÓRMULA CENTRALIZADA ──
  // Misma fuente para pantalla, previsualización y PDF (src/lib/cash-report/summary.ts).
  const cupSummary: DailySummary = computeDailySummary(report, 'CUP', paymentTotals);
  const usdSummary: DailySummary = computeDailySummary(report, 'USD', paymentTotals);

  // ── Comisión sugerida por producto: CÁLCULO REAL DEL SISTEMA (§5.1) ──
  // POST /api/commissions/calculate (motor de reglas por trabajador con
  // product_breakdown). Sin reglas → sin sugerencia (antes: 1% plano inventado).
  const suggestedByProduct = await fetchSuggestedCommissionsByProduct(startDate, endDate);

  const sales = report.sales || [];
  const production = (report as any).production || [];
  const commissionsWorkers = (commissionsSummary as any)?.workers as any[] || [];
  const totalCommissionsCup = (commissionsSummary as any)?.total_cup as number || 0;

  // Ítems con importes correctos (FIX D1: items-summary ahora devuelve precio×cant
  // y el split real por transacción) + comisión sugerida por producto.
  const itemsWithCommission = (((itemsSummary as any)?.items as any[]) || []).map((it: any) => ({
    ...it,
    commission_suggested: Number(suggestedByProduct.get(String(it.product_id)) || 0),
  }));

  // Logo
  let logoDataUrl: string | null = null;
  if (storeInfo?.logo_url) {
    try {
      const r = await fetch(storeInfo.logo_url);
      const b = await r.blob();
      logoDataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(b);
      });
    } catch {}
  }

  // ── Registro de secciones por página para el pie (dinámico: compacto/separado) ──
  const sectionPages: Array<{ from: number; to: number; name: string }> = [];
  const markSection = (name: string) => {
    const page = doc.getNumberOfPages();
    const last = sectionPages[sectionPages.length - 1];
    if (last && last.name === name && last.to === page - 1) {
      last.to = page;
    } else {
      sectionPages.push({ from: page, to: page, name });
    }
  };

  // ── Encabezado de página (MISIÓN 2026-10-23 §3/§6 — TRES líneas) ──
  // Antes: tienda+título (izq) y Período (der) COMPARTÍAN una línea 12pt →
  // colisión con nombres largos y período cortado. Ahora cada dato tiene su
  // línea propia — el período SIEMPRE se imprime completo, con la flecha
  // dibujada como vector (WinAnsi no codifica U+2192 — salía corrupto).
  // Estructura (misma en la sección de resumen y en la de detalle):
  //   Línea 1: ENERVIDA-VITALLCONS          (negrita 12 — reduce si excede)
  //   Línea 2: Reporte de Venta CUP         (negrita 10.5)
  //   Línea 3: Período: 2026-10-21 → 2026-10-22  (normal 9, línea propia)
  const renderPageHeader = (title: string) => {
    const headerH = logoDataUrl ? 21 : 15.5;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', m, y - 2, 12, 12); } catch {}
    }
    const tx = m + (logoDataUrl ? 16 : 0);
    const maxW = pw - m - tx;
    setText(C_DARK);
    // Línea 1 — tienda (ajusta el cuerpo antes que truncar: nunca se corta).
    doc.setFont('helvetica', 'bold');
    let storeFs = 12;
    doc.setFontSize(storeFs);
    while (doc.getTextWidth(sn) > maxW && storeFs > 7.5) { storeFs -= 0.5; doc.setFontSize(storeFs); }
    doc.text(sn, tx, y);
    y += 5.4;
    // Línea 2 — título del reporte.
    doc.setFontSize(10.5);
    doc.text(title, tx, y);
    y += 4.8;
    // Línea 3 — período COMPLETO en línea propia (flecha vectorial).
    drawTextWithArrow(doc, tx, y, `Período: ${startDate}`, endDate, startDate === endDate, { fontSize: 9, color: C_MUTED });
    if (orientation === 'horizontal') {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
      doc.text('Horizontal', pw - m, y, { align: 'right' });
    }
    y += headerH - 10.2;
  };

  // ── Fila 1 · bloque izquierdo: Resumen del Día (§4 — orden lógico) ──
  const renderIncomeBlock = (
    title: string,
    rows: Array<{ label: string; amount: number; isTotal?: boolean; isSubtotal?: boolean; note?: string }>,
    aEntregar: number,
    aEntregarLabel = 'Efectivo esperado a entregar',
  ) => {
    const blockW = contentW / 2 - 4;
    const x = m;
    let by = y;
    setText(C_DARK);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(title, x, by); by += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    for (const r of rows) {
      if (r.isTotal) { doc.setFont('helvetica', 'bold'); setText(C_DARK); }
      else if (r.isSubtotal) { doc.setFont('helvetica', 'bold'); setText(C_MUTED); }
      else { doc.setFont('helvetica', 'normal'); setText(C_DARK); }
      const maxLabel = blockW - 32;
      let lbl = r.label;
      if (doc.getTextWidth(lbl) > maxLabel) {
        while (lbl.length > 0 && doc.getTextWidth(lbl + '…') > maxLabel) lbl = lbl.slice(0, -1);
        lbl += '…';
      }
      doc.text(lbl, x, by);
      // Signo explícito para egresos/ajustes: −1.234,56 (auditable a simple vista).
      const signed = r.isTotal ? r.amount : (r.amount < 0 ? r.amount : (r.note === 'expense' ? -r.amount : r.amount));
      const amt = r.isTotal || r.amount === 0 || !r.note ? (r.amount === 0 ? '-' : fmtCup(r.amount)) : fmtCup(signed);
      doc.text(amt, x + blockW - 2, by, { align: 'right' });
      by += 4.2;
    }
    by += 2;
    setDraw(C_BLACK); doc.setLineWidth(0.8);
    doc.rect(x, by - 4, blockW, 7);
    setText(C_DARK);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(aEntregarLabel, x + 2, by + 1);
    doc.text(fmtCup(aEntregar), x + blockW - 2, by + 1, { align: 'right' });
    by += 9;
    return by;
  };

  // ── Fila 1 · bloque derecho: Desglose de efectivo (§8.3 — sin filas de importe 0) ──
  // MISIÓN 2026-10-22 (Parte B): «Desglose de billetes» (includeBreakdown)
  // controla las FILAS por denominación; «Desglose de efectivo» (la existencia
  // misma del bloque) se decide en cada llamada (includeCashBreakdown).
  const renderBreakdownBlock = (
    title: string,
    denominations: number[],
    breakdown: Breakdown,
    totalEntregado: number,
    cuadre: number,
    currency: Currency = 'CUP',
  ) => {
    const blockW = contentW / 2 - 4;
    const x = m + contentW / 2 + 4;
    let by = y;
    setText(C_DARK);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(title, x, by); by += 5;
    const showDenoms = options.includeBreakdown !== false;
    if (showDenoms) {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      setText(C_MUTED);
      doc.text('Denominación', x, by);
      doc.text('Cantidad', x + blockW * 0.55, by, { align: 'center' });
      doc.text('Importe', x + blockW - 2, by, { align: 'right' });
      by += 4;
      setDraw(C_BORDER); doc.setLineWidth(0.3);
      doc.line(x, by - 1.5, x + blockW, by - 1.5);
      by += 1;
      doc.setFont('helvetica', 'normal');
      setText(C_DARK);
    }
    let printedRows = 0;
    if (showDenoms) {
      for (const d of denominations) {
        const cnt = Number(breakdown[d] || 0);
        // §8.3: cantidad 0 → la fila NO se imprime (vista previa y PDF).
        if (cnt <= 0) continue;
        const imp = cnt * d;
        const lbl = denomLabel(d, currency);
        doc.text(lbl, x, by);
        doc.text(String(cnt), x + blockW * 0.55, by, { align: 'center' });
        doc.text(currency === 'CUP' ? fmtCup(imp) : fmtUsdFmt(imp), x + blockW - 2, by, { align: 'right' });
        by += 4.2;
        printedRows++;
      }
      if (printedRows === 0) {
        doc.setFont('helvetica', 'italic'); setText(C_MUTED);
        doc.text('Sin efectivo contado', x, by); by += 4.2;
        doc.setFont('helvetica', 'normal'); setText(C_DARK);
      }
    }
    by += 2;
    setDraw(C_BORDER); doc.setLineWidth(0.3);
    doc.line(x, by - 1.5, x + blockW, by - 1.5);
    by += 3;
    doc.setFont('helvetica', 'bold'); setText(C_DARK);
    doc.text('Efectivo contado / entregado', x, by);
    const totStr = currency === 'CUP' ? fmtCup(totalEntregado) : fmtUsdFmt(totalEntregado);
    // Etiqueta inequívoca (§4): lo contado por denominaciones.
    doc.text(totStr, x + blockW - 2, by, { align: 'right' });
    by += 5;
    // Cuadre con SIGNO y etiqueta de sentido (antes: valor absoluto ambiguo).
    const cuadreState = cuadreLabel(cuadre);
    setText(cuadreState === 'cuadrado' ? C_SUCCESS : C_WARN);
    doc.setFont('helvetica', 'bold');
    const labelTxt = cuadreState === 'cuadrado' ? 'Cuadre (cuadrado)' : `Cuadre (${cuadreState.toUpperCase()}): ${cuadre > 0 ? '+' : '-'}${currency === 'CUP' ? fmtCup(Math.abs(cuadre)) : fmtUsdFmt(Math.abs(cuadre))}`;
    let lbl = labelTxt;
    if (doc.getTextWidth(lbl) > blockW - 4) {
      while (lbl.length > 0 && doc.getTextWidth(lbl + '…') > blockW - 4) lbl = lbl.slice(0, -1);
      lbl += '…';
    }
    doc.text(lbl, x, by);
    by += 5;
    setText(C_MUTED); doc.setFont('helvetica', 'italic');
    doc.text('Nota:', x, by);
    by += 4;
    return by;
  };

  // ── Pie de firmas (opción «Líneas de firma») ──
  // INC-2026-10-19 (margen lógico + pies en ambos reportes):
  //  · NOMBRES 100% CONFIGURABLES desde la UI (Hecho por / Entregado por /
  //    Recibido por). SIN fallbacks hardcodeados: nombre vacío → la línea
  //    queda en blanco para rellenar a mano (nada de «Israel…»/«Belkis…»).
  //  · flow=true → el bloque fluye a continuación del contenido. Se usa cuando
  //    el reporte USD COMPARTIE hoja con el CUP: cada reporte lleva SU pie,
  //    sin solaparse, y entre ambos queda el separador visual.
  //  · flow=false → posición fija al pie de la hoja (clásico, hoja propia).
  const FIRMAS_BLOCK_H = 24;   // etiqueta + línea + nombre (mm)
  const renderFirmas = (opts: { flow?: boolean } = {}) => {
    const flow = opts.flow === true;
    if (flow && y + FIRMAS_BLOCK_H > ph - m - 4) { doc.addPage(); y = 14; }
    // Fijo: posición clásica al pie de hoja; si el contenido terminó muy abajo
    // (tabla llena + leyenda de incidencias), se empuja para no solapar.
    const sigY = flow ? y + 10 : Math.max(ph - 25, y + 8);
    const colW = contentW / 3;
    setDraw(C_MUTED); doc.setLineWidth(0.3);
    for (let i = 0; i < 3; i++) {
      const x = m + i * colW;
      doc.line(x + 5, sigY, x + colW - 5, sigY);
    }
    setText(C_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Hecho por:', m + 5, sigY - 4);
    doc.text('Entregado por:', m + colW + 5, sigY - 4);
    doc.text('Recibido por:', m + 2 * colW + 5, sigY - 4);
    setText(C_DARK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const clean = (s: string | undefined) => String(s || '').trim();
    const hecho = clean(madeBy);
    const entrega = clean(deliveredBy);
    const recibe = clean(recipientName);
    if (hecho) doc.text(hecho, m + 5, sigY + 5);
    if (entrega) doc.text(entrega, m + colW + 5, sigY + 5);
    if (recibe) doc.text(recibe, m + 2 * colW + 5, sigY + 5);
    if (flow) y = sigY + 9;
  };

  // ── Separador visual entre el reporte CUP y el USD (hoja compartida) ──
  // INC-2026-10-19: «no deja un margen lógico visual entre ambos reportes».
  // Aire + doble filete (fino + grueso) + aire: corte inequívoco entre los
  // dos documentos cuando comparten la misma hoja (§9 compacto).
  const renderSectionSeparator = () => {
    y += 6;
    setDraw(C_BORDER); doc.setLineWidth(0.3);
    doc.line(m, y, pw - m, y);
    y += 1.6;
    setDraw(C_BLACK); doc.setLineWidth(0.9);
    doc.line(m, y, pw - m, y);
    y += 7;
  };

  // ── Tabla de movimientos (§2: sin Clase · anchos proporcionales · headers repetidos) ──
  // AUDITORÍA 2026-10-19 (defectos A y B del reporte «Entrega en tienda»):
  //   A) La hoja CUP ya NO incluye la columna «USD»: el detalle en USD vive
  //      ÍNTEGRAMENTE en la hoja USD ([Efectivo (USD) | Zelle]). Antes el mismo
  //      importe aparecía en AMBAS hojas (redundancia pura de presentación —
  //      sin doble conteo contable: sales_split/computeDailySummary nunca
  //      mezclan monedas). Los totales de la hoja CUP quedan solo en CUP.
  //   B) La columna «Cant.» es ahora la cantidad ATRIBUIDA a la moneda de la
  //      hoja (qty_cup/qty_usd de items-summary: una línea cobrada en UNA sola
  //      moneda atribuye su cantidad completa a esa moneda; las líneas mixtas
  //      se reparten por valor cobrado). La fila de totales suma las
  //      cantidades de ESA hoja — la cantidad física nunca se duplica
  //      (invariante: qty_cup + qty_usd = total_quantity).
  const renderSalesTable = (currency: 'CUP' | 'USD', opts: { bottomReserve?: number } = {}): { totCash: number; totTransfer: number; totUsd: number; totCommission: number; totalPages: number } => {
    // §8.2: columna Comisión conmutable (solo página CUP); el ancho se redistribuye sin desplazar importes.
    const includeCommission = currency === 'CUP' && options.includeCommissionColumn !== false;
    const colNames = salesTableColumns(currency, includeCommission);
    const proportions = currency === 'CUP'
      ? (includeCommission
        ? [0.08, 0.26, 0.07, 0.18, 0.18, 0.23]
        : [0.09, 0.33, 0.09, 0.245, 0.245])
      : [0.11, 0.38, 0.10, 0.21, 0.20];
    const aligns: Array<'left' | 'right'> = colNames.map((_, i) => (i <= 1 ? 'left' : 'right')) as Array<'left' | 'right'>;
    const cols = colNames.map((name, i) => ({ name, w: proportions[i] * contentW, align: aligns[i] }));
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const rowH = 5;
    const headerH = 6;
    const colX: number[] = [];
    let accX = m;
    for (const c of cols) { colX.push(accX); accX += c.w; }

    const drawHeaderRow = (rowY: number) => {
      setText(C_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      cols.forEach((c, i) => {
        const pad = 2;
        if (c.align === 'right') doc.text(c.name, colX[i] + c.w - pad, rowY, { align: 'right' });
        else doc.text(c.name, colX[i] + pad, rowY);
      });
    };

    // Página CUP: productos con cobros en CUP (y los sin cobro/no-USD, que no
    // tienen hoja USD propia — p. ej. ventas total 0 con incidencia).
    // Página USD: solo productos con cobros en USD (criterio preexistente).
    const items = salesTableItems(itemsWithCommission, currency);
    const fmtAmt = currency === 'CUP' ? fmtCup : fmtUsdFmt;

    // Pre-dibujado del marco de la PRIMERA porción de tabla (la tabla fluye por
    // páginas: el marco se redibuja por página con sus filas).
    const drawTableFrame = (x: number, yTop: number, rows: number) => {
      const h = headerH + rows * rowH + rowH; // + totals row
      setDraw(C_BLACK); doc.setLineWidth(0.4);
      doc.rect(x, yTop, tableW, h);
      for (let i = 0; i < cols.length - 1; i++) doc.line(colX[i + 1], yTop, colX[i + 1], yTop + h);
      doc.line(x, yTop + headerH, x + tableW, yTop + headerH);
      doc.line(x, yTop + headerH + rows * rowH, x + tableW, yTop + headerH + rows * rowH);
    };

    let totCash = 0, totTransfer = 0, totUsd = 0, totCommission = 0, totQty = 0;
    let pageFirstRow = 0; // índice del primer ítem de la página actual
    let pages = 1;

    // Página 1 de la tabla (empieza en y actual)
    let yStart = y;
    // Cuenta filas que caben antes del pie. Reserva por defecto: pie fijo al
    // fondo (45). En hoja compartida CUP+USD el pie del reporte USD FLUYE tras
    // su tabla → se reserva además el bloque de firmas (INC-2026-10-19).
    const bottomReserve = opts.bottomReserve ?? 45;
    const fitsBeforeFooter = (yPos: number) => yPos + rowH < ph - bottomReserve;
    let i = 0;
    const drawTotalsRow = (rowY: number) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      setText(C_DARK);
      // Cantidad total de la hoja (B): suma de las cantidades atribuidas a
      // ESTA moneda — cuadra el detalle impreso con su total sin duplicar la
      // cantidad física entre hojas.
      drawCellText(2, rowY, totQty > 0 ? totQty.toFixed(2) : '-', 9);
      const cupIdx = 3, trIdx = 4;
      drawCellText(cupIdx, rowY, totCash > 0 ? fmtAmt(totCash) : '-', 9);
      drawCellText(trIdx, rowY, totTransfer > 0 ? fmtAmt(totTransfer) : '-', 9);
      if (includeCommission) drawCellText(5, rowY, totCommission > 0 ? fmtAmt(totCommission) : '-', 9);
    };
    const drawCellText = (colIdx: number, rowY: number, text: string, fontSize: number = 8) => {
      const col = cols[colIdx];
      const pad = 2;
      doc.setFontSize(fontSize);
      if (col.align === 'right') doc.text(text, colX[colIdx] + col.w - pad, rowY, { align: 'right' });
      else doc.text(text, colX[colIdx] + pad, rowY);
    };

    // Bucle con salto de página + REPETICIÓN de encabezados (P3)
    const renderChunk = () => {
      const rowsOnPage: any[] = [];
      let j = i;
      while (j < items.length && fitsBeforeFooter(y + headerH + (rowsOnPage.length + 1) * rowH + rowH + 4)) {
        rowsOnPage.push(items[j]); j++;
      }
      if (rowsOnPage.length === 0 && j < items.length) rowsOnPage.push(items[j++]); // al menos 1 fila
      drawTableFrame(m, y, rowsOnPage.length);
      drawHeaderRow(y + 4);
      y += headerH;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      setText(C_DARK);
      for (const it of rowsOnPage) {
        // Cobros en la MONEDA REAL (columnas separadas — nunca se suman CUP y USD).
        const cash = currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0);
        const transfer = currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0);
        const commission = Number(it.commission_suggested || 0);
        const qty = salesTableQty(it, currency);
        totCash += cash;
        totTransfer += transfer;
        totCommission += commission;
        totQty += qty;
        const rowY = y + 3.5;
        drawCellText(0, rowY, (it.sku as string || '').toString(), 8);
        let desc = ((it.product_name as string) || '').toString();
        const maxDescW = cols[1].w - 4;
        if (doc.getTextWidth(desc) > maxDescW) {
          while (desc.length > 0 && doc.getTextWidth(desc + '…') > maxDescW) desc = desc.slice(0, -1);
          desc += '…';
        }
        // Marca de incidencia de pago documentada (el cobro difiere del total histórico).
        if (it.has_payment_incident) desc = `* ${desc}`;
        drawCellText(1, rowY, desc, 8);
        drawCellText(2, rowY, qty.toFixed(2), 8);
        drawCellText(3, rowY, cash > 0 ? fmtAmt(cash) : '-', 8);
        drawCellText(4, rowY, transfer > 0 ? fmtAmt(transfer) : '-', 8);
        if (includeCommission) drawCellText(5, rowY, commission > 0 ? fmtAmt(commission) : '-', 8);
        y += rowH;
      }
      i = j;
    };

    if (items.length === 0) {
      // Tabla vacía visible (estado vacío explícito, §10)
      drawTableFrame(m, y, 0);
      drawHeaderRow(y + 4);
      y += headerH;
      setText(C_MUTED); doc.setFont('helvetica', 'italic');
      drawCellText(1, y + 3.5, 'Sin movimientos en el período', 8);
      y += rowH;
      return { totCash: 0, totTransfer: 0, totUsd: 0, totCommission: 0, totalPages: 1 };
    }
    renderChunk();
    while (i < items.length) {
      doc.addPage();
      pages++;
      y = 14;
      renderPageHeader(`Reporte de Venta ${currency} (cont.)`);
      renderChunk();
    }
    // Totales al final del detalle (una sola fila — nunca dentro de la suma)
    drawTotalsRow(y + 3.5);
    y += rowH + 4;
    // Leyenda de incidencias de pago documentadas (datos reales, sin inventar importes)
    if (currency === 'CUP' && itemsWithCommission.some((it: any) => it.has_payment_incident)) {
      setText(C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(7);
      doc.text('* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).', m, y + 2);
      y += 6;
    }
    void pageFirstRow;
    return { totCash, totTransfer, totUsd, totCommission, totalPages: pages };
  };

  // ══════════════ DOS SECCIONES SEPARABLES POR MONEDA (MISIÓN 2026-10-23 §3) ══════════════
  // Cada moneda se imprime como DOS documentos identificables por sí mismos:
  //   SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO: encabezado completo + resumen
  //     del día + desglose por denominaciones + contado/cuadre + pie de firmas.
  //     Funciona como COMPROBANTE DE ENTREGA sin depender de la sección 2.
  //   SEPARADOR FÍSICO: línea fina de corte con marcas en los extremos y aire
  //     a ambos lados (no atraviesa textos, tablas ni firmas) — permite cortar
  //     la hoja y separar ambas partes.
  //   SECCIÓN 2 — DETALLE DE VENTAS: encabezado COMPLETO repetido (tienda,
  //     título y período — identificable tras separarse) + tabla de ventas con
  //     totales + SU PROPIO pie de firmas.
  // §9 en dos modos: «USD en hoja separada» (true) o compacto (false = el
  // reporte USD fluye tras el CUP con separador de sección).
  const usdWillRender = options.includeUsd !== false && (
    usdSummary.ventasTotales > 0 || usdSummary.ventasCash > 0
    || breakdownTotal(usdBreakdown) > 0
    || itemsWithCommission.some((it: any) => (Number(it.usd_total || 0)) > 0)
  );

  // ── SEPARADOR FÍSICO DE CORTE (§3): fina línea horizontal + marcas ──
  // Claramente visible al imprimir; aire prudente arriba/abajo para no
  // confundirla con los bordes de tablas ni tocar firmas.
  const renderCutSeparator = () => {
    y += 7;
    if (y > ph - m - 6) { doc.addPage(); y = 14; }
    setDraw(C_BLACK);
    doc.setLineWidth(0.25);
    doc.line(m, y, pw - m, y);
    // Marcas de corte en los extremos (convención de imprenta — sin glifos).
    doc.setLineWidth(0.6);
    doc.line(m, y - 1.6, m, y + 1.6);
    doc.line(pw - m, y - 1.6, pw - m, y + 1.6);
    y += 8;
  };

  /**
   * Renderiza el reporte COMPLETO de una moneda en dos secciones separables.
   * `firstOnPage` indica si la moneda arranca página (USD separado / CUP).
   * En modo compacto, la sección 1 del USD fluye tras el detalle CUP con el
   * separador de sección (margen lógico INC-2026-10-19).
   */
  const renderCurrencyReport = (currency: 'CUP' | 'USD', firstOnPage: boolean) => {
    const curSummary = currency === 'CUP' ? cupSummary : usdSummary;
    const curBreakdown = currency === 'CUP' ? cupBreakdown : usdBreakdown;
    const curDenoms = currency === 'CUP' ? cupDenoms : usdDenoms;
    const title = `Reporte de Venta ${currency}`;

    // Modo compacto: si el resto de la hoja no puede acoger la sección 1
    // completa (encabezado + bloques + pie), el reporte abre hoja propia — el
    // SALTO ya es el margen visual (sin separador redundante) y NUNCA se
    // dibuja contenido por debajo del pie de página. El separador de doble
    // filete solo se dibuja cuando AMBOS reportes comparten la hoja.
    if (!firstOnPage) {
      if (y + 150 > ph - m - 4) { doc.addPage(); y = 14; }
      else renderSectionSeparator();
    }

    // ══ SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO ══
    renderPageHeader(title);
    markSection(currency);

    const s = curSummary;
    const incomeRows: Array<{ label: string; amount: number; isTotal?: boolean; isSubtotal?: boolean; note?: string }> = currency === 'CUP'
      ? [
          { label: 'Resumen del día (efectivo + transferencia)', amount: s.ventasTotales, isTotal: true },
          { label: 'Ventas en efectivo', amount: s.ventasCash },
          { label: 'Ventas por transferencia', amount: s.ventasTransfer },
        ]
      : [
          { label: 'Resumen del día (efectivo + Zelle)', amount: s.ventasTotales, isTotal: true },
          { label: 'Ventas en efectivo', amount: s.ventasCash },
          { label: 'Venta por Zelle', amount: s.ventasZelle },
        ];
    if (currency === 'CUP') {
      if (s.ventasZelle > 0) incomeRows.push({ label: 'Ventas por Zelle', amount: s.ventasZelle });
      if (s.ventasMixed > 0) incomeRows.push({ label: 'Ventas mixtas sin desglosar', amount: s.ventasMixed, isSubtotal: true });
      // MISIÓN DEFINITIVA 2026-10-24: equivalencia canónica en LÍNEA PROPIA
      // (contrato único §2) — jamás sumada a las filas de venta (no es una
      // segunda venta); la de efectivo SÍ alimenta el esperado a entregar.
      if (s.equivCashOtraMoneda > 0) incomeRows.push({ label: 'Equivalencia CUP de cobros en efectivo en otras monedas', amount: s.equivCashOtraMoneda });
      if (s.equivVouchersOtraMoneda > 0) incomeRows.push({ label: 'Equivalencia CUP de vouchers en otras monedas', amount: s.equivVouchersOtraMoneda, note: 'info' });
      if (s.otIngresosCash > 0) incomeRows.push({ label: 'Órdenes de trabajo (anticipos)', amount: s.otIngresosCash });
      // Comisiones PAGADAS desglosadas por medio (§4): transferencia NO toca el efectivo.
      if (s.comisionesCash > 0) incomeRows.push({ label: 'Comisiones pagadas en efectivo', amount: s.comisionesCash, note: 'expense' });
      if (s.comisionesTransfer > 0) incomeRows.push({ label: 'Comisiones pagadas por transferencia', amount: s.comisionesTransfer, note: 'info' });
      // Servicios recibidos: línea INDEPENDIENTE (§6) — ya no fusionados en proveedores.
      if (s.serviciosRecibidosCash > 0) incomeRows.push({ label: 'Servicios recibidos pagados en efectivo', amount: s.serviciosRecibidosCash, note: 'expense' });
      if (s.recibosProveedoresCash > 0) incomeRows.push({ label: 'Pagos a proveedores (efectivo)', amount: s.recibosProveedoresCash, note: 'expense' });
      if (s.ajustesPositivos > 0) incomeRows.push({ label: 'Ajustes extraordinarios (+)', amount: s.ajustesPositivos });
      if (s.ajustesNegativos > 0) incomeRows.push({ label: 'Ajustes extraordinarios (-)', amount: s.ajustesNegativos, note: 'expense' });
      // MISIÓN INGRESOS/EGRESOS 2026-10-20: documentos de caja (fondo de cambio
      // y otros) — filas independientes de los ajustes, auditables por separado.
      if (s.ingresosCaja > 0) incomeRows.push({ label: 'Ingresos de caja (fondo y otros)', amount: s.ingresosCaja });
      if (s.egresosCaja > 0) incomeRows.push({ label: 'Egresos de caja (fondo y otros)', amount: s.egresosCaja, note: 'expense' });
      if (s.reembolsosCash > 0) incomeRows.push({ label: 'Reembolsos de devoluciones (efectivo)', amount: s.reembolsosCash, note: 'expense' });
      // v2.23.0 (decisión del propietario 2026-10-21): reembolsos por voucher —
      // INFORMATIVO (nota 'info', igual que comisiones por transferencia): no
      // tocan el efectivo esperado; documenta el neto del lado vouchers.
      if (s.reembolsosVoucher > 0) incomeRows.push({ label: 'Reembolsos por voucher (transfer/Zelle)', amount: s.reembolsosVoucher, note: 'info' });
    } else {
      if (s.comisionesCash > 0) incomeRows.push({ label: 'Comisiones pagadas en efectivo', amount: s.comisionesCash, note: 'expense' });
      if (s.serviciosRecibidosCash > 0) incomeRows.push({ label: 'Servicios recibidos pagados en efectivo', amount: s.serviciosRecibidosCash, note: 'expense' });
    }
    const esperadoLabel = currency === 'CUP' ? 'Efectivo esperado a entregar' : 'Efectivo esperado a entregar (USD)';
    const blockEndY = renderIncomeBlock('Resumen del Día', incomeRows, s.efectivoEsperado, esperadoLabel);

    const totalCounted = breakdownTotal(curBreakdown);
    const cuadre = computeCuadre(totalCounted, s.efectivoEsperado);
    const displayDenomsList = displayDenoms(curDenoms, curBreakdown, currency);
    // «Desglose de efectivo» OFF → bloque omitido (la sección queda solo con
    // el Resumen; breakdownEndY = y mantiene la geometría intacta).
    const breakdownEndY = options.includeCashBreakdown === false
      ? y
      : renderBreakdownBlock(`Desglose de efectivo ${currency}`, displayDenomsList, curBreakdown, totalCounted, cuadre, currency);
    y = Math.max(blockEndY, breakdownEndY) + 5;

    // Pie de firmas de la SECCIÓN 1 (comprobante de entrega de efectivo).
    if (options.includeSignature !== false) renderFirmas({ flow: true });

    // ══ SEPARADOR FÍSICO entre las dos secciones (línea de corte) ══
    renderCutSeparator();

    // ══ SECCIÓN 2 — DETALLE DE VENTAS (encabezado COMPLETO repetido) ══
    // Salto de hoja solo si no cabe un mínimo inicial (encabezado + cabecera
    // de tabla + ~5 filas + firmas): la sección es identificable por sí misma
    // en la MISMA hoja (separada por la línea de corte) o en hoja propia.
    const firmasH2 = options.includeSignature !== false ? FIRMAS_BLOCK_H : 0;
    if (y + 62 + firmasH2 > ph - 12) { doc.addPage(); y = 14; }
    renderPageHeader(title);
    markSection(currency);
    // La tabla fluye con encabezados repetidos por página; reserva el pie de
    // firmas de la sección 2 (fluye tras el detalle).
    const reserve = options.includeSignature !== false ? 30 + FIRMAS_BLOCK_H : 30;
    renderSalesTable(currency, { bottomReserve: reserve });
    // Pie de firmas de la SECCIÓN 2 (al final del detalle — §3).
    if (options.includeSignature !== false) renderFirmas({ flow: true });
  };

  // Reporte CUP: siempre abre el documento en página propia.
  renderCurrencyReport('CUP', true);
  // Reporte USD (§9): hoja propia (default) o compacto tras el CUP con
  // separador de sección (margen lógico visual entre ambos reportes).
  if (usdWillRender) {
    if (options.usdSeparatePage !== false) {
      doc.addPage(); y = 14;
      renderCurrencyReport('USD', true);
    } else {
      renderCurrencyReport('USD', false);
    }
  }

  // ══════════════ SECCIÓN ÓRDENES DE TRABAJO (§8.1: conmutable) ══════════════
  if (options.includeOtReport !== false) {
    doc.addPage(); y = 14;
    renderPageHeader('Reporte de Órdenes de Trabajo');
    markSection('Órdenes');
    // MISIÓN 2026-10-23 (§7): semántica del listado documentada en el propio
    // documento — órdenes ABIERTAS del período (draft/approved/in_progress/
    // paused); las cerradas/completadas/anuladas son históricas y no requieren
    // entrega ni gestión (quedan en la base, fuera del listado operativo).
    setText(C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
    doc.text('Órdenes abiertas del período (pendientes de gestión). Las cerradas, completadas o anuladas no se listan.', m, y);
    y += 5;

    const cols = [
      { name: 'Código', w: 0.10 * contentW, align: 'left' as const },
      { name: 'Clasificación', w: 0.13 * contentW, align: 'left' as const },
      { name: 'Descripción', w: 0.45 * contentW, align: 'left' as const },
      { name: 'Cantidad', w: 0.08 * contentW, align: 'right' as const },
      { name: 'CUP', w: 0.13 * contentW, align: 'right' as const },
      { name: 'USD', w: 0.11 * contentW, align: 'right' as const },
    ];
    const tableW = cols.reduce((sum, c) => sum + c.w, 0);
    const rowH = 5;
    const headerH = 6;
    const colX: number[] = [];
    let accX = m;
    for (const c of cols) { colX.push(accX); accX += c.w; }
    const drawCell = (colIdx: number, rowY: number, text: string, fontSize: number = 8) => {
      const col = cols[colIdx];
      const pad = 2;
      doc.setFontSize(fontSize);
      if (col.align === 'right') doc.text(text, colX[colIdx] + col.w - pad, rowY, { align: 'right' });
      else doc.text(text, colX[colIdx] + pad, rowY);
    };

    const orders = (productionOrders as any[]) || [];
    const drawOtFrame = (yTop: number, rows: number) => {
      const h = headerH + (rows + 1) * rowH;
      setDraw(C_BLACK); doc.setLineWidth(0.4);
      doc.rect(m, yTop, tableW, h);
      for (let i = 0; i < cols.length - 1; i++) doc.line(colX[i + 1], yTop, colX[i + 1], yTop + h);
      doc.line(m, yTop + headerH, m + tableW, yTop + headerH);
      doc.line(m, yTop + headerH + rows * rowH, m + tableW, yTop + headerH + rows * rowH);
    };
    drawOtFrame(y, Math.max(1, orders.length));
    setText(C_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const headerY = y + 4;
    cols.forEach((c, i) => drawCell(i, headerY, c.name, 8));
    y += headerH;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(C_DARK);
    let totCup = 0, totUsd = 0;
    for (const ord of orders) {
      if (y > ph - 80) { doc.addPage(); y = 14; renderPageHeader('Reporte de Órdenes de Trabajo (cont.)'); }
      const num = (ord.order_number as string || '').toString();
      const desc = ((ord.description || ord.title || ord.customer_name || 'Orden de trabajo') as string).toString();
      const cupAmt = Number(ord.advance_currency === 'CUP' ? ord.advance_amount : (ord.budget_currency === 'CUP' ? ord.budget_total : 0));
      const usdAmt = Number(ord.advance_currency === 'USD' ? ord.advance_amount : (ord.budget_currency === 'USD' ? ord.budget_total : 0));
      totCup += cupAmt; totUsd += usdAmt;
      const rowY = y + 3.5;
      drawCell(0, rowY, num, 8);
      drawCell(1, rowY, 'Trabajo', 8);
      let d = desc;
      const maxDescW = cols[2].w - 4;
      if (doc.getTextWidth(d) > maxDescW) {
        while (d.length > 0 && doc.getTextWidth(d + '…') > maxDescW) d = d.slice(0, -1);
        d += '…';
      }
      drawCell(2, rowY, d, 8);
      drawCell(3, rowY, '1.00', 8);
      drawCell(4, rowY, cupAmt > 0 ? fmtCup(cupAmt) : '-', 8);
      drawCell(5, rowY, usdAmt > 0 ? fmtUsdFmt(usdAmt) : '-', 8);
      y += rowH;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const totalsY = y + 3.5;
    drawCell(4, totalsY, fmtCup(totCup), 9);
    drawCell(5, totalsY, totUsd > 0 ? fmtUsdFmt(totUsd) : '-', 9);
    y += rowH + 4;
    const incomeRows = [
      { label: 'Total órdenes (CUP)', amount: totCup, isTotal: true },
    ];
    const blockEndY = renderIncomeBlock('Resumen Órdenes', incomeRows, totCup, 'Total anticipos CUP');
    const cupDisplayDenoms = displayDenoms(cupDenoms, cupBreakdown, 'CUP');
    const cupTotalCounted = breakdownTotal(cupBreakdown);
    const cupCuadre = computeCuadre(cupTotalCounted, totCup);
    if (options.includeCashBreakdown !== false) {
      renderBreakdownBlock('Desglose de efectivo CUP', cupDisplayDenoms, cupBreakdown, cupTotalCounted, cupCuadre, 'CUP');
    }
    y = Math.max(blockEndY, y) + 5;
    // Pie de firmas de la hoja de Órdenes (opción «Líneas de firma» respetada).
    if (options.includeSignature !== false) renderFirmas();
  }

  // ── Pie de página con sección REAL por página (dinámico: compacto cambia paginación) ──
  // MISIÓN 2026-10-23 (§6): el período del pie usa la flecha VECTORIAL (el
  // carácter U+2192 no es codificable en WinAnsi — salía corrupto).
  void sales; void production; void commissionsWorkers; void totalCommissionsCup;
  const pageCount = doc.getNumberOfPages();
  const singleDay = startDate === endDate;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Hoja compartida CUP+USD (§9 compacto): ambas secciones se listan.
    const names = sectionPages.filter(sp => i >= sp.from && i <= sp.to).map(sp => sp.name);
    const secLbl = [...new Set(names)].join(' + ');
    const orientLbl = orientation === 'horizontal' ? 'Horizontal' : 'Vertical';
    const pageTail = ` · Página ${i} de ${pageCount}`;
    const before = `CostPro — Reporte Diario (${orientLbl}) · ${sn} · ${secLbl} · Período ${startDate}`;
    if (singleDay) {
      drawTextWithArrow(doc, pw / 2, ph - 5, before + pageTail, '', true, { fontSize: 7, color: C_MUTED, align: 'center' });
    } else {
      drawTextWithArrow(doc, pw / 2, ph - 5, before, `${endDate}${pageTail}`, false, { fontSize: 7, color: C_MUTED, align: 'center' });
    }
  }
  return doc;
}

/** Comisión sugerida por producto desde el MOTOR REAL (§5.1): agrega el
 *  product_breakdown de /api/commissions/calculate (todos los workers activos).
 *  Sin reglas configuradas → sugerencia 0 (NUNCA el 1% plano inventado).
 *  Exportada (MISIÓN EXCEL 2026-10-21): el exportador Excel reutiliza EXACTA-
 *  MENTE la misma fuente de comisiones que el PDF — sin segundas lógicas. */
export async function fetchSuggestedCommissionsByProduct(startDate: string, endDate: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await apiFetch('/api/commissions/calculate', {
      method: 'POST',
      body: JSON.stringify({ date_from: startDate, date_to: endDate, mode: 'rules' }),
    });
    const calcs = Array.isArray(res) ? res : (res?.calculations || res?.results || []);
    for (const calc of calcs) {
      const breakdown = calc?.product_breakdown || calc?.calculated_breakdown?.product_breakdown;
      if (!Array.isArray(breakdown)) continue;
      for (const p of breakdown) {
        const pid = String(p.product_id || '');
        const amt = Number(p.commission || 0);
        if (pid && amt > 0) map.set(pid, (map.get(pid) || 0) + amt);
      }
    }
  } catch {
    // Endpoint no disponible o sin reglas: columna sin sugerencia (0/'-').
  }
  return map;
}

export { formatUsd };
