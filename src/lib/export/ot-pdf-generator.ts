/**
 * OT PDF Generator — Genera un PDF de Orden de Trabajo (OT) en formato vectorial
 * usando jsPDF + jspdf-autotable.
 *
 * Layout (basado en imagen de referencia):
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [LOGO]  VITALCONS                       ORDEN DE TRABAJO │
 *   │         Tienda tagline                  No: OT-0020      │
 *   │                                         Fecha: 28/07/26  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Nombre: ____   CI: ____   Teléfono: ____                │
 *   │ Dirección: ____________________________                  │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Contratado: 750 USD    Anticipo: 100 USD   Pagado: 510  │
 *   │ Fecha pago: ___  Fecha liquid.: ___                     │
 *   │ Descripción: 1 Panel                                    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Cod │ Materiales      │ UM │ Cantidad │ Precio │ Importe│
 *   │ ... │ ...             │ ...│ ...      │ ...    │ ...    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ Total: 72.00 USD                                         │
 *   └──────────────────────────────────────────────────────────┘
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface OTMaterial {
  sku?: string;
  name: string;
  unit_of_measure?: string;
  budgeted_qty: number;
  budgeted_unit_cost: number;
}

export interface OTData {
  order_number: string;
  order_date: string;
  customer_name: string;
  customer_ci?: string;
  customer_phone?: string;
  customer_address?: string;
  budget_total: number;
  budget_currency: string;
  advance_amount?: number;
  advance_currency?: string;
  paid_amount?: number;
  payment_status?: string;
  description?: string;
  status: string;
  closed_at?: string;
  paid_at?: string;
  items: OTMaterial[];
  // Store info
  store_name: string;
  store_tagline?: string;
  store_address?: string;
  store_phone?: string;
  store_email?: string;
  store_logo_url?: string;
}

function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

function formatMoney(amount?: number | null, currency = 'CUP'): string {
  const val = Number(amount || 0);
  const formatted = val.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${currency}`;
}

/**
 * Genera el PDF de la OT y lo retorna como Uint8Array.
 */
