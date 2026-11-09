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
  /** Logo de la tienda emisora (dataURL rasterizado). Sin logo propio, drawScLogo dibuja el identificador CP; opcional: el modelo sigue saliendo sin marca. */
  logoDataUrl?: string | null;
  /**
   * CP-DOC-SC-DATA-MAPPING-006 §9: fuente de la marca resuelta por
   * resolveScLogoDataUrl. Con 'cp' (la tienda no tiene logo propio) se
   * dibuja el identificador monocromático CP — NUNCA el logo de la app.
   */
  logoSource?: 'store' | 'cp' | 'none';
  /** Código oficial del modelo, p. ej. «SC-2-08». */
  modelo: string;
  /** Nombre oficial del documento, p. ej. «VALE DE ENTREGA O DEVOLUCIÓN». */
  titulo: string;
  /**
   * CP-DOC-SC-HEADER-UX-005 — Nombre institucional de la organización del
   * documento (área CENTRAL del encabezado). Siempre el nombre REAL de la
   * tienda/entidad que emite o recibe (stores.name); nunca un valor fijo.
   * Opcional por compatibilidad: si no se pasa, el área central queda vacía
   * (comportamiento anterior).
   */
  nombreInstitucional?: string;
  /** Referencia normativa del modelo (área derecha, bajo el título). */
  notaLegal?: string;
  /**
   * Número consecutivo del modelo (solo los modelos que lo llevan, p. ej.
   * SC-2-04). Cuando se proporciona se dibuja la línea «No. Consecutivo:»
   * con el valor o, si llega vacío, con la línea de cumplimentación manual
   * (comportamiento actual). Los modelos que no lo pasan no la muestran.
   */
  numeroConsecutivo?: string;
  /** Línea derecha opcional bajo el título (fecha de emisión, etc.). */
  lineaDerecha?: string;
  /** Datos adicionales dibujados bajo el cuadro por el propio documento. */
  alturaExtra?: number;
}

// Geometría del encabezado institucional (mm). Composición horizontal de tres
// áreas sobre el ANCHO ÚTIL completo (sin espacio muerto):
//   izquierda ≈ logo (18-22 %) · centro ≈ nombre institucional (38-42 %) ·
//   derecha ≈ identificación documental (38-42 %).
const HEADER_MARGIN_X = 12;
const HEADER_Y0 = 10;
const HEADER_BASE_H = 25; // objetivo de la misión: 25-30 mm (antes 34 en SC-2-04)
const HEADER_LOGO_ZONE_W = 28; // zona izquierda con logo presente
const HEADER_LOGO_MAX_W = 20;
const HEADER_DOC_BLOCK_MIN_W = 46;
const HEADER_DOC_BLOCK_MAX_FRAC = 0.45;

/**
 * CP-DOC-SC-HEADER-UX-005 — Encabezado institucional reutilizable de la
 * familia SC-2-xx (Resolución No. 11/2007 MFP). Tres áreas horizontales:
 *
 *   ┌──────────┬───────────────────────────┬─────────────────────────────┐
 *   │   LOGO   │   NOMBRE DE LA ORGANIZ.   │  MODELO SC-2-XX             │
 *   │  (izq.)  │   (centrado, semibold)    │  Título oficial             │
 *   │ contain  │   ajuste automático       │  Referencia normativa       │
 *   └──────────┴───────────────────────────┴  No. Consecutivo / Fecha     │
 *
 *  - Altura compacta (≈25 mm; crece SOLO si el nombre o el título envuelven —
 *    nunca recorta ni solapa).
 *  - Sin logo el área izquierda se libera y el nombre se centra en el resto
 *    del ancho: la composición no se rompe ni queda desproporcionada.
 *  - Marco fino uniforme (0.25 pt) que separa discretamente del cuerpo.
 *  - Cada modelo conserva sus datos: código, título, referencia normativa,
 *    consecutivo y fecha propios (parámetros); nada de valores fijos de
 *    SC-2-04.
 *  - La autorización y las fuentes de datos no cambian: el nombre es el de
 *    la tienda del documento (stores.name) que cada generador ya lee bajo
 *    RLS.
 *
 * Devuelve la coordenada Y donde termina el encabezado (contrato anterior).
 */
