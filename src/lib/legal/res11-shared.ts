/**
 * MISIÓN RESOLUCIÓN 11 — PRIMITIVAS COMUNES DE PDF «IMPRESIÓN ECONÓMICA»
 * ========================================================================
 * Criterio visual común (obligatorio para todos los modelos SC-2-xx de la
 * Resolución No. 11/2007 del MFP que COSTPRO genera):
 *
 *  - Fondo completamente blanco (ningún `setFillColor` oscuro o de color).
 *  - Texto negro / gris muy oscuro.
 *  - Líneas de tabla finas (0.2 pt) y bordes discretos.
 *  - Encabezados de tabla con texto negro sobre fondo BLANCO (sin bandas).
 *  - Sin bandas de color para alternar filas (no zebra).
 *  - Sin logotipos ni bloques decorativos.
 *  - Tipografía Helvetica legible (7–11 pt) y uso racional del espacio.
 *
 * Cada documento conserva su propia plantilla específica (encabezado,
 * datos y firmas según su modelo); aquí solo viven los elementos comunes:
 * paleta, encabezado institucional, tabla normativa, bloque de firmas y
 * pie documental.
 */

import type { jsPDF } from 'jspdf';
import { drawScLogo } from './sc-logo';

// ────────────────────────────────────────────────────────────────────────────
// Paleta de impresión económica (tinta mínima)
// ────────────────────────────────────────────────────────────────────────────

