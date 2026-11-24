/**
 * IPV — Ingresos por Ventas: generador PDF (jsPDF + autoTable).
 *
 * MISIÓN §10: encabezado con tienda/título/período, fecha de generación,
 * tabla completa con encabezados repetidos en cada página, números alineados
 * a la derecha, totales al pie, sección de incidencias de conciliación, sin
 * superposiciones ni elementos de navegación. La vista previa (bloburl) y la
 * descarga comparten ESTE documento → el preview representa fielmente el PDF.
 *
 * El dataset que recibe es el MISMO que pinta la tabla visible y que exporta
 * el Excel (filas filtradas + totales recalculados sobre ellas) → escenarios
 * K/L: una sola ejecución del informe, tres representaciones.
 *
 * MISIÓN 2026-11-24 (fase 3 + fase 5):
 *  · La columna «Valor histórico (valoración CUP)» SALIÓ del documento
 *    (aparecía vacía): tabla, fila de TOTALES y nota metodológica sin ella;
 *    una venta sin evidencia de cobro se señala por INCIDENCIAS
 *    (SALE_WITHOUT_PAYMENT_EVIDENCE), nunca como dinero cobrado.
 *  · SELECTOR DE ORIENTACIÓN (payload.orientation):
 *    - Horizontal (apaisado, A4 landscape): la tabla completa en un solo
 *      cuerpo — aprovecha el ancho para leer muchas columnas.
 *    - Vertical (retrato, A4 portrait): la información se divide en BLOQUES
 *      de columnas apilados (máx. 4 columnas numéricas por bloque),
 *      repitiendo Código y Descripción en cada bloque para identificar
 *      correctamente cada producto; cada bloque cierra con su fila TOTALES y
 *      el último bloque contiene los importes → los totales quedan visibles
 *      al finalizar el informe. Los anchos de columna se fijan por bloque
 *      (nada se comprime hasta volverse ilegible) y los encabezados se
 *      repiten en cada página (autoTable).
 *  · Respeto de la opción «Ocultar columnas sin valores» (payload.
 *    hiddenColumns): las columnas ocultas en la vista NO aparecen en el PDF
 *    (cuerpo NI totales) — misma orientación que la vista (escenario K).
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { totalsFromRows, round2, type IpvRow, type IpvTotals, type IpvIncidence } from '@/lib/ipv-ventas/compute';
import { formatIpvQty, formatIpvMoney, formatDayLabel } from '@/lib/ipv-ventas/format';
import { IPV_NUMERIC_TABLE_COLUMNS, type IpvNumericColumnKey } from '@/lib/ipv-ventas/columns';

export type IpvPdfOrientation = 'landscape' | 'portrait';

export interface IpvPdfPayload {
  storeName: string;
  /** Etiquetas de fecha tal como las eligió el usuario (YYYY-MM-DD). */
  startDateLabel: string;
  endDateLabel: string;
  rows: IpvRow[];
  incidences: IpvIncidence[];
  generatedAt: string;
  /** Totales del subconjunto visible (mismas filas que la tabla y el Excel). */
  totalsOverride?: IpvTotals;
  /** Fase 5: orientación del documento. Por defecto horizontal (apaisado),
   *  el comportamiento histórico del IPV. */
  orientation?: IpvPdfOrientation;
  /** Fase 4B: claves de columnas numéricas OCULTAS por la opción «Ocultar
   *  columnas sin valores» sobre el subconjunto filtrado — el PDF las omite
   *  (tabla y totales) para reflejar exactamente la vista. */
  hiddenColumns?: ReadonlySet<IpvNumericColumnKey>;
}

const PAGE = { margin: 36 };

function dateLabel(iso: string): string {
  // FIX DESFASE (2026-11-06): las etiquetas del período son date-only elegidos
  // por el usuario (YYYY-MM-DD). Formateo por partes SIN Date ni TZ: el día
  // elegido es exactamente el que se imprime (antes `new Date('YYYY-MM-DD')`
  // se interpretaba como medianoche UTC y `toLocaleDateString` en TZ local
  // (Habana UTC−5) retrocedía un día).
  return formatDayLabel(iso);
}

function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function safeFileName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_');
}

