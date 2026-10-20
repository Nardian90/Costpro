/**
 * Comprobante PDF del documento Ingreso/Egreso de caja — MISIÓN 2026-10-20.
 *
 * Identifica el documento como «Comprobante de Ingreso/Egreso de Caja» (NO es
 * una factura de venta). Generación perezosa (jsPDF ~600KB solo al imprimir),
 * mismo patrón que cash-report-pdf.ts / lazy-pdf.
 */

import type { CashFlowDocument } from '@/types';
import { conceptLabel } from './constants';
import { formatDate, formatTime } from '@/lib/utils';

export interface ComprobanteContext {
  doc: CashFlowDocument;
  storeName: string | null;
}

const fmt = (n: number) => n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });

export async function buildCashFlowComprobantePdf(ctx: ComprobanteContext) {
  const { createPDFDocument } = await import('@/lib/export/lazy-pdf');
  const doc = await createPDFDocument('p', 'mm', 'a4');
  const { doc: d, storeName } = ctx;

  const W = 210;
  const M = 16;
  let y = 18;

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('COMPROBANTE DE INGRESO / EGRESO DE CAJA', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento de movimiento de efectivo — no constituye factura de venta', W / 2, y, { align: 'center' });
  y += 8;

  // Número + estado
  doc.setDrawColor(40);
  doc.setLineWidth(0.4);
  doc.line(M, y, W - M, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(d.document_number, M, y);
  doc.setFontSize(10);
  if (d.status === 'anulado') {
    doc.setTextColor(178, 34, 34);
    doc.text('*** ANULADO ***', W - M, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  } else {
    doc.setTextColor(22, 120, 60);
    doc.text('CONFIRMADO', W - M, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  y += 8;

  // Datos generales
  const rows: Array<[string, string]> = [
    ['Tipo', d.doc_type === 'ingreso' ? 'INGRESO de efectivo (+)' : 'EGRESO de efectivo (-)'],
    ['Motivo', conceptLabel(d.concept)],
    ['Tienda', storeName ?? '—'],
    ['Caja / Turno', d.closure_id ? `Turno ${d.closure_id.slice(0, 8)}` : '—'],
    ['Fecha operativa', `${formatDate(d.operation_date)} ${formatTime(d.operation_date)}`],
    ['Responsable', d.responsible?.full_name ?? d.responsible_user_id.slice(0, 8)],
    ...(d.counterparty ? [[
      d.doc_type === 'ingreso' ? 'Entregado por' : 'Recibido por', d.counterparty,
    ] as [string, string]] : []),
    ...(d.related_document?.document_number ? [['Fondo de origen', d.related_document.document_number] as [string, string]] : []),
  ];
  doc.setFontSize(10);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), M + 42, y);
    y += 6;
  }
  y += 3;

  // Importe destacado
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('IMPORTE', M + 3, y + 5.5);
  doc.setFontSize(15);
  doc.text(`${d.doc_type === 'ingreso' ? '+' : '-'}${fmt(d.amount)} ${d.currency}`, W - M - 3, y + 10, { align: 'right' });
  y += 16;
  if (d.currency === 'USD') {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Equivalente: ${fmt(d.amount_cup)} CUP · tasa aplicada ${fmt(Number(d.exchange_rate))}`, W - M, y + 4, { align: 'right' });
    y += 8;
  }
  y += 4;

  // Justificación y observaciones
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Justificación:', M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const justLines = doc.splitTextToSize(d.justification || '—', W - 2 * M);
  doc.text(justLines, M, y);
  y += justLines.length * 4.5 + 3;
  if (d.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', M, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(d.notes, W - 2 * M);
    doc.text(noteLines, M, y);
    y += noteLines.length * 4.5 + 3;
  }

  // Anulación (si aplica) — trazabilidad completa
  if (d.status === 'anulado') {
    y += 3;
    doc.setDrawColor(178, 34, 34);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 6;
    doc.setTextColor(178, 34, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ANULACIÓN', M, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const anulRows: Array<[string, string]> = [
      ['Anulado por', d.annulled_by_profile?.full_name ?? (d.annulled_by ?? '')],
      ['Fecha', d.annulled_at ? `${formatDate(d.annulled_at)} ${formatTime(d.annulled_at)}` : '—'],
      ['Motivo', d.annulment_reason ?? '—'],
    ];
    for (const [k, v] of anulRows) {
      doc.setFont('helvetica', 'bold');
      doc.text(`${k}:`, M, y);
      doc.setFont('helvetica', 'normal');
      const vLines = doc.splitTextToSize(String(v), W - 2 * M - 42);
      doc.text(vLines, M + 42, y);
      y += Math.max(5, vLines.length * 4.5);
    }
    doc.setTextColor(0, 0, 0);
  }

  // Pie: firmas + identificación
  const pageH = doc.internal.pageSize.getHeight();
  let fy = Math.min(y + 14, pageH - 40);
  doc.setDrawColor(120);
  doc.setLineWidth(0.25);
  doc.line(M, fy + 10, M + 62, fy + 10);
  doc.line(W - M - 62, fy + 10, W - M, fy + 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Responsable que registra', M + 31, fy + 14, { align: 'center' });
  doc.text(d.doc_type === 'ingreso' ? 'Quien entrega el dinero' : 'Quien recibe el dinero', W - M - 31, fy + 14, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(
    `Emitido ${formatDate(d.confirmed_at)} ${formatTime(d.confirmed_at)} · ID ${d.id}`,
    W / 2, pageH - 12, { align: 'center' },
  );
  doc.setTextColor(0);

  return doc;
}

export function comprobanteFileName(d: CashFlowDocument): string {
  return `comprobante_${d.document_number}.pdf`;
}
