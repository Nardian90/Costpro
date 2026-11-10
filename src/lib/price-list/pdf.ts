/**
 * PRICE LIST · Generación del PDF (misión CP-SALES-PRICE-LIST-001).
 *
 * Patrón del proyecto (build/render split, cf. sales-history-pdf.ts y los
 * modelos SC): `renderPriceListPdf` construye el documento SIN descargarlo —
 * el llamador decide previsualizarlo (`doc.output('bloburl')` en un iframe)
 * o exportarlo (`doc.save`). La previsualización y la descarga comparten
 * el MISMO documento: mismos productos, precios, orden, filtros y fecha.
 *
 * Diseño (misión §6-§7): A4 vertical, encabezado horizontal compacto
 * (logo izq. · título + tienda centro · fecha/tienda der.) y DOS bloques
 * de tabla independientes por página (columna izquierda arriba→abajo,
 * luego la derecha), con tres columnas: SKU/Código · Producto (y su
 * descripción) · Precio de venta. Filas nunca partidas; «Página X de N»
 * con el total real del plan (una sola pasada).
 *
 * CP-PRECIO-PDF-DESC-001 · «Mostrar descripción en PDF» (Sí/No):
 *  · Sí — cada celda dibuja el nombre (presentación primaria) y DEBAJO su
 *    descripción con tamaño/tono secundarios; ocupa varias líneas cuando
 *    hace falta y la altura de la fila se adapta dinámicamente.
 *  · No — solo el nombre: sin huecos vacíos, misma alineación y diseño.
 * Son campos SEPARADOS: jamás se combinan ni se sustituye uno por otro.
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { resolveScLogoDataUrl, drawScLogo, type ScLogoResolution } from '@/lib/legal/sc-logo';
import { planPriceListPages, type PriceListModel, type PriceListPlan, type PriceListGeometry } from './model';
import { operationalFilterLabel } from './operational-filters';

// ── Paleta sobria, coherente con los documentos COSTPRO ────────────────────
const INK: [number, number, number] = [23, 23, 27];
const MUTED: [number, number, number] = [82, 82, 91];
const HEAD_FILL: [number, number, number] = [237, 237, 239];
const LINE: [number, number, number] = [161, 161, 170];

// ── Geometría A4 vertical (mm) ─────────────────────────────────────────────
const PAGE_W = 210;
const MARGIN_X = 12;
const CONTENT_TOP = 38;      // bajo el encabezado institucional compacto
const BOTTOM_LIMIT = 283;    // pie debajo
const COL_GAP = 6;
const COL_W = (PAGE_W - 2 * MARGIN_X - COL_GAP) / 2;  // 90 mm por bloque
const SKU_W = 16;
const PRICE_W = 24;
const DESC_W = COL_W - SKU_W - PRICE_W;               // 50 mm (mayor espacio)
const HEADER_ROW_MM = 6;
const ROW_BASE_MM = 6;
const ROW_EXTRA_LINE_MM = 3.6;
const ROW_FONT = 7.6;
/** CP-PRECIO-PDF-DESC-001: tamaño secundario de la descripción respecto al nombre. */
const DESC_FONT = 6.7;

export const PRICE_LIST_GEOMETRY: PriceListGeometry = {
  // Alto útil por columna de datos (contentTop..bottomLimit).
  columnHeightMm: BOTTOM_LIMIT - CONTENT_TOP,
  headerRowMm: HEADER_ROW_MM,
  rowBaseMm: ROW_BASE_MM,
  rowExtraLineMm: ROW_EXTRA_LINE_MM,
  measureLines: () => 1, // el PDF inyecta splitTextToSize; tests inyectan el suyo
};

/**
 * Medidor real de líneas con jsPDF para el ancho de la columna producto.
 * CP-PRECIO-PDF-DESC-001: el texto de celda llega compuesto
 * («nombre\ndescripción» cuando la descripción se muestra). CRÍTICO:
 * medir cada bloque con la MISMA fuente y tamaño con la que se dibuja —
 * el nombre con ROW_FONT y la descripción con DESC_FONT (secundaria); si
 * midiera con la fuente por defecto del doc, el plan sobreestimaría las
 * alturas y desperdiciaría página.
 */
function makeDocMeasure(doc: jsPDF, widthMm: number) {
  return (text: string): number => {
    const [namePart = '', ...descParts] = text.split('\n');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(ROW_FONT);
    const nameLines = Math.max(1, (doc.splitTextToSize(namePart, widthMm) as string[]).length);
    if (descParts.length === 0) return nameLines;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(DESC_FONT);
    const descLines = Math.max(1, (doc.splitTextToSize(descParts.join('\n'), widthMm) as string[]).length);
    return nameLines + descLines;
  };
}

