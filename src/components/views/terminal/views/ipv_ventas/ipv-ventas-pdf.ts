/**
 * IPV — Ingresos por Ventas: generador PDF (jsPDF + autoTable, A4 horizontal).
 *
 * MISIÓN §10: encabezado con tienda/título/período, fecha de generación,
 * tabla completa con encabezados repetidos en cada página, números alineados
 * a la derecha, totales al pie, sección de incidencias de conciliación, sin
 * superposiciones ni elementos de navegación. La vista previa (bloburl) y la
 * descarga comparten ESTE documento → el preview representa fielmente el PDF.
 *
 * El dataset que recibe es el MISMO que pinta la tabla visible y que exporta
 * el Excel (filas filtradas + totales recalculados sobre ellas) → escenarios
 * K/L: una sola ejecución del informe, tres representaciones.
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { totalsFromRows, round2, type IpvRow, type IpvTotals, type IpvIncidence } from '@/lib/ipv-ventas/compute';
import { formatIpvQty, formatIpvMoney } from '@/lib/ipv-ventas/format';

export interface IpvPdfPayload {
  storeName: string;
  /** Etiquetas de fecha tal como las eligió el usuario (YYYY-MM-DD). */
  startDateLabel: string;
  endDateLabel: string;
  rows: IpvRow[];
  incidences: IpvIncidence[];
  generatedAt: string;
  /** Totales del subconjunto visible (mismas filas que la tabla y el Excel). */
  totalsOverride?: IpvTotals;
}

const PAGE = { margin: 36 };

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function safeFileName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_');
}

/**
 * Construye el documento PDF del IPV (A4 horizontal).
 * El caller decide: preview = doc.output('bloburl'), descarga = doc.save().
 */