/**
 * FIX DESBORDE (2026-10-16): las fuentes estándar de jsPDF (Helvetica) se
 * incrustan con WinAnsiEncoding. Caracteres fuera de WinAnsi — p. ej. el menos
 * tipográfico U+2212 «−» de la nota de conciliación — fuerzan la ruta de
 * dibujo UTF-16BE (bytes NUL-padded): el renglón se DIBUJA más ancho de lo que
 * splitTextToSize MIDIÓ, sobrepasa el borde físico de la hoja y cada visor lo
 * recorta a mitad de palabra (el final de la línea se pierde), además de
 * mostrar el glifo equivocado (” en lugar de −). Se sustituyen por
 * equivalentes WinAnsi seguros antes de medir y dibujar.
 */
const WINANSI_SAFE: Array<[RegExp, string]> = [
  [/[\u2010\u2011\u2012\u2013\u2212\u2796]/g, '-'], // guiones y menos tipográfico
  [/[\u2018\u2019\u201B]/g, "'"], // comillas simples tipográficas
  [/[\u201C\u201D]/g, '"'], // comillas dobles tipográficas
  [/\u2026/g, '...'], // elipsis
  [/[\u00A0\u2007\u202F]/g, ' '], // espacios no separables
  [/\u200B/g, ''], // espacio de ancho cero
];

