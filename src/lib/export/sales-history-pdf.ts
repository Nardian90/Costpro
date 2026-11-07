/**
 * HISTORIAL DE VENTAS — EXPORTACIÓN PROFESIONAL A PDF (misión 2026-11-07)
 * =======================================================================
 * Segunda opción de exportación del Historial de Ventas (Inicio → OPERACIÓN →
 * Ventas → Opciones → Historial de Ventas), junto a la exportación Excel
 * existente, que se conserva íntegra.
 *
 * Requisitos cubiertos:
 *  - Se exporta TODO el conjunto FILTRADO (no solo la página visible).
 *  - Identidad visual: logo de la TIENDA activa (lib/legal/sc-logo.ts — el
 *    mismo mecanismo de los modelos SC-2-xx) con fallback institucional
 *    (/logo.png) y aislamiento multi-tenant (logo_url de stores por id).
 *  - Encabezado: logo, nombre comercial, título, período, fecha/hora de
 *    generación e identificación comercial disponible (REEUP/NIT si existen).
 *  - Dos secciones: ventas por transacción y líneas de producto (Producto,
 *    SKU, cantidad, precio unitario nativo, moneda, importe CUP).
 *  - CONTROL MONETARIO: total_amount SIEMPRE es CUP (moneda de cuenta del
 *    sistema); los cobros en USD se presentan como referencia aparte. Nunca
 *    se suman CUP y USD en un mismo total.
 *  - Encabezados de tabla repetidos en cada página (autoTable) y numeración
 *    «Página X de Y». Solo lectura: no modifica ningún registro.
 */

import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { drawScLogo, resolveScLogoDataUrl } from '@/lib/legal/sc-logo';
import { logger } from '@/lib/logger';

// ────────────────────────────────────────────────────────────────────────────
// Tipos (espejo de las columnas reales de transactions / transaction_items)
// ────────────────────────────────────────────────────────────────────────────

export interface SalesHistoryPdfTransaction {
  id: string;
  created_at: string;
  status: string;
  payment_method?: string | null;
  invoice_number?: string | null;
  /** Moneda de cuenta del sistema — SIEMPRE CUP (nunca se suma con USD). */
  total_amount: number;
  subtotal?: number | null;
  discount_value?: number | null;
  tax_amount?: number | null;
  /** Cobros Zelle en equivalente CUP; el USD real de referencia = zelle/tasa. */
  zelle_amount?: number | null;
  sale_exchange_rate?: number | null;
  cash_amount?: number | null;
  transfer_amount?: number | null;
}

export interface SalesHistoryPdfLine {
  transaction_id: string;
  /** Fecha de la venta (se resuelve del mapa de transacciones en el modelo). */
  transaction_created_at?: string;
  product_id?: string | null;
  quantity: number;
  price_at_sale: number;
  price_currency?: string | null;
  price_at_sale_cup?: number | null;
  exchange_rate?: number | null;
  products?: { name?: string | null; sku?: string | null } | null;
}

export interface SalesHistoryPdfStore {
  name: string;
  logoUrl?: string | null;
  reeup?: string | null;
  nit?: string | null;
}

export interface SalesHistoryPdfModelInput {
  /** TODAS las transacciones filtradas (no solo la página visible). */
  transactions: SalesHistoryPdfTransaction[];
  /** Líneas de producto de esas transacciones (1 consulta por lote). */
  lines?: SalesHistoryPdfLine[];
  store: SalesHistoryPdfStore;
  dateFrom?: string | null;
  dateTo?: string | null;
  generatedAt?: Date;
}

