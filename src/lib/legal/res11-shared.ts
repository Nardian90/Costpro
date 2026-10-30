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

  // Código del modelo (derecha, negrita)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...RES11_INK.texto);
  doc.setFontSize(13);
  doc.text(opts.modelo, pageWidth - marginX - 4, 16.5, { align: 'right' });

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

  // Línea derecha opcional (fecha de emisión del modelo, etc.)
  if (opts.lineaDerecha) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...RES11_INK.texto);
    doc.text(opts.lineaDerecha, pageWidth - marginX - 4, 23.5, { align: 'right' });
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
// Bloque de firmas (espacios en blanco para cumplimentación manual)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dibuja una fila de líneas para firmas con su etiqueta. Devuelve la Y final.
 * Las firmas son SIEMPRE espacios en blanco: COSTPRO no sustituye firmas.
 */
export function drawRes11Signatures(
  doc: jsPDF,
  labels: string[],
  startY: number,
  columns = 4,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  // Si las firmas quedarían aisladas al final de página, se pasan juntas
  // a una página nueva (nunca separadas de su contenido).
  let y = startY;
  if (y + 26 > pageHeight - 14) {
    doc.addPage();
    y = 16;
  }

  doc.setDrawColor(...RES11_INK.texto);
  doc.setLineWidth(0.2);
  const colWidth = contentWidth / columns;
  const rows = Math.ceil(labels.length / columns);
  for (let row = 0; row < rows; row += 1) {
    const baseY = y + row * 22;
    labels
      .slice(row * columns, (row + 1) * columns)
      .forEach((label, i) => {
        const x0 = marginX + i * colWidth + 3;
        const x1 = marginX + (i + 1) * colWidth - 3;
        doc.line(x0, baseY, x1, baseY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...RES11_INK.gris);
        doc.text(label, (x0 + x1) / 2, baseY + 3.5, {
          align: 'center',
          maxWidth: colWidth - 6,
        });
      });
  }
  return y + (rows - 1) * 22 + 8;
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