/** Dibuja el encabezado institucional horizontal (≈24 mm, nunca más alto). */
function drawHeader(doc: jsPDF, model: PriceListModel, logo: ScLogoResolution): void {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN_X, 12, PAGE_W - 2 * MARGIN_X, 22);

  // Izquierda: logo de la tienda (contain; nunca deforma; opcional).
  drawScLogo(doc, logo, { x: MARGIN_X + 2, y: 14, maxW: 18, maxH: 18 });

  // Centro: título + nombre de la tienda (identidad institucional real).
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LISTADO DE PRECIOS', PAGE_W / 2, 20.5, { align: 'center' });
  doc.setFontSize(9);
  doc.text(model.store.name, PAGE_W / 2, 26.5, { align: 'center' });

  // Derecha: fecha de generación dinámica + identificación de la tienda.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  doc.text(`Fecha de generación: ${model.dateLabel} ${model.timeLabel}`, PAGE_W - MARGIN_X - 2, 17.5, { align: 'right' });
  doc.text(`Tienda: ${model.store.name}`, PAGE_W - MARGIN_X - 2, 21.5, { align: 'right' });
  if (model.store.reeup) doc.text(`REEUP: ${model.store.reeup}`, PAGE_W - MARGIN_X - 2, 25.5, { align: 'right' });
  else if (model.store.nit) doc.text(`NIT: ${model.store.nit}`, PAGE_W - MARGIN_X - 2, 25.5, { align: 'right' });
}

/** Un bloque de tabla (tres columnas) dentro de una columna de la página. */
function drawBlock(
  doc: jsPDF,
  model: PriceListModel,
  plan: PriceListPlan,
  pageIndex: number,
  side: 'left' | 'right',
): void {
  const column = plan.pages[pageIndex][side];
  if (column.rowIndices.length === 0) return;

  const x0 = side === 'left' ? MARGIN_X : MARGIN_X + COL_W + COL_GAP;
  let y = CONTENT_TOP;

  // CP-PRODUCT-COMMISSION-001 TAREA 2: con la columna «Comisión» visible el
  // bloque pasa de 3 a 4 columnas (SKU | Producto | Precio | Comisión) con
  // anchos redistibuídos; sin ella el layout histórico queda EXACTO.
  const withComm = model.meta.showCommission === true;
  const skuW = withComm ? 13 : SKU_W;
  const priceW = withComm ? 19 : PRICE_W;
  const commW = withComm ? 18 : 0;
  const descW = COL_W - skuW - priceW - commW;

  // Encabezado del bloque — visible en AMBAS columnas (misión §7).
  // CP-PRECIO-PDF-DESC-001: denominación honesta de la columna según la opción.
  const cellHeader = model.meta.includeDescription ? 'Producto y descripción' : 'Producto';
  doc.setFillColor(...HEAD_FILL);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(ROW_FONT);
  doc.setTextColor(...INK);
  doc.rect(x0, y, COL_W, HEADER_ROW_MM, 'FD');
  // 'SKU' (y no «SKU / Código»): el rótulo completo invadía la columna
  // contigua en el encabezado (defecto preexistente, visible ahora con el
  // rótulo de producto); la vista ya nombra «SKU desde/hasta» a este campo.
  doc.text('SKU', x0 + 1.5, y + 4);
  doc.text(cellHeader, x0 + skuW + 1.5, y + 4);
  if (withComm) {
    doc.text('Precio de venta', x0 + skuW + descW + priceW - 1.5, y + 4, { align: 'right' });
    doc.text('Comisión', x0 + COL_W - 1.5, y + 4, { align: 'right' });
  } else {
    doc.text('Precio de venta', x0 + COL_W - 1.5, y + 4, { align: 'right' });
  }
  y += HEADER_ROW_MM;

  // Filas — nombre con presentación primaria y descripción (cuando se
  // muestra) debajo, en tamaño/tono secundarios, con ajuste de línea
  // (sin recortes); precio a la derecha; altura de fila dinámica.
  doc.setFont('helvetica', 'normal');
  for (const rowIdx of column.rowIndices) {
    const row = model.rows[rowIdx];
    const descText = model.meta.includeDescription ? row.description.trim() : '';

    doc.setFontSize(ROW_FONT);
    const nameWrapped = doc.splitTextToSize(row.name, descW) as string[];
    doc.setFontSize(DESC_FONT);
    const descWrapped = descText !== '' ? (doc.splitTextToSize(descText, descW) as string[]) : [];
    const lines = Math.max(1, nameWrapped.length) + descWrapped.length;
    const rowH = ROW_BASE_MM + Math.max(0, lines - 1) * ROW_EXTRA_LINE_MM;

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.1);
    doc.rect(x0, y, COL_W, rowH, 'S');

    doc.setTextColor(...INK);
    doc.setFontSize(ROW_FONT);
    doc.text(row.skuLabel, x0 + 1.5, y + 4);

    // Nombre del producto (primario) — campo propio, nunca sustituto de la
    // descripción ni combinado con ella.
    let ty = y + 4;
    doc.setTextColor(...INK);
    doc.setFontSize(ROW_FONT);
    for (const lineTxt of nameWrapped) {
      doc.text(lineTxt, x0 + skuW + 1.5, ty);
      ty += ROW_EXTRA_LINE_MM;
    }
    // Descripción del producto (secundaria: menor tamaño, tono atenuado).
    if (descWrapped.length > 0) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(DESC_FONT);
      for (const lineTxt of descWrapped) {
        doc.text(lineTxt, x0 + skuW + 1.5, ty);
        ty += ROW_EXTRA_LINE_MM;
      }
    }

    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(row.priceLabel, (withComm ? x0 + skuW + descW + priceW : x0 + COL_W) - 1.5, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    // TAREA 2: celda «Comisión» — etiqueta inequívoca resuelta por el motor
    // real de comisiones (resolveProductCommission); tamaño compacto para el
    // texto «{n} CUP/venta» / «{n} CUP/unidad» / «5%» / «Según trabajador».
    if (withComm && row.commissionLabel) {
      doc.setFontSize(6.4);
      doc.text(row.commissionLabel, x0 + COL_W - 1.5, y + 4, { align: 'right' });
      doc.setFontSize(ROW_FONT);
    }
    y += rowH;
  }
}

