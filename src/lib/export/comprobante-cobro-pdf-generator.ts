/**
 * Comprobante de Cobro PDF Generator — Tiquet compacto (80mm)
 *
 * Genera un PDF de comprobante de pago para el cliente:
 *   - Anticipo (advance)
 *   - Pago parcial (partial)
 *   - Liquidación (settlement)
 *
 * Formato: 80mm de ancho, alto dinámico (media página A4 aprox).
 * Estilo recibo de caja: logo, # comprobante, OT ref, cliente, monto, método, fecha, firma.
 */
import { jsPDF } from 'jspdf';

export interface ComprobanteCobroData {
  // Datos del pago
  comprobante_number: string; // ej: REC-2026-0001
  payment_type: 'advance' | 'partial' | 'settlement';
  amount: number;
  currency: string;
  payment_method: string; // cash, transfer, zelle
  payment_date: string;
  reference?: string;
  notes?: string;

  // Datos de la OT
  order_number: string;
  order_id: string;
  customer_name: string;
  customer_phone?: string;
  description?: string;

  // Saldo de la OT (para contexto)
  budget_total: number;
  paid_amount: number; // total ya pagado (incluyendo este pago)
  budget_currency: string;

  // Store info
  store_name: string;
  store_tagline?: string;
  store_phone?: string;
  store_address?: string;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: 'ANTICIPO',
  partial: 'PAGO PARCIAL',
  settlement: 'LIQUIDACIÓN',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  zelle: 'Zelle',
};

function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatTime(isoDate?: string | null): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
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
 * Genera el PDF del comprobante de cobro y lo retorna como Uint8Array.
 */
export function generateComprobanteCobroPDF(data: ComprobanteCobroData): Uint8Array {
  // Formato tiquet: 80mm de ancho, alto dinámico
  const pageWidth = 80; // mm
  const margin = 4;
  const contentWidth = pageWidth - margin * 2;

  // Calcular alto dinámico basado en contenido
  let estimatedHeight = 130; // base
  if (data.notes) estimatedHeight += 10;
  if (data.customer_phone) estimatedHeight += 5;
  if (data.description) estimatedHeight += 8;
  const pageHeight = Math.max(estimatedHeight, 120);

  const doc = new jsPDF({
    unit: 'mm',
    format: [pageWidth, pageHeight],
    orientation: 'portrait',
  });

  let y = margin + 2;

  // ── HEADER (tienda) ───────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(data.store_tagline || data.store_name || 'TIENDA', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  if (data.store_name && data.store_tagline) {
    doc.text(data.store_name, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  }
  if (data.store_address) {
    const addrLines = doc.splitTextToSize(data.store_address, contentWidth);
    doc.text(addrLines, pageWidth / 2, y, { align: 'center' });
    y += 3.5 * addrLines.length;
  }
  if (data.store_phone) {
    doc.text(`Tel: ${data.store_phone}`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  }

  // Línea separadora
  y += 1;
  doc.setDrawColor(21, 128, 61);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // ── TÍTULO COMPROBANTE ────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('COMPROBANTE DE COBRO', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  doc.text(PAYMENT_TYPE_LABELS[data.payment_type] || data.payment_type, pageWidth / 2, y, { align: 'center' });
  y += 5;

  // ── NÚMERO DE COMPROBANTE ─────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`No: ${data.comprobante_number}`, pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`OT: ${data.order_number}`, margin, y);
  doc.text(`${formatDate(data.payment_date)}`, pageWidth - margin, y, { align: 'right' });
  y += 5;

  // Línea punteada
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // ── DATOS DEL CLIENTE ─────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Cliente:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  const nameLines = doc.splitTextToSize(data.customer_name || '—', contentWidth - 18);
  doc.text(nameLines, margin + 18, y);
  y += 3.5 * nameLines.length;

  if (data.customer_phone) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('Tel:', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(data.customer_phone, margin + 18, y);
    y += 3.5;
  }

  if (data.description) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('Desc:', margin, y);
    const descLines = doc.splitTextToSize(data.description, contentWidth - 18);
    doc.text(descLines, margin + 18, y);
    y += 3.5 * descLines.length;
  }

  y += 2;

  // ── MONTO DEL PAGO (destacado) ────────────────────────────────────
  doc.setFillColor(21, 128, 61);
  doc.rect(margin, y - 2, contentWidth, 16, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text('MONTO RECIBIDO', margin + 2, y + 2);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(formatMoney(data.amount, data.currency), pageWidth - margin - 2, y + 8, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Método: ${PAYMENT_METHOD_LABELS[data.payment_method] || data.payment_method}`, margin + 2, y + 12);
  y += 18;

  // ── ESTADO DE CUENTA DE LA OT ─────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('ESTADO DE CUENTA OT', margin, y);
  y += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Contratado:', margin, y);
  doc.setTextColor(0);
  doc.text(formatMoney(data.budget_total, data.budget_currency), pageWidth - margin, y, { align: 'right' });
  y += 3.5;

  doc.setTextColor(80);
  doc.text('Total pagado:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(formatMoney(data.paid_amount, data.budget_currency), pageWidth - margin, y, { align: 'right' });
  y += 3.5;

  const saldo = data.budget_total - data.paid_amount;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Saldo pendiente:', margin, y);
  doc.setFont('helvetica', 'bold');
  if (saldo > 0) {
    doc.setTextColor(180, 60, 60);
  } else {
    doc.setTextColor(21, 128, 61);
  }
  doc.text(formatMoney(Math.max(0, saldo), data.budget_currency), pageWidth - margin, y, { align: 'right' });
  y += 5;

  // ── NOTAS (si hay) ────────────────────────────────────────────────
  if (data.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.setFontSize(7);
    const notesLines = doc.splitTextToSize(`Notas: ${data.notes}`, contentWidth);
    doc.text(notesLines, margin, y);
    y += 3.5 * notesLines.length + 2;
  }

  // ── FIRMA ─────────────────────────────────────────────────────────
  y += 5;
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.line(margin + 10, y, pageWidth - margin - 10, y);
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');
  doc.text('Firma del cajero', pageWidth / 2, y + 4, { align: 'center' });
  y += 8;

  // ── FOOTER ────────────────────────────────────────────────────────
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text(`Emitido: ${formatDate(data.payment_date)} ${formatTime(data.payment_date)}`, pageWidth / 2, y, { align: 'center' });
  y += 3;
  doc.text('Gracias por su preferencia', pageWidth / 2, y, { align: 'center' });

  // Set metadata
  doc.setProperties({
    title: `Comprobante ${data.comprobante_number} — ${PAYMENT_TYPE_LABELS[data.payment_type]}`,
    subject: `Comprobante de cobro OT ${data.order_number}`,
    author: data.store_name || 'CostPro',
    creator: 'CostPro',
  });

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
