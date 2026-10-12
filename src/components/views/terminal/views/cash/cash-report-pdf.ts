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
import type { jsPDF } from 'jspdf';
import type { CashReport } from '@/types';
import {
  breakdownTotal, formatUsd,
  type Breakdown, type PdfTemplate, type Currency,
} from './cash-report-core';

export interface CashReportStoreInfo {
  name: string; logo_url: string | null; address: string | null;
  phone: string | null; email: string | null; reeup: string | null; nit: string | null;
}

export interface CashReportPdfOptions {
  detailPayments: boolean;   // detalle de pagos a proveedores
  detailProduction: boolean; // detalle de órdenes de producción/servicios
  includeBreakdown: boolean; // desglose de billetes CUP
  includeUsd: boolean;       // cuadre USD si hay
  includeSignature: boolean; // líneas de firma
}

export const DEFAULT_PDF_OPTIONS: CashReportPdfOptions = {
  detailPayments: false,
  detailProduction: false,
  includeBreakdown: true,
  includeUsd: true,
  includeSignature: true,
};

export interface CashReportPdfContext {
  report: CashReport;
  template: PdfTemplate;
  startDate: string;
  endDate: string;
  storeInfo: CashReportStoreInfo | null;
  deliveredBy: string;
  recipientName: string;
  /** Denominaciones activas CUP (defaults activadas + personalizadas, desc). */
  cupDenoms: number[];
  /** Denominaciones activas USD. */
  usdDenoms: number[];
  cupBreakdown: Breakdown;
  usdBreakdown: Breakdown;
  options: CashReportPdfOptions;
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
    apiFetch(`/api/production-orders?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}&limit=100`).then(d => Array.isArray(d) ? d : (d?.data || d?.orders || [])).catch(() => []),
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
  const doc = await createPDFDocument('p', 'mm', 'a4');
  // Plantilla 'simple': fidelidad a SU descripción (sin desglose) — ver cabecera.
  const effectiveOptions: CashReportPdfOptions = ctx.template === 'simple'
    ? { ...ctx.options, includeBreakdown: false, includeUsd: false }
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
  doc.text(`Periodo: ${startDate} → ${endDate}`, m, y); y += 3.5;
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
    ['EGRESOS (−)', '', '', ''],
    ['  Pagos a Proveedores (Recepciones)', `${payments.filter((p: any) => p.ref_type === 'receipt').reduce((s: number, x: any) => s + Number(x.payment_count), 0)} pagos`, '', fmt(payments.filter((p: any) => p.ref_type === 'receipt').reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['  Pagos por Servicios Recibidos', `${payments.filter((p: any) => p.ref_type === 'service').reduce((s: number, x: any) => s + Number(x.payment_count), 0)} pagos`, '', fmt(payments.filter((p: any) => p.ref_type === 'service').reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['  Comisiones a Trabajadores', `${commissions.reduce((s: number, x: any) => s + Number(x.commission_count), 0)} pagos`, '', fmt(commissions.reduce((s: number, x: any) => s + Number(x.total), 0))],
    ['SUBTOTAL EGRESOS', '', '', fmt(cupCashPayments + cupTransferPayments + cupCashCommissions)],
    ['', '', '', ''],
    ['(−) Transferencias (no se entregan en efectivo)', '', '', fmt(cupTransferSales + cupTransferProduction)],
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
    const productRows: (string | number)[][] = (itemsSummary as any).items.map((it: any) => [
      ((it.product_name as string) || '—').length > 30 ? (it.product_name as string).substring(0, 28) + '…' : ((it.product_name as string) || '—'),
      ((it.sku as string) || '—').length > 18 ? (it.sku as string).substring(0, 16) + '…' : ((it.sku as string) || '—'),
      Number(it.total_quantity).toFixed(2),
      fmt(Number(it.unit_price)),
      fmt(Number(it.total_cup)),
      fmt(Number(it.cash_paid)),
      fmt(Number(it.transfer_paid)),
      fmt(Number(it.zelle_paid)),
    ]);
    renderTable(
      ['Producto', 'SKU', 'Cant.', 'P.Unit', 'Total CUP', 'Efectivo', 'Transfer', 'Zelle'],
      productRows,
      [44, 28, 14, 20, 26, 22, 22, 18],
      {
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
        totalsRow: ['TOTALES', '', '', '', fmt(Number((itemsSummary as any).total_cup)), fmt(Number((itemsSummary as any).total_cash)), fmt(Number((itemsSummary as any).total_transfer)), fmt(Number((itemsSummary as any).total_zelle))],
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
      doc.text(`${p.payment_count} pagos · Total: −${fmt(Number(p.total), String(p.currency))}`, m, y); y += 5;
      try {
        const items = await fetchDetailRows(startDate, endDate, 'payment', String(p.payment_method), String(p.currency), String(p.ref_type));
        if (items.length > 0) {
          const payRows: (string | number)[][] = items.map((it: any) => {
            const date = String(it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
            const amt = Number(it.amount_cup || it.amount || 0);
            const ref = String(it.reference || it.notes || '');
            return [date, ref.substring(0, 35), `−${fmt(amt)}`];
          });
          renderTable(['Fecha', 'Referencia', 'Monto CUP'], payRows, [35, 95, 35], { align: ['left', 'left', 'right'] });
        }
      } catch {}
      y += 3;
    }
  }

  // ── Desglose + firmas ──
  if (y + 80 > ph - m - 10) { doc.addPage(); y = m; }
  sectionTitle('DESGLOSE DE BILLETES PARA ENTREGA', 'Conteo físico de efectivo');
  const cupTotal = breakdownTotal(cupBreakdown);
  const expectedCup = report?.cash_balance_cup ?? (report?.totals as any | undefined)?.balance_cup as number ?? 0;
  const cupDifference = cupTotal - expectedCup;

  if (options.includeBreakdown) {
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

  if (options.includeUsd) {
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

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLA DIARIO (portado 1:1 del modal — estilo reporte diario de empresa)
// ═══════════════════════════════════════════════════════════════════════════
async function buildDiarioPdf(doc: jsPDF, ctx: CashReportPdfContext, summaries?: CashReportSummaries): Promise<jsPDF> {
  const { report, startDate, endDate, storeInfo, deliveredBy, recipientName, cupBreakdown, usdBreakdown, cupDenoms, usdDenoms } = ctx;
  const pw = doc.internal.pageSize.getWidth();   // 210
  const ph = doc.internal.pageSize.getHeight();  // 297
  const m = 10; let y = 14;
  const sn = storeInfo?.name || 'Tienda';
  const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const C_DARK: [number, number, number] = [17, 24, 39];
  const C_BLACK: [number, number, number] = [0, 0, 0];
  const C_MUTED: [number, number, number] = [107, 114, 128];
  const C_BORDER: [number, number, number] = [200, 200, 200];
  const C_SUCCESS: [number, number, number] = [22, 163, 74];
  const C_WARN: [number, number, number] = [217, 119, 6];

  const setText = (c: [number, number, number]) => { doc.setTextColor(c[0], c[1], c[2]); };
  const setFill = (c: [number, number, number]) => { doc.setFillColor(c[0], c[1], c[2]); };
  const setDraw = (c: [number, number, number]) => { doc.setDrawColor(c[0], c[1], c[2]); };
  const fmtCup = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
  const fmtUsdFmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });

  // Resúmenes (fetch una vez, cacheable por el llamador)
  let { itemsSummary, paymentTotals, commissionsSummary, productionOrders } = (summaries && summaries.itemsSummary && summaries.commissionsSummary && summaries.paymentTotals && summaries.productionOrders)
    ? summaries as Required<CashReportSummaries>
    : await fetchDiarioSummaries(startDate, endDate);

  const sales = report.sales || [];
  const production = (report as any).production || [];

  const paymentTotalsObj = (paymentTotals as any)?.totals || {};
  const cupCashFromItems = Number(paymentTotalsObj.CUP?.cash || 0);
  const cupTransferFromItems = Number(paymentTotalsObj.CUP?.transfer || 0);
  const usdCashFromItems = Number(paymentTotalsObj.USD?.cash || 0);
  const usdZelleFromItems = Number(paymentTotalsObj.USD?.zelle || 0);

  const commissionsWorkers = (commissionsSummary as any)?.workers as any[] || [];
  const totalCommissionsCup = (commissionsSummary as any)?.total_cup as number || 0;

  const DEFAULT_COMMISSION_PCT = 1; // 1% por defecto (regla del modal original)
  const itemsWithCommission = (((itemsSummary as any)?.items as any[]) || []).map((it: any) => {
    const total = Number(it.total_cup || 0);
    const currency = (it.currency as string) || 'CUP';
    const totalForCurrency = (((itemsSummary as any)?.items as any[]) || [])
      .filter((x: any) => ((x.currency as string) || 'CUP') === currency)
      .reduce((s: number, x: any) => s + Number(x.total_cup || 0), 0);
    const transferPool = currency === 'CUP' ? cupTransferFromItems : 0;
    const transferPaid = totalForCurrency > 0 ? (transferPool * total / totalForCurrency) : 0;
    const commissionPaid = total * DEFAULT_COMMISSION_PCT / 100;
    return { ...it, transfer_paid_calc: transferPaid, commission_paid_calc: commissionPaid };
  });

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

  const renderIncomeBlock = (
    title: string,
    rows: Array<{ label: string; amount: number; isTotal?: boolean; isSubtotal?: boolean }>,
    aEntregar: number,
    aEntregarLabel: string = 'A entregar',
    extraSections?: Array<{ title: string; rows: Array<{ label: string; amount: number; isTotal?: boolean }> }>
  ) => {
    const blockW = (pw - 2 * m) / 2 - 4;
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
      const maxLabel = blockW - 30;
      let lbl = r.label;
      if (doc.getTextWidth(lbl) > maxLabel) {
        while (lbl.length > 0 && doc.getTextWidth(lbl + '…') > maxLabel) lbl = lbl.slice(0, -1);
        lbl += '…';
      }
      doc.text(lbl, x, by);
      const amt = r.amount === 0 ? '-' : fmtCup(r.amount);
      doc.text(amt, x + blockW - 2, by, { align: 'right' });
      by += 4.2;
    }
    if (extraSections && extraSections.length > 0) {
      for (const section of extraSections) {
        by += 2;
        setText(C_DARK);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(section.title, x, by); by += 4;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        for (const r of section.rows) {
          if (r.isTotal) { doc.setFont('helvetica', 'bold'); setText(C_DARK); }
          else { doc.setFont('helvetica', 'normal'); setText(C_DARK); }
          const maxLabel = blockW - 30;
          let lbl = r.label;
          if (doc.getTextWidth(lbl) > maxLabel) {
            while (lbl.length > 0 && doc.getTextWidth(lbl + '…') > maxLabel) lbl = lbl.slice(0, -1);
            lbl += '…';
          }
          doc.text(lbl, x, by);
          const amt = r.amount === 0 ? '-' : fmtCup(r.amount);
          doc.text(amt, x + blockW - 2, by, { align: 'right' });
          by += 4.2;
        }
      }
    }
    by += 2;
    setDraw(C_BLACK); doc.setLineWidth(0.8);
    doc.rect(x, by - 4, blockW, 7);
    setText(C_DARK);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(aEntregarLabel, x + 2, by + 1);
    doc.text(fmtCup(aEntregar), x + blockW - 2, by + 1, { align: 'right' });
    by += 7;
    return by;
  };

  const renderBreakdownBlock = (
    title: string,
    denominations: number[],
    breakdown: Breakdown,
    totalEntregado: number,
    cuadre: number,
    currency: Currency = 'CUP'
  ) => {
    const blockW = (pw - 2 * m) / 2 - 4;
    const x = m + (pw - 2 * m) / 2 + 4;
    let by = y;
    setText(C_DARK);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(title, x, by); by += 5;
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
    for (const d of denominations) {
      const cnt = Number(breakdown[d] || 0);
      const imp = cnt * d;
      const lbl = denomLabel(d, currency);
      const cntStr = cnt > 0 ? String(cnt) : '-';
      const impStr = cnt > 0 ? (currency === 'CUP' ? fmtCup(imp) : fmtUsdFmt(imp)) : '-';
      doc.text(lbl, x, by);
      doc.text(cntStr, x + blockW * 0.55, by, { align: 'center' });
      doc.text(impStr, x + blockW - 2, by, { align: 'right' });
      by += 4.2;
    }
    by += 2;
    setDraw(C_BORDER); doc.setLineWidth(0.3);
    doc.line(x, by - 1.5, x + blockW, by - 1.5);
    by += 3;
    doc.setFont('helvetica', 'bold'); setText(C_DARK);
    doc.text('Total entregado', x, by);
    const totStr = currency === 'CUP' ? fmtCup(totalEntregado) : fmtUsdFmt(totalEntregado);
    doc.text(totStr, x + blockW - 2, by, { align: 'right' });
    by += 5;
    doc.setFont('helvetica', 'normal');
    const cuadreColor = cuadre === 0 ? C_SUCCESS : C_WARN;
    setText(cuadreColor);
    doc.text(`Cuadre`, x, by);
    const cuadreStr = cuadre === 0 ? '-' : (currency === 'CUP' ? fmtCup(Math.abs(cuadre)) : fmtUsdFmt(Math.abs(cuadre)));
    doc.text(cuadreStr, x + blockW - 2, by, { align: 'right' });
    by += 5;
    setText(C_MUTED); doc.setFont('helvetica', 'italic');
    doc.text('Nota:', x, by);
    by += 4;
    return by;
  };

  const renderFirmas = () => {
    const sigY = ph - 25;
    const colW = (pw - 2 * m) / 3;
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
    doc.text(deliveredBy || 'Israel Leyva Velazquez', m + 5, sigY + 5);
    doc.text('____________________', m + colW + 5, sigY + 5);
    doc.text(recipientName || 'Belkis Olivera Perez', m + 2 * colW + 5, sigY + 5);
  };

  const renderSalesTable = (currency: 'CUP' | 'USD') => {
    const cols = [
      { name: 'Código',    w: 14, align: 'left' as const },
      { name: 'Clase',    w: 20, align: 'left' as const },
      { name: 'Descripción',   w: 44, align: 'left' as const },
      { name: 'Cant.',     w: 13, align: 'right' as const },
      { name: currency,    w: 30, align: 'right' as const },
      { name: currency === 'CUP' ? 'Transfer.' : 'Zelle', w: 30, align: 'right' as const },
      { name: 'Comisión',  w: 23, align: 'right' as const },
    ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const rowH = 5;
    const headerH = 6;
    const colX: number[] = [];
    let accX = m;
    for (const c of cols) { colX.push(accX); accX += c.w; }
    const drawCell = (colIdx: number, rowY: number, text: string, fontSize: number = 8) => {
      const col = cols[colIdx];
      const x = colX[colIdx];
      const pad = 2;
      doc.setFontSize(fontSize);
      if (col.align === 'right') doc.text(text, x + col.w - pad, rowY, { align: 'right' });
      else doc.text(text, x + pad, rowY);
    };
    const items = itemsWithCommission.filter((it: any) => ((it.currency as string) || 'CUP') === currency);
    const fmtAmt = currency === 'CUP' ? fmtCup : fmtUsdFmt;
    let totCup = 0, totTransfer = 0, totCommission = 0;
    const totalRows = items.length + 1;
    const tableH = headerH + totalRows * rowH;
    const yStart = y;
    setDraw(C_BLACK); doc.setLineWidth(0.4);
    doc.rect(m, yStart, tableW, tableH);
    for (let i = 0; i < cols.length - 1; i++) doc.line(colX[i + 1], yStart, colX[i + 1], yStart + tableH);
    doc.line(m, yStart + headerH, m + tableW, yStart + headerH);
    doc.line(m, yStart + headerH + items.length * rowH, m + tableW, yStart + headerH + items.length * rowH);
    setText(C_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const headerY = y + 4;
    cols.forEach((c, i) => drawCell(i, headerY, c.name, 8));
    y += headerH;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    setText(C_DARK);
    for (const it of items) {
      if (y > ph - 80) { doc.addPage(); y = 14; }
      const unit = Number(it.unit_price || it.price || 0);
      const qty = Number(it.total_quantity || 0);
      const total = Number(it.total_cup || (unit * qty) || 0);
      const transfer = Number(it.transfer_paid_calc || it.transfer_paid || 0);
      const commission = Number(it.commission_paid_calc || it.commission_paid || 0);
      totCup += total;
      totTransfer += transfer;
      totCommission += commission;
      const rowY = y + 3.5;
      drawCell(0, rowY, (it.sku as string || '').toString(), 8);
      drawCell(1, rowY, ((it.category as string) || '').toString().slice(0, 18), 8);
      let desc = ((it.product_name as string) || '').toString();
      const maxDescW = cols[2].w - 4;
      if (doc.getTextWidth(desc) > maxDescW) {
        while (desc.length > 0 && doc.getTextWidth(desc + '…') > maxDescW) desc = desc.slice(0, -1);
        desc += '…';
      }
      drawCell(2, rowY, desc, 8);
      drawCell(3, rowY, qty.toFixed(2), 8);
      drawCell(4, rowY, fmtAmt(total), 8);
      drawCell(5, rowY, transfer > 0 ? fmtAmt(transfer) : '-', 8);
      drawCell(6, rowY, commission > 0 ? fmtAmt(commission) : '-', 8);
      y += rowH;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const totalsY = y + 3.5;
    drawCell(4, totalsY, fmtAmt(totCup), 9);
    drawCell(5, totalsY, totTransfer > 0 ? fmtAmt(totTransfer) : '-', 9);
    drawCell(6, totalsY, totCommission > 0 ? fmtAmt(totCommission) : '-', 9);
    y += rowH;
    return { totCup, totTransfer, totCommission };
  };

  // ── PAGE 1: REPORTE DE VENTA CUP ──
  {
    const headerH_mm = logoDataUrl ? 16 : 8;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', m, y - 4, 14, 14); } catch {}
    }
    setText(C_DARK);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`${sn} Reporte de Venta CUP Día:`, m + (logoDataUrl ? 18 : 0), y);
    doc.text(fecha, pw - m, y, { align: 'right' });
    y += headerH_mm;
    const totals = renderSalesTable('CUP');
    y += 4;
    const cupCashSales = cupCashFromItems;
    const cupTransferSales = cupTransferFromItems;
    const cupCashPayments = (report.payments || []).filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, p: any) => s + Number(p.total), 0);
    const cupCashProduction = production.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, p: any) => s + Number(p.total), 0);
    const cupCashCommissions = (report.commissions || []).filter((c: any) => c.payment_method === 'cash' && c.currency === 'CUP').reduce((s: number, c: any) => s + Number(c.total), 0);
    const incomeRows: Array<{ label: string; amount: number; isTotal?: boolean; isSubtotal?: boolean }> = [
      { label: 'Ventas Totales', amount: totals.totCup, isTotal: true },
      { label: 'Venta por Transferencia', amount: cupTransferSales },
    ];
    if (cupCashProduction > 0) incomeRows.push({ label: 'Órdenes de Trabajo (anticipos)', amount: cupCashProduction });
    if (cupCashPayments > 0) incomeRows.push({ label: 'Pagos a Proveedores', amount: -cupCashPayments });
    const commissionSection = commissionsWorkers.length > 0
      ? [{
          title: 'Comisiones por Trabajador',
          rows: [
            ...commissionsWorkers.map((w: any) => ({
              label: `${w.worker_name || 'Trabajador'}${w.ci ? ` (${w.ci})` : ''}`,
              amount: Number(w.total_amount_cup || 0),
            })),
            { label: 'Total Comisiones', amount: totalCommissionsCup, isTotal: true },
          ],
        }]
      : undefined;
    const aEntregar = cupCashSales + cupCashProduction - cupCashPayments - (cupCashCommissions || totalCommissionsCup);
    const blockEndY = renderIncomeBlock('Resumen del Día', incomeRows, aEntregar, 'A entregar', commissionSection);
    const expectedCup = aEntregar;
    // CAMBIO 2026-10: denominaciones ACTIVAS del usuario (antes fijas [1000..1])
    const cupDisplayDenoms = displayDenoms(cupDenoms, cupBreakdown, 'CUP');
    const cupTotalCounted = breakdownTotal(cupBreakdown);
    const cupCuadre = cupTotalCounted - expectedCup;
    renderBreakdownBlock('Desglose de efectivo MN', cupDisplayDenoms, cupBreakdown, cupTotalCounted, cupCuadre, 'CUP');
    y = Math.max(blockEndY, y) + 5;
    renderFirmas();
  }

  // ── PAGE 2: REPORTE DE VENTA USD ──
  doc.addPage(); y = 14;
  {
    const headerH_mm = logoDataUrl ? 16 : 8;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', m, y - 4, 14, 14); } catch {}
    }
    setText(C_DARK);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`${sn} Reporte de Venta USD Día:`, m + (logoDataUrl ? 18 : 0), y);
    doc.text(fecha, pw - m, y, { align: 'right' });
    y += headerH_mm;
    const totals = renderSalesTable('USD');
    y += 4;
    const usdCashSales = usdCashFromItems;
    const usdZelleSales = usdZelleFromItems;
    const usdIncomeRows: Array<{ label: string; amount: number; isTotal?: boolean; isSubtotal?: boolean }> = [
      { label: 'Ventas Totales', amount: totals.totCup, isTotal: true },
      { label: 'Venta por Zelle', amount: usdZelleSales },
    ];
    const usdAEntregar = usdCashSales;
    const blockEndY = renderIncomeBlock('Resumen del Día USD', usdIncomeRows, usdAEntregar);
    const usdTotalCounted = breakdownTotal(usdBreakdown);
    const usdCuadre = usdTotalCounted - usdAEntregar;
    // CAMBIO 2026-10: denominaciones ACTIVAS USD del usuario (antes fijas)
    const usdDisplayDenoms = displayDenoms(usdDenoms, usdBreakdown, 'USD');
    renderBreakdownBlock('Desglose de efectivo USD', usdDisplayDenoms, usdBreakdown, usdTotalCounted, usdCuadre, 'USD');
    y = Math.max(blockEndY, y) + 5;
    setText(C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
    doc.text('Fondo de caja:', m, ph - 20);
  }

  // ── PAGE 3: REPORTE DE ÓRDENES DE TRABAJO ──
  doc.addPage(); y = 14;
  {
    const headerH_mm = logoDataUrl ? 16 : 8;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', m, y - 4, 14, 14); } catch {}
    }
    setText(C_DARK);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`Reporte de Ordenes de trabajo`, m + (logoDataUrl ? 18 : 0), y);
    doc.text(fecha, pw - m, y, { align: 'right' });
    y += headerH_mm;
    const cols = [
      { name: 'Código',    w: 18, align: 'left' as const },
      { name: 'Clasificación', w: 18, align: 'left' as const },
      { name: 'Descripción',   w: 60, align: 'left' as const },
      { name: 'Cantidad',  w: 12, align: 'right' as const },
      { name: 'CUP',       w: 28, align: 'right' as const },
      { name: 'USD',       w: 25, align: 'right' as const },
      { name: 'Comisión',  w: 22, align: 'right' as const },
    ];
    const tableW = cols.reduce((s, c) => s + c.w, 0);
    const rowH = 5;
    const headerH = 6;
    const colX: number[] = [];
    let accX = m;
    for (const c of cols) { colX.push(accX); accX += c.w; }
    const drawCell = (colIdx: number, rowY: number, text: string, fontSize: number = 8) => {
      const col = cols[colIdx];
      const x = colX[colIdx];
      const pad = 2;
      doc.setFontSize(fontSize);
      if (col.align === 'right') doc.text(text, x + col.w - pad, rowY, { align: 'right' });
      else doc.text(text, x + pad, rowY);
    };
    const orders = (productionOrders as any[]) || [];
    const ordersCount = Math.max(1, orders.length);
    const tableH = headerH + (ordersCount + 1) * rowH;
    const yStart = y;
    setDraw(C_BLACK); doc.setLineWidth(0.4);
    doc.rect(m, yStart, tableW, tableH);
    for (let i = 0; i < cols.length - 1; i++) doc.line(colX[i + 1], yStart, colX[i + 1], yStart + tableH);
    doc.line(m, yStart + headerH, m + tableW, yStart + headerH);
    doc.line(m, yStart + headerH + ordersCount * rowH, m + tableW, yStart + headerH + ordersCount * rowH);
    setText(C_DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const headerY = y + 4;
    cols.forEach((c, i) => drawCell(i, headerY, c.name, 8));
    y += headerH;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(C_DARK);
    let totCup = 0, totUsd = 0;
    for (const ord of orders) {
      if (y > ph - 80) { doc.addPage(); y = 14; }
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
      drawCell(6, rowY, '-', 8);
      y += rowH;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const totalsY = y + 3.5;
    drawCell(4, totalsY, fmtCup(totCup), 9);
    drawCell(5, totalsY, totUsd > 0 ? fmtUsdFmt(totUsd) : '-', 9);
    drawCell(6, totalsY, '-', 9);
    y += rowH + 4;
    const incomeRows = [
      { label: 'Ventas Totales', amount: totCup, isTotal: true },
      { label: 'Venta por Transferencia', amount: 0 },
    ];
    const aEntregar = totCup;
    const blockEndY = renderIncomeBlock('Resumen Órdenes', incomeRows, aEntregar);
    // CAMBIO 2026-10: denominaciones ACTIVAS del usuario (antes [200..1])
    const cupDisplayDenoms = displayDenoms(cupDenoms, cupBreakdown, 'CUP');
    const cupTotalCounted = breakdownTotal(cupBreakdown);
    const cupCuadre = cupTotalCounted - aEntregar;
    renderBreakdownBlock('Desglose de efectivo CUP', cupDisplayDenoms, cupBreakdown, cupTotalCounted, cupCuadre, 'CUP');
    y = Math.max(blockEndY, y) + 5;
    renderFirmas();
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); setText(C_MUTED); doc.setFont('helvetica', 'normal');
    const sectionName = i === 1 ? 'CUP' : i === 2 ? 'USD' : i === 3 ? 'Órdenes' : '';
    doc.text(`CostPro — Reporte Diario · ${sn} · ${sectionName} · Página ${i} de ${pageCount}`, pw / 2, ph - 5, { align: 'center' });
  }
  return doc;
}

export { formatUsd };
