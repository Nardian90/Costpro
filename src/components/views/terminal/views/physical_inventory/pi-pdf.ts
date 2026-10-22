/**
 * Hoja de Inventario Físico — generador PDF (jsPDF + autotable).
 *
 * Patrón del proyecto (buildIpvVentasPdf): builder async que recibe el payload
 * y devuelve el `doc`. El caller decide preview (`doc.output('bloburl')` +
 * <iframe>) o descarga (`doc.save()`). Carga perezosa vía createPDFDocument.
 *
 * MODALIDADES:
 *   - 'with_theoretical': incluye la columna de existencia teórica a la fecha
 *     de corte y la diferencia (solo si el usuario está autorizado — la UI ya
 *     lo garantiza y la RPC registra la versión generada).
 *   - 'blind': CONTEO CIEGO REAL — sin teóricas, sin diferencias, sin ningún
 *     dato que permita deducirlas. La hoja ciega es verdaderamente ciega.
 *
 * Diseño: A4 vertical, encabezado repetido en cada página, numeración
 * «Página X de Y», casillas de captura y observaciones por línea, pie con
 * versión de generación (auditable contra physical_inventory_sheets.seq).
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { PG, GRY } from '@/lib/export/pdf-shared';

export interface CountSheetPayload {
  piNumber: string;
  storeName: string;
  cutoffDate: string;          // ISO
  mode: 'with_theoretical' | 'blind';
  responsible?: string | null;
  scopeLabel: string;
  observations?: string | null;
  sheetSeq: number;            // versión registrada en BD
  lines: Array<{
    line_number: number;
    sku: string | null;
    name: string;
    unit: string;
    theoretical_qty?: number; // SOLO en with_theoretical
  }>;
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

/** Texto seguro para WinAnsi (jspdf estándar). */
function pdfWinAnsi(text: unknown): string {
  return String(text ?? '')
    .replace(/\u2212/g, '-')   // minus sign
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00AB\u00BB/g, '"');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtQty(q: number | undefined | null): string {
  if (q === undefined || q === null) return '';
  return Number(q) % 1 === 0 ? String(Math.trunc(Number(q))) : String(Number(q));
}

