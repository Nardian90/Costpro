/**
 * Nómina de Salario SC-4-06 (Res. 13/2007 MFP) — generador PDF A4 apaisado.
 *
 * Documento profesional con:
 *   · Encabezado: entidad (nombre+código snapshot del documento), tipo de
 *     nómina codificado, número NOM-NNNNNN-AAAA + «Hoja X de Y», período
 *     (desde/hasta) y moneda.
 *   · Datos de pago: modalidad (efectivo|tarjeta), cheque nominativo
 *     (número+fecha) cuando procede, reintegro bancario cuando exista.
 *   · Tabla principal por trabajador CON ENCABEZADOS REPETIDOS en cada
 *     página (margin.top + didDrawPage + decoratePageOnce — patrón probado
 *     del Inventario/IPV): expediente, nombres y apellidos, categoría
 *     ocupacional, salario básico (tarifa horaria o diaria), horas o días,
 *     horas extras + importe, complementos, otros haberes (sigla),
 *     obligaciones estatales sociales, total devengado, deducciones, neto
 *     a cobrar y acumulación de vacaciones (días+importe — informativa,
 *     FUERA del devengado, conforme al modelo).
 *   · Totales de documento (foot de la tabla) — calculados por el SERVIDOR
 *     (única fuente de verdad; el PDF solo presenta).
 *   · Desglose de conceptos con sigla (clase + sigla + descripción +
 *     importe por línea de trabajador).
 *   · Firmas del modelo: Elabora / Revisa y aprueba / Contabiliza. La firma
 *     de RECEPCIÓN solo aparece con pago en EFECTIVO (con pago por tarjetas
 *     magnéticas el modelo NO la incluye — regla textual de la Res. 13/07).
 *   · Pie: numeración «Página X de Y» + branding en todas las hojas.
 *
 * El caller decide: vista previa = doc.output('bloburl') (iframe), descarga
 * = doc.save() — MISMO builder (patrón Reporte Entrega).
 *
 * Sin coeficientes legales inventados: los importes de extras y conceptos
 * provienen del documento (configurados por la entidad conforme al brief).
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { pdfWinAnsi, splitToWidthVerified } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import type { Payroll, PayrollItem } from '@/lib/payrolls/types';

const MARGIN = 42;

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('es-CU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function dateTimeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export interface PayrollPdfPayload {
  payroll: Payroll;
  /** Nombre de quien firma «Elabora» (created_by) — opcional para el pie. */
  elaboraNombre?: string;
}

/**
 * Construye el documento de la nómina (A4 apaisado). Paginado con
 * encabezados repetidos; la misma instancia sirve para vista previa
 * (bloburl) y descarga (save).
 */
