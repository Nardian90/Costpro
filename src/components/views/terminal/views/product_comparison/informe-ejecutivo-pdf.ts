/**
 * CP-PDF-EXECUTIVE-REPORT-001 2026-11-24 · INFORME EJECUTIVO DE DESEMPEÑO
 * COMERCIAL Y ABASTECIMIENTO — reconstrucción editorial del documento oficial
 * (misión de rediseño del PDF de «Comparar Productos»).
 * ===========================================================================
 * MECANISMO (diagnóstico CP-PDF-EXECUTIVE-REPORT-001): el documento se genera
 * en cliente con jsPDF + jspdf-autotable (carga diferida vía
 * createPDFDocument/lazy-pdf) y se consume en DOS salidas idénticas:
 *  · vista preliminar → doc.output('bloburl') en iframe;
 *  · descarga → doc.save(nombre oficial).
 * La única fuente de contenido es src/lib/product-comparison/informe.ts
 * (buildInformeEjecutivo): este generador NO recalcula ni redacta nada (§9).
 *
 * SISTEMA EDITORIAL (misión §2-§8):
 *  · Papel A4 vertical (antes Letter); márgenes 20 mm; Anexo I en horizontal
 *    (orientación justificada por la tabla de 10 columnas, §5).
 *  · Tipografía jerárquica: portada 21 pt, títulos de sección 13 pt,
 *    subtítulos 10.5 pt, cuerpo 9.3 pt, auxiliar 8.2 pt, tablas 7.2-7.6 pt.
 *  · PORTADA ejecutiva (§4): identificación, períodos, elaboración, resumen
 *    de indicadores y contenido del documento — sin numeración visible.
 *  · PAGINACIÓN (§6): encabezado institucional de páginas continuas, guardas
 *    anti-huérfanos por bloque (título+intro+tabla), filas que no se parten
 *    (rowPageBreak 'avoid'), encabezados de tabla repetidos por autoTable en
 *    cada página y pie «Página X de Y» con identificación del documento.
 *  · ANEXOS (§7-§8): CADA anexo comienza en página nueva mediante addPage()
 *    REAL del motor (nunca espacios vacíos), con identificación ANEXO I-IV,
 *    título, introducción y nota; los anexos extensos continúan ordenados.
 *  · Integridad (§9): ninguna cifra ni texto del análisis se altera.
 */

import { format } from 'date-fns';
import type { jsPDF } from 'jspdf';
import type { CellHook } from 'jspdf-autotable';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import type {
  InformeEjecutivo,
  InformeIndicador,
  InformePrioridad,
  InformeTabla,
} from '@/lib/product-comparison/informe';

// ── Paleta editorial de impresión (sobria: blanco, grafito, azul institucional) ──
const C_DARK: [number, number, number] = [31, 41, 55];       // grafito (texto)
const C_BLACK: [number, number, number] = [16, 24, 40];      // títulos
const C_MUTED: [number, number, number] = [100, 116, 139];   // secundario
const C_BORDER: [number, number, number] = [203, 213, 225];  // líneas de tabla
const C_RULE: [number, number, number] = [148, 163, 184];    // reglas editoriales
const C_HEADER_BG: [number, number, number] = [238, 242, 247];
const C_BAND: [number, number, number] = [248, 250, 252];    // banda suave
const C_STRIPE: [number, number, number] = [246, 248, 250];  // fila alternada
const C_ACCENT: [number, number, number] = [31, 78, 121];    // azul institucional
const C_ALTA_BG: [number, number, number] = [250, 232, 229];
const C_ALTA_TX: [number, number, number] = [153, 42, 27];
const C_MEDIA_BG: [number, number, number] = [250, 240, 219];
const C_MEDIA_TX: [number, number, number] = [146, 104, 14];
const C_PREV_BG: [number, number, number] = [233, 237, 241];
const C_PREV_TX: [number, number, number] = [68, 81, 91];
const C_BAR_ANT: [number, number, number] = [191, 199, 209]; // barra tramo anterior
const C_BAR_ACT: [number, number, number] = [31, 78, 121];   // barra período actual
const C_POS: [number, number, number] = [4, 120, 87];        // variación positiva (verde sobrio de impresión)

// ── Retícula del documento (A4: 210 × 297 mm) ────────────────────────────────
const M = 20;                 // márgenes laterales (§3: 20-22 mm)
const BOTTOM_RESERVE = 20;    // reserva inferior (pie incluido)
const PAGE_TOP_CONT = 24;     // inicio de contenido en páginas continuas
const TITULO_DOC = 'Informe Ejecutivo de Desempeño Comercial y Abastecimiento';