export interface SalesHistoryPdfModel {
  store: SalesHistoryPdfStore;
  titulo: string;
  periodoTexto: string;
  /** Rango crudo (para el nombre de archivo). */
  periodoDesde?: string | null;
  periodoHasta?: string | null;
  generacionTexto: string;
  ventas: Array<{
    fecha: string;
    hora: string;
    identificador: string;
    metodo: string;
    estado: string;
    importeCup: number;
    cobroUsd: number | null;
  }>;
  totalesVentas: { totalCup: number; cobrosUsd: number };
  lineas: Array<{
    fecha: string;
    identificador: string;
    producto: string;
    sku: string;
    cantidad: number;
    precioUnitario: number;
    moneda: string;
    importeCup: number;
  }>;
  totalLineasCup: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Formateo (es-CU, sin redondeos de los valores persistidos)
// ────────────────────────────────────────────────────────────────────────────

const moneyFormatter = new Intl.NumberFormat('es-CU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

const quantityFormatter = new Intl.NumberFormat('es-CU', { maximumFractionDigits: 20 });

export function formatSalesHistoryMoney(value: number): string {
  if (!Number.isFinite(value)) return '';
  return moneyFormatter.format(Number(value.toFixed(10)));
}

export function salesHistoryFileName(storeName: string, dateFrom?: string | null, dateTo?: string | null): string {
  // Puntos y guiones permitidos (S.A, EEI-1…); separadores y comillas fuera.
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'Tienda';
  const desde = dateFrom || 'inicio';
  const hasta = dateTo || 'hoy';
  return `Historial_Ventas_${safe(storeName)}_${desde}_${hasta}.pdf`;
}

const METODO_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mixed: 'Mixto',
  zelle: 'USD/Zelle',
  wallet: 'Billetera',
  other: 'Otro',
};

function metodoLabel(pm?: string | null): string {
  return METODO_LABELS[(pm || '').toLowerCase()] || 'Sin especificar';
}

function estadoLabel(status: string): string {
  if (status === 'completed') return 'Completada';
  if (status === 'pending') return 'Pendiente';
  return 'Anulada';
}

function identificadorDe(t: SalesHistoryPdfTransaction): string {
  return t.invoice_number || t.id?.split('-')[0] || '';
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

/** Precio unitario CUP canónico del sistema (misma regla del modal y SC-2-12). */
export function precioUnitarioCupDeLinea(l: SalesHistoryPdfLine): number {
  const rate = Number(l.exchange_rate) > 0 ? Number(l.exchange_rate) : 1;
  const pCup = Number(l.price_at_sale_cup);
  return pCup > 0 ? pCup : (Number(l.price_at_sale) || 0) * rate;
}

export function buildSalesHistoryPdfModel(input: SalesHistoryPdfModelInput): SalesHistoryPdfModel {
  const generatedAt = input.generatedAt || new Date();

  const fechaTx = new Map<string, string>();
  for (const t of input.transactions) fechaTx.set(t.id, t.created_at);

  // Sección 1: ventas (una fila por transacción)
  const ventas = input.transactions.map((t) => {
    const zelle = Number(t.zelle_amount || 0);
    const rate = Number(t.sale_exchange_rate || 1);
    const cobroUsd = zelle > 0 && rate > 1 ? zelle / rate : null;
    return {
      fecha: format(new Date(t.created_at), 'dd/MM/yyyy'),
      hora: format(new Date(t.created_at), 'HH:mm'),
      identificador: identificadorDe(t),
      metodo: metodoLabel(t.payment_method),
      estado: estadoLabel(t.status),
      importeCup: Number(t.total_amount || 0),
      cobroUsd,
    };
  });

  // CONTROL MONETARIO: CUP y USD se totalizan POR SEPARADO (total_amount es
  // SIEMPRE CUP; el cobro USD es una referencia aparte — jamás se suman).
  const totalesVentas = {
    totalCup: ventas.reduce((s, v) => s + v.importeCup, 0),
    cobrosUsd: ventas.reduce((s, v) => s + (v.cobroUsd || 0), 0),
  };

  // Sección 2: líneas de producto de esas ventas
  const lineas = (input.lines || []).map((l) => {
    const precioCup = precioUnitarioCupDeLinea(l);
    const qty = Number(l.quantity) || 0;
    return {
      fecha: format(new Date(l.transaction_created_at || fechaTx.get(l.transaction_id) || new Date()), 'dd/MM/yyyy'),
      identificador: l.transaction_id?.split('-')[0] || '',
      producto: l.products?.name || '',
      sku: l.products?.sku || '',
      cantidad: qty,
      precioUnitario: Number(l.price_at_sale) || 0,
      moneda: (l.price_currency || 'CUP').toUpperCase(),
      importeCup: qty * precioCup,
    };
  });
  const totalLineasCup = lineas.reduce((s, l) => s + l.importeCup, 0);

  const periodoTexto =
    input.dateFrom || input.dateTo
      ? `${input.dateFrom ? format(new Date(`${input.dateFrom}T00:00:00`), 'dd/MM/yyyy') : '—'} — ${
          input.dateTo ? format(new Date(`${input.dateTo}T00:00:00`), 'dd/MM/yyyy') : '—'
        }`
      : 'Todo el histórico disponible';

  return {
    store: input.store,
    titulo: 'HISTORIAL DE VENTAS',
    periodoTexto,
    periodoDesde: input.dateFrom || null,
    periodoHasta: input.dateTo || null,
    generacionTexto: format(generatedAt, 'dd/MM/yyyy HH:mm'),
    ventas,
    totalesVentas,
    lineas,
    totalLineasCup,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Lecturas bajo RLS (solo lectura; tienda activa — aislamiento multi-tenant)
// ────────────────────────────────────────────────────────────────────────────

/** Datos de la tienda activa para el encabezado (logo + identificación). */
export async function fetchSalesHistoryStoreInfo(
  storeId?: string | null,
): Promise<SalesHistoryPdfStore> {
  if (!storeId) return { name: 'Todas las tiendas', logoUrl: null, reeup: null, nit: null };
  const { data, error } = await supabase
    .from('stores')
    .select('name, logo_url, reeup, nit')
    .eq('id', storeId)
    .maybeSingle();
  if (error) {
    logger.warn('DATABASE', 'SALES_HISTORY_STORE_READ_FAILED', { data: error });
    return { name: 'Tienda', logoUrl: null, reeup: null, nit: null };
  }
  const row = data as { name?: string | null; logo_url?: string | null; reeup?: string | null; nit?: string | null } | null;
  return {
    name: row?.name || 'Tienda',
    logoUrl: row?.logo_url || null,
    reeup: row?.reeup || null,
    nit: row?.nit || null,
  };
}

const LINES_PAGE = 1000;
const LINES_MAX_PAGES = 20;

/**
 * Líneas de producto de las transacciones filtradas (una consulta paginada
 * por lotes de ids — sin N+1).
 */
export async function fetchSalesHistoryLines(
  transactionIds: string[],
): Promise<SalesHistoryPdfLine[]> {
  const out: SalesHistoryPdfLine[] = [];
  for (let i = 0; i < transactionIds.length; i += LINES_PAGE) {
    const chunk = transactionIds.slice(i, i + LINES_PAGE);
    let from = 0;
    for (let page = 0; page < LINES_MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('transaction_items')
        .select(
          'transaction_id, product_id, quantity, price_at_sale, price_currency, price_at_sale_cup, exchange_rate, products(name, sku)',
        )
        .in('transaction_id', chunk)
        .order('created_at', { ascending: true })
        .range(from, from + LINES_PAGE - 1);
      if (error) {
        logger.warn('DATABASE', 'SALES_HISTORY_LINES_READ_FAILED', { data: error });
        return out;
      }
      const rows = (data as unknown as SalesHistoryPdfLine[]) || [];
      out.push(...rows);
      if (rows.length < LINES_PAGE) break;
      from += LINES_PAGE;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Render (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSalesHistoryPdf(model: SalesHistoryPdfModel) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  // ── Encabezado con identidad de la tienda ──
  const logo = await resolveScLogoDataUrl(model.store.logoUrl);
  drawScLogo(doc, logo, { x: marginX, y: 10, maxW: 26, maxH: 14 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(model.store.name || 'Tienda', marginX + 30, 15, { maxWidth: contentWidth - 80 });
  doc.setFontSize(11);
  doc.text(model.titulo, pageWidth - marginX, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const identLines: string[] = [];
  if (model.store.reeup) identLines.push(`REEUP: ${model.store.reeup}`);
  if (model.store.nit) identLines.push(`NIT: ${model.store.nit}`);
  doc.text(identLines.join('   ·   '), marginX + 30, 20);
  doc.text(`Período: ${model.periodoTexto}`, marginX + 30, 24.5);
  doc.text(`Generado: ${model.generacionTexto}`, pageWidth - marginX, 20, { align: 'right' });

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(marginX, 28, pageWidth - marginX, 28);

  const { default: autoTable } = await import('jspdf-autotable');
  const baseStyles = {
    font: 'helvetica',
    fontSize: 7.5,
    cellPadding: 1.6,
    textColor: 0,
    lineColor: [150, 150, 150] as [number, number, number],
    lineWidth: 0.15,
    fillColor: [255, 255, 255] as [number, number, number],
  };
  const headStyles = {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: [0, 0, 0] as [number, number, number],
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize: 7,
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.2,
  };

  let y = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Ventas del período', marginX, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Hora', 'Identificador', 'Método de pago', 'Estado', 'Importe (CUP)', 'Cobro USD (ref.)']],
    body: model.ventas.map((v) => [
      v.fecha,
      v.hora,
      v.identificador,
      v.metodo,
      v.estado,
      formatSalesHistoryMoney(v.importeCup),
      v.cobroUsd != null ? formatSalesHistoryMoney(v.cobroUsd) : '',
    ]),
    theme: 'grid',
    styles: baseStyles,
    headStyles,
    alternateRowStyles: { fillColor: [255, 255, 255] },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 'auto', halign: 'left' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 5.5;

  // Totales por moneda — JAMÁS se mezclan CUP y USD en una misma suma.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    `Total general (CUP): ${formatSalesHistoryMoney(model.totalesVentas.totalCup)} CUP`,
    pageWidth - marginX,
    finalY,
    { align: 'right' },
  );
  finalY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Cobros en USD (referencia, no convertible al total CUP): ${formatSalesHistoryMoney(model.totalesVentas.cobrosUsd)} USD`,
    pageWidth - marginX,
    finalY,
    { align: 'right' },
  );
  finalY += 8;

  // ── Sección 2: líneas de producto ──
  if (model.lineas.length > 0) {
    if (finalY > pageHeight - 40) {
      doc.addPage();
      finalY = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Líneas de productos vendidos', marginX, finalY);
    autoTable(doc, {
      startY: finalY + 2,
      head: [['Fecha', 'Identificador', 'Producto', 'SKU', 'Cant.', 'Precio unitario', 'Moneda', 'Importe (CUP)']],
      body: model.lineas.map((l) => [
        l.fecha,
        l.identificador,
        l.producto,
        l.sku,
        quantityFormatter.format(Number(l.cantidad.toFixed(10))),
        formatSalesHistoryMoney(l.precioUnitario),
        l.moneda,
        formatSalesHistoryMoney(l.importeCup),
      ]),
      theme: 'grid',
      styles: baseStyles,
      headStyles,
      alternateRowStyles: { fillColor: [255, 255, 255] },
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 17, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 'auto', halign: 'left' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 15, halign: 'center' },
        7: { cellWidth: 26, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    });
    finalY = docAny.lastAutoTable?.finalY || finalY;
    finalY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(
      `Importe total de líneas (CUP): ${formatSalesHistoryMoney(model.totalLineasCup)} CUP`,
      pageWidth - marginX,
      finalY,
      { align: 'right' },
    );
  }

  // ── Pie por página: numeración y nota de solo lectura ──
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(90);
    doc.text(
      'Documento informativo generado por COSTPRO a partir del historial de ventas (solo lectura; no modifica registros).',
      marginX,
      pageHeight - 8,
      { maxWidth: contentWidth - 40 },
    );
    doc.text(`Página ${p} de ${totalPaginas}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
}

/** Genera y descarga el PDF con el nombre oficial. */
export async function generateSalesHistoryPdf(model: SalesHistoryPdfModel): Promise<void> {
  const doc = await renderSalesHistoryPdf(model);
  doc.save(salesHistoryFileName(model.store.name, model.periodoDesde, model.periodoHasta));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: filtros → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

export interface ExportSalesHistoryPdfOpciones {
  /** TODAS las transacciones filtradas del historial. */
  transactions: SalesHistoryPdfTransaction[];
  storeId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Incluir líneas de producto (se consulta por lote). */
  incluirLineas?: boolean;
}

export async function exportSalesHistoryPdf(opts: ExportSalesHistoryPdfOpciones): Promise<void> {
  const store = await fetchSalesHistoryStoreInfo(opts.storeId);
  const lines = opts.incluirLineas === false
    ? []
    : await fetchSalesHistoryLines(opts.transactions.map((t) => t.id));
  const model = buildSalesHistoryPdfModel({
    transactions: opts.transactions,
    lines,
    store,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    generatedAt: new Date(),
  });
  try {
    await generateSalesHistoryPdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SALES_HISTORY_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