export const RES11_INK = {
  /** Texto principal: negro puro. */
  texto: [0, 0, 0] as [number, number, number],
  /** Texto secundario: gris muy oscuro (etiquetas, notas). */
  gris: [55, 55, 55] as [number, number, number],
  /** Líneas de tabla / bordes discretos: gris claro fino. */
  linea: [150, 150, 150] as [number, number, number],
  /** Marco del encabezado institucional: negro fino. */
  marco: [0, 0, 0] as [number, number, number],
  /** Único «relleno» permitido: BLANCO puro (cabeceras de tabla). */
  blanco: [255, 255, 255] as [number, number, number],
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Formateo compartido (es-CU; sin redondeos ni transformaciones)
// ────────────────────────────────────────────────────────────────────────────

const moneyFormatter = new Intl.NumberFormat('es-CU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

const quantityFormatter = new Intl.NumberFormat('es-CU', {
  maximumFractionDigits: 20,
});

/**
 * Canonicaliza el ruido de representación binaria (p. ej. 8.5 × 120.4 →
 * 1023.4000000000001) SIN alterar el valor almacenado: elimina solo los
 * dígitos por debajo de la décima cifra decimal, donde el float64 no puede
 * representar los decimales de las columnas numeric de PostgreSQL.
 */
function canonical(value: number): number {
  return Number(value.toFixed(10));
}

export function formatRes11Money(value: number): string {
  if (!Number.isFinite(value)) return '';
  return moneyFormatter.format(canonical(value));
}

export function formatRes11Quantity(value: number): string {
  if (!Number.isFinite(value)) return '';
  return quantityFormatter.format(canonical(value));
}

/** Línea de cumplimentación manual (nunca «N/A», ceros ni guiones). */
export const RES11_BLANK_LINE = '_______________';

export function blankRes11Field(label: string): string {
  return `${label}: ${RES11_BLANK_LINE}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Encabezado institucional del modelo
// ────────────────────────────────────────────────────────────────────────────

export interface Res11HeaderOptions {
  /** Logo de la tienda emisora (o default de la app) — dataURL rasterizado. Opcional: RES-11 sigue saliendo sin logo. */
  logoDataUrl?: string | null;
  /** Código oficial del modelo, p. ej. «SC-2-08». */
  modelo: string;
  /** Nombre oficial del documento, p. ej. «VALE DE ENTREGA O DEVOLUCIÓN». */
  titulo: string;
  /** Línea derecha opcional bajo el título (fecha de emisión, etc.). */
  lineaDerecha?: string;
  /** Datos adicionales dibujados bajo el cuadro por el propio documento. */
  alturaExtra?: number;
}

/**
 * Dibuja el recuadro de identificación del modelo (marco fino, fondo blanco,
 * texto negro): código del modelo a la derecha, título oficial y la nota
 * normativa de uso obligatorio. Devuelve la coordenada Y donde termina.
 */
export function drawRes11Header(doc: jsPDF, opts: Res11HeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const height = 18;

  doc.setDrawColor(...RES11_INK.marco);
  doc.setFillColor(...RES11_INK.blanco);
  doc.setLineWidth(0.35);
  doc.rect(marginX, 10, contentWidth, height, 'S');

  // Logo de la tienda emisora (o default de la app) — a la derecha del
  // recuadro; el código del modelo se corre a la izquierda para no pisarlo.
  // Los modelos RES-11 (que prohíben logotipos) no pasan logoDataUrl y quedan
  // exactamente como antes.
  let modeloRightX = pageWidth - marginX - 4;
  if (opts.logoDataUrl) {
    const logoBoxW = 20;
    modeloRightX -= logoBoxW + 4;
    drawScLogo(doc, { dataUrl: opts.logoDataUrl, source: 'store' }, {
      x: pageWidth - marginX - 3 - logoBoxW,
      y: 10.8,
      maxW: logoBoxW,
      maxH: height - 1.6,
    });
  }

  // Código del modelo (derecha, negrita)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...RES11_INK.texto);
  doc.setFontSize(13);
  doc.text(opts.modelo, modeloRightX, 16.5, { align: 'right' });

  // Título oficial (izquierda, negrita)
  doc.setFontSize(12);
  doc.text(opts.titulo, marginX + 4, 16.5, { maxWidth: contentWidth - 55 });

  // Nota normativa (gris muy oscuro, cursiva)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...RES11_INK.gris);
  doc.text(
    'Uso obligatorio — Resolución No. 11/2007, Ministerio de Finanzas y Precios (Anexo Único).',
    marginX + 4,
    22.5,
    { maxWidth: contentWidth - 8 },
  );

  // Línea derecha opcional (fecha de emisión del modelo, etc.). Con logo
  // presente se alinea a la izquierda del logo para no quedar debajo.
  if (opts.lineaDerecha) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...RES11_INK.texto);
    doc.text(opts.lineaDerecha, modeloRightX, 23.5, { align: 'right' });
  }

  return 10 + height;
}

// ────────────────────────────────────────────────────────────────────────────
// Tabla normativa (jsPDF-autoTable con estilos de impresión económica)
// ────────────────────────────────────────────────────────────────────────────

export interface Res11TableOptions {
  startY: number;
  head: string[];
  body: string[][];
  /** Anchos por columna; 'auto' para la columna descriptiva. */
  columnStyles?: Record<number, { cellWidth?: number | 'auto'; halign?: 'left' | 'center' | 'right' }>;
  marginX?: number;
}

/** Tabla con cabecera BLANCA (texto negro), bordes finos y sin zebra. */
export async function drawRes11Table(doc: jsPDF, opts: Res11TableOptions): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    startY: opts.startY,
    head: [opts.head],
    body: opts.body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.6,
      textColor: [...RES11_INK.texto],
      lineColor: [...RES11_INK.linea],
      lineWidth: 0.15,
      fillColor: [...RES11_INK.blanco],
      minCellHeight: 4.6,
    },
    headStyles: {
      // IMPRESIÓN ECONÓMICA: cabecera blanca con texto negro (sin banda de tinta).
      fillColor: [...RES11_INK.blanco],
      textColor: [...RES11_INK.texto],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
      lineColor: [...RES11_INK.texto],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      // Sin bandas de fondo para alternar filas (ahorro de tinta).
      fillColor: [...RES11_INK.blanco],
    },
    columnStyles: opts.columnStyles as never,
    margin: { left: opts.marginX ?? 12, right: opts.marginX ?? 12 },
    // Evita cortar una fila de producto entre páginas.
    rowPageBreak: 'avoid',
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Bloques de datos etiquetados (CP-DOC-PDF-UX-004)
// ────────────────────────────────────────────────────────────────────────────

export interface Res11FieldSpec {
  /** Etiqueta COMPLETA e inequívoca (nunca «Código:» genérico si hay varios). */
  label: string;
  /** Valor real del documento; '' → línea de cumplimentación manual. */
  value: string;
}

export interface Res11DataBlockOptions {
  /** Coordenada y tamaño del bloque (mm). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Título del bloque (p. ej. «ENTIDAD RECEPTORA»). */
  title: string;
  /** Campos etiqueta→valor dibujados en filas dentro del bloque. */
  fields: Res11FieldSpec[];
  /** Espaciado vertical entre filas (mm; default 5). */
  rowHeight?: number;
  /** Columnas por fila (1 o 2; default 1). Los campos fluyen izquierda→derecha. */
  columns?: 1 | 2;
}

/**
 * Altura mínima que necesita un bloque para dibujarse SIN superposiciones:
 * mide las líneas reales de etiqueta y valor (texto largo → varias líneas)
 * con la métrica de fuente del propio documento. CP-DOC-PDF-UX-004 §D.
 */
export function measureRes11DataBlockHeight(
  doc: jsPDF,
  opts: Pick<Res11DataBlockOptions, 'w' | 'fields' | 'rowHeight' | 'columns'>,
): number {
  const rowHeight = opts.rowHeight ?? 5;
  const cols = opts.columns ?? 1;
  const cellW = opts.w / cols;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  // Altura por fila real: cada grupo de `cols` campos comparte la mayor
  // envoltura de sus etiquetas/valores.
  let total = 0;
  for (let i = 0; i < opts.fields.length; i += cols) {
    let rowLines = 1;
    for (const field of opts.fields.slice(i, i + cols)) {
      doc.setFont('helvetica', 'bold');
      const labelLines = doc.splitTextToSize(field.label, cellW / 2 - 3).length;
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(field.value || RES11_BLANK_LINE, cellW / 2 - 3.5).length;
      rowLines = Math.max(rowLines, labelLines, valueLines);
    }
    total += Math.max(rowHeight, rowLines * 3.3 + 1.7);
  }
  return 8 + total; // título (≈6) + filas + colchón
}

/**
 * Dibuja un bloque de datos con TÍTULO y campos etiqueta→valor asociados
 * visualmente (etiqueta en negrita, su valor a continuación en la misma
 * celda, línea de cumplimentación si está vacío). Cada dato queda
 * inequívocamente asociado a su etiqueta — sin mezclar entidades.
 * La altura del recuadro crece automáticamente cuando un texto largo
 * envuelve a varias líneas (sin superposiciones ni datos cortados).
 * Devuelve la altura real usada (mm).
 */
export function drawRes11DataBlock(doc: jsPDF, opts: Res11DataBlockOptions): number {
  const { x, y, w, title, fields } = opts;
  const rowHeight = opts.rowHeight ?? 5;
  const cols = opts.columns ?? 1;
  const cellW = w / cols;

  // Altura real: la máxima entre la solicitada y la necesaria por envoltura.
  const needed = measureRes11DataBlockHeight(doc, {
    w, fields, rowHeight, columns: cols,
  });
  const h = Math.max(opts.h, needed);

  doc.setDrawColor(...RES11_INK.marco);
  doc.setFillColor(...RES11_INK.blanco);
  doc.setLineWidth(0.25);
  doc.rect(x, y, w, h, 'S');

  // Título del bloque (negrita, mayúsculas, gris muy oscuro)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...RES11_INK.gris);
  doc.text(title.toUpperCase(), x + 2.5, y + 3.6, { maxWidth: w - 5 });

  // Filas etiqueta → valor (en «cols» columnas por fila); el alto de cada
  // fila se adapta a la envoltura real de sus textos.
  let fy = y + 8;
  for (let i = 0; i < fields.length; i += cols) {
    const rowFields = fields.slice(i, i + cols);
    let rowLines = 1;
    rowFields.forEach((field) => {
      doc.setFont('helvetica', 'bold');
      const labelLines = doc.splitTextToSize(field.label, cellW / 2 - 3).length;
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(field.value || RES11_BLANK_LINE, cellW / 2 - 3.5).length;
      rowLines = Math.max(rowLines, labelLines, valueLines);
    });
    const realRowH = Math.max(rowHeight, rowLines * 3.3 + 1.7);
    rowFields.forEach((field, c) => {
      const cellX = x + c * cellW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...RES11_INK.texto);
      doc.text(field.label, cellX + 2.5, fy, { maxWidth: cellW / 2 - 3 });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...RES11_INK.texto);
      // El valor arranca donde acaba la zona de etiqueta (mitad de la celda):
      // asociación visual inmediata y sin superposiciones.
      doc.text(field.value || RES11_BLANK_LINE, cellX + cellW / 2, fy, {
        maxWidth: cellW / 2 - 3.5,
      });
    });
    fy += realRowH;
  }
  return h;
}

// ────────────────────────────────────────────────────────────────────────────
// Bloque de firmas (espacios en blanco para cumplimentación manual)
// ────────────────────────────────────────────────────────────────────────────

export interface Res11SignatureRow {
  /** Denominaciones de los responsables de la fila. */
  labels: string[];
  /**
   * Pesos relativos de anchura por firma de la fila (opcional). Permite
   * dar más espacio a denominaciones largas sin comprimir las demás.
   */
  weights?: number[];
}

/** Alto vertical de un área de firma: línea + espacio de rúbrica + etiqueta. */
const SIGNATURE_ROW_HEIGHT_MM = 26;

/** Dibuja UNA fila de áreas de firma. Devuelve la Y tras la fila. */
function drawSignatureRow(
  doc: jsPDF,
  labels: string[],
  weights: number[] | undefined,
  y: number,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  const n = labels.length;
  const w = weights && weights.length === n
    ? weights.map((v) => v / weights.reduce((a, b) => a + b, 0))
    : Array.from({ length: n }, () => 1 / n);

  doc.setDrawColor(...RES11_INK.texto);
  doc.setLineWidth(0.25);
  let cx = marginX;
  labels.forEach((label, i) => {
    const colW = contentWidth * w[i];
    const x0 = cx + 4;
    const x1 = cx + colW - 4;
    doc.line(x0, y, x1, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...RES11_INK.gris);
    doc.text(label, (x0 + x1) / 2, y + 4, {
      align: 'center',
      maxWidth: colW - 8,
    });
    cx += colW;
  });
  return y + SIGNATURE_ROW_HEIGHT_MM;
}

/**
 * Dibuja áreas de firma claramente diferenciadas, en varias filas si se
 * indica (CP-DOC-PDF-UX-004: líneas suficientes, denominación completa y
 * separación vertical entre áreas; la fila con denominaciones extensas puede
 * llevar pesos de anchura propios). Devuelve la Y final.
 * Las firmas son SIEMPRE espacios en blanco: COSTPRO no sustituye firmas.
 */
export function drawRes11SignatureAreas(
  doc: jsPDF,
  rows: Res11SignatureRow[],
  startY: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  // Las firmas nunca se separan de su contenido ni quedan aisladas: si la
  // primera fila no cabe completa, todas pasan a una página nueva.
  if (y + rows.length * SIGNATURE_ROW_HEIGHT_MM + 8 > pageHeight - 14) {
    doc.addPage();
    y = 16;
  }
  for (const row of rows) {
    y = drawSignatureRow(doc, row.labels, row.weights, y);
  }
  return y;
}

/**
 * Dibuja una fila de líneas para firmas con su etiqueta (API histórica,
 * ahora delega en drawRes11SignatureAreas). Devuelve la Y final.
 */
export function drawRes11Signatures(
  doc: jsPDF,
  labels: string[],
  startY: number,
  columns = 4,
): number {
  const rows: Res11SignatureRow[] = [];
  for (let i = 0; i < labels.length; i += columns) {
    rows.push({ labels: labels.slice(i, i + columns) });
  }
  return drawRes11SignatureAreas(doc, rows, startY);
}

// ────────────────────────────────────────────────────────────────────────────
// Pie documental normativo
// ────────────────────────────────────────────────────────────────────────────

/** Nota al pie: referencia normativa + trazabilidad COSTPRO. */
export function drawRes11Footer(doc: jsPDF, identificadorNota: string): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...RES11_INK.gris);
  doc.text(
    `Modelo de uso obligatorio según la Resolución No. 11/2007 del Ministerio de Finanzas y Precios — Gaceta Oficial No. 015 de 2007, Anexo Único, Capítulo 2 «Subsistema de Inventarios».`,
    marginX,
    pageHeight - 12,
    { maxWidth: contentWidth },
  );
  if (identificadorNota) {
    doc.text(identificadorNota, marginX, pageHeight - 8, { maxWidth: contentWidth });
  }
}

/** Nombre de archivo seguro: SC-2-XX_<Documento>_<identificador>.pdf */
export function res11FileName(modelo: string, documento: string, identificador: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'documento';
  return `${modelo}_${slug(documento)}_${slug(identificador)}.pdf`;
}

/** Estado documental de COSTPRO anotado de forma sobria (sin colores). */
export function estadoDocumentoLabel(estado: string): string {
  const map: Record<string, string> = {
    completed: 'Completado',
    voided: 'Anulado',
    reversed: 'Devuelto',
    PENDIENTE: 'Pendiente',
    CONFIRMADA: 'Confirmada',
    CANCELADA: 'Cancelada',
    REVERSADA: 'Reversada',
    draft: 'Borrador',
    sent: 'Enviada',
    partial: 'Parcial',
    received: 'Recibida',
    cancelled: 'Cancelada',
    pending: 'Pendiente',
    confirmed: 'Confirmada',
  };
  return map[estado] || estado;
}