/** Normaliza un texto a caracteres WinAnsi seguros para fuentes estándar PDF. */
export function pdfWinAnsi(s: string): string {
  return WINANSI_SAFE.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

/**
 * splitTextToSize + verificación dura del ancho dibujado: jsPDF puede devolver
 * renglones que sobrepasan el maxWidth pedido (medición vs dibujo). Cada
 * renglón se mide con getTextWidth y, si excede, se vuelve a partir en el
 * último espacio que quepa → ningún renglón invade el margen derecho.
 */
export function splitToWidthVerified(doc: jsPDF, text: string, maxWidth: number): string[] {
  const raw = doc.splitTextToSize(text, maxWidth) as unknown as string[];
  const EPS = 0.35; // tolerancia de redondeo flotante (pt)
  const out: string[] = [];
  for (const candidate of raw) {
    let line = candidate;
    // Reparte mientras el renglón exceda el ancho y existan espacios de corte.
    while (doc.getTextWidth(line) > maxWidth + EPS && line.includes(' ')) {
      let cut = line.length;
      while (cut > 0 && doc.getTextWidth(line.slice(0, cut)) > maxWidth + EPS) {
        cut = line.lastIndexOf(' ', cut - 1);
      }
      if (cut <= 0) break; // palabra única más ancha que la página: no se puede partir
      out.push(line.slice(0, cut));
      line = line.slice(cut + 1);
    }
    out.push(line);
  }
  return out;
}

type DocWithTable = jsPDF & { lastAutoTable: { finalY: number } };

/** Columnas numéricas VISIBLES (orden canónico menos las ocultas por la vista). */
function visibleColumnDefs(hidden: ReadonlySet<IpvNumericColumnKey> | undefined) {
  return IPV_NUMERIC_TABLE_COLUMNS.filter((c) => !hidden?.has(c.key));
}

/** Valor formateado de una celda numérica (qty N/D-aware / importe). */
function cellValue(row: IpvRow, key: IpvNumericColumnKey): string {
  return formatIpvQty(row[key]);
}
function totalValue(totals: IpvTotals, key: IpvNumericColumnKey): string {
  return formatIpvQty(totals[key]);
}

/**
 * Construye el documento PDF del IPV. El caller decide: preview =
 * doc.output('bloburl'), descarga = doc.save().
 */
export async function buildIpvVentasPdf(payload: IpvPdfPayload): Promise<jsPDF> {
  const orientation: IpvPdfOrientation = payload.orientation ?? 'landscape';
  const doc = await createPDFDocument(orientation === 'portrait' ? 'p' : 'l', 'pt', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totals = payload.totalsOverride ?? totalsFromRows(payload.rows);
  const colDefs = visibleColumnDefs(payload.hiddenColumns);

  const drawHeader = (compact: boolean): number => {
    const y0 = PAGE.margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 11 : 14);
    doc.setTextColor(20, 20, 20);
    doc.text('IPV — INGRESOS POR VENTAS', pageW / 2, y0 + (compact ? 10 : 14), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(pdfWinAnsi(`Tienda: ${payload.storeName}`), PAGE.margin, y0 + (compact ? 22 : 30));
    doc.text(`Período: ${dateLabel(payload.startDateLabel)} — ${dateLabel(payload.endDateLabel)}`, PAGE.margin, y0 + (compact ? 33 : 42));
    doc.text(`Generado: ${dateTimeLabel(payload.generatedAt)}`, PAGE.margin, y0 + (compact ? 44 : 54));

    doc.text('Moneda de los importes: dinero cobrado por moneda real (CUP · USD) — criterio del Reporte de Entrega', pageW - PAGE.margin, y0 + (compact ? 22 : 30), { align: 'right' });
    doc.text(`Productos incluidos: ${payload.rows.length}`, pageW - PAGE.margin, y0 + (compact ? 33 : 42), { align: 'right' });
    if (orientation === 'portrait') {
      doc.text('Orientación vertical: bloques de columnas (Código y Descripción repetidos por bloque)', pageW - PAGE.margin, y0 + (compact ? 44 : 54), { align: 'right' });
    }

    doc.setDrawColor(180);
    doc.line(PAGE.margin, y0 + (compact ? 50 : 62), pageW - PAGE.margin, y0 + (compact ? 50 : 62));
    return y0 + (compact ? 58 : 70);
  };

  const startY = drawHeader(false);

  // ANTI-SOLAPE (2026-10-16): autoTable llama a didDrawPage TAMBIÉN al iniciar
  // la página 1 → antes se dibujaba el header compacto ENCIMA del completo
  // (texto superpuesto solo en la 1ª página). Con este registro cada página
  // se decora UNA sola vez: página 1 = completo; páginas siguientes = compacto.
  const decoratedPages = new Set<number>();
  decoratedPages.add(doc.getNumberOfPages());
  const decoratePageOnce = (compact: boolean): void => {
    const page = doc.getNumberOfPages();
    if (decoratedPages.has(page)) return;
    decoratedPages.add(page);
    drawHeader(compact);
  };
  const decorateNewPage = (): void => decoratePageOnce(true);

  const autoTable = (await import('jspdf-autotable')).default;

  // Cuerpo base por producto (énfasis de legibilidad 2026-10-16: filas con
  // movimientos en semibold; Ventas CUP ≠ 0 con fondo cálido. Los valores NO
  // cambian — solo la forma).
  const baseRowStyles = (r: IpvRow): { hasMov: boolean; em: Record<string, unknown>; cupEm: Record<string, unknown> } => {
    const hasMov = r.hasPeriodMovements || Math.abs(r.ventasImporteCup) > 0.005 || Math.abs(r.ventasImporteUsd) > 0.005;
    const em = hasMov ? { fontStyle: 'bold' as const, fontSize: 8.2, fillColor: [246, 249, 252] as [number, number, number] } : {};
    const cupEm = hasMov && Math.abs(r.ventasImporteCup) > 0.005
      ? { fontStyle: 'bold' as const, fontSize: 8.4, fillColor: [255, 247, 231] as [number, number, number] }
      : em;
    return { hasMov, em, cupEm };
  };

  const tableTheme = {
    styles: { font: 'helvetica' as const, fontSize: 7.5, cellPadding: 3, lineColor: [210, 210, 210] as [number, number, number], lineWidth: 0.35, textColor: [30, 30, 30] as [number, number, number] },
    headStyles: { fillColor: [240, 240, 240] as [number, number, number], textColor: [20, 20, 20] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 7.2 },
    footStyles: { fillColor: [228, 228, 228] as [number, number, number], fontStyle: 'bold' as const },
  };

  if (colDefs.length === 0) {
    // Guardia defensiva: el conjunto filtrado no tiene ninguna columna con
    // valores (solo puede ocurrir con filas íntegramente vacías — la regla de
    // inclusión §6 normalmente excluye esos productos). Nada que tabular.
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text('Sin columnas con valores en el conjunto filtrado (con la opción «Ocultar columnas sin valores» activada).', PAGE.margin, startY + 12);
  } else if (orientation === 'landscape') {
    // ── HORIZONTAL: la tabla completa en un solo cuerpo (comportamiento
    //    histórico del IPV, ahora sin la columna retirada y con las columnas
    //    ocultas de la vista omitidas). ──
    const head = [['Código', 'Descripción', ...colDefs.map((c) => c.short)]];
    const body = payload.rows.map((r) => {
      const { em, cupEm } = baseRowStyles(r);
      return [
        { content: pdfWinAnsi(r.sku), styles: em },
        { content: pdfWinAnsi(r.name), styles: r.hasPeriodMovements || Math.abs(r.ventasImporteCup) > 0.005 || Math.abs(r.ventasImporteUsd) > 0.005 ? { fontStyle: 'bold' as const } : {} },
        ...colDefs.map((c) => ({
          content: cellValue(r, c.key),
          styles: c.key === 'ventasImporteCup' ? cupEm : em,
        })),
      ];
    });
    const foot = [[
      { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
      ...colDefs.map((c) => ({ content: totalValue(totals, c.key), styles: { fontStyle: 'bold' as const } })),
    ]];

    autoTable(doc, {
      head,
      body,
      foot,
      startY,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 58 },
      ...tableTheme,
      columnStyles: {
        0: { cellWidth: 40, halign: 'left' },
        1: { cellWidth: 160, halign: 'left' },
        ...Object.fromEntries(colDefs.map((c, i) => [
          i + 2,
          { cellWidth: c.kind === 'money' ? 62 : 50, halign: 'right' as const },
        ])),
      },
      didDrawPage: () => {
        if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
      },
    });
  } else {
    // ── VERTICAL: bloques de columnas apilados, Código + Descripción
    //    repetidos por bloque (la identificación del producto nunca se
    //    pierde), anchos cómodos y fila TOTALES por bloque. El último bloque
    //    lleva los importes → totales visibles al finalizar el informe. ──
    const BLOCK = 4; // columnas numéricas por bloque: ancho ≈ 82 pt por columna
    const blocks: typeof colDefs[] = [];
    for (let i = 0; i < colDefs.length; i += BLOCK) blocks.push(colDefs.slice(i, i + BLOCK));

    let cursor = startY;
    for (const block of blocks) {
      const blockH = 90; // encabezado del bloque + 2 filas: mínimo legible antes de saltar
      if (cursor + blockH > pageH - PAGE.margin) {
        doc.addPage();
        decorateNewPage();
        cursor = PAGE.margin + 66;
      }
      const head = [['Código', 'Descripción', ...block.map((c) => c.short)]];
      const body = payload.rows.map((r) => {
        const { em, cupEm } = baseRowStyles(r);
        return [
          { content: pdfWinAnsi(r.sku), styles: em },
          { content: pdfWinAnsi(r.name), styles: r.hasPeriodMovements || Math.abs(r.ventasImporteCup) > 0.005 || Math.abs(r.ventasImporteUsd) > 0.005 ? { fontStyle: 'bold' as const } : {} },
          ...block.map((c) => ({
            content: cellValue(r, c.key),
            styles: c.key === 'ventasImporteCup' ? cupEm : em,
          })),
        ];
      });
      const foot = [[
        { content: 'TOTALES', colSpan: 2, styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
        ...block.map((c) => ({ content: totalValue(totals, c.key), styles: { fontStyle: 'bold' as const } })),
      ]];

      const usable = pageW - PAGE.margin * 2;
      const codeW = 36;
      const nameW = 150;
      const remaining = usable - codeW - nameW;
      const moneyCount = block.filter((c) => c.kind === 'money').length;
      // Los importes piden algo más de ancho que las cantidades.
      const moneyW = moneyCount > 0 ? Math.min(84, remaining - (block.length - moneyCount) * 70) : 0;
      const qtyW = moneyCount > 0 ? 70 : remaining / block.length;

      autoTable(doc, {
        head,
        body,
        foot,
        startY: cursor,
        margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 58 },
        ...tableTheme,
        columnStyles: {
          0: { cellWidth: codeW, halign: 'left' },
          1: { cellWidth: nameW, halign: 'left' },
          ...Object.fromEntries(block.map((c, i) => [
            i + 2,
            { cellWidth: c.kind === 'money' ? moneyW : qtyW, halign: 'right' as const },
          ])),
        },
        didDrawPage: () => {
          if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
        },
      });
      cursor = (doc as DocWithTable).lastAutoTable.finalY + 14;
    }
  }

  // ── Incidencias de conciliación (§5.6: visibles, nunca ocultas) ──────────
  let cursorY = (doc as DocWithTable).lastAutoTable.finalY + 18;

  const ensureSpace = (needed: number): void => {
    if (cursorY + needed > pageH - PAGE.margin) {
      doc.addPage();
      decorateNewPage();
      cursorY = PAGE.margin + 66;
    }
  };

  if (payload.incidences.length > 0) {
    ensureSpace(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(140, 60, 10);
    doc.text(`Incidencias de conciliación (${payload.incidences.length})`, PAGE.margin, cursorY);
    cursorY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Diferencias reportadas tal cual — no ajustadas. N/D = existencia histórica no reconstruible.', PAGE.margin, cursorY);
    cursorY += 8;

    const incPortrait = orientation === 'portrait';
    autoTable(doc, {
      head: [['Código', 'Producto', 'Tipo', 'Calculado', 'Esperado', 'Diferencia', 'Detalle']],
      body: payload.incidences.map((i) => [
        pdfWinAnsi(i.sku),
        pdfWinAnsi(i.name),
        pdfWinAnsi(i.type),
        i.calculated === null || i.calculated === undefined ? 'N/D' : formatIpvQty(i.calculated),
        i.expected === null || i.expected === undefined ? '—' : formatIpvQty(i.expected),
        i.difference === null || i.difference === undefined ? '—' : formatIpvQty(i.difference),
        pdfWinAnsi(i.detail),
      ]),
      startY: cursorY,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.margin + 58 },
      styles: { fontSize: 6.8, cellPadding: 2.5 },
      headStyles: { fillColor: [250, 240, 225], textColor: [120, 60, 10] },
      columnStyles: incPortrait
        ? { 0: { cellWidth: 34 }, 1: { cellWidth: 96 }, 2: { cellWidth: 62 }, 3: { cellWidth: 38, halign: 'right' }, 4: { cellWidth: 38, halign: 'right' }, 5: { cellWidth: 38, halign: 'right' } }
        : {
            0: { cellWidth: 42 },
            1: { cellWidth: 110 },
            2: { cellWidth: 66 },
            3: { cellWidth: 46, halign: 'right' },
            4: { cellWidth: 46, halign: 'right' },
            5: { cellWidth: 46, halign: 'right' },
            6: { cellWidth: 190 },
          },
      didDrawPage: () => {
        if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
      },
    });
    cursorY = (doc as DocWithTable).lastAutoTable.finalY + 14;
  }

  // Nota metodológica al pie
  ensureSpace(40);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(110, 110, 110);
  // FIX DESBORDE (2026-10-16): la nota contenía «−» (U+2212), fuera de
  // WinAnsi → jsPDF dibujaba el renglón en UTF-16BE más ancho de lo medido y
  // el visor lo recortaba en el borde derecho de la hoja (se perdía el tramo
  // final del texto). pdfWinAnsi normaliza los glifos y splitToWidthVerified
  // garantiza que ningún renglón exceda el ancho imprimible.
  const note = pdfWinAnsi(
    'Conciliación: Existencia final = Existencia inicial + Entradas + Devoluciones - Cantidades vendidas - Vales de salida ± Ajustes ± Transferencias. ' +
      'Cantidades del ledger de movimientos de inventario. Importes: dinero efectivamente cobrado por moneda real (CUP / USD), fuente única del Reporte de Entrega; neto por moneda = cobrado - reembolsos + recuperaciones (ledger de devoluciones, en la moneda real de cada fila). ' +
      'Ventas sin evidencia de cobro reconstruible NO se presentan como dinero cobrado: se señalan en las incidencias (SALE_WITHOUT_PAYMENT_EVIDENCE). ' +
      'Los productos sin movimientos ni saldos en el período se excluyen.',
  );
  const lines = splitToWidthVerified(doc, note, pageW - PAGE.margin * 2);
  doc.text(lines, PAGE.margin, cursorY);

  // Pie de página: numeración en todas las páginas
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${p} de ${pageCount}`, pageW - PAGE.margin, pageH - 14, { align: 'right' });
    doc.text('IPV — Ingresos por Ventas · ADNegocio', PAGE.margin, pageH - 14);
  }

  return doc;
}

/** Nombre de archivo seguro para descargas. */
export function ipvFileName(ext: 'pdf' | 'xlsx', storeName: string, from: string, to: string): string {
  return `IPV_${safeFileName(storeName)}_${from}_${to}.${ext}`;
}

export { round2 };