/** Pie: numeración dinámica real («Página X de N») + nota de vigencia. */
function drawFooter(doc: jsPDF, plan: PriceListPlan, model: PriceListModel): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  // CP-OPERATIONAL-CLASS-001: coherencia pantalla↔documento — el pie deja
  // constancia de los filtros operativos aplicados (clasificación y estado
  // del precio). Nada que declarar cuando el filtro es neutro.
  const filterNote = operationalFilterLabel(model.meta.operationalFilter);
  for (let p = 0; p < plan.totalPages; p += 1) {
    doc.setPage(p + 1);
    doc.text(`Precios vigentes al ${model.dateLabel} ${model.timeLabel}`, PAGE_W / 2, 290, { align: 'center' });
    doc.text(`Página ${p + 1} de ${plan.totalPages}`, PAGE_W / 2, 294, { align: 'center' });
    if (filterNote) {
      doc.setFont('helvetica', 'italic');
      doc.text(`Filtros aplicados: ${filterNote}`, PAGE_W / 2, 286, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
  }
}

/**
 * Construye el documento sin descargarlo. `logo` es inyectable (tests);
 * por defecto se resuelve de la TIENDA del modelo (fuente real).
 */
export async function renderPriceListPdf(
  model: PriceListModel,
  logo?: ScLogoResolution,
): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'mm', 'a4');
  const resolution = logo ?? await resolveScLogoDataUrl(model.store.logoUrl ?? null);

  // Plan con el MEDIDOR REAL (alturas exactas) — una sola pasada: el plan
  // ya contiene el total de páginas para «Página X de N».
  const withCommForPlan = model.meta.showCommission === true;
  const geometry: PriceListGeometry = {
    ...PRICE_LIST_GEOMETRY,
    measureLines: makeDocMeasure(doc, withCommForPlan ? COL_W - 13 - 19 - 18 : DESC_W),
  };
  const plan = planPriceListPages(model, geometry);
  if (plan.totalPages === 0) {
    throw new Error('No hay productos que cumplan los filtros: no se genera un PDF vacío.');
  }

  for (let p = 0; p < plan.totalPages; p += 1) {
    if (p > 0) doc.addPage();
    drawHeader(doc, model, resolution);
    drawBlock(doc, model, plan, p, 'left');
    drawBlock(doc, model, plan, p, 'right');
  }
  drawFooter(doc, plan, model);

  return doc;
}

/** Genera y descarga el MISMO documento que se previsualiza. */
export async function generatePriceListPdf(model: PriceListModel): Promise<void> {
  const doc = await renderPriceListPdf(model);
  doc.save(priceListFileName(model.store.name, model.dateLabel));
}

/** Nombre de archivo legible: tienda + fecha (patrón del proyecto). */
export function priceListFileName(storeName: string, dateLabel: string): string {
  const safe = storeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tienda';
  return `${safe}-listado-precios-${dateLabel.replaceAll('/', '')}.pdf`;
}