const fmtCup = (n: number): string =>
  `${n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Número compacto para etiquetas del gráfico (1,53 M / 74,7 k / 300). */
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CU', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('es-CU', { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString('es-CU', { maximumFractionDigits: 0 });
}

/** Truncado con «…» verificado por ancho real. */
function truncar(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** Nombre de archivo oficial del informe. */
export function informeEjecutivoFileName(informe: InformeEjecutivo): string {
  const tienda = informe.meta.entidadNombre.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) || 'Tienda';
  return `Informe_Ejecutivo_Desempeno_Comercial_${tienda}_${format(new Date(informe.meta.generadoEl), 'yyyyMMdd_HHmm')}.pdf`;
}

// ── Utilidades de página (dimensiones SIEMPRE de la página actual) ──────────

function pageW(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}
function pageH(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

/** Encabezado institucional de páginas continuas (con o sin anexos). */
function drawContinuationHeader(doc: jsPDF, informe: InformeEjecutivo): void {
  const pw = pageW(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_BLACK);
  doc.text(TITULO_DOC, M, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(informe.meta.entidadNombre, pw - M, 11, { align: 'right' });
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.25);
  doc.line(M, 15, pw - M, 15);
}

/** Nueva página VERTICAL con encabezado institucional. */
function nuevaPaginaVertical(doc: jsPDF, informe: InformeEjecutivo): void {
  doc.addPage('a4', 'portrait');
  drawContinuationHeader(doc, informe);
}

/** Necesita espacio antes de dibujar un bloque de altura `need` (mm). */
function ensureSpace(doc: jsPDF, y: number, need: number, informe: InformeEjecutivo): number {
  if (y + need <= pageH(doc) - BOTTOM_RESERVE) return y;
  nuevaPaginaVertical(doc, informe);
  return PAGE_TOP_CONT;
}

/** Texto con ajuste de línea; devuelve la Y después del bloque. */
function drawWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
  informe: InformeEjecutivo,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (y + lineH > pageH(doc) - BOTTOM_RESERVE) {
      nuevaPaginaVertical(doc, informe);
      y = PAGE_TOP_CONT;
    }
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

/** Párrafo de cuerpo (9.3 pt, interlineado cómodo para lectura prolongada). */
function drawParrafo(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.3);
  doc.setTextColor(...C_DARK);
  return drawWrapped(doc, texto, M, y, pageW(doc) - 2 * M, 4.9, informe) + 2;
}

/** Párrafo auxiliar (8.2 pt, secundario: introducciones y notas). */
function drawAuxiliar(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...C_MUTED);
  return drawWrapped(doc, texto, M, y, pageW(doc) - 2 * M, 4.0, informe) + 1.5;
}

/** Título de sección numerado (13 pt + regla editorial). Guarda anti-huérfanos:
 *  `need` reserva espacio para el título MÁS el primer bloque de contenido
 *  (§3: nunca un encabezado aislado al pie de página). */
function drawSectionTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo, need = 46): number {
  const pw = pageW(doc);
  const yy = ensureSpace(doc, y, need, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo, M, yy + 2.5);
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(M, yy + 5, pw - M, yy + 5);
  return yy + 9.5;
}

/** Subtítulo interno (10.5 pt bold grafito). Guarda anti-huérfanos. */
function drawSubTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo, need = 14): number {
  const yy = ensureSpace(doc, y, need, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C_DARK);
  doc.text(titulo, M, yy + 1.5);
  return yy + 6;
}

// ── Tablas (autoTable dinámico — encabezados repetidos en multipágina) ───────

interface TablaOpts {
  head: string[];
  body: string[][];
  colWidths: number[];   // proporciones (suman 1)
  aligns: Array<'left' | 'right' | 'center'>;
  fontSize?: number;
  /** Hook oficial de jspdf-autotable (p. ej., colorear la celda de prioridad). */
  didParseCell?: CellHook;
}

async function drawTabla(
  doc: jsPDF,
  opts: TablaOpts,
  informe: InformeEjecutivo,
  startY: number,
): Promise<number> {
  const { default: autoTable } = await import('jspdf-autotable');
  const contentW = pageW(doc) - 2 * M;
  // Páginas que YA llevan el encabezado institucional al empezar la tabla.
  // autoTable añade páginas por salto y las detectamos con getCurrentPageInfo
  // (ABSOLUTO y fiable) dentro de didDrawPage; data.pageNumber es relativo a
  // la propia tabla y no sirve para comparar (defecto detectado en escenarios
  // de estrés E/F: páginas internas sin encabezado).
  const paginasConHeader = new Set<number>([doc.getCurrentPageInfo().pageNumber]);
  autoTable(doc, {
    startY,
    head: [opts.head],
    body: opts.body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: opts.fontSize ?? 7.4,
      cellPadding: 1.7,
      lineColor: C_BORDER,
      lineWidth: 0.12,
      textColor: C_DARK,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: C_HEADER_BG,
      textColor: C_BLACK,
      fontStyle: 'bold',
      fontSize: (opts.fontSize ?? 7.4) - 0.2,
      lineWidth: 0.2,
      lineColor: C_RULE,
      // La alineación del encabezado sigue la de su columna (consistencia §5).
    },
    alternateRowStyles: { fillColor: C_STRIPE },
    columnStyles: Object.fromEntries(
      opts.head.map((_, i) => [
        i,
        {
          cellWidth: (opts.colWidths[i] ?? 1 / opts.head.length) * contentW,
          halign: opts.aligns[i] ?? 'left',
        },
      ]),
    ),
    margin: { left: M, right: M, top: PAGE_TOP_CONT, bottom: BOTTOM_RESERVE },
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      // Encabezado institucional en las páginas de CONTINUACIÓN de la tabla
      // (la primera ya lo trae dibujado por el flujo del documento).
      const pn = doc.getCurrentPageInfo().pageNumber;
      if (!paginasConHeader.has(pn)) {
        drawContinuationHeader(doc, informe);
        paginasConHeader.add(pn);
      }
    },
    ...(opts.didParseCell ? { didParseCell: opts.didParseCell } : {}),
  });
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  return docAny.lastAutoTable?.finalY ?? startY;
}

// ── Gráfico ejecutivo (barras horizontales comparativas — primitivas jsPDF) ──

function alturaGrafico(informe: InformeEjecutivo): number {
  const g = informe.grafico;
  if (!g) return 0;
  const barH = 3.4;
  const gapBar = 1.1;
  const gapProd = 2.6;
  const headerH = 5;
  const legendH = 6;
  return headerH + g.series.length * (barH * 2 + gapBar + gapProd) - gapProd + legendH + 8;
}

function drawGrafico(doc: jsPDF, informe: InformeEjecutivo, y0: number): number {
  const g = informe.grafico;
  if (!g) return y0;
  const contentW = pageW(doc) - 2 * M;
  const labelW = contentW * 0.30;
  const barArea = contentW - labelW - 18; // reserva para la etiqueta de valor
  const maxVal = Math.max(...g.series.flatMap((s) => [s.anterior, s.actual]), 1);
  const barH = 3.4;
  const gapBar = 1.1;
  const gapProd = 2.6;
  const headerH = 5;
  const legendH = 6;
  const alto = alturaGrafico(informe);

  const yStart = ensureSpace(doc, y0, alto, informe);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_DARK);
  doc.text(g.titulo, M, yStart + 2);

  let y = yStart + headerH + 2;
  for (const s of g.series) {
    // Etiqueta del producto (una línea, truncada con verificación real)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...C_DARK);
    doc.text(truncar(doc, s.name, labelW - 2), M, y + barH);

    // Barras: anterior (gris) y actual (azul institucional), escala común.
    const wAnt = Math.max((s.anterior / maxVal) * barArea, s.anterior > 0 ? 0.8 : 0);
    const wAct = Math.max((s.actual / maxVal) * barArea, s.actual > 0 ? 0.8 : 0);
    doc.setFillColor(...C_BAR_ANT);
    doc.rect(M + labelW, y, wAnt, barH, 'F');
    doc.setFillColor(...C_BAR_ACT);
    doc.rect(M + labelW, y + barH + gapBar, wAct, barH, 'F');

    doc.setFontSize(6.8);
    doc.setTextColor(...C_MUTED);
    if (s.anterior > 0) doc.text(fmtCompact(s.anterior), M + labelW + wAnt + 1.2, y + barH);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C_BAR_ACT);
    if (s.actual > 0) doc.text(fmtCompact(s.actual), M + labelW + wAct + 1.2, y + barH + gapBar + barH);
    y += barH * 2 + gapBar + gapProd;
  }

  // Leyenda
  y += 0.4;
  doc.setFillColor(...C_BAR_ANT);
  doc.rect(M, y, 4, 2.2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...C_MUTED);
  doc.text('Tramo comparable (mes anterior)', M + 5.5, y + 2);
  doc.setFillColor(...C_BAR_ACT);
  doc.rect(M + 52, y, 4, 2.2, 'F');
  doc.setTextColor(...C_DARK);
  doc.text('Período analizado', M + 57.5, y + 2);

  // Nota metodológica corta
  doc.setFontSize(6.9);
  doc.setTextColor(...C_MUTED);
  const notaLines = doc.splitTextToSize(g.nota, contentW) as string[];
  let yn = y + 5.5;
  for (const line of notaLines.slice(0, 2)) {
    doc.text(line, M, yn);
    yn += 3;
  }
  return yStart + alto + 3;
}

// ── Matriz de prioridades y decisiones ───────────────────────────────────────

const PRIORIDAD_TXT: Record<InformePrioridad['nivel'], string> = {
  alta: 'ALTA',
  media: 'MEDIA',
  preventiva: 'PREVENTIVA',
};

async function drawMatrizPrioridades(
  doc: jsPDF,
  informe: InformeEjecutivo,
  startY: number,
): Promise<number> {
  const styleFor = (nivel: InformePrioridad['nivel']) => {
    if (nivel === 'alta') return { bg: C_ALTA_BG, tx: C_ALTA_TX };
    if (nivel === 'media') return { bg: C_MEDIA_BG, tx: C_MEDIA_TX };
    return { bg: C_PREV_BG, tx: C_PREV_TX };
  };

  // El nivel de cada fila viaja en el texto para colorear en didParseCell.
  const body = informe.prioridades.map((p) => [
    PRIORIDAD_TXT[p.nivel],
    p.producto,
    p.situacion,
    p.decision,
  ]);

  return drawTabla(
    doc,
    {
      head: ['Prioridad', 'Producto', 'Situación', 'Decisión recomendada'],
      body,
      colWidths: [0.10, 0.17, 0.365, 0.365],
      aligns: ['center', 'left', 'left', 'left'],
      fontSize: 7.6,
      didParseCell: (data) => {
        if (data.row.section !== 'body') return;
        if (data.column.index !== 0) {
          data.cell.styles.fontSize = 7.6;
          return;
        }
        const nivel = String(data.cell.raw ?? '').toLowerCase();
        const s = nivel.includes('alta')
          ? styleFor('alta')
          : nivel.includes('media')
            ? styleFor('media')
            : styleFor('preventiva');
        data.cell.styles.fillColor = s.bg;
        data.cell.styles.textColor = s.tx;
        data.cell.styles.fontStyle = 'bold';
      },
    },
    informe,
    startY,
  );
}

// ── Anexos (§7: cada anexo en página nueva; §8: identificación completa) ─────

/** Cabecera de anexo: identificación ANEXO n + título + introducción. */
function drawAnnexHeader(
  doc: jsPDF,
  informe: InformeEjecutivo,
  ident: string,
  titulo: string,
  intro: string | undefined,
): number {
  const pw = pageW(doc);
  let y = PAGE_TOP_CONT;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_ACCENT);
  doc.text(ident, M, y + 1, { charSpace: 0.5 });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo, M, y + 2.5);
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(M, y + 5, pw - M, y + 5);
  y += 9.5;
  if (intro) {
    y = drawAuxiliar(doc, intro, y, informe) + 1.5;
  }
  return y;
}

/** Sección/tabla interna con introducción y nota (análisis complementario). */
async function drawSeccionTabla(
  doc: jsPDF,
  tabla: InformeTabla,
  informe: InformeEjecutivo,
  y0: number,
  opts: { colWidths?: number[]; aligns?: Array<'left' | 'right' | 'center'>; fontSize?: number } = {},
): Promise<number> {
  let y = y0;
  // Guarda anti-huérfanos: el subtítulo nunca queda aislado al pie de página.
  y = drawSubTitle(doc, tabla.titulo, y, informe, 30);
  if (tabla.intro) {
    y = drawAuxiliar(doc, tabla.intro, y, informe) + 1;
  }
  if (tabla.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, 'Sin casos en este período.', M, y, pageW(doc) - 2 * M, 4.4, informe) + 2;
    return y;
  }
  const n = tabla.columnas.length;
  const widths =
    opts.colWidths ??
    tabla.anchos ??
    Array.from({ length: n }, (_, i) =>
      // La primera columna (descripción) respira; las numéricas se reparten.
      i === 0 ? 0.26 : (0.74 / (n - 1)),
    );
  const aligns =
    opts.aligns ??
    tabla.alineaciones ??
    Array.from({ length: n }, (_, i) => (i === 0 ? 'left' : 'right') as 'left' | 'right');
  const body = tabla.filas;
  y = await drawTabla(
    doc,
    {
      head: tabla.columnas,
      body,
      colWidths: widths,
      aligns,
      fontSize: opts.fontSize ?? 7.4,
    },
    informe,
    y,
  );
  if (tabla.nota) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.4);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, `Nota: ${tabla.nota}`, M, y + 1.8, pageW(doc) - 2 * M, 3.8, informe) + 1.5;
  }
  return y + 4;
}

/** Dibuja un anexo tabular (InformeTabla) en página nueva con identidad propia. */
async function drawAnexoTabla(
  doc: jsPDF,
  informe: InformeEjecutivo,
  anexo: InformeTabla,
  ident: string,
  orientacion: 'portrait' | 'landscape',
  layout: { colWidths: number[]; aligns: Array<'left' | 'right' | 'center'>; fontSize: number },
): Promise<void> {
  doc.addPage('a4', orientacion);
  drawContinuationHeader(doc, informe);
  let y = drawAnnexHeader(doc, informe, ident, anexo.titulo, anexo.intro);
  if (anexo.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, 'Sin casos en este período.', M, y, pageW(doc) - 2 * M, 4.4, informe) + 2;
  } else {
    y = await drawTabla(
      doc,
      {
        head: anexo.columnas,
        body: anexo.filas,
        colWidths: layout.colWidths,
        aligns: layout.aligns,
        fontSize: layout.fontSize,
      },
      informe,
      y,
    );
  }
  if (anexo.nota) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.4);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, `Nota: ${anexo.nota}`, M, y + 1.8, pageW(doc) - 2 * M, 3.8, informe) + 1.5;
  }
}

// ── PORTADA (§4) ─────────────────────────────────────────────────────────────

/** Etiqueta de grupo editorial: versalitas en acento + regla fina. Devuelve la Y inicial del contenido. */
function drawGrupoKicker(doc: jsPDF, texto: string, y: number): number {
  const pw = pageW(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_ACCENT);
  doc.text(texto, M, y, { charSpace: 0.5 });
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.2);
  doc.line(M, y + 2.2, pw - M, y + 2.2);
  return y + 7;
}

/**
 * Tarjeta destacada (Ingresos / Variación): banda suave con filete de acento a
 * la izquierda, etiqueta pequeña en versalitas, valor protagonista y descriptor.
 * CP-UX-FINAL-POLISH-003 §1.1-1.2: jerarquía y aire para los dos indicadores
 * principales; sin comprimir tipografías.
 */
function drawTarjetaDestacada(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  etiqueta: string,
  valor: string,
  valorColor: [number, number, number],
  secundario: string | null,
  descriptor: string,
): void {
  const valueSize = 14.5;
  doc.setFillColor(...C_BAND);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.9);
  doc.line(x, y, x, y + h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C_MUTED);
  doc.text(etiqueta, x + 5, y + 7.2, { charSpace: 0.35 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(valueSize);
  doc.setTextColor(...valorColor);
  doc.text(truncar(doc, valor, w - 10), x + 5, y + 16.5);
  const yDesc = y + 20.5;
  if (secundario) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...valorColor);
    doc.text(secundario, x + 5, yDesc);
    const wSec = doc.getTextWidth(secundario);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...C_MUTED);
    doc.text(truncar(doc, descriptor, w - 10 - wSec - 2.5), x + 5 + wSec + 2.5, yDesc);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...C_MUTED);
    doc.text(truncar(doc, descriptor, w - 10), x + 5, yDesc);
  }
}

/** Tarjeta de cifra (grupos comercial e inventario): número protagonista + etiqueta inferior. */
function drawTarjetaCifra(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  cifra: string,
  etiqueta: string,
): void {
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...C_BLACK);
  doc.text(truncar(doc, cifra, w - 6), x + w / 2, y + 9.3, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(...C_MUTED);
  const lineas = doc.splitTextToSize(etiqueta, w - 6) as string[];
  let ye = y + 13.2;
  for (const linea of lineas.slice(0, 3)) {
    doc.text(linea, x + w / 2, ye, { align: 'center' });
    ye += 3.2;
  }
}

/** Banda del producto líder: acento institucional a todo el ancho, discreta (10 mm). */
function drawBandaLider(doc: jsPDF, y: number, contentW: number, nombre: string, participacion: string): void {
  const h = 9.5;
  doc.setFillColor(...C_ACCENT);
  doc.rect(M, y, contentW, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(255, 255, 255);
  doc.text('LÍDER DEL PERÍODO', M + 5, y + 4, { charSpace: 0.5 });
  doc.setFontSize(10);
  doc.text(truncar(doc, nombre, contentW * 0.55), M + 5, y + 7.9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(participacion, M + contentW - 5, y + 6.5, { align: 'right' });
}

/**
 * Composición editorial de los indicadores ejecutivos en la portada
 * (CP-UX-FINAL-POLISH-003 §1.1/1.2). Sustituye la lista compacta de líneas por:
 *   1. Bloque destacado: Ingresos y Variación, lado a lado, con jerarquía.
 *   2. Grupo «Desempeño comercial»: crecimiento, contracción, sin ventas.
 *   3. Grupo «Disponibilidad e inventario»: agotados con antecedente, cobertura.
 *   4. Banda diferenciada del producto líder (sin desproporción).
 * Los indicadores no reconocidos se listan al pie del bloque (defensa de
 * integridad §9: NINGÚN indicador se pierde jamás).
 * NO recalc NI reescribe cifras: solo distribuye informe.indicadores.
 */
function drawIndicadoresEditorial(doc: jsPDF, informe: InformeEjecutivo, yKicker: number): number {
  const pw = pageW(doc);
  const contentW = pw - 2 * M;
  const inds = informe.indicadores;
  const GAP = 4.5; // aire entre grupos (§1.2)

  // Clasificación presentacional por etiqueta (fuente única: buildInformeEjecutivo).
  const usados = new Set<number>();
  const buscar = (re: RegExp): InformeIndicador | undefined => {
    const idx = inds.findIndex((ind, i) => !usados.has(i) && re.test(ind.label));
    if (idx >= 0) usados.add(idx);
    return idx >= 0 ? inds[idx] : undefined;
  };
  const ingresos = buscar(/^Ingresos del conjunto/i);
  const variacion = buscar(/^Variación vs/i);
  const crecimiento = buscar(/crecimiento relevante/i);
  const contraccion = buscar(/contracción/i);
  const sinVentas = buscar(/sin ventas en el tramo/i);
  const agotados = buscar(/agotados con antecedentes/i);
  const cobertura = buscar(/cobertura estimada insuficiente/i);
  const lider = buscar(/^Lider del período/i);

  // ── Bloque destacado ──
  let y = drawGrupoKicker(doc, 'RESUMEN DE INDICADORES', yKicker);
  if (ingresos || variacion) {
    const cardW = (contentW - 4) / 2;
    const h = 23;
    if (ingresos) {
      drawTarjetaDestacada(doc, M, y, cardW, h, 'INGRESOS DEL CONJUNTO', ingresos.value, C_ACCENT, null, 'Ventas del conjunto en el período analizado');
    }
    if (variacion) {
      const mVar = variacion.value.match(/^(.*?)\s*\((.+)\)\s*$/);
      const principal = mVar ? mVar[1] : variacion.value;
      const pct = mVar ? mVar[2] : null;
      const esNegativa = principal.trim().startsWith('-');
      const colorVar = esNegativa ? C_ALTA_TX : principal.trim().startsWith('+') || /^\$?\d/.test(principal.trim()) ? C_POS : C_DARK;
      drawTarjetaDestacada(
        doc,
        M + cardW + 4,
        y,
        cardW,
        h,
        'VARIACIÓN VS. TRAMO COMPARABLE',
        principal,
        colorVar,
        pct,
        'Frente al tramo equivalente del período anterior',
      );
    }
    y += h + GAP + 1.5;
  }

  // ── Grupo: desempeño comercial ──
  const comerciales = [crecimiento, contraccion, sinVentas].filter((i): i is InformeIndicador => !!i);
  if (comerciales.length > 0) {
    y = drawGrupoKicker(doc, 'DESEMPEÑO COMERCIAL DEL CONJUNTO', y);
    const gapCard = 4;
    const cardW = (contentW - gapCard * (comerciales.length - 1)) / comerciales.length;
    let maxLines = 1;
    comerciales.forEach((c) => {
      const lineas = doc.splitTextToSize(c.label, cardW - 6) as string[];
      maxLines = Math.max(maxLines, lineas.length);
    });
    const h = 13.2 + maxLines * 3.2 + 1.3;
    comerciales.forEach((c, i) => {
      drawTarjetaCifra(doc, M + i * (cardW + gapCard), y, cardW, h, c.value, c.label);
    });
    y += h + GAP;
  }

  // ── Grupo: disponibilidad e inventario ──
  const inventario = [agotados, cobertura].filter((i): i is InformeIndicador => !!i);
  if (inventario.length > 0) {
    y = drawGrupoKicker(doc, 'DISPONIBILIDAD E INVENTARIO', y);
    const gapCard = 4;
    const cardW = (contentW - gapCard * (inventario.length - 1)) / inventario.length;
    let maxLines = 1;
    inventario.forEach((c) => {
      const lineas = doc.splitTextToSize(c.label, cardW - 6) as string[];
      maxLines = Math.max(maxLines, lineas.length);
    });
    const h = 13.2 + maxLines * 3.2 + 1.3;
    inventario.forEach((c, i) => {
      drawTarjetaCifra(doc, M + i * (cardW + gapCard), y, cardW, h, c.value, c.label);
    });
    y += h + GAP;
  }

  // ── Líder del período (tratamiento diferenciado, sin desproporción) ──
  if (lider) {
    const mLider = lider.value.match(/^(.+?)\s+—\s+(.+)$/);
    drawBandaLider(doc, y, contentW, mLider ? mLider[1].trim() : lider.value, mLider ? mLider[2].trim() : '');
    y += 9.5 + GAP - 1;
  }

  // ── Defensa de integridad §9: cualquier indicador no clasificado NO se pierde ──
  const restantes = inds.filter((_, i) => !usados.has(i));
  if (restantes.length > 0) {
    y = drawGrupoKicker(doc, 'OTROS INDICADORES', y);
    const vw = 62;
    for (const ind of restantes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(...C_DARK);
      doc.text(truncar(doc, ind.label, contentW - vw - 4), M, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_BLACK);
      doc.text(ind.value, pw - M, y, { align: 'right' });
      y += 5.2;
    }
    y += GAP - 4;
  }

  return y;
}

function drawPortada(doc: jsPDF, informe: InformeEjecutivo): void {
  const pw = pageW(doc);
  const contentW = pw - 2 * M;
  const { meta } = informe;
  const f = (iso: string): string => {
    const [yy, mm, dd] = iso.split('-');
    return yy && mm && dd ? `${dd}/${mm}/${yy}` : iso;
  };

  // Bloque superior: identificación editorial (kicker + título + subtítulo)
  let y = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_ACCENT);
  doc.text('ANÁLISIS COMERCIAL · COMPARACIÓN DE PRODUCTOS', M, y, { charSpace: 0.7 });
  y += 6;
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.9);
  doc.line(M, y, M + 34, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(...C_BLACK);
  doc.text('COMPARACIÓN DE PRODUCTOS', M, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(...C_DARK);
  doc.text(TITULO_DOC, M, y);

  // Ficha institucional (entidad, períodos, elaboración)
  y += 12;
  doc.setFillColor(...C_BAND);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(M, y, contentW, 44, 'S');
  const filas: Array<[string, string]> = [
    ['ENTIDAD', meta.entidadNombre],
    ['PERÍODO ANALIZADO', `${f(meta.periodoActual.desde)} a ${f(meta.periodoActual.hasta)} (${meta.diasPeriodo} días)`],
    ['PERÍODO COMPARATIVO', `${f(meta.periodoComparacion.desde)} a ${f(meta.periodoComparacion.hasta)}`],
    ['ELABORACIÓN', `${format(new Date(meta.generadoEl), 'dd/MM/yyyy HH:mm')} · Ámbito: ${meta.ambito}`],
  ];
  let yf = y + 8;
  for (const [etiqueta, valor] of filas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C_MUTED);
    doc.text(etiqueta, M + 5, yf);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    doc.setTextColor(...C_DARK);
    doc.text(valor, M + 48, yf);
    yf += 9;
  }

  // Resumen de indicadores — composición editorial (CP-UX-FINAL-POLISH-003 §1.1):
  // bloque destacado de ingresos/variación, grupos semánticos y banda del líder,
  // con aire y jerarquía en lugar de líneas consecutivas.
  y += 44 + 7;
  y = drawIndicadoresEditorial(doc, informe, y);

  // Contenido del documento (fila compacta si el bloque editorial creció,
  // p. ej. etiquetas a 3 líneas — la portada JAMÁS invade el pie, §4)
  y += 8;
  const filaContenido = y > 226 ? 5.2 : 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_ACCENT);
  doc.text('CONTENIDO', M, y, { charSpace: 0.5 });
  y += 6.5;
  const secciones: Array<[string, string]> = [
    ['1.', 'Diagnóstico ejecutivo'],
    ['2.', 'Prioridades y decisiones recomendadas'],
    ['3.', 'Análisis complementario'],
    // (el ancho del numeral se mide al dibujar; véase más abajo)
    ...informe.anexos.map((a, i) => {
      const m = a.titulo.match(/^(Anexo\s+[IVX]+)\.\s*(.+)$/i);
      const ident = m ? m[1].replace('Anexo', 'ANEXO').toUpperCase() : `ANEXO ${i + 1}`;
      const resto = m ? m[2] : a.titulo;
      return [ident.replace(/\.?\s*$/, ''), resto] as [string, string];
    }),
    ['ANEXO IV', 'Metodología y fuentes'],
  ];
  const mitad = Math.ceil(secciones.length / 2);
  const colW = (contentW - 8) / 2;
  for (let i = 0; i < mitad; i++) {
    const fila = secciones[i];
    const fila2 = secciones[i + mitad];
    const yy = y + i * filaContenido;
    for (const [col, item] of [[0, fila], [1, fila2]] as Array<[number, [string, string] | undefined]>) {
      if (!item) continue;
      const x = M + col * (colW + 8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      doc.setTextColor(...C_ACCENT);
      doc.text(item[0], x, yy);
      // El título se coloca tras el ancho REAL del numeral en mm
      // (getTextWidth ya devuelve unidades del documento), sin solapes.
      const wNum = doc.getTextWidth(item[0]);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_DARK);
      doc.text(truncar(doc, item[1], colW - wNum - 2), x + wNum + 2, yy);
    }
  }

  // Identificación al pie de la portada (sin numeración de página, §4)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...C_MUTED);
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.2);
  doc.line(M, 273, pw - M, 273);
  doc.text(
    `${meta.entidadNombre} · ${TITULO_DOC} · Generado el ${format(new Date(meta.generadoEl), 'dd/MM/yyyy HH:mm')}`,
    M,
    278,
  );
}

// ── Builder principal ────────────────────────────────────────────────────────

export async function buildInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'mm', 'a4');
  const { meta } = informe;

  const f = (iso: string): string => {
    const [yy, mm, dd] = iso.split('-');
    return yy && mm && dd ? `${dd}/${mm}/${yy}` : iso;
  };

  // ── PÁGINA 1 · PORTADA (sin numeración visible, §4) ──
  drawPortada(doc, informe);

  // ── PÁGINA 2 · CUERPO ──
  nuevaPaginaVertical(doc, informe);
  let y = PAGE_TOP_CONT;

  // 1. DIAGNÓSTICO EJECUTIVO
  y = drawSectionTitle(doc, '1. Diagnóstico ejecutivo', y, informe, 40);
  y = drawSubTitle(doc, 'Situación general', y, informe);
  for (const parrafo of informe.situacionGeneral) {
    y = drawParrafo(doc, parrafo, y, informe);
    y += 0.5;
  }

  // Conclusión gerencial destacada (banda editorial sobria)
  {
    const contentW = pageW(doc) - 2 * M;
    const lines = doc.splitTextToSize(informe.conclusionGerencial, contentW - 8) as string[];
    const altoBanda = lines.length * 4.6 + 8;
    y = ensureSpace(doc, y + 1, altoBanda + 3, informe);
    doc.setFillColor(...C_BAND);
    doc.rect(M, y, contentW, altoBanda, 'F');
    doc.setDrawColor(...C_ACCENT);
    doc.setLineWidth(0.9);
    doc.line(M, y, M, y + altoBanda);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_ACCENT);
    doc.text('CONCLUSIÓN GERENCIAL', M + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.3);
    doc.setTextColor(...C_DARK);
    let yc = y + 10;
    for (const line of lines) {
      doc.text(line, M + 4, yc);
      yc += 4.6;
    }
    y += altoBanda + 5;
  }

  // Indicadores relevantes (detalle completo del resumen de portada)
  y = drawSubTitle(doc, 'Indicadores relevantes', y, informe);
  y = await drawTabla(
    doc,
    {
      head: ['Indicador', 'Valor'],
      body: informe.indicadores.map((i) => [i.label, i.value]),
      colWidths: [0.62, 0.38],
      aligns: ['left', 'right'],
      fontSize: 8.0,
    },
    informe,
    y,
  );
  y += 6;

  // Gráfico ejecutivo — el subtítulo NUNCA queda huérfano: se reserva el
  // espacio del gráfico completo ANTES de dibujar el título (defecto del
  // generador anterior detectado en la portada del baseline).
  {
    const alto = informe.grafico ? alturaGrafico(informe) : 12;
    y = ensureSpace(doc, y, Math.min(alto + 10, pageH(doc) - PAGE_TOP_CONT - BOTTOM_RESERVE), informe);
    y = drawSubTitle(doc, 'Comportamiento comparado de los productos principales', y, informe, alto + 8);
  }
  if (informe.grafico) {
    y = drawGrafico(doc, informe, y);
  } else {
    y = drawParrafo(doc, 'Sin datos suficientes para construir el gráfico comparativo en este período.', y, informe);
  }

  // 2. PRIORIDADES Y DECISIONES
  y = drawSectionTitle(doc, '2. Prioridades y decisiones recomendadas', y, informe);
  if (informe.prioridades.length === 0) {
    y = drawParrafo(
      doc,
      'Ninguna situación del conjunto comparado supera los umbrales de revisión de este informe. Mantener el seguimiento periódico de la comparación y de la disponibilidad.',
      y,
      informe,
    );
  } else {
    y = drawParrafo(
      doc,
      'Matriz ordenada por severidad: ALTA compromete ventas o disponibilidad; MEDIA exige seguimiento o ajuste; PREVENTIVA identifica oportunidades y riesgos latentes. Cada decisión incluye su justificación cuantitativa; las restantes situaciones operativas se detallan en el análisis complementario y los anexos.',
      y,
      informe,
    );
    y += 1.5;
    y = await drawMatrizPrioridades(doc, informe, y);
    y += 6;
  }

  // 3. ANÁLISIS COMPLEMENTARIO
  if (informe.complementarias.length > 0) {
    y = drawSectionTitle(doc, '3. Análisis complementario', y, informe);
    for (const tabla of informe.complementarias) {
      y = await drawSeccionTabla(doc, tabla, informe, y);
    }
  }

  // ── ANEXOS (§7): CADA anexo comienza en página nueva mediante addPage real.
  //    No se simula la separación con espacios ni saltos de línea.

  // Anexo I — ranking comparativo completo (10 columnas → orientación
  // horizontal justificada, §5). Los saltos internos de autoTable conservan
  // la orientación y repiten el encabezado en cada página.
  const anexoI = informe.anexos[0];
  if (anexoI) {
    await drawAnexoTabla(doc, informe, anexoI, 'ANEXO I', 'landscape', {
      colWidths: [0.08, 0.28, 0.05, 0.05, 0.11, 0.11, 0.10, 0.08, 0.07, 0.07],
      aligns: ['left', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right'],
      fontSize: 7.4,
    });
  }
  // Anexo II — disponibilidad y cobertura (vertical)
  const anexoII = informe.anexos[1];
  if (anexoII) {
    await drawAnexoTabla(doc, informe, anexoII, 'ANEXO II', 'portrait', {
      colWidths: [0.23, 0.10, 0.13, 0.14, 0.15, 0.25],
      aligns: ['left', 'right', 'right', 'right', 'left', 'left'],
      fontSize: 7.2,
    });
  }
  // Anexo III — productos sin ventas (vertical)
  const anexoIII = informe.anexos[2];
  if (anexoIII) {
    await drawAnexoTabla(doc, informe, anexoIII, 'ANEXO III', 'portrait', {
      colWidths: [0.19, 0.14, 0.13, 0.11, 0.12, 0.31],
      aligns: ['left', 'left', 'right', 'right', 'right', 'left'],
      fontSize: 7.2,
    });
  }

  // Anexo IV — metodología y fuentes (página nueva propia).
  doc.addPage('a4', 'portrait');
  drawContinuationHeader(doc, informe);
  {
    let ym = drawAnnexHeader(doc, informe, 'ANEXO IV', 'Metodología y fuentes', undefined);
    const contentW = pageW(doc) - 2 * M;
    for (const bloque of informe.metodologia) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      const lineasBloque = bloque.parrafos.reduce(
        (acc, parrafo) => acc + (doc.splitTextToSize(parrafo, contentW) as string[]).length + 0.3,
        0,
      );
      const altoBloque = 4.6 + lineasBloque * 4.0 + 3;
      ym = ensureSpace(doc, ym, Math.min(altoBloque, 120), informe);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.4);
      doc.setTextColor(...C_DARK);
      doc.text(bloque.titulo, M, ym + 1.5);
      ym += 6;
      for (const parrafo of bloque.parrafos) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor(...C_DARK);
        ym = drawWrapped(doc, parrafo, M, ym, contentW, 4.1, informe) + 1.4;
      }
      ym += 2.5;
    }
  }

  // ── Pie institucional + numeración «Página X de Y» (loop final; la portada
  //    queda libre de numeración visible, §4). Dimensiones SIEMPRE de la
  //    página actual para convivir con las páginas horizontales del Anexo I.
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    const pw = pageW(doc);
    const ph = pageH(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...C_MUTED);
    doc.setDrawColor(...C_RULE);
    doc.setLineWidth(0.15);
    doc.line(M, ph - 12, pw - M, ph - 12);
    doc.text(
      truncar(doc, `${meta.entidadNombre} — ${TITULO_DOC}`, pw * 0.62),
      M,
      ph - 7.5,
    );
    doc.setFont('helvetica', 'bold');
    doc.text(`Página ${p} de ${total}`, pw - M, ph - 7.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  return doc;
}

/** Descarga el informe con el nombre oficial (acción EXPLÍCITA del usuario). */
export async function exportInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<void> {
  const doc = await buildInformeEjecutivoPdf(informe);
  doc.save(informeEjecutivoFileName(informe));
}
