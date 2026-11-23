/**
 * ADNEGOCIO-UI 2026-11-23 · INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS
 * — generador del documento oficial (misión Comparar Productos §3-§6).
 * ===========================================================================
 * PATRÓN DOCUMENTAL «REPORTE DE ENTREGA» (cash-report-pdf.ts), reutilizado:
 *  · Builder ASÍNCRONO que DEVUELVE el doc: `buildInformeEjecutivoPdf(ctx)`
 *    — la vista decide: vista previa → doc.output('bloburl') (iframe);
 *    descarga → doc.save(nombre). Misma fuente para ambas salidas.
 *  · Motor jsPDF con carga DIFERIDA (createPDFDocument de lazy-pdf) —
 *    NUNCA import estático de jspdf/jspdf-autotable (bundle gate W2/W3).
 *  · Tablas con jspdf-autotable (import dinámico): encabezados repetidos
 *    en cada página, `rowPageBreak: 'avoid'`, anchos proporcionales al
 *    ancho útil y truncado verificado — mismas reglas del reporte de caja.
 *  · Flecha vectorial del período (drawTextWithArrow) — U+2192 no existe en
 *    WinAnsi; el gráfico es idéntico en pantalla, impresión y cualquier visor.
 *  · Numeración «Página X de Y» al final (loop sobre las hojas reales).
 *
 * FUENTE ÚNICA DE CONTENIDO: src/lib/product-comparison/informe.ts
 * (buildInformeEjecutivo) — el PDF NO recalcula ni redacta nada: consume el
 * mismo informe que ve el usuario en pantalla. Cero fórmulas duplicadas.
 */

import { format } from 'date-fns';
import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import type {
  InformeEjecutivo,
  InformeHallazgo,
} from '@/lib/product-comparison/informe';
import type { ComparisonRow } from '@/lib/product-comparison/compare';

// Paleta de impresión (misma doctrina «impresión económica» del sistema)
const C_DARK: [number, number, number] = [17, 24, 39];
const C_BLACK: [number, number, number] = [0, 0, 0];
const C_MUTED: [number, number, number] = [107, 114, 128];
const C_BORDER: [number, number, number] = [203, 203, 203];
const C_HEADER_BG: [number, number, number] = [237, 237, 237];