export function drawRes11Header(doc: jsPDF, opts: Res11HeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - HEADER_MARGIN_X * 2;
  const rightX = pageWidth - HEADER_MARGIN_X - 3.5;

  // ── Área derecha: medir el bloque documental para acotar su ancho ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const codeLabel = `MODELO ${opts.modelo}`;
  const codeW = doc.getTextWidth(codeLabel);
  doc.setFontSize(9.5);
  let titleSize = 9.5;
  let titleW = doc.getTextWidth(opts.titulo);
  const maxTitleW = Math.max(HEADER_DOC_BLOCK_MIN_W, contentWidth * HEADER_DOC_BLOCK_MAX_FRAC) - 6;
  if (titleW > maxTitleW && doc.getTextWidth(opts.titulo) > 0) {
    // Título extenso: reducir a 8.5 pt antes de permitir envoltura.
    doc.setFontSize(8.5);
    titleSize = 8.5;
    titleW = doc.getTextWidth(opts.titulo);
  }
  const titleLines = doc.splitTextToSize(opts.titulo, maxTitleW) as string[];
  if (titleLines.length > 1) titleW = maxTitleW;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.3);
  const notaLegal = opts.notaLegal ?? 'Uso obligatorio — Resolución No. 11/2007, Ministerio de Finanzas y Precios (Anexo Único).';
  const notaW = doc.getTextWidth(notaLegal);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const consecutivoLine = opts.numeroConsecutivo === undefined
    ? null
    : `No. Consecutivo: ${opts.numeroConsecutivo || RES11_BLANK_LINE}`;
  const consecW = consecutivoLine ? doc.getTextWidth(consecutivoLine) : 0;
  const lineaW = opts.lineaDerecha ? doc.getTextWidth(opts.lineaDerecha) : 0;

  const blockW = Math.min(
    Math.max(codeW, titleW, notaW, consecW, lineaW) + 5,
    Math.max(HEADER_DOC_BLOCK_MIN_W, contentWidth * HEADER_DOC_BLOCK_MAX_FRAC),
  );

  // ── Altura: la máxima entre la base, el bloque documental y el nombre ──
  // Filas documentales (baseline relativo a HEADER_Y0): código 6.4, título
  // +4.6 (o +3.4 por línea extra), nota +3.4, consecutivo +3.8, fecha +3.4.
  const docBlockH = 6.4 + titleLines.length * 4.6 + 3.4 + (consecutivoLine ? 3.8 : 0) + (opts.lineaDerecha ? 3.4 : 0) + 3.2;
  let headerH = Math.max(HEADER_BASE_H, docBlockH);

  // Nombre institucional: área central entre el logo y el bloque documental.
  const conMarca = Boolean(opts.logoDataUrl) || opts.logoSource === 'cp';
  const leftZoneW = conMarca ? HEADER_LOGO_ZONE_W : 0;
  const centerX0 = HEADER_MARGIN_X + leftZoneW;
  const centerX1 = pageWidth - HEADER_MARGIN_X - blockW - 4;
  const centerW = centerX1 - centerX0;
  const nombre = (opts.nombreInstitucional || '').trim();

  let nameLines: string[] = [];
  let nameSize = 12;
  if (nombre && centerW > 24) {
    // Ajuste automático: 12 → 10.5 → 9 → 8 pt; se prefiere UNA línea, se
    // aceptan dos; si aun así no cabe, se usa la menor con las líneas
    // necesarias y el encabezado crece (sin recortes ni solapamientos).
    const candidateSizes = [12, 10.5, 9, 8];
    let fallback: { lines: string[]; size: number } | null = null;
    for (const size of candidateSizes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(nombre, centerW - 2) as string[];
      if (lines.length === 1) {
        nameLines = lines;
        nameSize = size;
        fallback = null;
        break;
      }
      if (!fallback && lines.length <= 2) fallback = { lines, size };
    }
    if (fallback) {
      nameLines = fallback.lines;
      nameSize = fallback.size;
    } else if (nameLines.length === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(candidateSizes[candidateSizes.length - 1]);
      nameLines = doc.splitTextToSize(nombre, centerW - 2) as string[];
      nameSize = candidateSizes[candidateSizes.length - 1];
    }
    const nameStep = nameSize * 0.42;
    headerH = Math.max(headerH, nameLines.length * nameStep + 7);
  }

  // ── Marco fino (separación discreta del cuerpo) ──
  doc.setDrawColor(...RES11_INK.marco);
  doc.setFillColor(...RES11_INK.blanco);
  doc.setLineWidth(0.25);
  doc.rect(HEADER_MARGIN_X, HEADER_Y0, contentWidth, headerH, 'S');

  // ── Área izquierda: logo contain, centrado verticalmente en su zona ──
  // Sin logo propio de la tienda (logoSource 'cp') se dibuja el identificador
  // monocromático CP — vectorial, blanco y negro, nunca el logo de la app.
  if (opts.logoDataUrl || opts.logoSource === 'cp') {
    drawScLogo(
      doc,
      { dataUrl: opts.logoDataUrl ?? null, source: opts.logoSource === 'cp' ? 'cp' : 'store' },
      {
        x: HEADER_MARGIN_X + 3,
        y: HEADER_Y0 + 3,
        maxW: HEADER_LOGO_MAX_W,
        maxH: headerH - 6,
      },
    );
  }

  // ── Área central: nombre institucional centrado ──
  if (nameLines.length > 0) {
    const nameStep = nameSize * 0.42;
    let ty = HEADER_Y0 + (headerH - nameLines.length * nameStep) / 2 + nameStep * 0.78;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameSize);
    doc.setTextColor(...RES11_INK.texto);
    for (const line of nameLines) {
      doc.text(line, (centerX0 + centerX1) / 2, ty, { align: 'center', maxWidth: centerW - 2 });
      ty += nameStep;
    }
  }

  // ── Área derecha: identificación documental (jerarquía: código > título >
  //    referencia normativa > consecutivo y fecha compactos) ──
  let ty = HEADER_Y0 + 6.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...RES11_INK.texto);
  doc.text(codeLabel, rightX, ty, { align: 'right' });
  ty += titleLines.length * 4.6;
  doc.setFontSize(titleSize);
  doc.text(opts.titulo, rightX, ty, { align: 'right', maxWidth: blockW - 4 });
  ty += 3.4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.3);
  doc.setTextColor(...RES11_INK.gris);
  doc.text(notaLegal, rightX, ty, { align: 'right', maxWidth: blockW - 4 });
  if (consecutivoLine) {
    ty += 3.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...RES11_INK.texto);
    doc.text(consecutivoLine, rightX, ty, { align: 'right' });
  }
  if (opts.lineaDerecha) {
    ty += 3.4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...RES11_INK.texto);
    doc.text(opts.lineaDerecha, rightX, ty, { align: 'right' });
  }

  return HEADER_Y0 + headerH;
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
// Pie de firma unificado — referencia de diseño del propietario (2026-11-09)
// ────────────────────────────────────────────────────────────────────────────
// Lógica de la referencia aplicada a TODOS los modelos SC de la familia:
//  · Cada área de firma es un espacio ABIERTO (sin marcos ni cajas):
//    LÍNEA de firma manuscrita con la denominación del cargo centrada
//    DEBAJO de la línea, en MAYÚSCULAS, y espacio de rúbrica suficiente
//    encima de la línea.
//  · El nombre dinámico (cuando COSTPRO lo conoce) se consigna ENCIMA de la
//    línea, centrado — la ubicación de nombres y apellidos de la referencia.
//  · Los bloques con datos de cumplimentación (p. ej. el transportador del
//    SC-2-04) llevan un TÍTULO en mayúsculas con regla inferior y una
//    cuadrícula de campos «Etiqueta: valor» con línea de cumplimentación —
//    la firma manuscrita puede ser un campo más de esa cuadrícula.
//  · Campos con valor dinámico: el valor se escribe SOBRE su línea; los
//    vacíos conservan la línea para cumplimentación manual (sin N/A, ceros
//    ni valores inventados).
//  · Todas las áreas comparten alineación y tipografía; el conjunto completo
//    (firmas + secciones de datos) se mueve SIEMPRE junto a una página nueva
//    si no cabe — ninguna firma separada de su contenido.
// ────────────────────────────────────────────────────────────────────────────