export async function buildCountSheetPdf(payload: CountSheetPayload): Promise<jsPDF> {
  const doc = (await createPDFDocument('p', 'pt', 'a4')) as DocWithTable;
  const W = doc.internal.pageSize.getWidth();
  const M = 36; // margen pt

  const isBlind = payload.mode === 'blind';

  // ── Encabezado (se repite en cada página vía didDrawPage) ──────────────
  const drawHeader = (page: number) => {
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...PG);
      doc.text('COSTPRO — HOJA DE INVENTARIO FÍSICO', M, M + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(
        pdfWinAnsi(`${payload.piNumber} · ${payload.storeName} · corte ${fmtDate(payload.cutoffDate)} · ${isBlind ? 'CONTEO CIEGO' : 'CON EXISTENCIAS TEÓRICAS'} (continuación)`),
        W - M, M + 6, { align: 'right' }
      );
      doc.setDrawColor(210);
      doc.setLineWidth(0.5);
      doc.line(M, M + 14, W - M, M + 14);
      return M + 26;
    }

    // Página 1 — encabezado completo
    let y = M + 10;
    doc.setFillColor(...PG);
    doc.rect(M, y - 12, 3, 30, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(17, 24, 39);
    doc.text('COSTPRO', M + 10, y + 4);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfWinAnsi(payload.storeName), M + 10, y + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text('HOJA DE INVENTARIO FÍSICO', W - M, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PG);
    doc.text(payload.piNumber, W - M, y + 18, { align: 'right' });

    y += 34;
    doc.setDrawColor(210);
    doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y);
    y += 14;

    // Bloque de datos
    doc.setFontSize(7.5);
    const rows: Array<[string, string]> = [
      ['FECHA DE CORTE', fmtDate(payload.cutoffDate)],
      ['MODALIDAD', isBlind ? 'CONTEO CIEGO' : 'CON EXISTENCIAS TEÓRICAS'],
      ['ALCANCE', payload.scopeLabel],
      ['RESPONSABLE', payload.responsible || '—'],
      ['LÍNEAS', String(payload.lines.length)],
      ['GENERADA', `${fmtDate(new Date().toISOString())} · versión #${payload.sheetSeq}`],
    ];
    const colW = (W - 2 * M) / 2;
    let ry = y;
    for (let i = 0; i < rows.length; i += 2) {
      const left = rows[i];
      const right = rows[i + 1];
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(110);
      doc.text(left[0], M, ry);
      doc.setTextColor(17, 24, 39);
      doc.text(pdfWinAnsi(left[1]), M + 88, ry);
      if (right) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(110);
        doc.text(right[0], M + colW, ry);
        doc.setTextColor(17, 24, 39);
        doc.text(pdfWinAnsi(right[1]), M + colW + 88, ry);
      }
      ry += 11;
    }
    y = ry + 4;

    if (payload.observations) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(110);
      doc.text('OBSERVACIONES', M, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55);
      const obs = doc.splitTextToSize(pdfWinAnsi(payload.observations), W - 2 * M - 88);
      doc.text(obs.slice(0, 2), M + 88, y);
      y += Math.max(12, 11 * Math.min(obs.length, 2));
    }
    return y + 6;
  };

  // ── Tabla de líneas ─────────────────────────────────────────────────────
  const head: string[][] = isBlind
    ? [['#', 'CÓDIGO', 'DESCRIPCIÓN', 'UND', 'CANT. FÍSICA', 'OBSERVACIONES']]
    : [['#', 'CÓDIGO', 'DESCRIPCIÓN', 'UND', 'TEÓRICA', 'CANT. FÍSICA', 'OBSERVACIONES']];

  const body: string[][] = payload.lines.map((l) =>
    isBlind
      ? [String(l.line_number), pdfWinAnsi(l.sku || '—'), pdfWinAnsi(l.name), pdfWinAnsi(l.unit || ''), '', '']
      : [
          String(l.line_number),
          pdfWinAnsi(l.sku || '—'),
          pdfWinAnsi(l.name),
          pdfWinAnsi(l.unit || ''),
          fmtQty(l.theoretical_qty),
          '',
          '',
        ]
  );

  let startY = drawHeader(1);

  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    head,
    body,
    startY,
    margin: { left: M, right: M, bottom: 56 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 5,
      lineColor: [210, 210, 210],
      lineWidth: 0.35,
      textColor: [30, 35, 40],
      overflow: 'linebreak',
      minCellHeight: 22, // casillas cómodas para escribir a mano
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [252, 253, 254] },
    columnStyles: isBlind
      ? {
          0: { cellWidth: 26, halign: 'center' },
          1: { cellWidth: 76 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 40, halign: 'center' },
          4: { cellWidth: 84, halign: 'center' },
          5: { cellWidth: 110 },
        }
      : {
          0: { cellWidth: 24, halign: 'center' },
          1: { cellWidth: 70 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 34, halign: 'center' },
          4: { cellWidth: 52, halign: 'center', fontStyle: 'bold' },
          5: { cellWidth: 78, halign: 'center' },
          6: { cellWidth: 92 },
        },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === (isBlind ? 4 : 5)) {
        // Casilla de captura: fondo claro para escribir
        data.cell.styles.fillColor = [248, 250, 252];
      }
    },
    didDrawPage: (data) => {
      const top = drawHeader(data.pageNumber);
      if (data.pageNumber === 1) {
        // startY ya se aplicó; solo en páginas siguientes reposicionar
        if (data.cursor && data.cursor.y < top) data.cursor.y = top;
      }
      // Pie: numeración + branding
      const H = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(
        pdfWinAnsi(`${payload.piNumber} · versión #${payload.sheetSeq} · ${fmtDate(new Date().toISOString())}`),
        M, H - 24
      );
      doc.text(
        `Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`,
        W - M, H - 24, { align: 'right' }
      );
    },
  });

  // Bloque de firmas al final
  const finalY = doc.lastAutoTable?.finalY ?? startY;
  const H = doc.internal.pageSize.getHeight();
  if (H - finalY > 90) {
    const sy = finalY + 42;
    doc.setDrawColor(120);
    doc.setLineWidth(0.5);
    const sigW = (W - 2 * M - 40) / 2;
    doc.line(M, sy, M + sigW, sy);
    doc.line(W - M - sigW, sy, W - M, sy);
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text('Contado por (firma y nombre)', M, sy + 12);
    doc.text('Revisado / Autorizado por (firma y nombre)', W - M - sigW, sy + 12);
  }

  return doc;
}

export function countSheetFileName(piNumber: string, mode: string): string {
  const safe = piNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  return `Hoja_Conteo_${safe}_${mode === 'blind' ? 'Ciega' : 'ConTeoricas'}.pdf`;
}
