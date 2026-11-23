/**
 * ADNEGOCIO-UI 2026-11-24 · INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y
 * ABASTECIMIENTO — generador del documento oficial (misión Informe Gerencial).
 * ===========================================================================
 * PATRÓN DOCUMENTAL «REPORTE DE ENTREGA» (cash-report-pdf.ts), reutilizado:
 *  · Builder ASÍNCRONO que DEVUELVE el doc: `buildInformeEjecutivoPdf(informe)`
 *    — la vista decide: vista preliminar → doc.output('bloburl') (iframe);
 *    descarga → doc.save(nombre). Misma fuente para ambas salidas: la vista
 *    preliminar ES el documento que se exporta.
 *  · Motor jsPDF con carga DIFERIDA (createPDFDocument de lazy-pdf) —
 *    NUNCA import estático de jspdf/jspdf-autotable (bundle gate W2/W3).
 *  · Tablas con jspdf-autotable (import dinámico): encabezados repetidos en
 *    cada página, rowPageBreak 'avoid', anchos proporcionales y truncado
 *    verificado.
 *  · Gráfico ejecutivo dibujado con primitivas jsPDF (rects + texto) — sin
 *    dependencias nuevas, idéntico en cualquier visor y en impresión.
 *  · Numeración «Página X de Y» al final (loop sobre las hojas reales) y
 *    encabezado institucional en cada página.
 *
 * FUENTE ÚNICA DE CONTENIDO: src/lib/product-comparison/informe.ts
 * (buildInformeEjecutivo) — el PDF NO recalcula ni redacta nada: consume el
 * modelo del documento ya construido por el motor analítico.
 *
 * ARQUITECTURA DEL DOCUMENTO (misión §5):
 *  · Encabezado ejecutivo (página 1): entidad, título, períodos, elaboración.
 *  · 1. Diagnóstico ejecutivo: situación general + conclusión gerencial +
 *    indicadores relevantes + gráfico comparativo.
 *  · 2. Prioridades y decisiones: matriz ejecutiva (nivel fundamentado).
 *  · 3. Análisis complementario: secciones compactas solo si aportan valor.
 *  · Anexos I (ranking completo), II (disponibilidad y cobertura),
 *    III (sin ventas), IV (metodología y fuentes).
 *  · Diseño editorial: blanco, paleta sobria, jerarquía tipográfica clara,
 *    sin grandes bloques de texto ni repeticiones.
 */

import { format } from 'date-fns';
import type { jsPDF } from 'jspdf';
import type { CellHook } from 'jspdf-autotable';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import type {
  InformeEjecutivo,
  InformePrioridad,
  InformeTabla,
} from '@/lib/product-comparison/informe';

// Paleta editorial de impresión (sobria: blanco, grafito, acentos discretos)
const C_DARK: [number, number, number] = [31, 41, 55];       // grafito (texto)
const C_BLACK: [number, number, number] = [17, 17, 17];      // títulos
const C_MUTED: [number, number, number] = [107, 114, 128];   // secundario
const C_BORDER: [number, number, number] = [203, 213, 225];  // líneas
const C_HEADER_BG: [number, number, number] = [241, 245, 249];
const C_BAND: [number, number, number] = [249, 250, 251];    // banda suave
const C_ALTA_BG: [number, number, number] = [250, 232, 229];
const C_ALTA_TX: [number, number, number] = [153, 42, 27];
const C_MEDIA_BG: [number, number, number] = [250, 240, 219];
const C_MEDIA_TX: [number, number, number] = [146, 104, 14];
const C_PREV_BG: [number, number, number] = [233, 237, 241];
const C_PREV_TX: [number, number, number] = [68, 81, 91];
const C_BAR_ANT: [number, number, number] = [191, 199, 209]; // barra tramo anterior
const C_BAR_ACT: [number, number, number] = [31, 78, 121];   // barra período actual (azul sobrio)