/**
 * CP-DOC-SC-DATA-MAPPING-006: código documental de tienda listo para el PDF.
 * Fuente: stores.store_code (consecutivo persistente por tenant). Devuelve
 * '' cuando la tienda aún no lo tiene — NUNCA el uuid interno ni otro dato.
 */
export function storeCodeToString(code: number | string | null | undefined): string {
  if (code === null || code === undefined) return '';
  const s = String(code).trim();
  return s === '' ? '' : s;
}

/** Área de firma del pie unificado. */
export interface Res11FooterSignature {
  /** Cargo / responsabilidad — se dibuja centrado, EN MAYÚSCULAS, bajo la línea. */
  role: string;
  /**
   * Nombre dinámico conocido (COSTPRO) — se dibuja centrado ENCIMA de la
   * línea. La línea sigue siendo el espacio de la firma manuscrita.
   */
  name?: string;
}

/** Campo de cumplimentación del pie («Etiqueta: valor/línea»). */
export interface Res11FooterField {
  /** Etiqueta literal del campo (p. ej. «Chapa:»). */
  label: string;
  /** Valor dinámico; vacío → solo la línea de cumplimentación manual. */
  value?: string;
}

/** Sección de datos con título y regla (p. ej. «TRANSPORTADOR:» del SC-2-04). */
export interface Res11FooterFieldsSection {
  /** Título en mayúsculas con regla inferior (se dibuja con dos puntos). */
  title?: string;
  /** Campos en cuadrícula, en orden de lectura por filas. */
  fields: Res11FooterField[];
  /** Sub-columnas de la cuadrícula (por defecto 2, como la referencia). */
  columns?: number;
}