export async function buildIpvVentasPdf(payload: IpvPdfPayload): Promise<jsPDF> {
  const doc = await createPDFDocument('l', 'pt', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const totals = payload.totalsOverride ?? totalsFromRows(payload.rows);

  const drawHeader = (compact: boolean): number => {
    const y0 = PAGE.margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 11 : 14);
    doc.setTextColor(20, 20, 20);
    doc.text('IPV — INGRESOS POR VENTAS', pageW / 2, y0 + (compact ? 10 : 14), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`Tienda: ${payload.storeName}`, PAGE.margin, y0 + (compact ? 22 : 30));
    doc.text(`Período: ${dateLabel(payload.startDateLabel)} — ${dateLabel(payload.endDateLabel)}`, PAGE.margin, y0 + (compact ? 33 : 42));
    doc.text(`Generado: ${dateTimeLabel(payload.generatedAt)}`, PAGE.margin, y0 + (compact ? 44 : 54));

    doc.text('Moneda de los importes: CUP (contable, tasa histórica por venta); USD nativo informativo', pageW - PAGE.margin, y0 + (compact ? 22 : 30), { align: 'right' });
    doc.text(`Productos incluidos: ${payload.rows.length}`, pageW - PAGE.margin, y0 + (compact ? 33 : 42), { align: 'right' });

    doc.setDrawColor(180);
    doc.line(PAGE.margin, y0 + (compact ? 50 : 62), pageW - PAGE.margin, y0 + (compact ? 50 : 62));
    return y0 + (compact ? 58 : 70);
  };

  const startY = drawHeader(false);

  const head = [[
    'Código', 'Descripción', 'Exist.\ninicial', 'Cant.\nvendidas', 'Vales\nsalidas', 'Entradas', 'Devolu-\nciones', 'Ajustes', 'Transf.', 'Exist.\nfinal', 'Ventas\n(CUP)', 'Ventas\nUSD',
  ]];

  const body = payload.rows.map((r) => [
    r.sku,
    r.name,
    formatIpvQty(r.existenciaInicial),
    formatIpvQty(r.cantidadesVendidas),
    formatIpvQty(r.valesSalidas),
    formatIpvQty(r.entradas),
    formatIpvQty(r.devoluciones),
    formatIpvQty(r.ajustes),
    formatIpvQty(r.transferencias),
    formatIpvQty(r.existenciaFinal),
    formatIpvMoney(r.ventasImporteCup),
    formatIpvMoney(r.ventasImporteUsd),
  ]);

  const foot = [[
    { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
    { content: totals.existenciaInicial === null ? 'N/D' : formatIpvQty(totals.existenciaInicial), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.cantidadesVendidas), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.valesSalidas), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.entradas), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.devoluciones), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.ajustes), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvQty(totals.transferencias), styles: { fontStyle: 'bold' as const } },
    { content: totals.existenciaFinal === null ? 'N/D' : formatIpvQty(totals.existenciaFinal), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvMoney(totals.ventasImporteCup), styles: { fontStyle: 'bold' as const } },
    { content: formatIpvMoney(totals.ventasImporteUsd), styles: { fontStyle: 'bold' as const } },
  ]];

  const autoTable = (await import('jspdf-autotable')).default;
  autoTable(doc, {
    head,
    body,
    foot,
    startY,
    margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 58 },
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, lineColor: [210, 210, 210], lineWidth: 0.35, textColor: [30, 30, 30] },
    headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
    footStyles: { fillColor: [228, 228, 228], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 42, halign: 'left' },
      1: { cellWidth: 168, halign: 'left' },
      2: { cellWidth: 50, halign: 'right' },
      3: { cellWidth: 50, halign: 'right' },
      4: { cellWidth: 50, halign: 'right' },
      5: { cellWidth: 50, halign: 'right' },
      6: { cellWidth: 50, halign: 'right' },
      7: { cellWidth: 46, halign: 'right' },
      8: { cellWidth: 46, halign: 'right' },
      9: { cellWidth: 50, halign: 'right' },
      10: { cellWidth: 62, halign: 'right' },
      11: { cellWidth: 54, halign: 'right' },
    },
    didDrawPage: () => {
      drawHeader(true);
    },
  });

  // ── Incidencias de conciliación (§5.6: visibles, nunca ocultas) ──────────
  type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };
  let cursorY = (doc as DocWithTable).lastAutoTable.finalY + 18;
  const pageH = doc.internal.pageSize.getHeight();

  const ensureSpace = (needed: number): void => {
    if (cursorY + needed > pageH - PAGE.margin) {
      doc.addPage();
      cursorY = PAGE.margin + 58;
    }
  };

  if (payload.incidences.length > 0) {
    ensureSpace(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(140, 60, 10);
    doc.text(`Incidencias de conciliación (${payload.incidences.length})`, PAGE.margin, cursorY);
    cursorY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Diferencias reportadas tal cual — no ajustadas. N/D = existencia histórica no reconstruible.', PAGE.margin, cursorY);
    cursorY += 8;

    autoTable(doc, {
      head: [['Código', 'Producto', 'Tipo', 'Calculado', 'Esperado', 'Diferencia', 'Detalle']],
      body: payload.incidences.map((i) => [
        i.sku,
        i.name,
        i.type,
        i.calculated === null || i.calculated === undefined ? 'N/D' : formatIpvQty(i.calculated),
        i.expected === null || i.expected === undefined ? '—' : formatIpvQty(i.expected),
        i.difference === null || i.difference === undefined ? '—' : formatIpvQty(i.difference),
        i.detail,
      ]),
      startY: cursorY,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 58 },
      styles: { fontSize: 6.8, cellPadding: 2.5 },
      headStyles: { fillColor: [250, 240, 225], textColor: [120, 60, 10] },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 110 },
        2: { cellWidth: 66 },
        3: { cellWidth: 46, halign: 'right' },
        4: { cellWidth: 46, halign: 'right' },
        5: { cellWidth: 46, halign: 'right' },
        6: { cellWidth: 190 },
      },
      didDrawPage: () => { drawHeader(true); },
    });
    cursorY = (doc as DocWithTable).lastAutoTable.finalY + 14;
  }

  // Nota metodológica al pie
  ensureSpace(40);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(110, 110, 110);
  const note = 'Conciliación: Existencia final = Existencia inicial + Entradas + Devoluciones − Cantidades vendidas − Vales de salida ± Ajustes ± Transferencias. ' +
    'Cantidades del ledger de movimientos de inventario; importes de las líneas de venta (CUP, tasa histórica por venta). Los productos sin movimientos ni saldos en el período se excluyen.';
  const lines = doc.splitTextToSize(note, pageW - PAGE.margin * 2);
  doc.text(lines, PAGE.margin, cursorY);

  // Pie de página: numeración en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${p} de ${pageCount}`, pageW - PAGE.margin, pageH - 14, { align: 'right' });
    doc.text('IPV — Ingresos por Ventas · COSTPRO 4', PAGE.margin, pageH - 14);
  }

  return doc;
}

/** Nombre de archivo seguro para descargas. */
export function ipvFileName(ext: 'pdf' | 'xlsx', storeName: string, from: string, to: string): string {
  return `IPV_${safeFileName(storeName)}_${from}_${to}.${ext}`;
}

export { round2 };