const fmtCup = (n: number): string =>
  `${n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Número compacto para etiquetas del gráfico (1,53 M / 74,7 k / 300). */
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CU', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('es-CU', { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString('es-CU', { maximumFractionDigits: 0 });
}

/** Truncado con «…» verificado por ancho real (misma regla del reporte de caja). */
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

// ── Utilidades de página ─────────────────────────────────────────────────────

const M = 15;                 // margen lateral (mm)
const BOTTOM_RESERVE = 18;    // reserva del pie (mm)
const PAGE_TOP_CONT = 17;     // alto del encabezado de páginas continuas

function drawContinuationHeader(doc: jsPDF, informe: InformeEjecutivo): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_BLACK);
  doc.text('Informe Ejecutivo de Desempeño Comercial y Abastecimiento', M, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  doc.text(informe.meta.entidadNombre, pw - M, 9, { align: 'right' });
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.line(M, 12, pw - M, 12);
}

/** Necesita espacio antes de dibujar un bloque de altura `need` (mm). */
function ensureSpace(doc: jsPDF, y: number, need: number, informe: InformeEjecutivo): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + need <= ph - BOTTOM_RESERVE) return y;
  doc.addPage();
  drawContinuationHeader(doc, informe);
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
  const ph = doc.internal.pageSize.getHeight();
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (y + lineH > ph - BOTTOM_RESERVE) {
      doc.addPage();
      drawContinuationHeader(doc, informe);
      y = PAGE_TOP_CONT;
    }
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
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
  const pw = doc.internal.pageSize.getWidth();
  const contentW = pw - 2 * M;
  autoTable(doc, {
    startY,
    head: [opts.head],
    body: opts.body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: opts.fontSize ?? 7.8,
      cellPadding: 1.6,
      lineColor: C_BORDER,
      lineWidth: 0.15,
      textColor: C_DARK,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: C_HEADER_BG,
      textColor: C_BLACK,
      fontStyle: 'bold',
      fontSize: (opts.fontSize ?? 7.8) - 0.3,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: C_BAND },
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
    ...(opts.didParseCell ? { didParseCell: opts.didParseCell } : {}),
  });
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  return docAny.lastAutoTable?.finalY ?? startY;
}

/** Encabezado de sección numerado (jerarquía editorial). */
function drawSectionTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo): number {
  const pw = doc.internal.pageSize.getWidth();
  let yy = ensureSpace(doc, y, 12, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo, M, yy);
  doc.setDrawColor(...C_BLACK);
  doc.setLineWidth(0.4);
  doc.line(M, yy + 1.8, pw - M, yy + 1.8);
  return yy + 7;
}

/** Subtítulo (secciones internas — jerarquía secundaria). */
function drawSubTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo): number {
  let yy = ensureSpace(doc, y, 9, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.6);
  doc.setTextColor(...C_DARK);
  doc.text(titulo, M, yy);
  return yy + 5;
}

/** Párrafo de sección (texto normal envuelto, interlineado cómodo). */
function drawParrafo(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(...C_DARK);
  return drawWrapped(doc, texto, M, y, doc.internal.pageSize.getWidth() - 2 * M, 4.7, informe) + 1.5;
}

// ── Gráfico ejecutivo (barras horizontales comparativas — primitivas jsPDF) ──

function drawGrafico(doc: jsPDF, informe: InformeEjecutivo, y0: number): number {
  const g = informe.grafico;
  if (!g) return y0;
  const pw = doc.internal.pageSize.getWidth();
  const contentW = pw - 2 * M;
  const labelW = contentW * 0.30;
  const barArea = contentW - labelW - 16; // reserva para la etiqueta de valor
  const maxVal = Math.max(...g.series.flatMap((s) => [s.anterior, s.actual]), 1);
  const barH = 3.4;
  const gapBar = 1.1;
  const gapProd = 2.6;
  const headerH = 5;
  const legendH = 6;
  const alto =
    headerH + g.series.length * (barH * 2 + gapBar + gapProd) - gapProd + legendH + 4;

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

    // Barras: anterior (gris) y actual (azul sobrio), escala común.
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
      colWidths: [0.11, 0.17, 0.36, 0.36],
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

// ── Secciones de tablas (complementarias y anexos) ───────────────────────────

async function drawSeccionTabla(
  doc: jsPDF,
  tabla: InformeTabla,
  informe: InformeEjecutivo,
  y0: number,
  opts: { colWidths?: number[]; aligns?: Array<'left' | 'right' | 'center'>; fontSize?: number } = {},
): Promise<number> {
  let y = y0;
  y = drawSubTitle(doc, tabla.titulo, y, informe);
  if (tabla.intro) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, tabla.intro, M, y, doc.internal.pageSize.getWidth() - 2 * M, 3.9, informe) + 1;
  }
  if (tabla.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.4);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, 'Sin casos en este período.', M, y, doc.internal.pageSize.getWidth() - 2 * M, 4.2, informe) + 2;
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
    doc.setFontSize(7.2);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, `Nota: ${tabla.nota}`, M, y + 1.5, doc.internal.pageSize.getWidth() - 2 * M, 3.6, informe) + 1.5;
  }
  return y + 3;
}

// ── Builder principal ────────────────────────────────────────────────────────

export async function buildInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - 2 * M;
  const { meta } = informe;

  const f = (iso: string): string => {
    const [yy, mm, dd] = iso.split('-');
    return yy && mm && dd ? `${dd}/${mm}/${yy}` : iso;
  };

  // ── ENCABEZADO INSTITUCIONAL (página 1) ──
  doc.setFillColor(...C_HEADER_BG);
  doc.rect(M, 12, contentW, 30, 'F');
  doc.setDrawColor(...C_BLACK);
  doc.setLineWidth(0.5);
  doc.rect(M, 12, contentW, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(meta.entidadNombre.toUpperCase(), M + 4, 19);

  doc.setFontSize(12.5);
  doc.setTextColor(...C_BLACK);
  doc.text(truncar(doc, 'Informe Ejecutivo de Desempeño Comercial y Abastecimiento', contentW - 8), M + 4, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...C_DARK);
  doc.text(
    `Elaborado: ${format(new Date(meta.generadoEl), 'dd/MM/yyyy HH:mm')}   ·   Ámbito: ${meta.ambito}`,
    M + 4,
    32.5,
  );
  doc.text(
    `Período analizado: ${f(meta.periodoActual.desde)} a ${f(meta.periodoActual.hasta)} (${meta.diasPeriodo} días)   ·   Período comparativo: ${f(meta.periodoComparacion.desde)} a ${f(meta.periodoComparacion.hasta)}`,
    M + 4,
    38,
  );

  let y = 44;

  // ── 1. DIAGNÓSTICO EJECUTIVO ──
  y = drawSectionTitle(doc, '1. Diagnóstico ejecutivo', y, informe);
  y = drawSubTitle(doc, 'Situación general', y, informe);
  for (const parrafo of informe.situacionGeneral) {
    y = drawParrafo(doc, parrafo, y, informe);
    y += 0.5;
  }

  // Conclusión gerencial destacada (banda editorial sobria)
  {
    const lines = doc.splitTextToSize(informe.conclusionGerencial, contentW - 8) as string[];
    const altoBanda = lines.length * 4.4 + 6;
    y = ensureSpace(doc, y + 1, altoBanda + 3, informe);
    doc.setFillColor(...C_BAND);
    doc.rect(M, y, contentW, altoBanda, 'F');
    doc.setDrawColor(...C_BAR_ACT);
    doc.setLineWidth(0.8);
    doc.line(M, y, M, y + altoBanda);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_BAR_ACT);
    doc.text('CONCLUSIÓN GERENCIAL', M + 4, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(...C_DARK);
    let yc = y + 9;
    for (const line of lines) {
      doc.text(line, M + 4, yc);
      yc += 4.4;
    }
    y += altoBanda + 4;
  }

  // Indicadores relevantes
  y = drawSubTitle(doc, 'Indicadores relevantes', y, informe);
  y = await drawTabla(
    doc,
    {
      head: ['Indicador', 'Valor'],
      body: informe.indicadores.map((i) => [i.label, i.value]),
      colWidths: [0.62, 0.38],
      aligns: ['left', 'right'],
      fontSize: 7.9,
    },
    informe,
    y,
  );
  y += 5;

  // Gráfico ejecutivo
  y = drawSubTitle(doc, 'Comportamiento comparado de los productos principales', y, informe);
  if (informe.grafico) {
    y = drawGrafico(doc, informe, y);
  } else {
    y = drawParrafo(doc, 'Sin datos suficientes para construir el gráfico comparativo en este período.', y, informe);
  }

  // ── 2. PRIORIDADES Y DECISIONES ──
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
    y += 5;
  }

  // ── 3. ANÁLISIS COMPLEMENTARIO ──
  if (informe.complementarias.length > 0) {
    y = drawSectionTitle(doc, '3. Análisis complementario', y, informe);
    for (const tabla of informe.complementarias) {
      y = await drawSeccionTabla(doc, tabla, informe, y);
    }
  }

  // ── ANEXOS ──
  y = drawSectionTitle(doc, 'Anexos', y, informe);
  y = drawParrafo(
    doc,
    'El detalle completo que respalda las decisiones se presenta en los anexos: ranking comparativo, disponibilidad y cobertura, productos sin ventas y metodología con las fuentes y limitaciones del análisis.',
    y,
    informe,
  );
  y += 1.5;

  // Anexo I — anchos ajustados a 10 columnas
  const anexoI = informe.anexos[0];
  if (anexoI) {
    y = await drawSeccionTabla(doc, anexoI, informe, y, {
      colWidths: [0.09, 0.21, 0.06, 0.06, 0.11, 0.11, 0.10, 0.08, 0.09, 0.09],
      aligns: ['left', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right'],
      fontSize: 6.8,
    });
  }
  // Anexo II
  const anexoII = informe.anexos[1];
  if (anexoII) {
    y = await drawSeccionTabla(doc, anexoII, informe, y, {
      colWidths: [0.20, 0.12, 0.13, 0.13, 0.14, 0.28],
      aligns: ['left', 'right', 'right', 'right', 'left', 'left'],
      fontSize: 7.0,
    });
  }
  // Anexo III
  const anexoIII = informe.anexos[2];
  if (anexoIII) {
    y = await drawSeccionTabla(doc, anexoIII, informe, y, {
      colWidths: [0.16, 0.13, 0.12, 0.11, 0.11, 0.37],
      aligns: ['left', 'left', 'right', 'right', 'right', 'left'],
      fontSize: 7.0,
    });
  }

  // Anexo IV — metodología y fuentes. Cada bloque se mantiene COMPLETO en una
  // página (se mide antes de dibujar): evita títulos huérfanos y páginas casi
  // vacías al final del documento (regla editorial de la misión §7).
  y = drawSubTitle(doc, 'Anexo IV. Metodología y fuentes', y, informe);
  for (const bloque of informe.metodologia) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const lineasBloque = bloque.parrafos.reduce(
      (acc, parrafo) => acc + (doc.splitTextToSize(parrafo, contentW) as string[]).length + 0.3,
      0,
    );
    const altoBloque = 4.6 + lineasBloque * 4.0 + 2;
    y = ensureSpace(doc, y, Math.min(altoBloque, 120), informe);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...C_DARK);
    doc.text(bloque.titulo, M, y);
    y += 4.6;
    for (const parrafo of bloque.parrafos) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...C_DARK);
      y = drawWrapped(doc, parrafo, M, y, contentW, 4.0, informe) + 1.2;
    }
    y += 2;
  }

  // ── Pie institucional + numeración «Página X de Y» (loop final) ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...C_MUTED);
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.15);
    doc.line(M, ph - 11, pw - M, ph - 11);
    doc.text(
      `${meta.entidadNombre} — Informe Ejecutivo de Desempeño Comercial y Abastecimiento`,
      M,
      ph - 7,
    );
    doc.text(`Página ${p} de ${total}`, pw - M, ph - 7, { align: 'right' });
  }

  return doc;
}

/** Descarga el informe con el nombre oficial (acción EXPLÍCITA del usuario). */
export async function exportInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<void> {
  const doc = await buildInformeEjecutivoPdf(informe);
  doc.save(informeEjecutivoFileName(informe));
}