// Geometría del pie unificado (mm) — espacio de rúbrica real para firmar.
const FOOTER_RUBRIC_MM = 13;
const FOOTER_ROLE_GAP_MM = 3.4;
const FOOTER_ROLE_LEADING_MM = 3.1;
const FOOTER_ROLE_FONT_PT = 7;
const FOOTER_ROW_GAP_MM = 4;
const FOOTER_FIELD_ROW_MM = 7;
const FOOTER_SECTION_GAP_MM = 3.5;
const FOOTER_SECTION_TITLE_MM = 9;

const FOOTER_MARGIN_X = 12;

/** N.º de líneas que ocupa el cargo en mayúsculas dentro de su columna. */
function footerRoleLineCount(doc: jsPDF, role: string, colW: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FOOTER_ROLE_FONT_PT);
  return doc.splitTextToSize(role.toUpperCase(), Math.max(12, colW - 6)).length;
}

/** Alto de una fila de firmas: rúbrica + línea + cargo (el más alto manda). */
function footerRowHeight(doc: jsPDF, cells: Res11FooterSignature[], colWidths: number[]): number {
  const lines = cells.length
    ? Math.max(...cells.map((c, i) => footerRoleLineCount(doc, c.role, colWidths[i] ?? 40)))
    : 1;
  return FOOTER_RUBRIC_MM + FOOTER_ROLE_GAP_MM + lines * FOOTER_ROLE_LEADING_MM + 1.8;
}

/**
 * Dibuja UNA fila de áreas de firma compartiendo la MISMA Y de línea
 * (alineación horizontal de la referencia). Devuelve la Y tras la fila.
 */
function paintFooterSignatureRow(
  doc: jsPDF,
  cells: Res11FooterSignature[],
  y: number,
  weights?: number[],
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - FOOTER_MARGIN_X * 2;
  const n = Math.max(1, cells.length);
  const colWidths =
    weights && weights.length === n
      ? weights.map((v) => (v / weights.reduce((a, b) => a + b, 0)) * contentWidth)
      : Array.from({ length: n }, () => contentWidth / n);

  const lineY = y + FOOTER_RUBRIC_MM;
  let cx = FOOTER_MARGIN_X;
  cells.forEach((cell, i) => {
    const colW = colWidths[i];
    const x0 = cx + 3;
    const x1 = cx + colW - 3;
    const midX = (x0 + x1) / 2;

    // Línea de firma manuscrita (referencia: línea arriba, cargo abajo).
    doc.setDrawColor(...RES11_INK.texto);
    doc.setLineWidth(0.25);
    doc.line(x0, lineY, x1, lineY);

    // Nombre dinámico ENCIMA de la línea (centrado, sin desplazar la rúbrica).
    if (cell.name) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...RES11_INK.texto);
      doc.text(cell.name, midX, lineY - 2, { align: 'center', maxWidth: colW - 8 });
    }

    // Denominación del cargo DEBAJO de la línea: centrada, en MAYÚSCULAS.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FOOTER_ROLE_FONT_PT);
    doc.setTextColor(...RES11_INK.gris);
    const roleLines = doc.splitTextToSize(cell.role.toUpperCase(), Math.max(12, colW - 6)) as string[];
    roleLines.forEach((ln, li) => {
      doc.text(ln, midX, lineY + FOOTER_ROLE_GAP_MM + li * FOOTER_ROLE_LEADING_MM, {
        align: 'center',
      });
    });

    cx += colW;
  });
  return y + footerRowHeight(doc, cells, colWidths);
}