export function generateOTPDF(data: OTData): Uint8Array {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // ── HEADER ────────────────────────────────────────────────────────
  // Logo (si existe URL, jsPDF no puede cargar imágenes remotas sin datos base64)
  // Por simplicidad, dibujamos un placeholder del logo si no hay datos base64
  // y usamos el nombre + tagline de la tienda como branding principal.

  // Cuadro de logo placeholder (40x40mm) en esquina superior izquierda
  doc.setDrawColor(21, 128, 61);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, margin, 30, 30, 2, 2, 'S');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text('LOGO', margin + 15, margin + 17, { align: 'center' });

  // Branding (nombre + tagline de la tienda) a la derecha del logo
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(data.store_tagline || data.store_name || 'TIENDA', margin + 36, margin + 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  if (data.store_name) {
    doc.text(data.store_name, margin + 36, margin + 18);
  }
  if (data.store_address) {
    doc.text(data.store_address, margin + 36, margin + 23);
  }
  if (data.store_phone) {
    doc.text(`Tel: ${data.store_phone}`, margin + 36, margin + 28);
  }

  // Título del documento (ORDEN DE TRABAJO) — esquina superior derecha
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('ORDEN DE TRABAJO', pageWidth - margin, margin + 8, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(`No: ${data.order_number}`, pageWidth - margin, margin + 14, { align: 'right' });
  doc.text(`Fecha: ${formatDate(data.order_date)}`, pageWidth - margin, margin + 20, { align: 'right' });

  // Línea separadora del header
  doc.setDrawColor(21, 128, 61);
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 35, pageWidth - margin, margin + 35);

  // ── DATOS DEL CLIENTE ────────────────────────────────────────────
  let y = margin + 42;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('DATOS DEL CLIENTE', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // Nombre
  doc.setTextColor(80);
  doc.text('Nombre:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.customer_name || '—', margin + 18, y);
  // CI
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('CI:', margin + 100, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.customer_ci || '—', margin + 110, y);
  // Teléfono
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Tel:', margin + 145, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(data.customer_phone || '—', margin + 155, y);
  y += 6;

  // Dirección (full width)
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Dirección:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  const addressLines = doc.splitTextToSize(data.customer_address || '—', contentWidth - 22);
  doc.text(addressLines, margin + 22, y);
  y += 6 * addressLines.length + 2;

  // ── INFORMACIÓN FINANCIERA ───────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text('INFORMACIÓN DEL CONTRATO', margin, y);
  y += 6;

  // 3 columnas: Contratado | Anticipo | Pagado
  const colW = contentWidth / 3;
  doc.setFontSize(9);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y - 4, colW, 14, 'F');
  doc.rect(margin + colW, y - 4, colW, 14, 'F');
  doc.rect(margin + colW * 2, y - 4, colW, 14, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Contratado:', margin + 3, y);
  doc.text('Anticipo:', margin + colW + 3, y);
  doc.text('Pagado:', margin + colW * 2 + 3, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(formatMoney(data.budget_total, data.budget_currency), margin + 3, y + 6);
  doc.text(formatMoney(data.advance_amount, data.advance_currency || data.budget_currency), margin + colW + 3, y + 6);
  doc.text(formatMoney(data.paid_amount, data.budget_currency), margin + colW * 2 + 3, y + 6);
  y += 16;

  // Fechas
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Fecha pago:', margin, y);
  doc.text('Fecha liquid.:', margin + colW, y);
  doc.text('Estado:', margin + colW * 2, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  // VITALCONS: la fecha_pago está en payment_transactions (no en production_orders directamente).
  // Si closed_at existe, asumir que es la fecha de liquidación.
  doc.text(formatDate(data.paid_at) || '—', margin + 22, y);
  doc.text(formatDate(data.closed_at) || '—', margin + colW + 28, y);
  const statusMap: Record<string, string> = {
    completed: 'Completada',
    closed: 'Cerrada',
    in_progress: 'En progreso',
    paused: 'Pausada',
    draft: 'Borrador',
    approved: 'Aprobada',
    voided: 'Anulada',
  };
  doc.text(statusMap[data.status] || data.status, margin + colW * 2 + 18, y);
  y += 8;

  // Descripción
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Descripción:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  const descLines = doc.splitTextToSize(data.description || '—', contentWidth - 26);
  doc.text(descLines, margin + 26, y);
  y += 6 * descLines.length + 4;

  // ── TABLA DE MATERIALES ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text('MATERIALES', margin, y);
  y += 2;

  const tableRows = (data.items || []).map((item, idx) => [
    String(idx + 1),
    item.sku || item.name,
    item.unit_of_measure || 'U',
    Number(item.budgeted_qty || 0).toLocaleString('es-CU'),
    formatMoney(item.budgeted_unit_cost, data.budget_currency),
    formatMoney(Number(item.budgeted_qty || 0) * Number(item.budgeted_unit_cost || 0), data.budget_currency),
  ]);

  // Calcular total de materiales
  const totalMateriales = (data.items || []).reduce(
    (sum, it) => sum + Number(it.budgeted_qty || 0) * Number(it.budgeted_unit_cost || 0),
    0
  );
  const totalCantidad = (data.items || []).reduce(
    (sum, it) => sum + Number(it.budgeted_qty || 0),
    0
  );

  autoTable(doc, {
    startY: y + 2,
    head: [['Cod', 'Materiales', 'UM', 'Cantidad', 'Precio', 'Importe']],
    body: tableRows,
    foot: [[
      { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: totalCantidad.toLocaleString('es-CU'), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: '', styles: { fontStyle: 'bold' } },
      { content: formatMoney(totalMateriales, data.budget_currency), styles: { halign: 'right', fontStyle: 'bold' } },
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: [21, 128, 61],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: 30,
    },
    footStyles: {
      fillColor: [230, 243, 255],
      textColor: 0,
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },   // Cod
      1: { cellWidth: 'auto' },                  // Materiales
      2: { cellWidth: 14, halign: 'center' },    // UM
      3: { cellWidth: 22, halign: 'right' },     // Cantidad
      4: { cellWidth: 30, halign: 'right' },     // Precio
      5: { cellWidth: 32, halign: 'right' },     // Importe
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Footer con número de página
      const pageNum = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${data.store_tagline || data.store_name} — ${data.order_number}`,
        margin,
        pageHeight - 6
      );
      doc.text(
        `Página ${pageNum}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: 'right' }
      );
    },
  });

  // ── FIRMA ────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  if (finalY < pageHeight - 40) {
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.line(margin + 20, finalY, margin + 80, finalY);
    doc.line(pageWidth - margin - 80, finalY, pageWidth - margin - 20, finalY);
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.text('Cliente', margin + 50, finalY + 5, { align: 'center' });
    doc.text('Responsable', pageWidth - margin - 50, finalY + 5, { align: 'center' });
  }

  // Set metadata
  doc.setProperties({
    title: `Orden de Trabajo ${data.order_number}`,
    subject: `OT para ${data.customer_name || 'cliente'}`,
    author: data.store_name || 'CostPro',
    creator: 'CostPro',
  });

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