export async function buildPayrollPdf(payload: PayrollPdfPayload): Promise<jsPDF> {
  const { payroll, elaboraNombre } = payload;
  const items = payroll.items ?? [];
  const doc = await createPDFDocument('l', 'pt', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ─────────────────────────────────────────────────────────────────────
  // Encabezado (compacto en páginas 2+): entidad, modelo, número y hoja
  // ─────────────────────────────────────────────────────────────────────
  const drawHeader = (compact: boolean): number => {
    const y0 = MARGIN;
    const tipo = (payroll.tipo_nomina || '').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 10 : 13);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfWinAnsi(`NÓMINA — ${tipo}`), pageW / 2, y0 + (compact ? 9 : 13), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(pdfWinAnsi(`Entidad: ${payroll.entidad_nombre}${payroll.entidad_codigo ? ` (${payroll.entidad_codigo})` : ''}`), MARGIN, y0 + (compact ? 19 : 26));
    doc.text(pdfWinAnsi(`Número: ${payroll.payroll_number}`), MARGIN, y0 + (compact ? 29 : 38));
    doc.text(pdfWinAnsi(`Período: ${dateLabel(payroll.period_start)} – ${dateLabel(payroll.period_end)}`), MARGIN, y0 + (compact ? 39 : 50));

    doc.text(`Moneda: ${payroll.currency}`, pageW - MARGIN, y0 + (compact ? 19 : 26), { align: 'right' });
    doc.text(pdfWinAnsi(`Modalidad de pago: ${payroll.payment_method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}`), pageW - MARGIN, y0 + (compact ? 29 : 38), { align: 'right' });
    if (payroll.cheque_number) {
      doc.text(pdfWinAnsi(`Cheque nominativo: ${payroll.cheque_number}${payroll.cheque_date ? ` · ${dateLabel(payroll.cheque_date)}` : ''}`), pageW - MARGIN, y0 + (compact ? 39 : 50), { align: 'right' });
    }

    doc.setDrawColor(180);
    doc.line(MARGIN, y0 + (compact ? 46 : 60), pageW - MARGIN, y0 + (compact ? 46 : 60));
    return y0 + (compact ? 54 : 68);
  };

  const startY = drawHeader(false);

  // ANTI-SOLAPE: cada página se decora UNA sola vez (patrón IPV).
  const decoratedPages = new Set<number>();
  decoratedPages.add(doc.getNumberOfPages());
  const decoratePageOnce = (compact: boolean): void => {
    const page = doc.getNumberOfPages();
    if (decoratedPages.has(page)) return;
    decoratedPages.add(page);
    drawHeader(compact);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Tabla principal por trabajador (columnas del SC-4-06)
  // ─────────────────────────────────────────────────────────────────────
  const isHourly = items.every((it) => it.rate_type !== 'daily');
  const timeHead = isHourly ? 'Horas\nRegulares' : 'Días\nDevengados';
  const rateHead = isHourly ? 'Salario Básico\n(hora)' : 'Salario Básico\n(día)';

  const head = [[
    'Exp. Lab.',
    'Nombres y Apellidos',
    'Categoría\nOcupacional',
    rateHead,
    timeHead,
    'H. Extras\n(h)',
    'Importe\nExtras',
    'Compl.\nSalario',
    'Otros Hab.\n(sigla)',
    'Oblig.\nSocial',
    'Total\nDevengado',
    'Deduc-\nciones',
    'Neto a\nCobrar',
    'Vacac.\n(días)',
    'Vacac.\nImporte',
  ]];

  const siglaList = (it: PayrollItem): string => {
    const cs = it.concepts ?? [];
    const otros = cs.filter((c) => c.kind === 'otro_haber').map((c) => c.sigla);
    if (otros.length) return otros.join(', ');
    return '—';
  };

  const body = items.map((it) => ([
    { content: pdfWinAnsi(it.expediente_laboral || '—') },
    { content: pdfWinAnsi(it.worker_names) },
    { content: pdfWinAnsi(it.categoria_ocupacional || '—') },
    { content: it.rate_amount != null ? `${money(it.rate_amount)}` : '—' },
    { content: isHourly ? qty(it.regular_hours) : qty(it.accrued_days) },
    { content: qty(it.overtime_hours) },
    { content: money(it.overtime_amount) },
    { content: money(it.total_complementos) },
    { content: pdfWinAnsi(siglaList(it)) },
    { content: money(it.total_social_security) },
    { content: money(it.total_gross) },
    { content: money(it.total_deductions) },
    { content: money(it.total_net), styles: { fontStyle: 'bold' as const } },
    { content: qty(it.vacation_days) },
    { content: money(it.vacation_amount) },
  ]));

  const foot = [[
    {
      content: pdfWinAnsi(`TOTALES · ${payroll.total_workers} trabajador(es)`),
      colSpan: 2,
      styles: { halign: 'left' as const, fontStyle: 'bold' as const },
    },
    { content: '' },
    { content: '' },
    {
      content: isHourly
        ? `${qty(payroll.total_regular_hours)} h`
        : `${qty(payroll.total_accrued_days)} d`,
      styles: { fontStyle: 'bold' as const },
    },
    { content: qty(payroll.total_overtime_hours), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_overtime), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_complementos), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_other_earnings), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_social_security), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_gross), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_deductions), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_net), styles: { fontStyle: 'bold' as const } },
    { content: qty(payroll.total_vacation_days), styles: { fontStyle: 'bold' as const } },
    { content: money(payroll.total_vacation_amount), styles: { fontStyle: 'bold' as const } },
  ]];

  const autoTable = (await import('jspdf-autotable')).default;

  autoTable(doc, {
    head,
    body,
    foot,
    startY,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 54 },
    styles: {
      font: 'helvetica', fontSize: 7.4, cellPadding: 3,
      lineColor: [214, 214, 214], lineWidth: 0.35, textColor: [30, 30, 30],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [238, 240, 243], textColor: [20, 20, 20],
      fontStyle: 'bold', halign: 'center', fontSize: 7,
    },
    footStyles: { fillColor: [228, 231, 235], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 44, halign: 'left' },
      1: { cellWidth: 108, halign: 'left' },
      2: { cellWidth: 74, halign: 'left' },
      3: { cellWidth: 54, halign: 'right' },
      4: { cellWidth: 38, halign: 'right' },
      5: { cellWidth: 36, halign: 'right' },
      6: { cellWidth: 50, halign: 'right' },
      7: { cellWidth: 46, halign: 'right' },
      8: { cellWidth: 54, halign: 'left' },
      9: { cellWidth: 46, halign: 'right' },
      10: { cellWidth: 58, halign: 'right' },
      11: { cellWidth: 48, halign: 'right' },
      12: { cellWidth: 58, halign: 'right' },
      13: { cellWidth: 34, halign: 'right' },
      14: { cellWidth: 50, halign: 'right' },
    },
    didDrawPage: () => {
      if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // Desglose de conceptos con sigla (clase + sigla + descripción + importe)
  // ─────────────────────────────────────────────────────────────────────
  const conceptRows = items.flatMap((it) =>
    (it.concepts ?? []).map((c) => ({
      worker: it.worker_names,
      kind: c.kind,
      sigla: c.sigla,
      description: c.description,
      amount: c.amount,
    })),
  );

  let cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
  cursor += 24;

  if (conceptRows.length) {
    if (cursor > pageH - 200) {
      doc.addPage();
      cursor = drawHeader(true) + 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfWinAnsi('CONCEPTOS POR TRABAJADOR (SIGLA · CLASE)'), MARGIN, cursor);
    cursor += 10;

    const cHead = [['Trabajador', 'Clase', 'Sigla', 'Descripción', 'Importe']];
    const cBody = conceptRows.map((r) => ([
      { content: pdfWinAnsi(r.worker) },
      { content: pdfWinAnsi(r.kind) },
      { content: pdfWinAnsi(r.sigla) },
      { content: pdfWinAnsi(r.description || '—') },
      { content: money(r.amount) },
    ]));

    autoTable(doc, {
      head: cHead,
      body: cBody,
      startY: cursor,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 54 },
      styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.6, lineColor: [214, 214, 214], lineWidth: 0.3, textColor: [30, 30, 30], overflow: 'linebreak' },
      headStyles: { fillColor: [238, 240, 243], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center', fontSize: 6.8 },
      columnStyles: {
        0: { cellWidth: 150, halign: 'left' },
        1: { cellWidth: 90, halign: 'left' },
        2: { cellWidth: 46, halign: 'left' },
        3: { cellWidth: 330, halign: 'left' },
        4: { cellWidth: 60, halign: 'right' },
      },
      didDrawPage: () => {
        if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
      },
    });
    cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor;
    cursor += 20;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Notas + reintegro bancario (datos 7 del modelo)
  // ─────────────────────────────────────────────────────────────────────
  if (payroll.notes || payroll.reintegro_number) {
    if (cursor > pageH - 180) {
      doc.addPage();
      cursor = drawHeader(true) + 6;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    if (payroll.reintegro_number) {
      doc.text(
        pdfWinAnsi(`Reintegro al Banco (salarios indebidos no reclamados): ${payroll.reintegro_number}${payroll.reintegro_date ? ` · ${dateLabel(payroll.reintegro_date)}` : ''}`),
        MARGIN, cursor,
      );
      cursor += 13;
    }
    if (payroll.notes) {
      const noteLines = splitToWidthVerified(doc, pdfWinAnsi(`Notas: ${payroll.notes}`), pageW - 2 * MARGIN);
      for (const line of noteLines.slice(0, 4)) {
        doc.text(line, MARGIN, cursor);
        cursor += 11;
      }
    }
    cursor += 8;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Firmas del modelo SC-4-06: elabora / revisa y aprueba / contabiliza.
  // Firma de RECEPCIÓN solo con pago en EFECTIVO (regla textual: con pago
  // por tarjetas magnéticas NO aparece firma de recepción).
  // ─────────────────────────────────────────────────────────────────────
  if (cursor > pageH - 120) {
    doc.addPage();
    cursor = drawHeader(true) + 6;
  }
  const sigY = Math.max(cursor + 10, pageH - 96);
  const colW = (pageW - 2 * MARGIN) / (payroll.payment_method === 'efectivo' ? 4 : 3);
  const labels = ['Elabora', 'Revisa y aprueba', 'Contabiliza'];
  if (payroll.payment_method === 'efectivo') labels.push('Recibí conforme (Recepción)');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  labels.forEach((label, i) => {
    const x = MARGIN + i * colW;
    doc.setDrawColor(120);
    doc.line(x, sigY, x + colW - 24, sigY);
    doc.text(pdfWinAnsi(label), x, sigY + 11);
    if (elaboraNombre && i === 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(pdfWinAnsi(elaboraNombre), x, sigY + 20);
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
    }
  });

  // Estado del documento (sello discreto bajo las firmas)
  const estado =
    payroll.status === 'paid' ? 'PAGADA'
      : payroll.status === 'confirmed' ? 'CONFIRMADA'
        : payroll.status === 'voided' ? 'ANULADA'
          : 'BORRADOR';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(
    payroll.status === 'voided' ? 170 : 70,
    payroll.status === 'voided' ? 40 : 70,
    payroll.status === 'voided' ? 40 : 70,
  );
  doc.text(pdfWinAnsi(`Estado: ${estado}`), MARGIN, sigY + 34);
  if (payroll.status === 'voided' && payroll.void_reason) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const motivo = splitToWidthVerified(doc, pdfWinAnsi(`Motivo de anulación: ${payroll.void_reason}`), pageW - 2 * MARGIN);
    motivo.slice(0, 2).forEach((line, i) => doc.text(line, MARGIN, sigY + 46 + i * 10));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Pie de página: numeración + hoja + branding en TODAS las hojas
  // ─────────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${p} de ${pageCount}`, pageW - MARGIN, pageH - 14, { align: 'right' });
    doc.text(pdfWinAnsi(`Nómina ${payroll.payroll_number} · Hoja ${p} de ${pageCount} · ${dateTimeLabel(new Date().toISOString())}`), MARGIN, pageH - 14);
  }

  return doc;
}