/**
 * Dibuja la cuadrícula de campos «Etiqueta: valor/línea» de la referencia:
 * etiqueta en negrita, línea de cumplimentación SIEMPRE presente y el valor
 * dinámico escrito SOBRE su línea. Devuelve la Y tras la cuadrícula.
 */
function paintFooterFields(
  doc: jsPDF,
  fields: Res11FooterField[],
  y: number,
  opts: { x?: number; w?: number; columns?: number } = {},
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = opts.x ?? FOOTER_MARGIN_X;
  const w = opts.w ?? pageWidth - FOOTER_MARGIN_X * 2;
  const cols = Math.max(1, opts.columns ?? 2);
  const cellW = w / cols;
  const rows = Math.ceil(fields.length / cols);

  for (let r = 0; r < rows; r += 1) {
    const inRow = fields.slice(r * cols, (r + 1) * cols);
    const baseline = y + r * FOOTER_FIELD_ROW_MM + 4.6;
    inRow.forEach((field, c) => {
      const px = x + c * cellW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...RES11_INK.texto);
      doc.text(field.label, px + 1.5, baseline);
      const lineX0 = px + 1.5 + doc.getTextWidth(field.label) + 1.8;
      const lineX1 = px + cellW - 3;
      if (lineX1 - lineX0 > 8) {
        doc.setDrawColor(...RES11_INK.texto);
        doc.setLineWidth(0.22);
        doc.line(lineX0, baseline + 0.9, lineX1, baseline + 0.9);
      }
      if (field.value) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...RES11_INK.texto);
        doc.text(field.value, lineX0 + 0.8, baseline, {
          maxWidth: Math.max(8, lineX1 - lineX0 - 1.6),
        });
      }
    });
  }
  return y + rows * FOOTER_FIELD_ROW_MM;
}

/** Alto de la cuadrícula de campos (misma métrica que paintFooterFields). */
function footerFieldsHeight(fields: Res11FooterField[], columns?: number): number {
  const cols = Math.max(1, columns ?? 2);
  return Math.ceil(Math.max(0, fields.length) / cols) * FOOTER_FIELD_ROW_MM;
}

/** Título de sección en mayúsculas con regla inferior (p. ej. «TRANSPORTADOR:»). */
function paintFooterSectionTitle(doc: jsPDF, title: string, y: number, w: number): number {
  const x = (doc.internal.pageSize.getWidth() - w) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...RES11_INK.texto);
  const titulo = title.trim().endsWith(':') ? title.trim().toUpperCase() : `${title.trim().toUpperCase()}:`;
  doc.text(titulo, x + 1.5, y + 3.6);
  doc.setDrawColor(...RES11_INK.texto);
  doc.setLineWidth(0.35);
  doc.line(x + 1.5, y + 5.1, x + w - 1.5, y + 5.1);
  return y + FOOTER_SECTION_TITLE_MM;
}

// ────────────────────────────────────────────────────────────────────────────
// API pública del pie unificado (sustituye a la antigua cuadrícula con marcos
// de CP-DOC-SC-DATA-MAPPING-006 §6/§7, cuya geometría pasa a la referencia de
// diseño del propietario: sin cajas, línea arriba y cargo en mayúsculas abajo)
// ────────────────────────────────────────────────────────────────────────────

/** Especificación completa del pie de firma de un modelo SC. */
export interface Res11SignatureFooterSpec {
  /** Áreas de firma (se reparten en filas de `columns`). */
  signatures: Res11FooterSignature[];
  /** Columnas por fila de firmas (por defecto 3). */
  columns?: number;
  /** Sección de datos con título y regla (p. ej. transportador del SC-2-04). */
  fieldsSection?: Res11FooterFieldsSection;
  /** Campos sueltos SIN título tras las firmas (p. ej. «No. Consecutivo» del SC-2-09). */
  trailingFields?: Res11FooterField[];
  /** Sub-columnas de los campos sueltos (por defecto 2). */
  trailingColumns?: number;
}