const fmtCup = (n: number): string =>
  `${n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  return `Informe_Ejecutivo_Comparacion_Productos_${tienda}_${format(new Date(informe.meta.generadoEl), 'yyyyMMdd_HHmm')}.pdf`;
}

// ── Utilidades de página ─────────────────────────────────────────────────────

const M = 14;                 // margen lateral (mm)
const BOTTOM_RESERVE = 18;    // reserva del pie (mm)
const PAGE_TOP_CONT = 16;     // alto del mini-encabezado de páginas continuas

function drawMiniHeader(doc: jsPDF, informe: InformeEjecutivo): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK);
  doc.text('INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS', M, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  const gen = `Generado: ${format(new Date(informe.meta.generadoEl), 'dd/MM/yyyy HH:mm')}`;
  doc.text(gen, pw - M, 8, { align: 'right' });
  doc.text(informe.meta.entidadNombre, M, 12);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.line(M, 13.5, pw - M, 13.5);
}

/** Necesita espacio antes de dibujar un bloque de altura `need` (mm). */
function ensureSpace(doc: jsPDF, y: number, need: number, informe: InformeEjecutivo): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + need <= ph - BOTTOM_RESERVE) return y;
  doc.addPage();
  drawMiniHeader(doc, informe);
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
      drawMiniHeader(doc, informe);
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
      fontSize: 7.8,
      cellPadding: 1.6,
      lineColor: C_BORDER,
      lineWidth: 0.15,
      textColor: C_DARK,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: C_HEADER_BG,
      textColor: C_BLACK,
      fontStyle: 'bold',
      fontSize: 7.4,
      halign: 'center',
    },
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
    // jspdf-autotable repite SOLITO la fila de encabezado en cada página de
    // continuación (comportamiento por defecto) — requisito multipágina.
  });
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  return docAny.lastAutoTable?.finalY ?? startY;
}

/** Encabezado de sección (título numerado + línea). */
function drawSectionTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo): number {
  const pw = doc.internal.pageSize.getWidth();
  let yy = ensureSpace(doc, y, 12, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo.toUpperCase(), M, yy);
  doc.setDrawColor(...C_BLACK);
  doc.setLineWidth(0.35);
  doc.line(M, yy + 1.6, pw - M, yy + 1.6);
  return yy + 6;
}

/** Párrafo de sección (texto normal envuelto). */
function drawParrafo(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
  return drawWrapped(doc, texto, M, y, doc.internal.pageSize.getWidth() - 2 * M, 4.6, informe) + 1.5;
}

// ── Tablas por categoría (misión §4: columnas específicas por comportamiento) ─

function variacionPdf(r: ComparisonRow): string {
  if (r.varPct === null) return 'sin base';
  const pct = `${r.varPct > 0 ? '+' : ''}${r.varPct}%`;
  const dif = `${r.difCup > 0 ? '+' : r.difCup < 0 ? '−' : ''}${fmtCup(Math.abs(r.difCup))}`;
  return `${pct} (${dif})`;
}

const posTxt = (p: number | null): string => (p === null ? '—' : String(p));
const cantTxt = (n: number, um: string | null): string => `${n.toLocaleString('es-CU')} ${um ?? 'u'}`;

// ── Builder principal ────────────────────────────────────────────────────────

export async function buildInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - 2 * M;
  const { meta } = informe;

  // ── A. ENCABEZADO (página 1) ──
  doc.setFillColor(...C_HEADER_BG);
  doc.rect(M, 12, contentW, 26, 'F');
  doc.setDrawColor(...C_BLACK);
  doc.setLineWidth(0.4);
  doc.rect(M, 12, contentW, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C_BLACK);
  doc.text(truncar(doc, meta.entidadNombre.toUpperCase(), contentW - 8), M + 4, 20);

  doc.setFontSize(10.5);
  doc.text(meta.titulo, M + 4, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C_DARK);
  doc.text(
    `Generado: ${format(new Date(meta.generadoEl), 'dd/MM/yyyy HH:mm')}   ·   Ámbito: ${meta.ambito}`,
    M + 4,
    32,
  );

  let y = 46;

  // Períodos (A. encabezado — ambos intervalos EXPLÍCITOS, como en la vista):
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C_BLACK);
  doc.text('Período analizado:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${meta.periodoActual.desde} a ${meta.periodoActual.hasta}`, M + 33, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Período de comparación:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${meta.periodoComparacion.desde} a ${meta.periodoComparacion.hasta} (tramo equivalente del mes anterior)`, M + 33, y);

  y += 7;

  // Parámetros y filtros (transparencia metodológica)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...C_MUTED);
  doc.text('Parámetros del análisis:', M, y);
  y += 3.6;
  doc.setFont('helvetica', 'normal');
  for (const p of meta.parametros) {
    y = drawWrapped(doc, `• ${p}`, M, y, contentW, 3.6, informe);
  }

  y += 3;

  // ── B. RESUMEN EJECUTIVO ──
  y = drawSectionTitle(doc, 'Resumen ejecutivo', y, informe);
  y = drawParrafo(doc, informe.resumenEjecutivo.parrafo, y, informe);
  y = await drawTabla(
    doc,
    {
      head: ['Concepto', 'Valor'],
      body: informe.resumenEjecutivo.cifras.map((c) => [c.label, c.value]),
      colWidths: [0.55, 0.45],
      aligns: ['left', 'right'],
    },
    informe,
    y,
  );
  y += 5;

  // Indicadores principales
  if (informe.indicadores.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C_BLACK);
    const need = 8 + informe.indicadores.length * 5;
    y = ensureSpace(doc, y, need, informe);
    doc.text('Indicadores principales', M, y);
    y += 2;
    y = await drawTabla(
      doc,
      {
        head: ['Indicador', 'Valor'],
        body: informe.indicadores.map((c) => [c.label, c.value]),
        colWidths: [0.42, 0.58],
        aligns: ['left', 'left'],
      },
      informe,
      y,
    );
    y += 5;
  }

  // ── C-G. TABLAS POR COMPORTAMIENTO ──
  const S = informe.secciones;

  // 1. Crecimiento y 2. Descenso (misión §4: misma plantilla de columnas)
  for (const sec of [S.crecimiento, S.descenso]) {
    y = drawSectionTitle(doc, sec.titulo, y, informe);
    y = drawParrafo(doc, sec.intro, y, informe);
    if (sec.productos.length === 0) {
      y = drawParrafo(doc, 'Sin casos en este período.', y, informe);
      y += 3;
      continue;
    }
    const body = sec.productos.map((r) => [
      truncar(doc, r.name, contentW * 0.34),
      posTxt(r.posAnterior),
      posTxt(r.posActual),
      fmtCup(r.ventasAnteriores),
      fmtCup(r.ventasActuales),
      variacionPdf(r),
      cantTxt(r.unidadesActuales, r.unidadMedida),
    ]);
    y = await drawTabla(
      doc,
      {
        head: ['Producto', 'Pos. ant.', 'Pos. act.', 'Ventas ant. (CUP)', 'Ventas act. (CUP)', 'Variación', 'Unid. act.'],
        body,
        colWidths: [0.30, 0.08, 0.08, 0.14, 0.14, 0.16, 0.10],
        aligns: ['left', 'center', 'center', 'right', 'right', 'right', 'right'],
      },
      informe,
      y,
    );
    y += 5;
  }

  // 3. Nuevos en el ranking
  y = drawSectionTitle(doc, S.nuevos.titulo, y, informe);
  y = drawParrafo(doc, S.nuevos.intro, y, informe);
  if (S.nuevos.productos.length === 0) {
    y = drawParrafo(doc, 'Sin casos en este período.', y, informe);
  } else {
    const body = [...S.nuevos.productos]
      .sort((a, b) => (a.posActual ?? 99) - (b.posActual ?? 99))
      .map((r) => [
        truncar(doc, r.name, contentW * 0.34),
        r.sku ?? '—',
        posTxt(r.posActual),
        fmtCup(r.ventasActuales),
        cantTxt(r.unidadesActuales, r.unidadMedida),
        'Nuevo en el ranking',
      ]);
    y = await drawTabla(
      doc,
      {
        head: ['Producto', 'Código', 'Pos. act.', 'Ventas act. (CUP)', 'Cantidad vendida', 'Estado'],
        body,
        colWidths: [0.32, 0.12, 0.08, 0.15, 0.17, 0.16],
        aligns: ['left', 'left', 'center', 'right', 'right', 'left'],
      },
      informe,
      y,
    );
  }
  y += 5;

  // 4. Dejaron de venderse
  y = drawSectionTitle(doc, S.dejaronDeVenderse.titulo, y, informe);
  y = drawParrafo(doc, S.dejaronDeVenderse.intro, y, informe);
  if (S.dejaronDeVenderse.productos.length === 0) {
    y = drawParrafo(doc, 'Sin casos en este período.', y, informe);
  } else {
    const body = S.dejaronDeVenderse.productos.map((r) => [
      truncar(doc, r.name, contentW * 0.30),
      posTxt(r.posAnterior),
      fmtCup(r.ventasAnteriores),
      cantTxt(r.unidadesAnteriores, r.unidadMedida),
      '0',
      `Deja de percibir ${fmtCup(r.ventasAnteriores)} CUP${r.posAnterior !== null && r.posAnterior <= 5 ? ' (principal del Top anterior)' : ''}`,
    ]);
    y = await drawTabla(
      doc,
      {
        head: ['Producto', 'Pos. ant.', 'Ventas ant. (CUP)', 'Cant. anterior', 'Ventas act.', 'Impacto'],
        body,
        colWidths: [0.28, 0.08, 0.14, 0.14, 0.09, 0.27],
        aligns: ['left', 'center', 'right', 'right', 'right', 'left'],
      },
      informe,
      y,
    );
  }
  y += 5;

  // 5. Salen del Top
  y = drawSectionTitle(doc, S.salieronDelTop.titulo, y, informe);
  y = drawParrafo(doc, S.salieronDelTop.intro, y, informe);
  if (S.salieronDelTop.productos.length === 0) {
    y = drawParrafo(doc, 'Sin casos en este período.', y, informe);
  } else {
    const body = S.salieronDelTop.productos.map((r) => [
      truncar(doc, r.name, contentW * 0.36),
      posTxt(r.posAnterior),
      fmtCup(r.ventasActuales),
      cantTxt(r.unidadesActuales, r.unidadMedida),
      'Sigue vendiéndose fuera del Top',
    ]);
    y = await drawTabla(
      doc,
      {
        head: ['Producto', 'Pos. ant.', 'Ventas act. (CUP)', 'Unid. act.', 'Estado'],
        body,
        colWidths: [0.36, 0.10, 0.17, 0.17, 0.20],
        aligns: ['left', 'center', 'right', 'right', 'left'],
      },
      informe,
      y,
    );
  }
  y += 5;

  // ── H. HALLAZGOS Y RECOMENDACIONES ──
  y = drawSectionTitle(doc, 'Hallazgos y recomendaciones', y, informe);
  y = drawParrafo(
    doc,
    'Cada hallazgo distingue el HECHO comprobado, la EVIDENCIA numérica, la POSIBLE implicación comercial (hipótesis de trabajo, no un hecho demostrado) y la ACCIÓN que conviene evaluar.',
    y,
    informe,
  );
  informe.hallazgos.forEach((h: InformeHallazgo, i: number) => {
    y = ensureSpace(doc, y, 26, informe);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C_BLACK);
    const titulo = `${i + 1}. ${h.titulo}`;
    y = drawWrapped(doc, titulo, M, y, contentW, 4.4, informe);
    y += 0.8;
    const pares: Array<[string, string]> = [
      ['Hecho comprobado:', h.hallazgo],
      ['Evidencia:', h.evidencia],
      ['Posible implicación:', h.implicacion],
      ['Acción a evaluar:', h.accion],
    ];
    for (const [label, texto] of pares) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.setTextColor(...C_DARK);
      const lw = doc.getTextWidth(`${label} `);
      if (y + 4.4 > ph - BOTTOM_RESERVE) {
        doc.addPage();
        drawMiniHeader(doc, informe);
        y = PAGE_TOP_CONT;
      }
      doc.text(label, M, y);
      doc.setFont('helvetica', 'normal');
      y = drawWrapped(doc, texto, M + lw, y, contentW - lw, 4.1, informe);
    }
    y += 2.5;
  });
  y += 1;

  // ── I. CONCLUSIÓN EJECUTIVA ──
  y = drawSectionTitle(doc, 'Conclusión ejecutiva', y, informe);
  for (const parrafo of informe.conclusion) {
    y = drawParrafo(doc, parrafo, y, informe);
    y += 1;
  }

  // ── Pie documental + numeración «Página X de Y» (loop final) ──
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
      `ADNegocio — Informe Ejecutivo de Comparación de Productos · ${meta.entidadNombre}`,
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
