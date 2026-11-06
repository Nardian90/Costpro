/**
 * Inventario — Stock actual: generador PDF (jsPDF + autoTable, A4 vertical).
 *
 * MISIÓN 2026-11-06 (Objetivo 3A): documento de control de inventario con
 * presentación profesional:
 *   · Título «INVENTARIO — STOCK ACTUAL», tienda, fecha/hora de generación y
 *     descripción de los filtros aplicados (coherencia pantalla ↔ PDF).
 *   · Tabla con encabezados repetidos en cada página (margin.top + didDrawPage,
 *     patrón probado del IPV), números alineados a la derecha y formatos
 *     numéricos consistentes.
 *   · Paginación «Página X de Y» + branding en el pie de todas las hojas.
 *   · Nombres de producto envueltos dentro de su celda (autoTable wrap +
 *     pdfWinAnsi/splitToWidthVerified para glifos seguros) — nada cortado ni
 *     superpuesto.
 *
 * El dataset recibido es el conjunto COMPLETO del stock (fuente canónica RPC
 * get_paginated_products ciclada por fetchAllStockFromSupabase) con los mismos
 * filtros de la vista — nunca el subconjunto renderizado en pantalla.
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { pdfWinAnsi, splitToWidthVerified } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import type { StockExportProduct } from '@/lib/inventory/stock-export';

export interface StockPdfPayload {
  storeName: string;
  generatedAt: string;
  /** Descripción legible de los filtros activos (o «Sin filtros…»). */
  filtersLabel: string;
  products: StockExportProduct[];
}

const PAGE = { margin: 36 };

const MONEY_FMT = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY_FMT = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

function money(n: number | null | undefined): string {
  return MONEY_FMT.format(Number(n ?? 0));
}
function qty(n: number | null | undefined): string {
  return QTY_FMT.format(Number(n ?? 0));
}

function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function stockFileName(storeName: string, ext: 'pdf' | 'xlsx', when = new Date()): string {
  const safe = storeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_');
  const ts = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`;
  return `Inventario_Stock_Actual_${safe}_${ts}.${ext}`;
}

/**
 * Construye el documento PDF del Stock actual (A4 vertical).
 * El caller decide: preview = doc.output('bloburl'), descarga = doc.save().
 */
export async function buildStockActualPdf(payload: StockPdfPayload): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'pt', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const valorTotal = payload.products.reduce((acc, p) => acc + (p.stock_current ?? 0) * (p.cost_average ?? 0), 0);
  const stockTotal = payload.products.reduce((acc, p) => acc + (p.stock_current ?? 0), 0);

  const drawHeader = (compact: boolean): number => {
    const y0 = PAGE.margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 11 : 14);
    doc.setTextColor(20, 20, 20);
    doc.text('INVENTARIO — STOCK ACTUAL', pageW / 2, y0 + (compact ? 10 : 14), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(pdfWinAnsi(`Tienda: ${payload.storeName}`), PAGE.margin, y0 + (compact ? 22 : 30));
    doc.text(`Generado: ${dateTimeLabel(payload.generatedAt)}`, PAGE.margin, y0 + (compact ? 33 : 42));

    doc.text(`Productos incluidos: ${payload.products.length}`, pageW - PAGE.margin, y0 + (compact ? 22 : 30), { align: 'right' });
    if (!compact) {
      // El texto de filtros puede ser largo: se envuelve verificado a la derecha.
      doc.setFontSize(7.6);
      const filterLines = splitToWidthVerified(doc, pdfWinAnsi(`Filtros: ${payload.filtersLabel}`), pageW / 2 - PAGE.margin);
      filterLines.forEach((line, i) => {
        doc.text(line, pageW - PAGE.margin, y0 + 40 + i * 10, { align: 'right' });
      });
    }

    doc.setDrawColor(180);
    doc.line(PAGE.margin, y0 + (compact ? 48 : 62), pageW - PAGE.margin, y0 + (compact ? 48 : 62));
    return y0 + (compact ? 56 : 70);
  };

  const startY = drawHeader(false);

  // ANTI-SOLAPE (patrón IPV): cada página se decora UNA sola vez — página 1
  // completa; siguientes compactas, sin superposición de encabezados.
  const decoratedPages = new Set<number>();
  decoratedPages.add(doc.getNumberOfPages());
  const decoratePageOnce = (compact: boolean): void => {
    const page = doc.getNumberOfPages();
    if (decoratedPages.has(page)) return;
    decoratedPages.add(page);
    drawHeader(compact);
  };

  const head = [[
    'SKU', 'Producto', 'Stock\nActual', 'Precio', 'Costo\nPromedio', 'Valor Total', 'Categoría',
  ]];

  const body = payload.products.map((p) => {
    const stock = p.stock_current ?? 0;
    const costo = p.cost_average ?? 0;
    const valor = stock * costo;
    const outOfStock = stock <= 0;
    return [
      { content: pdfWinAnsi(p.sku || '—') },
      { content: pdfWinAnsi(p.name) },
      { content: qty(stock), styles: outOfStock ? { textColor: [160, 40, 40] as [number, number, number], fontStyle: 'bold' as const } : {} },
      { content: money(p.price) },
      { content: money(costo) },
      { content: money(valor) },
      { content: pdfWinAnsi(p.category || '—') },
    ];
  });

  const foot = [[
    { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
    { content: qty(stockTotal), styles: { fontStyle: 'bold' as const } },
    { content: '' },
    { content: '' },
    { content: money(valorTotal), styles: { fontStyle: 'bold' as const } },
    { content: '' },
  ]];

  const autoTable = (await import('jspdf-autotable')).default;

  autoTable(doc, {
    head,
    body,
    foot,
    startY,
    margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 56 },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, lineColor: [210, 210, 210], lineWidth: 0.35, textColor: [30, 30, 30], overflow: 'linebreak' },
    headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    footStyles: { fillColor: [228, 228, 228], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
      1: { cellWidth: 175, halign: 'left' },
      2: { cellWidth: 46, halign: 'right' },
      3: { cellWidth: 58, halign: 'right' },
      4: { cellWidth: 62, halign: 'right' },
      5: { cellWidth: 66, halign: 'right' },
      6: { cellWidth: 60, halign: 'left' },
    },
    didDrawPage: () => {
      if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
    },
  });

  // Pie de página: numeración en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${p} de ${pageCount}`, pageW - PAGE.margin, pageH - 14, { align: 'right' });
    doc.text('Inventario — Stock Actual · COSTPRO 4', PAGE.margin, pageH - 14);
  }

  return doc;
}