/** Disposición por filas de las áreas de firma (misma partición que el dibujo). */
function footerSignatureRows(
  signatures: Res11FooterSignature[],
  columns: number,
): Res11FooterSignature[][] {
  const rows: Res11FooterSignature[][] = [];
  for (let i = 0; i < signatures.length; i += columns) {
    rows.push(signatures.slice(i, i + columns));
  }
  return rows.length ? rows : [[]];
}

/**
 * Alto total del pie unificado (misma disposición que el dibujo). Útil para
 * el guard de salto de página del caller y para las pruebas de geometría.
 */
export function measureRes11SignatureFooterHeight(
  doc: jsPDF,
  spec: Res11SignatureFooterSpec,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - FOOTER_MARGIN_X * 2;
  const cols = Math.max(1, spec.columns ?? 3);
  const rows = footerSignatureRows(spec.signatures, cols);
  let h = 0;
  rows.forEach((row, ri) => {
    if (ri > 0) h += FOOTER_ROW_GAP_MM;
    const colWidths = Array.from({ length: Math.max(1, row.length) }, () => contentWidth / Math.max(1, row.length));
    h += footerRowHeight(doc, row, colWidths);
  });
  if (spec.fieldsSection) {
    h += FOOTER_SECTION_GAP_MM;
    if (spec.fieldsSection.title) h += FOOTER_SECTION_TITLE_MM;
    h += footerFieldsHeight(spec.fieldsSection.fields, spec.fieldsSection.columns);
  }
  if (spec.trailingFields?.length) {
    h += FOOTER_SECTION_GAP_MM - 1.5;
    h += footerFieldsHeight(spec.trailingFields, spec.trailingColumns);
  }
  return h;
}

/**
 * Dibuja el PIE DE FIRMA UNIFICADO de un modelo SC conforme a la referencia
 * de diseño del propietario (2026-11-09): áreas de firma abiertas (línea de
 * rúbrica arriba, cargo centrado en MAYÚSCULAS debajo), nombre dinámico
 * encima de la línea cuando existe, y las secciones de datos con título,
 * regla y cuadrícula de campos «Etiqueta: valor/línea». TODAS las filas y
 * secciones se mueven SIEMPRE juntas — si el conjunto no cabe en la página
 * pasa completo a una nueva (ninguna firma separada de su contenido).
 * Devuelve la Y final.
 */
export function drawRes11SignatureFooter(
  doc: jsPDF,
  spec: Res11SignatureFooterSpec,
  startY: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalH = measureRes11SignatureFooterHeight(doc, spec);

  let y = startY;
  if (y + totalH + 6 > pageHeight - 14) {
    doc.addPage();
    y = 16;
  }

  const cols = Math.max(1, spec.columns ?? 3);
  const rows = footerSignatureRows(spec.signatures, cols);
  rows.forEach((row, ri) => {
    if (ri > 0) y += FOOTER_ROW_GAP_MM;
    y = paintFooterSignatureRow(doc, row, y);
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - FOOTER_MARGIN_X * 2;
  if (spec.fieldsSection) {
    y += FOOTER_SECTION_GAP_MM;
    if (spec.fieldsSection.title) {
      y = paintFooterSectionTitle(doc, spec.fieldsSection.title, y, contentWidth);
    }
    y = paintFooterFields(doc, spec.fieldsSection.fields, y, {
      columns: spec.fieldsSection.columns,
    });
  }

  if (spec.trailingFields?.length) {
    y += FOOTER_SECTION_GAP_MM - 1.5;
    y = paintFooterFields(doc, spec.trailingFields, y, {
      columns: spec.trailingColumns ?? 2,
    });
  }

  return y;
}

/**
 * API histórica (deprecada): delega en el pie unificado convirtiendo cada
 * etiqueta en un área de firma ({ role }). Los modelos migran a la
 * especificación completa (Res11SignatureFooterSpec) con nombres dinámicos
 * encima de la línea y secciones de datos.
 */
export function drawRes11Signatures(
  doc: jsPDF,
  labels: string[],
  startY: number,
  columns = 4,
): number {
  return drawRes11SignatureFooter(
    doc,
    { signatures: labels.map((label) => ({ role: label })), columns },
    startY,
  );
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
