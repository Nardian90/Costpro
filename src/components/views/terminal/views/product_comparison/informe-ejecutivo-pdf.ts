/**
 * ADN-ANALISIS-COMPARAR-PRODUCTOS-EXECUTIVE-PDF-001 (2026-11-26)
 * INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS — rediseño ejecutivo premium.
 * ===========================================================================
 * Evolución del sistema editorial CP-PDF-EXECUTIVE-REPORT-001 (PR #1702/#1705):
 * se conserva el mecanismo probado (jsPDF + jspdf-autotable con carga diferida
 * vía createPDFDocument/lazy-pdf; mismas DOS salidas: vista preliminar bloburl
 * y descarga) y se eleva a estándar de inteligencia empresarial:
 *
 *  · TIPOGRAFÍA (§7): portada 26 pt, indicadores protagonistas 26 pt,
 *    secciones 17.5 pt, subtítulos 12.5 pt, cuerpo 11.3 pt, auxiliar 9.8 pt,
 *    notas 9 pt, tablas 10.5 pt — legible también para personas mayores.
 *  · GRÁFICOS ANALÍTICOS (§4) con TOKENS del gráfico de referencia de Estados
 *    Financieros «Evolución acumulada de ventas» (SalesRhythmDashboard /
 *    chart-theme.ts CHART_THEME_LIGHT — coherencia estética entre módulos):
 *      A · barras horizontales agrupadas (anterior vs. actual, valores al
 *          final de cada barra, marcador de tendencia por producto),
 *      B · divergente de variaciones (incrementos/reducciones, «nuevo» sin %),
 *      C · cobertura estimada en días con umbrales D/2 y D y etiqueta textual
 *          de estado (nunca solo color, §7).
 *    Representación vectorial jsPDF (sin rasterización); cero series
 *    inventadas: si la fuente no da evolución diaria, NO se simula (§4.D).
 *  · PORTADA EJECUTIVA (§3): ficha institucional, dashboard de indicadores con
 *    jerarquía, banda del líder y «La situación en un minuto» (resumen
 *    gerencial <1 min), índice con páginas e ENLACES internos.
 *  · NARRATIVA (§5): el diagnóstico responde ¿qué ocurrió / qué riesgo u
 *    oportunidad / qué decisión se recomienda?; las recomendaciones se
 *    presentan como bloques CRÍTICA-ALTA / MEDIA / PREVENTIVA con evidencia y
 *    acción separados (etiquetas EVIDENCIA E INTERPRETACIÓN / ACCIÓN
 *    RECOMENDADA sobre el contenido real del motor).
 *  · TABLAS (§6): 10.5 pt, cabeceras diferenciadas, filas alternas, anchos
 *    proporcionados; el Anexo I se separa en I-A (ranking comercial) e I-B
 *    (cantidades) para no comprimir columnas; encabezados repetidos en
 *    multipágina y filas que nunca se parten (rowPageBreak 'avoid').
 *  · SEO/DOCUMENTO (§9): metadatos (título/asunto/autor/keywords), marcadores
 *    de navegación (outline), enlaces internos desde el índice y texto 100 %
 *    seleccionable/buscable. Informe privado: sin exposición pública.
 *
 * INTEGRIDAD (§10): la única fuente de contenido sigue siendo
 * src/lib/product-comparison/informe.ts (buildInformeEjecutivo): este
 * generador NO recalcula ni redacta nada; las extensiones del motor
 * (variaciones, riesgoCobertura, resumenGerencial) son derivaciones de los
 * MISMOS cálculos y evaluaciones existentes.
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
  InformeVariacion,
  InformeCoberturaItem,
} from '@/lib/product-comparison/informe';
import { fmtPctSign } from '@/lib/product-comparison/informe';

// ── Paleta editorial de impresión (estructura del documento) ─────────────────
const C_DARK: [number, number, number] = [31, 41, 55];       // grafito (texto)
const C_BLACK: [number, number, number] = [16, 24, 40];      // títulos
const C_MUTED: [number, number, number] = [100, 116, 139];   // secundario
const C_BORDER: [number, number, number] = [203, 213, 225];  // líneas de tabla
const C_RULE: [number, number, number] = [148, 163, 184];    // reglas editoriales
const C_SEPARADOR: [number, number, number] = [226, 232, 240]; // línea suave entre productos (slate-200)
const C_HEADER_BG: [number, number, number] = [238, 242, 247];
const C_BAND: [number, number, number] = [248, 250, 252];    // banda suave
const C_STRIPE: [number, number, number] = [239, 243, 247];  // fila alternada (contraste visible)
const C_ACCENT: [number, number, number] = [31, 78, 121];    // azul institucional
const C_WHITE: [number, number, number] = [255, 255, 255];

// ── Tokens de gráficos — REUTILIZADOS del gráfico de referencia de Estados
//    Financieros (src/lib/sales-dashboard/chart-theme.ts · CHART_THEME_LIGHT):
//    series[0] #15803d (período actual), axis #475569 (tramo comparable),
//    negative #dc2626 (reducciones), grid #cbd5e1, series[2] #b45309
//    (moderada). Un único idioma visual entre módulos (misión §2). ──────────
const GR_ACTUAL: [number, number, number] = [21, 128, 61];    // #15803d series[0]
const GR_ANTERIOR: [number, number, number] = [71, 85, 105];  // #475569 axis
const GR_NEGATIVO: [number, number, number] = [220, 38, 38];  // #dc2626 negative
const GR_GRID: [number, number, number] = [203, 213, 225];    // #cbd5e1 grid
const GR_MODERADA: [number, number, number] = [180, 83, 9];   // #b45309 series[2]
const GR_SIN_DATO: [number, number, number] = [148, 163, 184];// slate auxiliar

// Estados de cobertura (color + etiqueta textual SIEMPRE visible, §7).
// ADNEGOCIO-PDF-REPORT-POLISH-002 §1: correspondencia visual INEQUÍVOCA —
// cada clasificación con su propio color de los tokens reutilizados de
// Estados Financieros (NINGÚN color nuevo): agotado = negative #dc2626,
// insuficiente = moderada #b45309 (riesgo alto), moderada = axis #475569
// (vigilancia), baja rotación = series[0] #15803d (sin riesgo inmediato),
// sin movimiento / sin dato = slate auxiliar (sin información).
const ESTADO_COBERTURA: Record<InformeCoberturaItem['estado'], { etiqueta: string; color: [number, number, number] }> = {
  agotado: { etiqueta: 'AGOTADO', color: GR_NEGATIVO },
  cobertura_insuficiente: { etiqueta: 'Cobertura insuficiente', color: GR_MODERADA },
  cobertura_moderada: { etiqueta: 'Cobertura moderada', color: GR_ANTERIOR },
  baja_rotacion: { etiqueta: 'Baja rotación', color: GR_ACTUAL },
  sin_movimiento: { etiqueta: 'Sin movimiento', color: GR_SIN_DATO },
  sin_dato: { etiqueta: 'Sin dato suficiente', color: GR_SIN_DATO },
};

// Prioridades (misma semántica del motor; presentación por bloques).
const PRIORIDAD_TXT: Record<InformePrioridad['nivel'], string> = {
  alta: 'ALTA',
  media: 'MEDIA',
  preventiva: 'PREVENTIVA',
};
const PRIORIDAD_COLOR: Record<InformePrioridad['nivel'], { bg: [number, number, number]; tx: [number, number, number] }> = {
  alta: { bg: [254, 226, 226], tx: [153, 27, 27] },
  media: { bg: [254, 243, 199], tx: [146, 104, 14] },
  preventiva: { bg: [233, 237, 241], tx: [68, 81, 91] },
};
const GRUPO_PRIORIDAD: Record<InformePrioridad['nivel'], { titulo: string; descripcion: string }> = {
  alta: { titulo: 'CRÍTICA / ALTA', descripcion: 'Interrupciones comerciales relevantes y riesgos inmediatos de disponibilidad.' },
  media: { titulo: 'MEDIA', descripcion: 'Seguimiento, reposición anticipada o revisión de condiciones comerciales.' },
  preventiva: { titulo: 'PREVENTIVA', descripcion: 'Baja rotación, acumulación de inventario y oportunidades de optimización.' },
};

// ── Sistema tipográfico (§7) ─────────────────────────────────────────────────
const T_PORTADA = 26;        // título principal (24-30)
const T_PORTADA_SUB = 12.5;
const T_HERO_VALOR = 26;     // indicadores protagonistas (22-30)
const T_CIFRA = 16.5;        // cifras de grupos
const T_SECCION = 17.5;      // títulos de sección (17-20)
const T_SUBTITULO = 12.5;    // subtítulos
const T_CUERPO = 11.3;       // texto general (~12)
const LH_CUERPO = 5.9;
const T_AUX = 9.8;           // secundario
const LH_AUX = 4.9;
const T_NOTA = 9.0;          // notas (nunca < 9 pt)
const LH_NOTA = 4.3;
const T_TABLA = 10.5;        // contenido de tablas (mínimo 10.5-11)
const T_TABLA_HEAD = 10.2;
const T_FOOT = 8.2;

// ── Retícula del documento (A4: 210 × 297 mm) ────────────────────────────────
const M = 20;                 // márgenes laterales
const BOTTOM_RESERVE = 22;    // reserva inferior (pie incluido)
const PAGE_TOP_CONT = 26;     // inicio de contenido en páginas continuas
const TITULO_DOC = 'Informe Ejecutivo de Desempeño Comercial y Abastecimiento';
const TITULO_SEO = 'Informe ejecutivo de comparación de productos';

const fmtCup = (n: number): string =>
  `${n.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Número compacto para etiquetas de gráfico (1,53 M / 74,7 k / 300). */
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CU', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('es-CU', { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString('es-CU', { maximumFractionDigits: 0 });
}

/** Días compactos para la escala del gráfico de cobertura (30 d / 1,5 k d). */
function fmtDias(n: number): string {
  return `${fmtCompact(n)} d`;
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

/** Encabezado institucional de páginas continuas. */
function drawContinuationHeader(doc: jsPDF, informe: InformeEjecutivo): void {
  const pw = pageW(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C_BLACK);
  doc.text(TITULO_DOC, M, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...C_MUTED);
  doc.text(informe.meta.entidadNombre, pw - M, 12, { align: 'right' });
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.25);
  doc.line(M, 16.5, pw - M, 16.5);
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

/**
 * Anchos automáticos por contenido (ADN-ANALISIS-…-PDF-001 §6): mide el texto
 * natural de cada columna (cabecera + celdas) y reparte el ancho proporcional-
 * mente con cotas mín/máx. Evita que montos y cabeceras se partan a mitad de
 * dígito cuando el motor no define anchos propios. Es SOLO presentación: no
 * altera ningún cálculo del motor (§10).
 */
function anchosAuto(
  doc: jsPDF,
  head: string[],
  body: string[][],
  contentW: number,
): number[] {
  const PAD = 2.6;   // aire de celda (no infla el reparto)
  const headFs = T_TABLA - 0.3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headFs); // medir como se dibuja la cabecera (bold)
  const natural = head.map((h) => Math.min(doc.getTextWidth(h) + PAD, contentW * 0.32));
  doc.setFont('helvetica', 'normal');
  for (const fila of body) {
    fila.forEach((celda, i) => {
      if (i >= natural.length) return;
      const w = doc.getTextWidth(String(celda));
      // Celdas largas (descripciones/lecturas) no elevan la natural por encima
      // del cap: se envuelven dentro de su columna.
      natural[i] = Math.max(natural[i], Math.min(w + PAD, contentW * 0.32));
    });
  }
  const min = contentW * 0.05;
  const aj = natural.map((w) => Math.max(w, min));
  const suma = aj.reduce((s, w) => s + w, 0);
  const prop = aj.map((w) => w / suma);
  // Normalizar a 1 con cotas: mínimo 5 %, máximo 32 %.
  const clamp = prop.map((v) => Math.min(Math.max(v, 0.05), 0.32));
  const sumaClamp = clamp.reduce((s, v) => s + v, 0);
  return clamp.map((v) => v / sumaClamp);
}

/** Altura estimada (mm) de un texto envuelto a ancho fijo. */
function alturaTexto(doc: jsPDF, text: string, maxWidth: number, lineH: number): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  return lines.length * lineH;
}

/** Párrafo de cuerpo (11.3 pt — estándar §7 para lectura prolongada). */
function drawParrafo(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(T_CUERPO);
  doc.setTextColor(...C_DARK);
  return drawWrapped(doc, texto, M, y, pageW(doc) - 2 * M, LH_CUERPO, informe) + 2.5;
}

/** Párrafo auxiliar (9.8 pt: introducciones y contexto). */
function drawAuxiliar(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(T_AUX);
  doc.setTextColor(...C_MUTED);
  return drawWrapped(doc, texto, M, y, pageW(doc) - 2 * M, LH_AUX, informe) + 2;
}

/** Nota al pie de bloque (9 pt mín., §7). */
function drawNota(doc: jsPDF, texto: string, y: number, informe: InformeEjecutivo): number {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(T_NOTA);
  doc.setTextColor(...C_MUTED);
  return drawWrapped(doc, texto, M, y + 1.6, pageW(doc) - 2 * M, LH_NOTA, informe) + 2;
}

/** Título de sección numerado (17.5 pt + regla de acento). Guarda
 *  anti-huérfanos: `need` reserva el título MÁS el primer bloque. */
function drawSectionTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo, need = 58): number {
  const pw = pageW(doc);
  const yy = ensureSpace(doc, y, need, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(T_SECCION);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo, M, yy + 4.5);
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.7);
  doc.line(M, yy + 7.2, pw - M, yy + 7.2);
  return yy + 13;
}

/** Subtítulo interno (12.5 pt bold grafito). Guarda anti-huérfanos. */
function drawSubTitle(doc: jsPDF, titulo: string, y: number, informe: InformeEjecutivo, need = 18): number {
  const yy = ensureSpace(doc, y, need, informe);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(T_SUBTITULO);
  doc.setTextColor(...C_DARK);
  doc.text(titulo, M, yy + 2.2);
  return yy + 8.5;
}

// ── Tablas (autoTable dinámico — encabezados repetidos en multipágina) ───────

interface TablaOpts {
  head: string[];
  body: string[][];
  colWidths: number[];   // proporciones (suman 1)
  aligns: Array<'left' | 'right' | 'center'>;
  fontSize?: number;
  headFontSize?: number;
  cellPadding?: number;
  didParseCell?: CellHook;
  /**
   * Columnas numéricas SIN puntos de ruptura natural (montos, porcentajes,
   * velocidades): si la celda no cabe, se reduce SOLO su tamaño de fuente
   * (mínimo 7.6 pt) antes de partir un dígito — la cifra exacta se conserva
   * íntegra y legible (§10-§11). Última instancia tras el reparto de anchos.
   */
  fitColumnos?: number[];
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
  // (ABSOLUTO y fiable) dentro de didDrawPage (lección de los escenarios E/F).
  const paginasConHeader = new Set<number>([doc.getCurrentPageInfo().pageNumber]);
  autoTable(doc, {
    startY,
    head: [opts.head],
    body: opts.body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: opts.fontSize ?? T_TABLA,
      cellPadding: opts.cellPadding ?? 2.1,
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
      fontSize: opts.headFontSize ?? (opts.fontSize ?? T_TABLA) - 0.3,
      lineWidth: 0.2,
      lineColor: C_RULE,
      valign: 'middle',
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
      // Encabezado institucional en las páginas de CONTINUACIÓN de la tabla.
      const pn = doc.getCurrentPageInfo().pageNumber;
      if (!paginasConHeader.has(pn)) {
        drawContinuationHeader(doc, informe);
        paginasConHeader.add(pn);
      }
    },
    // El ajuste tipográfico de columnas numéricas DEBE ejecutarse en
    // didParseCell (antes del cálculo de saltos de línea del autotable): en
    // willDrawCell el texto ya viene envuelto y reducir la fuente no repara
    // el corte del dígito. Si la llamada aporta su propio didParseCell, se
    // encadenan ambos (fit primero, decoración después).
    ...((opts.fitColumnos && opts.fitColumnos.length > 0) || opts.didParseCell
      ? {
          didParseCell: (data: Parameters<CellHook>[0]) => {
            if (data.row.section === 'head' && opts.fitColumnos?.includes(data.column.index)) {
              // La cabecera no debe partir palabras ('Existenci/a'): mismo
              // mecanismo de ajuste, con base en el tamaño de cabecera.
              const raw = String(data.cell.raw ?? '');
              if (raw) {
                const wCol =
                  (opts.colWidths[data.column.index] ?? 1 / opts.head.length) * (pageW(doc) - 2 * M)
                  - 2 * (opts.cellPadding ?? 2.1);
                let fs = opts.headFontSize ?? (opts.fontSize ?? T_TABLA) - 0.3;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(fs);
                while (fs > 8.4 && doc.getTextWidth(raw) > wCol) {
                  fs -= 0.2;
                  doc.setFontSize(fs);
                }
                data.cell.styles.fontSize = fs;
              }
            }
            if (data.row.section === 'body' && opts.fitColumnos?.includes(data.column.index)) {
              const raw = String(data.cell.raw ?? '');
              if (raw) {
                const wCol =
                  (opts.colWidths[data.column.index] ?? 1 / opts.head.length) * (pageW(doc) - 2 * M)
                  - 2 * (opts.cellPadding ?? 2.1);
                let fs = opts.fontSize ?? T_TABLA;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(fs);
                while (fs > 7.6 && doc.getTextWidth(raw) > wCol) {
                  fs -= 0.3;
                  doc.setFontSize(fs);
                }
                data.cell.styles.fontSize = fs;
              }
            }
            opts.didParseCell?.(data);
          },
        }
      : {}),
  });
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  return docAny.lastAutoTable?.finalY ?? startY;
}

// ── Marcadores y metadatos (§9) ──────────────────────────────────────────────

interface SeccionNavegable {
  titulo: string;
  pagina: number;
}

function registrarSeccion(secciones: SeccionNavegable[], titulo: string, doc: jsPDF): void {
  secciones.push({ titulo, pagina: doc.getCurrentPageInfo().pageNumber });
}

function aplicarMetadatos(doc: jsPDF, informe: InformeEjecutivo): void {
  const { meta } = informe;
  doc.setProperties({
    title: `${TITULO_SEO} — ${meta.entidadNombre}`,
    subject: `${TITULO_DOC} · ${meta.periodoActual.desde} a ${meta.periodoActual.hasta} vs. ${meta.periodoComparacion.desde} a ${meta.periodoComparacion.hasta}`,
    author: 'ADNegocio (CostPro)',
    keywords: 'comparación de productos, ventas, inventario, cobertura, desabastecimiento, informe ejecutivo, inteligencia comercial, CUP',
    creator: 'ADNegocio — plataforma CostPro',
  });
}

function aplicarMarcadores(doc: jsPDF, secciones: SeccionNavegable[]): void {
  try {
    for (const s of secciones) {
      doc.outline.add(null, s.titulo, { pageNumber: s.pagina });
    }
  } catch {
    // El outline es un enriquecimiento: si el visor no lo soporta, el documento
    // sigue siendo válido y navegable por el índice con enlaces internos.
  }
}

/** Fila del índice de portada: numeral + título con ENLACE interno a la página. */
function drawIndiceFila(
  doc: jsPDF,
  numeral: string,
  titulo: string,
  pagina: number | null,
  x: number,
  y: number,
  colW: number,
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...C_ACCENT);
  doc.text(numeral, x, y);
  const wNum = doc.getTextWidth(numeral);
  const texto = truncar(doc, titulo, colW - wNum - 9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C_DARK);
  if (pagina !== null) {
    doc.textWithLink(texto, x + wNum + 2, y, { pageNumber: pagina });
  } else {
    doc.text(texto, x + wNum + 2, y);
  }
  if (pagina !== null) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C_MUTED);
    doc.text(`${pagina}`, x + colW - 2, y, { align: 'right' });
  }
}

// ── GRÁFICO A · Comparación de ventas por producto (§4.A) ────────────────────
// Barras horizontales AGRUPADAS con los tokens del gráfico de referencia de
// Estados Financieros: tramo comparable en gris pizarra (#475569) y período
// analizado en verde institucional (#15803d). Valores al final de cada barra,
// leyenda diferenciada y marcador de tendencia por producto (▲/▼/●).

function alturaGraficoComparativo(informe: InformeEjecutivo): number {
  const g = informe.grafico;
  if (!g) return 0;
  const barH = 5.0;
  const gapBar = 1.6;
  const gapProd = 5.0; // banda + marcador de tendencia + hairline entre productos
  const headerH = 6;
  const legendH = 7.5;
  const notaH = 11;
  return headerH + g.series.length * (barH * 2 + gapBar + gapProd) - gapProd + legendH + notaH + 4;
}

/**
 * Marcador de tendencia VECTORIAL (glifos ▲/▼/● no existen en WinAnsi y el
 * motor de fuentes estándar los sustituiría por basura — lección 29d185c55):
 * triángulo arriba (verde, sube), abajo (rojo, baja) o punto (gris, estable).
 * Devuelve el ancho total consumido (mm).
 */
function tendenciaMarca(
  doc: jsPDF,
  anterior: number,
  actual: number,
  x: number,
  y: number,
  maxW: number,
): number {
  const dif = actual - anterior;
  const up = dif > 0;
  const down = dif < 0;
  const color = up ? GR_ACTUAL : down ? GR_NEGATIVO : C_MUTED;
  doc.setFillColor(...color);
  if (up) {
    doc.triangle(x, y - 1.3, x + 1.8, y - 1.3, x + 0.9, y - 2.9, 'F');
  } else if (down) {
    doc.triangle(x, y - 2.9, x + 1.8, y - 2.9, x + 0.9, y - 1.3, 'F');
  } else {
    doc.circle(x + 0.9, y - 2, 0.9, 'F');
  }
  const wSim = 2.6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...color);
  const texto = `${dif > 0 ? '+' : dif < 0 ? '-' : ''}${fmtCompact(Math.abs(dif))}`;
  doc.text(truncar(doc, texto, maxW - wSim - 1.5), x + wSim + 1.5, y);
  return wSim + 1.5 + doc.getTextWidth(texto);
}

function drawGraficoComparativo(doc: jsPDF, informe: InformeEjecutivo, y0: number): number {
  const g = informe.grafico;
  if (!g) return y0;
  const contentW = pageW(doc) - 2 * M;
  const labelW = contentW * 0.33;
  const valorReserva = 20;
  const barArea = contentW - labelW - valorReserva;
  const maxVal = Math.max(...g.series.flatMap((s) => [s.anterior, s.actual]), 1);
  const barH = 5.0;
  const gapBar = 1.6;
  const gapProd = 5.0;
  const headerH = 6;
  const legendH = 7.5;
  const notaH = 11;
  const alto = alturaGraficoComparativo(informe);

  const yStart = ensureSpace(doc, y0, alto, informe);

  // Título del gráfico (10.5 pt bold) — nunca huérfano (reserva garantizada).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C_DARK);
  doc.text(g.titulo, M, yStart + 3);

  let y = yStart + headerH + 2.5;
  const H_GRUPO = barH * 2 + gapBar;
  g.series.forEach((s, idx) => {
    // Banda de asociación visual (índices alternos): encierra nombre + ambas
    // barras + marcador de tendencia del MISMO producto — la lectura por
    // producto queda inequívoca (auditoría 2026-11-27, petición del propietario).
    if (idx % 2 === 0) {
      doc.setFillColor(...C_BAND);
      doc.rect(M, y - 1.6, contentW, H_GRUPO + 5.0, 'F');
    }
    // Etiqueta del producto (10 pt, hasta 2 líneas — legibilidad §6/§7).
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C_DARK);
    const nombre = truncar(doc, s.name, labelW - 2);
    const lineasNombre = doc.splitTextToSize(nombre, labelW - 2) as string[];
    doc.text(lineasNombre[0], M, y + barH);
    if (lineasNombre[1]) {
      doc.setFontSize(8.4);
      doc.setTextColor(...C_MUTED);
      doc.text(lineasNombre[1], M, y + barH + 3.4);
    }

    // Barras: escala común del conjunto comparado.
    const wAnt = Math.max((s.anterior / maxVal) * barArea, s.anterior > 0 ? 0.9 : 0);
    const wAct = Math.max((s.actual / maxVal) * barArea, s.actual > 0 ? 0.9 : 0);
    const xBar = M + labelW;
    doc.setFillColor(...GR_ANTERIOR);
    doc.rect(xBar, y, wAnt, barH, 'F');
    doc.setFillColor(...GR_ACTUAL);
    doc.rect(xBar, y + barH + gapBar, wAct, barH, 'F');

    // Valores PEGADOS al extremo de cada barra (§4.A — 1.0 mm desde el fin).
    doc.setFontSize(8.6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C_MUTED);
    if (s.anterior > 0) doc.text(fmtCompact(s.anterior), xBar + wAnt + 1.0, y + barH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.4);
    doc.setTextColor(...GR_ACTUAL);
    if (s.actual > 0) doc.text(fmtCompact(s.actual), xBar + wAct + 1.0, y + barH + gapBar + barH);

    // Marcador de tendencia alineado bajo la etiqueta (▲/▼ + diferencia).
    tendenciaMarca(doc, s.anterior, s.actual, M + 1.5, y + H_GRUPO + 2.4, labelW - 3);

    // Línea separadora SUAVE entre productos (no cruza contenido: nace bajo el
    // marcador de tendencia y muere en la banda siguiente — mismo plano que la
    // banda alterna, delimita sin confundir).
    if (idx < g.series.length - 1) {
      doc.setDrawColor(...C_SEPARADOR);
      doc.setLineWidth(0.2);
      doc.line(M, y + H_GRUPO + 3.4, M + contentW, y + H_GRUPO + 3.4);
    }

    y += H_GRUPO + gapProd;
  });

  // Leyenda claramente diferenciada (§4.A).
  y += 0.6;
  const legY = y + 2.2;
  doc.setFillColor(...GR_ANTERIOR);
  doc.rect(M, legY - 1.8, 4.4, 2.6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);
  doc.setTextColor(...C_DARK);
  doc.text('Tramo comparable (mes anterior)', M + 6, legY);
  const w1 = doc.getTextWidth('Tramo comparable (mes anterior)');
  doc.setFillColor(...GR_ACTUAL);
  doc.rect(M + 6 + w1 + 7, legY - 1.8, 4.4, 2.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Período analizado', M + 6 + w1 + 13.4, legY);

  // Nota metodológica del motor (9 pt mín., §7) + lectura de barras ausentes.
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(T_NOTA);
  doc.setTextColor(...C_MUTED);
  let yn = legY + 5;
  const notaLines = doc.splitTextToSize(
    `${g.nota} La ausencia de una barra indica que el producto no registró ventas en ese período (nuevo en el ranking o que dejó de venderse).`,
    contentW,
  ) as string[];
  for (const line of notaLines.slice(0, 3)) {
    doc.text(line, M, yn);
    yn += LH_NOTA;
  }
  return yStart + alto + 3;
}

// ── GRÁFICO B · Variaciones divergentes (§4.B) ───────────────────────────────
// Barras divergentes: incrementos a la derecha (verde), reducciones a la
// izquierda (rojo). Los productos NUEVOS en el ranking se identifican con la
// etiqueta «NUEVO» y NO reciben porcentaje (sin base comparable, §4.D/§10).

function alturaGraficoVariaciones(v: InformeVariacion[]): number {
  if (v.length === 0) return 14;
  const barH = 5.2;
  const gapProd = 4.6; // banda + hairline entre productos
  const headerH = 6;
  const legendH = 13;      // leyenda + línea de escala con etiquetas
  return headerH + v.length * (barH + gapProd) - gapProd + legendH + 4;
}

function drawGraficoVariaciones(doc: jsPDF, informe: InformeEjecutivo, y0: number): number {
  const v = informe.variaciones;
  if (v.length === 0) return y0;
  const contentW = pageW(doc) - 2 * M;
  const labelW = contentW * 0.34;
  const chartW = contentW - labelW - 4;
  // El eje cero deja espacio a la izquierda para las reducciones.
  const maxAbs = Math.max(...v.map((s) => Math.abs(s.difCup)), 1);
  const zeroX = M + labelW + chartW * 0.45;
  const halfPos = chartW * 0.55 - 2;
  const halfNeg = chartW * 0.45 - 2;
  const barH = 5.2;
  const gapProd = 4.6;
  const headerH = 6;
  const alto = alturaGraficoVariaciones(v);

  const yStart = ensureSpace(doc, y0, alto, informe);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C_DARK);
  doc.text('Variación de ingresos por producto (CUP) — mayores movimientos del período', M, yStart + 3);

  let y = yStart + headerH + 2;
  v.forEach((s, idx) => {
    // Banda de asociación visual (índices alternos) — nombre + barra + etiqueta
    // del MISMO producto quedan encerrados (auditoría 2026-11-27).
    if (idx % 2 === 0) {
      doc.setFillColor(...C_BAND);
      doc.rect(M, y - 1.4, contentW, barH + 2.8, 'F');
    }
    // Nombre (10 pt, una línea).
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C_DARK);
    doc.text(truncar(doc, s.name, labelW - 2), M, y + barH);

    // Barra divergente desde el eje cero.
    const w = (Math.abs(s.difCup) / maxAbs) * (s.difCup >= 0 ? halfPos : halfNeg);
    const color = s.difCup >= 0 ? GR_ACTUAL : GR_NEGATIVO;
    doc.setFillColor(...color);
    doc.rect(s.difCup >= 0 ? zeroX : zeroX - Math.max(w, 0.9), y, Math.max(w, 0.9), barH, 'F');

    // Etiqueta de valor: FUERA de la barra cuando cabe; DENTRO (texto blanco)
    // cuando el margen no alcanza — nunca solapada ni cortada (§11).
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    const valor = `${s.difCup > 0 ? '+' : '-'}${fmtCompact(Math.abs(s.difCup))}`;
    const pct = s.varPct !== null && !s.esNuevo ? ` (${fmtPctSign(s.varPct)})` : '';
    const etiqueta = valor + pct;
    const wEt = doc.getTextWidth(etiqueta);
    const espacioDerecho = pageW(doc) - M - (zeroX + w + 1.6);
    const espacioIzquierdo = zeroX - w - 1.6 - (M + labelW);
    if (s.difCup >= 0) {
      if (wEt <= espacioDerecho) {
        doc.setTextColor(...color);
        doc.text(valor, zeroX + w + 1.0, y + barH);
        const wV = doc.getTextWidth(valor);
        if (s.esNuevo) {
          // «Nuevo» se identifica textualmente (nunca % ficticio, §4.D).
          doc.setFillColor(...[254, 243, 199] as [number, number, number]);
          doc.rect(zeroX + w + 1.0 + wV + 2.0, y + barH - 3.6, 13, 4.6, 'F');
          doc.setFontSize(7.6);
          doc.setTextColor(...[146, 104, 14] as [number, number, number]);
          doc.text('NUEVO', zeroX + w + 1.0 + wV + 4.5, y + barH);
        } else if (pct) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.2);
          doc.setTextColor(...C_MUTED);
          doc.text(pct, zeroX + w + 1.0 + wV + 2.0, y + barH);
        }
      } else {
        // Dentro de la barra, alineado al extremo interior (texto blanco).
        doc.setTextColor(...C_WHITE);
        doc.text(etiqueta, zeroX + w - 2, y + barH, { align: 'right' });
      }
    } else {
      if (wEt <= espacioIzquierdo) {
        doc.setTextColor(...color);
        doc.text(etiqueta, zeroX - w - 1.0, y + barH, { align: 'right' });
      } else {
        doc.setTextColor(...C_WHITE);
        doc.text(etiqueta, zeroX - w + 2, y + barH, { align: 'left' });
      }
    }

    // Línea separadora SUAVE entre productos (en el blanco entre bandas —
    // nunca cruza la barra ni la etiqueta de valor).
    if (idx < v.length - 1) {
      doc.setDrawColor(...C_SEPARADOR);
      doc.setLineWidth(0.2);
      doc.line(M, y + barH + 2.3, M + contentW, y + barH + 2.3);
    }

    y += barH + gapProd;
  });

  // Leyenda + línea de escala del eje cero.
  const legY = y + 1.5;
  doc.setFillColor(...GR_ACTUAL);
  doc.rect(M, legY - 1.8, 4.4, 2.6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  doc.setTextColor(...C_DARK);
  doc.text('Incremento', M + 6, legY);
  const w1 = doc.getTextWidth('Incremento');
  doc.setFillColor(...GR_NEGATIVO);
  doc.rect(M + 6 + w1 + 6, legY - 1.8, 4.4, 2.6, 'F');
  doc.text('Reducción', M + 6 + w1 + 12, legY);
  const w2 = doc.getTextWidth('Reducción');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_MUTED);
  doc.text('NUEVO = entra al ranking sin ventas comparables; sin porcentaje (sin base).', M + 6 + w1 + 18 + w2 + 4, legY);

  // Eje cero vertical con su rótulo.
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.3);
  doc.line(zeroX, yStart + headerH, zeroX, y - gapProd + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...C_MUTED);
  doc.text('eje 0', zeroX, yStart + headerH - 1, { align: 'center' });
  return yStart + alto + 3;
}

// ── GRÁFICO C · Disponibilidad y cobertura (§4.C) ────────────────────────────
// Barras horizontales de cobertura estimada en días con UMBRALES D/2 y D (los
// mismos del motor: UMBRAL_COBERTURA_ALTA/BAJA). Agotado, riesgo de
// desabastecimiento y acumulación quedan diferenciados por color Y etiqueta
// textual (§7: nunca solo color). Selección razonable anti-saturación: hasta
// 12 casos por severidad; el detalle completo vive en el Anexo II.

const COBERTURA_MAX_FILAS = 12;

function seleccionCobertura(items: InformeCoberturaItem[]): InformeCoberturaItem[] {
  const orden: InformeCoberturaItem['estado'][] = [
    'agotado',
    'cobertura_insuficiente',
    'cobertura_moderada',
    'baja_rotacion',
    'sin_movimiento',
  ];
  const seleccion: InformeCoberturaItem[] = [];
  for (const estado of orden) {
    const delEstado = items
      .filter((i) => i.estado === estado)
      .sort((a, b) => (a.coberturaDias ?? Number.POSITIVE_INFINITY) - (b.coberturaDias ?? Number.POSITIVE_INFINITY));
    seleccion.push(...delEstado);
  }
  return seleccion.slice(0, COBERTURA_MAX_FILAS);
}

// ADNEGOCIO-PDF-REPORT-POLISH-002 §1 · ARQUITECTURA POR ZONAS:
//   1) columna de nombres; 2) zona de cobertura CUANTITATIVA (barras + escala
//   + umbrales D/2 y D SOLO dentro de esta zona); 3) zona de estados
//   CUALITATIVOS (etiquetas textuales de los casos no calculables, sin
//   posicionarse sobre una escala numérica); 4) escala al pie de la zona
//   cuantitativa; 5) leyenda con SOLO los estados presentes.
// Regla fundamental: las guías D/2 y D nunca atraviesan nombres, etiquetas de
// estado ni textos; se limitan al EXTENSIÓN VERTICAL de las filas cuantitativas
// y cualquier texto que conviva con ellas se dibuja sobre un apagado blanco.
// Caso todo-agotado (ningún valor cuantificable): sin escala, sin umbrales ni
// eje — título y categorías textuales adaptados. Nunca se inventan valores
// para dibujar barras (§4.D).

const COB_BAR_H = 5.0;
const COB_GAP_PROD = 4.0;
const COB_HEADER_H = 6;
const COB_SUB_H = 5.2;    // subtítulo de zona (solo cuando conviven ambas)
const COB_ESCALA_H = 6.8; // eje al pie de la zona cuantitativa

interface ZonasCobertura {
  numericos: InformeCoberturaItem[];
  textuales: InformeCoberturaItem[];
  mixto: boolean;
}

function zonasCobertura(items: InformeCoberturaItem[]): ZonasCobertura {
  const numericos = items.filter((i) => i.coberturaDias !== null && i.coberturaDias > 0);
  const textuales = items.filter((i) => !(i.coberturaDias !== null && i.coberturaDias > 0));
  return { numericos, textuales, mixto: numericos.length > 0 && textuales.length > 0 };
}

function alturaGraficoCobertura(items: InformeCoberturaItem[]): number {
  if (items.length === 0) return 14;
  const { numericos, textuales, mixto } = zonasCobertura(items);
  // Contabilidad IDÉNTICA al dibujo (ADNEGOCIO-PDF-REPORT-POLISH-002):
  // cabecera (título + arranque) 8 + zona cuantitativa (subtítulo si mixto +
  // filas de 9 mm + eje 7.6) + zona cualitativa (subtítulo + filas de 9 mm) +
  // leyenda (2.5 de aire + 3.4 de cuerpo) + aire final 2.0 para la nota.
  let alto = 8;
  if (numericos.length > 0) {
    alto += (mixto ? COB_SUB_H : 0) + numericos.length * (COB_BAR_H + COB_GAP_PROD) + 7.6;
  }
  if (textuales.length > 0) {
    alto += COB_SUB_H + textuales.length * (COB_BAR_H + COB_GAP_PROD);
  }
  return alto + 2.5 + 3.4 + 2.0;
}

/** Apagado blanco bajo un texto que convive con las guías (nunca cruzado). */
function apagarGuiaBajoTexto(doc: jsPDF, x: number, y: number, w: number, barH: number): void {
  doc.setFillColor(...C_WHITE);
  doc.rect(x - 0.8, y - 0.5, w + 1.6, barH + 1.0, 'F');
}

function drawGraficoCobertura(doc: jsPDF, informe: InformeEjecutivo, y0: number, diasPeriodo: number): number {
  const items = seleccionCobertura(informe.riesgoCobertura);
  if (items.length === 0) return y0;
  const { numericos, textuales, mixto } = zonasCobertura(items);
  const contentW = pageW(doc) - 2 * M;
  const labelW = contentW * 0.36;
  const barArea = contentW - labelW;
  const xBar = M + labelW;
  const barH = COB_BAR_H;
  const gapProd = COB_GAP_PROD;
  const alto = alturaGraficoCobertura(items);

  const yStart = ensureSpace(doc, y0, alto, informe);

  // Título ADAPTADO a la información disponible (§1).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C_DARK);
  doc.text(
    numericos.length > 0
      ? 'Riesgo de inventario: cobertura estimada (días) frente al umbral del tramo'
      : 'Riesgo de inventario: disponibilidad — sin cobertura calculable en los casos mostrados',
    M,
    yStart + 3,
  );

  let y = yStart + COB_HEADER_H + 2;

  // ── ZONA CUANTITATIVA (barras; umbrales D/2 y D SOLO aquí dentro) ──
  if (numericos.length > 0) {
    if (mixto) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(...C_MUTED);
      doc.text('CON COBERTURA CALCULABLE (días)', M, y);
      y += COB_SUB_H;
    }
    const conDias = numericos.map((i) => i.coberturaDias as number);
    const maxCobertura = Math.max(...conDias, diasPeriodo * 1.15);
    const escala = (dias: number): number => (dias / maxCobertura) * barArea;

    // Extensión VERTICAL de la zona cuantitativa: las guías solo viven aquí.
    const zonaTop = y - 1;
    const zonaBottom = y + numericos.length * (barH + gapProd) - gapProd + 1;
    const xUmbral1 = xBar + escala(diasPeriodo * 0.5);
    const xUmbral2 = xBar + escala(diasPeriodo);
    for (const [xUm, etiqueta] of [[xUmbral1, 'D/2'], [xUmbral2, 'D']] as Array<[number, string]>) {
      doc.setDrawColor(...C_RULE);
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([1.4, 1.2], 0);
      doc.line(xUm, zonaTop, xUm, zonaBottom);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.setTextColor(...C_MUTED);
      doc.text(etiqueta, xUm, zonaTop - 1.5, { align: 'center' });
    }

    for (const item of numericos) {
      const st = ESTADO_COBERTURA[item.estado];
      // 1) Nombre del producto (columna de nombres, nunca sobre la escala).
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_DARK);
      doc.text(truncar(doc, item.name, labelW - 2), M, y + barH);

      // 2) Barra de cobertura (días).
      const w = Math.max(escala(item.coberturaDias as number), 0.9);
      doc.setFillColor(...st.color);
      doc.rect(xBar, y, w, barH, 'F');

      // 3) Valor numérico al final de la barra — con apagado blanco para que
      //    las guías no crucen el texto; si el margen no alcanza (barra
      //    máxima), el valor entra en la barra en blanco (§11).
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      const diasTxt = `${fmtCompact(item.coberturaDias as number)} d`;
      const wDias = doc.getTextWidth(diasTxt); // medido en el tamaño de dibujo
      const xVal = xBar + w + 1.4;
      if (xVal + wDias <= pageW(doc) - M) {
        apagarGuiaBajoTexto(doc, xVal, y, wDias, barH);
        doc.setTextColor(...C_DARK);
        doc.text(diasTxt, xVal, y + barH);
        // 4) Etiqueta de estado textual tras el valor (nunca solo color, §7).
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        const wTag = doc.getTextWidth(st.etiqueta);
        const xTag = xVal + wDias + 2.4;
        const disponible = pageW(doc) - M - xTag;
        if (disponible >= wTag) {
          apagarGuiaBajoTexto(doc, xTag, y, wTag, barH);
          doc.setTextColor(...st.color);
          doc.text(st.etiqueta, xTag, y + barH);
        } else if (w > wTag + 5) {
          // Dentro de la barra (blanco sobre color sólido; sin guías debajo).
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...C_WHITE);
          doc.text(st.etiqueta, xBar + w - 2, y + barH, { align: 'right' });
        } else {
          apagarGuiaBajoTexto(doc, xTag, y, Math.min(wTag, Math.max(disponible, 8)), barH);
          doc.setTextColor(...st.color);
          doc.text(truncar(doc, st.etiqueta, Math.max(disponible, 8)), xTag, y + barH);
        }
      } else {
        // Barra máxima: valor dentro de la barra (extremo derecho, blanco).
        doc.setTextColor(...C_WHITE);
        doc.text(diasTxt, xBar + w - 2, y + barH, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.6);
        const wTag = doc.getTextWidth(st.etiqueta);
        if (w > wTag + wDias + 8) {
          doc.setFont('helvetica', 'normal');
          doc.text(st.etiqueta, xBar + 2, y + barH);
        }
      }
      y += barH + gapProd;
    }

    // Escala en días (0 → máximo) al PIE de la zona cuantitativa (pertenece
    // solo a ella; nunca se dibuja sin valores cuantificables, §1).
    const ejY = y + 0.8;
    doc.setDrawColor(...GR_GRID);
    doc.setLineWidth(0.25);
    doc.line(xBar, ejY, xBar + barArea, ejY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...C_MUTED);
    doc.text('0 d', xBar, ejY + 3.4, { align: 'left' });
    doc.text(fmtDias(maxCobertura), xBar + barArea, ejY + 3.4, { align: 'right' });
    doc.text('D = días del tramo analizado', xBar + barArea / 2, ejY + 3.4, { align: 'center' });
    // Consumo EXACTO del tramo de escala (etiqueta a ejY+3.4 + descensor +
    // aire) — coincide con lo asignado por alturaGraficoCobertura.
    y = ejY + COB_ESCALA_H;
  }

  // ── ZONA CUALITATIVA (estados textuales, SIN escala numérica) ──
  if (textuales.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...C_MUTED);
    doc.text(
      mixto
        ? 'SIN COBERTURA CALCULABLE — ESTADO OPERATIVO'
        : 'ESTADO OPERATIVO (SIN ESCALA DE COBERTURA APLICABLE)',
      M,
      y,
    );
    y += COB_SUB_H;
    for (const item of textuales) {
      const st = ESTADO_COBERTURA[item.estado];
      // Nombre del producto (columna de nombres).
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...C_DARK);
      doc.text(truncar(doc, item.name, labelW - 2), M, y + barH);
      // Chip de estado (categoría textual independiente — no es posición de
      // escala) + texto oficial de cobertura del motor (§4.D).
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      const chipTxt = st.etiqueta.toUpperCase();
      const chipW = doc.getTextWidth(chipTxt) + 3.6;
      doc.setFillColor(...st.color);
      doc.rect(xBar + 1.5, y + barH - 3.6, chipW, 4.8, 'F');
      doc.setTextColor(...C_WHITE);
      doc.text(chipTxt, xBar + 1.5 + chipW / 2, y + barH, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(...C_DARK);
      const xTxt = xBar + 1.5 + chipW + 2.8;
      doc.text(truncar(doc, item.coberturaTexto, pageW(doc) - M - xTxt), xTxt, y + barH);
      y += barH + gapProd;
    }
  }

  // Leyenda de estados (color + texto) — SOLO los estados presentes. El aire
  // (2.5 mm) separa la leyenda de la última fila (nunca pegada, §2).
  const legY = y + 2.5;
  let xLeg = M;
  const presentes = new Set(items.map((i) => i.estado));
  const ordenLeyenda: InformeCoberturaItem['estado'][] = [
    'agotado',
    'cobertura_insuficiente',
    'cobertura_moderada',
    'baja_rotacion',
    'sin_movimiento',
    'sin_dato',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  for (const e of ordenLeyenda) {
    if (!presentes.has(e)) continue;
    const st = ESTADO_COBERTURA[e];
    doc.setFillColor(...st.color);
    doc.rect(xLeg, legY - 1.7, 4.4, 2.6, 'F');
    doc.setTextColor(...C_DARK);
    doc.text(st.etiqueta, xLeg + 5.8, legY);
    xLeg += 5.8 + doc.getTextWidth(st.etiqueta) + 6;
  }

  return yStart + alto + 1;
}

// ── RECOMENDACIONES por bloques (§5) ─────────────────────────────────────────
// Cada recomendación = chip de prioridad + producto + EVIDENCIA E
// INTERPRETACIÓN (situación del motor) + ACCIÓN RECOMENDADA (decisión del
// motor). Agrupadas por severidad: CRÍTICA/ALTA · MEDIA · PREVENTIVA. Bloques
// breves — nunca celdas de párrafo gigantes (§6).
//
// ADNEGOCIO-PDF-REPORT-POLISH-002 §2 · EL FONDO CUBRE EL CONTENIDO REAL:
// la altura se calcula midendo el texto EXACTAMENTE con la fuente con que se
// dibuja (helvetica normal 10.4). Antes se medía con el tamaño vigente del
// documento al llegar a cada bloque (variable: 9.6/8.6/12…), la cuenta de
// líneas difería del dibujo y la última línea quedaba fuera del sombreado;
// además la contabilidad vertical reservaba 10.5 arriba donde el dibujo usa
// 14 (etiqueta EVIDENCIA) y el colchón inferior no cubría el descensor.
// Ahora medición y dibujo comparten la MISMA función y constantes.

const BLOQUE_TEXTO = 10.4;          // cuerpo de los bloques (igual al dibujo)
const BLOQUE_LH = 4.7;              // interlínea de los bloques
const BLOQUE_TOP_EVIDENCIA = 14;    // baseline de la etiqueta EVIDENCIA desde yy
const BLOQUE_GAP_ACCION = 3.2;      // separación evidencia → acción
const BLOQUE_DESCENSOR = 0.9;       // por debajo del baseline (≈10.4 pt)
const BLOQUE_PAD_INFERIOR = 4.0;    // colchón bajo la última línea (§2)

interface BloqueMedido {
  lineasSit: string[];
  lineasDec: string[];
  alto: number;
}

/** Medición ÚNICA del bloque: las líneas y la altura que usa el dibujo son
 *  SIEMPRE las mismas que se pintan (fuente fijada explícitamente). */
function medirBloquePrioridad(doc: jsPDF, p: InformePrioridad, contentW: number): BloqueMedido {
  const textoW = contentW - 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BLOQUE_TEXTO);
  const lineasSit = doc.splitTextToSize(p.situacion, textoW) as string[];
  const lineasDec = doc.splitTextToSize(p.decision, textoW) as string[];
  const alto =
    BLOQUE_TOP_EVIDENCIA +
    BLOQUE_LH + Math.max(lineasSit.length - 1, 0) * BLOQUE_LH +
    BLOQUE_GAP_ACCION +
    BLOQUE_LH + Math.max(lineasDec.length - 1, 0) * BLOQUE_LH +
    BLOQUE_DESCENSOR + BLOQUE_PAD_INFERIOR;
  return { lineasSit, lineasDec, alto };
}

/** Pinta el fondo de un segmento del bloque (fondo suave + barra de acento). */
function pintarSegmentoBloque(
  doc: jsPDF,
  color: { bg: [number, number, number]; tx: [number, number, number] },
  yTop: number,
  yBottom: number,
  contentW: number,
): void {
  const h = Math.max(yBottom - yTop, 0.1);
  doc.setFillColor(...color.bg);
  doc.rect(M, yTop, contentW, h, 'F');
  doc.setFillColor(...color.tx);
  doc.rect(M, yTop, 1.4, h, 'F');
}

function drawBloquePrioridad(doc: jsPDF, p: InformePrioridad, y: number, informe: InformeEjecutivo): number {
  const pw = pageW(doc);
  const contentW = pw - 2 * M;
  const color = PRIORIDAD_COLOR[p.nivel];
  const { lineasSit, lineasDec, alto } = medirBloquePrioridad(doc, p, contentW);
  const usableH = pageH(doc) - PAGE_TOP_CONT - BOTTOM_RESERVE;
  const limInf = (): number => pageH(doc) - BOTTOM_RESERVE;

  // Chip de prioridad + nombre del producto (cabecera del bloque).
  const dibujarChip = (yy: number): void => {
    const chipW = p.nivel === 'preventiva' ? 24 : p.nivel === 'media' ? 14.5 : 11.5;
    doc.setFillColor(...color.tx);
    doc.rect(M + 4.5, yy + 3.4, chipW, 6.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_WHITE);
    doc.text(PRIORIDAD_TXT[p.nivel], M + 4.5 + chipW / 2, yy + 7.5, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(...C_BLACK);
    doc.text(truncar(doc, p.producto, contentW - chipW - 16), M + 4.5 + chipW + 4, yy + 7.8);
  };

  // Etiqueta de sección interna (EVIDENCIA / ACCIÓN).
  const dibujarEtiqueta = (texto: string, yy: number): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...color.tx);
    doc.text(texto, M + 4.5, yy);
  };

  // Línea de texto del bloque.
  const dibujarLinea = (line: string, yy: number, negro: boolean): void => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BLOQUE_TEXTO);
    doc.setTextColor(...(negro ? C_BLACK : C_DARK));
    doc.text(line, M + 4.5, yy);
  };

  if (alto + 2 <= usableH) {
    // Caso normal: el bloque completo cabe en una página — los bloques
    // pequeños NO se parten entre páginas (§4).
    const yy = ensureSpace(doc, y, alto + 2, informe);
    pintarSegmentoBloque(doc, color, yy, yy + alto, contentW);
    dibujarChip(yy);
    let yb = yy + BLOQUE_TOP_EVIDENCIA;
    dibujarEtiqueta('EVIDENCIA E INTERPRETACIÓN', yb);
    yb += BLOQUE_LH;
    for (const line of lineasSit) {
      dibujarLinea(line, yb, false);
      yb += BLOQUE_LH;
    }
    yb += BLOQUE_GAP_ACCION;
    dibujarEtiqueta('ACCIÓN RECOMENDADA', yb);
    yb += BLOQUE_LH;
    for (const line of lineasDec) {
      dibujarLinea(line, yb, true);
      yb += BLOQUE_LH;
    }
    return yy + alto + 5.5;
  }

  // Bloque mayor que una página: el salto se gestiona DE MANERA CONTROLADA
  // (fondo por segmentos de página, sin recortar contenido — §4). Solo exige
  // aire para la cabecera + primeras líneas: si hay sitio, arranca bajo lo
  // ya dibujado (p. ej. bajo el título de grupo) sin dejar títulos huérfanos.
  let yy = ensureSpace(doc, y, Math.min(40, usableH), informe);
  pintarSegmentoBloque(doc, color, yy, limInf(), contentW);
  dibujarChip(yy);
  let yb = yy + BLOQUE_TOP_EVIDENCIA;
  const abreSegmento = (): void => {
    nuevaPaginaVertical(doc, informe);
    yb = PAGE_TOP_CONT;
    pintarSegmentoBloque(doc, color, yb, limInf(), contentW);
  };
  const cabe = (): boolean => yb + BLOQUE_LH <= limInf();

  dibujarEtiqueta('EVIDENCIA E INTERPRETACIÓN', yb);
  yb += BLOQUE_LH;
  for (const line of lineasSit) {
    if (!cabe()) abreSegmento();
    dibujarLinea(line, yb, false);
    yb += BLOQUE_LH;
  }
  yb += BLOQUE_GAP_ACCION;
  if (!cabe()) {
    abreSegmento();
    yb += BLOQUE_GAP_ACCION;
  }
  dibujarEtiqueta('ACCIÓN RECOMENDADA', yb);
  yb += BLOQUE_LH;
  for (const line of lineasDec) {
    if (!cabe()) abreSegmento();
    dibujarLinea(line, yb, true);
    yb += BLOQUE_LH;
  }
  // El segmento final se cierra en el contenido real (no hasta el pie): el
  // blanco tapa fondo y barra de acento del segmento sobrante — el bloque
  // termina limpio y el contenido siguiente no encuentra restos (§4).
  const fin = yb - BLOQUE_LH + BLOQUE_DESCENSOR + BLOQUE_PAD_INFERIOR;
  if (fin < limInf()) {
    doc.setFillColor(...C_WHITE);
    doc.rect(M, fin, contentW, limInf() - fin, 'F');
  }
  return fin + 5.5;
}

async function drawSeccionPrioridades(doc: jsPDF, informe: InformeEjecutivo, y0: number): Promise<number> {
  let y = y0;
  const niveles: InformePrioridad['nivel'][] = ['alta', 'media', 'preventiva'];
  y = drawParrafo(
    doc,
    'Bloques ordenados por severidad. CRÍTICA / ALTA agrupa interrupciones comerciales relevantes y riesgos inmediatos de disponibilidad; MEDIA exige seguimiento o reposición anticipada; PREVENTIVA identifica baja rotación y oportunidades. Cada bloque muestra la evidencia cuantitativa del motor y la acción recomendada; el detalle operativo completo está en el análisis complementario y los anexos.',
    y,
    informe,
  );
  y += 1;
  for (const nivel of niveles) {
    const grupo = informe.prioridades.filter((p) => p.nivel === nivel);
    if (grupo.length === 0) continue;
    const g = GRUPO_PRIORIDAD[nivel];
    // Cabecera de grupo (nunca huérfana: reserva del primer bloque).
    // El ancho del título se mide ANTES de cambiar el tamaño de fuente:
    // getTextWidth usa el tamaño vigente y medir después daría un ancho
    // menor al dibujado (solape título/descripción — defecto detectado en
    // la revisión visual).
    const primera = grupo[0];
    // Guarda anti-huérfanos: título + primer bloque (limitado al alto útil de
    // una página — un bloque mayor que una página arranca bajo el título y
    // continúa por segmentos; sin el límite el título quedaría solo, §4).
    const yy = ensureSpace(
      doc,
      y,
      12 + Math.min(medirBloquePrioridad(doc, primera, pageW(doc) - 2 * M).alto, pageH(doc) - PAGE_TOP_CONT - BOTTOM_RESERVE),
      informe,
    );
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...PRIORIDAD_COLOR[nivel].tx);
    doc.text(g.titulo, M, yy + 3);
    const wTitulo = doc.getTextWidth(g.titulo);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    doc.setTextColor(...C_MUTED);
    doc.text(truncar(doc, g.descripcion, pageW(doc) - 2 * M - wTitulo - 4), M + wTitulo + 3.5, yy + 3);
    y = yy + 8;
    for (const p of grupo) {
      y = drawBloquePrioridad(doc, p, y, informe);
    }
    y += 2;
  }
  return y;
}

// ── PORTADA EJECUTIVA (§3) ───────────────────────────────────────────────────

/** Etiqueta de grupo editorial: versalitas en acento + regla fina. */
function drawGrupoKicker(doc: jsPDF, texto: string, y: number): number {
  const pw = pageW(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_ACCENT);
  doc.text(texto, M, y, { charSpace: 0.55 });
  doc.setDrawColor(...C_RULE);
  doc.setLineWidth(0.2);
  doc.line(M, y + 2.4, pw - M, y + 2.4);
  return y + 7.5;
}

/** Ajuste adaptativo del valor de la tarjeta hero (SIN truncar números, §10):
 *  si el valor exacto no cabe ni a 17 pt se muestra la cifra compacta y el
 *  valor EXACTO se traslada a la línea de contexto. Devuelve TAMBIÉN el
 *  tamaño con que debe dibujarse (el dibujo NUNCA lo recalcula). */
function heroValor(doc: jsPDF, valorExacto: string, w: number): { texto: string; size: number; compactado: boolean } {
  let texto = valorExacto;
  let size = T_HERO_VALOR;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size); // ADNEGOCIO-PDF-REPORT-POLISH-002: medir SIEMPRE en el tamaño de dibujo (antes heredaba el tamaño vigente — p. ej. 8.6 del kicker — y el ajuste nunca entraba: la cifra desbordaba la tarjeta)
  while (size > 17 && doc.getTextWidth(texto) > w - 10) {
    size -= 1.5;
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(texto) > w - 10) {
    // Límite: compacta + valor exacto en el contexto (la cifra exacta vive
    // también en la tabla de indicadores y en la conciliación del cuerpo).
    // Formato es-CU: miles con coma, decimales con punto (p. ej. -529,200.00).
    return { texto: fmtCompact(Number(valorExacto.replace(/[^0-9.,-]/g, '').replace(/,/g, ''))), size: 21, compactado: true };
  }
  return { texto: valorExacto, size, compactado: false };
}

/** Altura necesaria de la tarjeta hero para su descriptor FINAL (hasta 3
 *  líneas — ADNEGOCIO-PDF-REPORT-POLISH-002 §3: antes se recortaba a 2 y la
 *  tercera línea se perdía cuando el motor añadía «Valor exacto: … CUP.»). */
function alturaTarjetaHero(doc: jsPDF, descriptor: string, w: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const lineas = Math.max((doc.splitTextToSize(descriptor, w - 10) as string[]).slice(0, 3).length, 1);
  return Math.max(22, 17.8 + lineas * 3.3 + 1.2);
}

/** Tarjeta hero (Ingresos / Variación): cifra protagonista 26 pt + contexto.
 *  La cifra NUNCA se trunca (integridad numérica §10): si el valor exacto no
 *  cabe, se reduce el tamaño hasta 17 pt y, en el límite, se muestra la cifra
 *  compacta con el valor EXACTO trasladado a la línea de contexto.
 *  `valor`/`size` ya vienen ajustados por heroValor y `descriptor` es el texto
 *  FINAL (con el valor exacto incorporado cuando la cifra se compactó). */
function drawTarjetaHero(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  etiqueta: string,
  valor: { texto: string; size: number },
  valorColor: [number, number, number],
  descriptor: string,
): void {
  doc.setFillColor(...C_BAND);
  doc.rect(x, y, w, h, 'F');
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(1.1);
  doc.line(x, y, x, y + h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C_MUTED);
  doc.text(etiqueta, x + 5, y + 5.5, { charSpace: 0.3 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(valor.size); // tamaño ADAPTATIVO calculado por heroValor
  doc.setTextColor(...valorColor);
  doc.text(valor.texto, x + 5, y + 14.8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C_MUTED);
  const lineas = doc.splitTextToSize(descriptor, w - 10) as string[];
  let ye = y + 17.8;
  for (const linea of lineas.slice(0, 3)) {
    doc.text(linea, x + 5, ye);
    ye += 3.3;
  }
}

/** Tarjeta de cifra de grupo: número 16.5 pt + etiqueta + explicación breve. */
function drawTarjetaCifra(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  cifra: string,
  cifraColor: [number, number, number],
  etiqueta: string,
  explicacion: string,
): void {
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(...cifraColor);
  doc.text(truncar(doc, cifra, w - 6), x + w / 2, y + 8.8, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.9);
  doc.setTextColor(...C_DARK);
  const lineas = doc.splitTextToSize(etiqueta, w - 6) as string[];
  let ye = y + 12.2;
  for (const linea of lineas.slice(0, 2)) {
    doc.text(linea, x + w / 2, ye, { align: 'center' });
    ye += 3.5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...C_MUTED);
  const exp = doc.splitTextToSize(explicacion, w - 6) as string[];
  for (const linea of exp.slice(0, 2)) {
    doc.text(linea, x + w / 2, ye + 0.4, { align: 'center' });
    ye += 3.2;
  }
}

/** Altura de la tarjeta de cifra medida con las fuentes EXACTAS de dibujo
 *  (etiqueta negrita 7.9, explicación normal 7.4) y hasta 2 líneas de
 *  explicación — ADNEGOCIO-PDF-REPORT-POLISH-002 §3: antes se medía con la
 *  fuente vigente y se dibujaba solo 1 línea de explicación (pérdida de
 *  contenido cuando el texto necesita dos). */
function alturaTarjetaCifra(doc: jsPDF, etiqueta: string, explicacion: string, wCard: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.9);
  const lineasEt = Math.max((doc.splitTextToSize(etiqueta, wCard - 6) as string[]).slice(0, 2).length, 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  const lineasExp = Math.max((doc.splitTextToSize(explicacion, wCard - 6) as string[]).slice(0, 2).length, 1);
  return 12.6 + lineasEt * 3.5 + lineasExp * 3.2 + 2.2;
}

/** Banda del producto líder (acento institucional, 12 mm). */
function drawBandaLider(doc: jsPDF, y: number, contentW: number, nombre: string, participacion: string): void {
  const h = 10.5;
  doc.setFillColor(...C_ACCENT);
  doc.rect(M, y, contentW, h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...C_WHITE);
  doc.text('PRODUCTO LÍDER DEL PERÍODO', M + 5, y + 4, { charSpace: 0.45 });
  doc.setFontSize(11.5);
  doc.text(truncar(doc, nombre, contentW * 0.62), M + 5, y + 8.6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(participacion, M + contentW - 5, y + 7.2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text('participación oficial del período', M + contentW - 5, y + 9.7, { align: 'right' });
}

/** Banda «La situación en un minuto» — resumen gerencial del motor (§3).
 *  NUNCA se superpone: la altura se calcula ANTES y quien la llama decide si
 *  cabe en la página actual o si continúa en la siguiente (flujo real).
 *  ADNEGOCIO-PDF-REPORT-POLISH-002 §3: la medición se hace en la MISMA fuente
 *  con que se dibuja (normal 9.2) — antes heredaba el estado vigente (p. ej.
 *  negrita 9.8) y la altura difería del contenido real. */
function alturaResumenMinuto(doc: jsPDF, informe: InformeEjecutivo): number {
  const contentW = pageW(doc) - 2 * M;
  let alto = 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  for (const s of informe.resumenGerencial) {
    alto += alturaTexto(doc, s, contentW - 14, 4.3) + 1.8;
  }
  return alto;
}

function drawResumenMinuto(doc: jsPDF, informe: InformeEjecutivo, y: number): number {
  const contentW = pageW(doc) - 2 * M;
  const items = informe.resumenGerencial;
  const alto = alturaResumenMinuto(doc, informe);
  const yy = ensureSpace(doc, y, alto + 2, informe);
  doc.setFillColor(...C_BAND);
  doc.rect(M, yy, contentW, alto, 'F');
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(1.1);
  doc.line(M, yy, M, yy + alto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...C_ACCENT);
  doc.text('LA SITUACIÓN EN UN MINUTO', M + 5, yy + 5.8, { charSpace: 0.4 });
  let yb = yy + 10.5;
  for (const s of items) {
    doc.setFillColor(...C_ACCENT);
    doc.circle(M + 6.5, yb - 1.2, 0.7, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(...C_DARK);
    yb = drawWrapped(doc, s, M + 10, yb, contentW - 14, 4.3, informe) + 1.8;
  }
  return yy + alto;
}

/** Portada (página 1). El índice se rellena al FINAL del documento (dos
 *  pasos: el cuerpo registra las páginas reales y luego el ancla que aquí se
 *  devuelve completa las filas con enlaces internos). */
function drawPortada(doc: jsPDF, informe: InformeEjecutivo): { pagina: number; yFilas: number } {
  const pw = pageW(doc);
  const contentW = pw - 2 * M;
  const { meta } = informe;
  const f = (iso: string): string => {
    const [yy, mm, dd] = iso.split('-');
    return yy && mm && dd ? `${dd}/${mm}/${yy}` : iso;
  };

  // Identificación editorial
  let y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_ACCENT);
  doc.text('ANÁLISIS COMERCIAL · COMPARACIÓN DE PRODUCTOS', M, y, { charSpace: 0.7 });
  y += 5.5;
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(1);
  doc.line(M, y, M + 36, y);
  y += 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(T_PORTADA);
  doc.setTextColor(...C_BLACK);
  doc.text('COMPARACIÓN DE PRODUCTOS', M, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(T_PORTADA_SUB);
  doc.setTextColor(...C_DARK);
  doc.text(TITULO_DOC, M, y);

  // Ficha institucional
  y += 9.5;
  doc.setFillColor(...C_BAND);
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.rect(M, y, contentW, 31, 'S');
  const filas: Array<[string, string]> = [
    ['ENTIDAD', meta.entidadNombre],
    ['PERÍODO ANALIZADO', `${f(meta.periodoActual.desde)} a ${f(meta.periodoActual.hasta)} (${meta.diasPeriodo} días)`],
    ['PERÍODO COMPARATIVO', `${f(meta.periodoComparacion.desde)} a ${f(meta.periodoComparacion.hasta)}`],
    ['ELABORACIÓN', `${format(new Date(meta.generadoEl), 'dd/MM/yyyy HH:mm')} · Ámbito: ${meta.ambito}`],
  ];
  let yf = y + 6;
  for (const [etiqueta, valor] of filas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C_MUTED);
    doc.text(etiqueta, M + 4.5, yf);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.8);
    doc.setTextColor(...C_DARK);
    doc.text(valor, M + 48, yf);
    yf += 7.2;
  }
  y += 31 + 4.5;

  // ── Dashboard de indicadores (§3) ──
  const inds = informe.indicadores;
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

  // Fila hero: Ingresos + Variación (cifras protagonistas con contexto).
  y = drawGrupoKicker(doc, 'RESULTADO DEL CONJUNTO COMPARADO', y);
  const cardW = (contentW - 4.5) / 2;
  // Altura de la fila hero medida sobre los descriptores FINALES (los mismos
  // textos que se dibujan — sin líneas perdidas, §3).
  const DESC_INGRESOS = 'Suma de los ingresos del período analizado para los productos incluidos en ambos cortes.';
  const DESC_VARIACION = 'Frente al tramo equivalente del período anterior; mide solo el conjunto comparado, no la tienda completa.';
  const heroI = ingresos ? heroValor(doc, ingresos.value.replace(' CUP', ''), cardW) : null;
  const heroV = variacion ? heroValor(doc, (variacion.value.match(/^([+-][^()]+?)\s*(?:\((.+)\))?$/)?.[1] ?? variacion.value).replace(/\s*CUP$/, ''), cardW) : null;
  const descI = heroI?.compactado ? `${DESC_INGRESOS} Valor exacto: ${ingresos?.value} CUP.` : DESC_INGRESOS;
  const pctV = variacion ? variacion.value.match(/^(.+)\((.+)\)$/)?.[2] ?? null : null;
  const descV = heroV?.compactado
    ? `${pctV ? `Frente al tramo equivalente del período anterior: ${pctV}. Mide solo el conjunto comparado, no la tienda completa.` : DESC_VARIACION} Valor exacto: ${variacion?.value} CUP.`
    : pctV
      ? `Frente al tramo equivalente del período anterior: ${pctV}. Mide solo el conjunto comparado, no la tienda completa.`
      : DESC_VARIACION;
  const heroH = Math.max(
    22,
    heroI ? alturaTarjetaHero(doc, descI, cardW) : 0,
    heroV ? alturaTarjetaHero(doc, descV, cardW) : 0,
  );
  if (ingresos && heroI) {
    drawTarjetaHero(
      doc, M, y, cardW, heroH,
      'INGRESOS DEL CONJUNTO COMPARADO (CUP)',
      { texto: heroI.texto, size: heroI.size },
      C_ACCENT,
      descI,
    );
  }
  if (variacion && heroV) {
    const mVar = variacion.value.match(/^([+-][^()]+?)\s*(?:\((.+)\))?$/);
    const principal = mVar ? mVar[1].trim() : variacion.value;
    const esNegativa = principal.trim().startsWith('-');
    const colorVar = esNegativa ? GR_NEGATIVO : principal.trim().startsWith('+') ? GR_ACTUAL : C_DARK;
    drawTarjetaHero(
      doc, M + cardW + 4.5, y, cardW, heroH,
      'VARIACIÓN VS. TRAMO COMPARABLE (CUP)',
      { texto: heroV.texto, size: heroV.size },
      colorVar,
      descV,
    );
  }
  y += heroH + 4;

  // Grupo: desempeño comercial del conjunto.
  const comerciales = [crecimiento, contraccion, sinVentas].filter((i): i is InformeIndicador => !!i);
  if (comerciales.length > 0) {
    y = drawGrupoKicker(doc, 'DESEMPEÑO COMERCIAL DEL RANKING', y);
    const gapCard = 4;
    const wCard = (contentW - gapCard * (comerciales.length - 1)) / comerciales.length;
    const explicaciones: Record<string, string> = {
      'crecimiento relevante': 'Variación de +50% o más sobre su propia base del tramo comparable.',
      'contracción': 'Variación de -50% o más sobre su propia base del tramo comparable.',
      'sin ventas en el tramo': 'Vendían en el tramo comparable y el mayor del período no registra salidas.',
    };
    let maxH = 0;
    comerciales.forEach((c) => {
      const exp = Object.entries(explicaciones).find(([k]) => c.label.toLowerCase().includes(k))?.[1] ?? 'Indicador del conjunto comparado.';
      maxH = Math.max(maxH, alturaTarjetaCifra(doc, c.label, exp, wCard));
    });
    const hC = maxH;
    comerciales.forEach((c, i) => {
      const exp = Object.entries(explicaciones).find(([k]) => c.label.toLowerCase().includes(k))?.[1] ?? 'Indicador del conjunto comparado.';
      const esRiesgo = c.label.toLowerCase().includes('contracción') || c.label.toLowerCase().includes('sin ventas');
      drawTarjetaCifra(
        doc, M + i * (wCard + gapCard), y, wCard, hC,
        c.value,
        esRiesgo ? GR_NEGATIVO : GR_ACTUAL,
        c.label,
        exp,
      );
    });
    y += hC + 4;
  }

  // Grupo: disponibilidad e inventario.
  const inventario = [agotados, cobertura].filter((i): i is InformeIndicador => !!i);
  if (inventario.length > 0) {
    y = drawGrupoKicker(doc, 'DISPONIBILIDAD E INVENTARIO', y);
    const gapCard = 4;
    const wCard = (contentW - gapCard * (inventario.length - 1)) / inventario.length;
    let maxH = 0;
    inventario.forEach((c) => {
      const exp = c.label.toLowerCase().includes('agotados')
        ? 'Sin existencia al corte teniendo ventas en el tramo comparable: interrupción comercial.'
        : 'La existencia no alcanza la mitad del tramo al ritmo de venta actual: riesgo de desabastecimiento.';
      maxH = Math.max(maxH, alturaTarjetaCifra(doc, c.label, exp, wCard));
    });
    const hC = maxH;
    inventario.forEach((c, i) => {
      const exp = c.label.toLowerCase().includes('agotados')
        ? 'Sin existencia al corte teniendo ventas en el tramo comparable: interrupción comercial.'
        : 'La existencia no alcanza la mitad del tramo al ritmo de venta actual: riesgo de desabastecimiento.';
      drawTarjetaCifra(
        doc, M + i * (wCard + gapCard), y, wCard, hC,
        c.value,
        GR_NEGATIVO,
        c.label,
        exp,
      );
    });
    y += hC + 4;
  }

  // Producto líder.
  if (lider) {
    const mLider = lider.value.match(/^(.+?)\s+—\s+(.+)$/);
    drawBandaLider(doc, y, contentW, mLider ? mLider[1].trim() : lider.value, mLider ? mLider[2].trim() : '');
    y += 10.5 + 4.5;
  }

  // Indicadores no clasificados — defensa de integridad §9 (ninguno se pierde).
  const restantes = inds.filter((_, i) => !usados.has(i));
  if (restantes.length > 0) {
    y = drawGrupoKicker(doc, 'OTROS INDICADORES', y);
    const vw = 62;
    for (const ind of restantes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.8);
      doc.setTextColor(...C_DARK);
      doc.text(truncar(doc, ind.label, contentW - vw - 4), M, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_BLACK);
      doc.text(ind.value, pw - M, y, { align: 'right' });
      y += 5.6;
    }
    y += 1;
  }

  // Resumen gerencial (<1 min) — §3. ensureSpace lo mantiene íntegro: si la
  // portada no lo acomoda, continúa en la página siguiente sin solaparse.
  y += 3;
  const yResumen = drawResumenMinuto(doc, informe, y);
  y = yResumen + 6;

  // CONTENIDO (índice): las páginas y los enlaces internos se completan al
  // final del build (dos pasos — drawIndiceFinal). 9 entradas en 2 columnas.
  if (y + 6.5 + 5 * 6.2 > pageH(doc) - BOTTOM_RESERVE) {
    nuevaPaginaVertical(doc, informe);
    y = PAGE_TOP_CONT;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C_ACCENT);
  doc.text('CONTENIDO', M, y, { charSpace: 0.55 });
  return { pagina: doc.getCurrentPageInfo().pageNumber, yFilas: y + 7 };
}

// ── Índice de portada (dos pasos: se rellena al final con páginas reales) ────

const INDICE_ENTRADAS: Array<{ numeral: string; titulo: string; seccion: string }> = [
  { numeral: '1.', titulo: 'Diagnóstico ejecutivo', seccion: 'diagnostico' },
  { numeral: '2.', titulo: 'Prioridades y decisiones recomendadas', seccion: 'prioridades' },
  { numeral: '3.', titulo: 'Gráficos analíticos', seccion: 'graficos' },
  { numeral: '4.', titulo: 'Análisis complementario', seccion: 'complementario' },
  { numeral: '', titulo: 'ANEXO I-A · Ranking comercial', seccion: 'anexoIA' },
  { numeral: '', titulo: 'ANEXO I-B · Cantidades del ranking', seccion: 'anexoIB' },
  { numeral: '', titulo: 'ANEXO II · Disponibilidad y cobertura', seccion: 'anexoII' },
  { numeral: '', titulo: 'ANEXO III · Productos sin ventas', seccion: 'anexoIII' },
  { numeral: '', titulo: 'ANEXO IV · Metodología y fuentes', seccion: 'anexoIV' },
];

function drawIndiceFinal(
  doc: jsPDF,
  paginas: Record<string, number | undefined>,
  ancla: { pagina: number; yFilas: number },
): void {
  doc.setPage(ancla.pagina);
  const colW = (pageW(doc) - 2 * M - 8) / 2;
  INDICE_ENTRADAS.forEach((e, i) => {
    const col = i < 5 ? 0 : 1;
    const fila = i < 5 ? i : i - 5;
    const x = M + col * (colW + 8);
    const y = ancla.yFilas + fila * 6.2;
    drawIndiceFila(doc, e.numeral, e.titulo, paginas[e.seccion] ?? null, x, y, colW);
  });
}

// ── Anexos (§6-§8: página nueva; Anexo I separado en I-A / I-B) ──────────────

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
  doc.setFontSize(8.6);
  doc.setTextColor(...C_ACCENT);
  doc.text(ident, M, y + 1, { charSpace: 0.55 });
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(T_SECCION);
  doc.setTextColor(...C_BLACK);
  doc.text(titulo, M, y + 3.5);
  doc.setDrawColor(...C_ACCENT);
  doc.setLineWidth(0.7);
  doc.line(M, y + 6.2, pw - M, y + 6.2);
  y += 12.5;
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
  y = drawSubTitle(doc, tabla.titulo, y, informe, 32);
  if (tabla.intro) {
    y = drawAuxiliar(doc, tabla.intro, y, informe) + 1;
  }
  if (tabla.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(T_AUX);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, 'Sin casos en este período.', M, y, pageW(doc) - 2 * M, LH_AUX, informe) + 2;
    return y;
  }
  const n = tabla.columnas.length;
  const widths =
    opts.colWidths ??
    tabla.anchos ??
    anchosAuto(doc, tabla.columnas, tabla.filas, pageW(doc) - 2 * M);
  const aligns =
    opts.aligns ??
    tabla.alineaciones ??
    Array.from({ length: n }, (_, i) => (i === 0 ? 'left' : 'right') as 'left' | 'right');
  // Columnas numéricas (sin puntos de ruptura): >60 % de celdas con forma de
  // cifra/magnitud → ajuste tipográfico por celda si el ancho no alcanza.
  const esNumerica = tabla.columnas.map((_, ci) => {
    const celdas = tabla.filas.map((f) => (f[ci] ?? '').trim()).filter(Boolean);
    if (celdas.length === 0) return false;
    const conForma = celdas.filter((c) => /^[+\-]?\$?[\d.,%()\s]+[a-zA-Záéíóúñ/\d]*$/.test(c) && /\d/.test(c)).length;
    return conForma / celdas.length > 0.6;
  });
  y = await drawTabla(
    doc,
    {
      head: tabla.columnas,
      body: tabla.filas,
      colWidths: widths,
      aligns,
      fontSize: opts.fontSize ?? T_TABLA,
      fitColumnos: esNumerica.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    },
    informe,
    y,
  );
  if (tabla.nota) {
    y = drawNota(doc, `Nota: ${tabla.nota}`, y + 1.4, informe) + 1.5;
  }
  return y + 4;
}

/** Dibuja un anexo tabular en página nueva con identidad propia. */
async function drawAnexoTabla(
  doc: jsPDF,
  informe: InformeEjecutivo,
  ident: string,
  titulo: string,
  intro: string | undefined,
  anexo: Pick<InformeTabla, 'columnas' | 'filas' | 'nota'>,
  orientacion: 'portrait' | 'landscape',
  layout: { colWidths: number[]; aligns: Array<'left' | 'right' | 'center'>; fontSize: number },
): Promise<void> {
  doc.addPage('a4', orientacion);
  drawContinuationHeader(doc, informe);
  let y = drawAnnexHeader(doc, informe, ident, titulo, intro);
  if (anexo.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(T_AUX);
    doc.setTextColor(...C_MUTED);
    y = drawWrapped(doc, 'Sin casos en este período.', M, y, pageW(doc) - 2 * M, LH_AUX, informe) + 2;
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
    y = drawNota(doc, `Nota: ${anexo.nota}`, y + 1.4, informe) + 1.5;
  }
}

// ── Builder principal ────────────────────────────────────────────────────────

export async function buildInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<jsPDF> {
  const doc = await createPDFDocument('p', 'mm', 'a4');
  const { meta } = informe;
  const dias = meta.diasPeriodo;
  const secciones: SeccionNavegable[] = [];
  const paginas: Record<string, number | undefined> = {};

  // ── PÁGINA 1 · PORTADA EJECUTIVA (sin numeración, §4) ──
  const indice = drawPortada(doc, informe);

  // ── CUERPO ── Si el resumen/índice saltaron a la página 2, el cuerpo continúa
  // en esa misma página bajo el índice (evita páginas vacías, §8); si el índice
  // quedó en la portada, el cuerpo arranca en página nueva.
  let y: number;
  if (indice.pagina === 1) {
    nuevaPaginaVertical(doc, informe);
    y = PAGE_TOP_CONT;
  } else {
    doc.setPage(indice.pagina);
    y = indice.yFilas + 5 * 6.2 + 7;
    if (y + 60 > pageH(doc) - BOTTOM_RESERVE) {
      nuevaPaginaVertical(doc, informe);
      y = PAGE_TOP_CONT;
    }
  }

  // 1. DIAGNÓSTICO EJECUTIVO (§5: responde qué ocurrió / riesgo / decisión)
  registrarSeccion(secciones, '1. Diagnóstico ejecutivo', doc);
  paginas.diagnostico = doc.getCurrentPageInfo().pageNumber;
  y = drawSectionTitle(doc, '1. Diagnóstico ejecutivo', y, informe, 52);

  y = drawSubTitle(doc, '¿Qué ocurrió en el período?', y, informe);
  for (const parrafo of informe.situacionGeneral) {
    y = drawParrafo(doc, parrafo, y, informe);
    y += 0.5;
  }

  y = drawSubTitle(doc, '¿Qué riesgo u oportunidad representa?', y, informe);
  {
    const nAlta = informe.prioridades.filter((p) => p.nivel === 'alta').length;
    const nMedia = informe.prioridades.filter((p) => p.nivel === 'media').length;
    const nPrev = informe.prioridades.filter((p) => p.nivel === 'preventiva').length;
    const total = informe.prioridades.length;
    const lectura = total > 0
      ? `El análisis clasifica ${total} situación${total !== 1 ? 'es' : ''} que amerita${total !== 1 ? 'n' : ''} decisión: ${nAlta} de nivel CRÍTICA/ALTA, ${nMedia} de nivel MEDIA y ${nPrev} de nivel PREVENTIVA. Las ALTA comprometen ventas o disponibilidad y se atienden primero; las MEDIA exigen seguimiento o reposición anticipada; las PREVENTIVA señalan baja rotación y oportunidades de optimización.`
      : 'El conjunto comparado opera sin situaciones que superen los umbrales de revisión del informe: no hay riesgos de desabastecimiento ni contracciones relevantes que exijan decisión inmediata.';
    y = drawParrafo(doc, lectura, y, informe);
    y += 1;
  }

  y = drawSubTitle(doc, '¿Qué decisión se recomienda?', y, informe);
  {
    const contentW = pageW(doc) - 2 * M;
    const lines = doc.splitTextToSize(informe.conclusionGerencial, contentW - 9) as string[];
    const altoBanda = lines.length * 5.4 + 11;
    y = ensureSpace(doc, y + 1, altoBanda + 3, informe);
    doc.setFillColor(...C_BAND);
    doc.rect(M, y, contentW, altoBanda, 'F');
    doc.setDrawColor(...C_ACCENT);
    doc.setLineWidth(1.1);
    doc.line(M, y, M, y + altoBanda);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_ACCENT);
    doc.text('CONCLUSIÓN GERENCIAL', M + 4.5, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(T_CUERPO);
    doc.setTextColor(...C_DARK);
    let yc = y + 12;
    for (const line of lines) {
      doc.text(line, M + 4.5, yc);
      yc += 5.4;
    }
    y += altoBanda + 3;
    y = drawNota(
      doc,
      'Las decisiones completas, con su evidencia cuantitativa, están en la sección 2. El alcance estadístico del conjunto comparado se declara en el Anexo IV.',
      y,
      informe,
    );
  }
  y += 4;

  // 2. PRIORIDADES Y DECISIONES (bloques por severidad — §5). Flujo natural:
  // drawSectionTitle salta de página por sí solo cuando el título + primer
  // bloque no caben (sin páginas casi vacías, §8).
  y += 6;
  registrarSeccion(secciones, '2. Prioridades y decisiones recomendadas', doc);
  paginas.prioridades = doc.getCurrentPageInfo().pageNumber;
  y = drawSectionTitle(doc, '2. Prioridades y decisiones recomendadas', y, informe, 52);
  if (informe.prioridades.length === 0) {
    y = drawParrafo(
      doc,
      'Ninguna situación del conjunto comparado supera los umbrales de revisión de este informe. Mantener el seguimiento periódico de la comparación y de la disponibilidad.',
      y,
      informe,
    );
  } else {
    y = await drawSeccionPrioridades(doc, informe, y);
    y += 4;
  }

  // 3. GRÁFICOS ANALÍTICOS (§4: A comparación, B variaciones, C cobertura)
  y += 6;
  registrarSeccion(secciones, '3. Gráficos analíticos', doc);
  paginas.graficos = doc.getCurrentPageInfo().pageNumber;
  y = drawSectionTitle(doc, '3. Gráficos analíticos', y, informe, 50);
  y = drawAuxiliar(
    doc,
    'Tres lecturas visuales sobre los MISMOS datos del motor: comparación de ingresos por producto, variaciones del período y riesgo de cobertura. La paleta y el lenguaje visual siguen al gráfico de referencia de Estados Financieros (Evolución acumulada de ventas). Ningún gráfico inventa datos: cuando la fuente no provee una serie diaria, no se simula evolución.',
    y,
    informe,
  );
  y += 2;

  // 3.A — comparación por producto (el subtítulo reserva el gráfico COMPLETO:
  // nunca un título huérfano al pie de página — defecto del baseline).
  {
    const alto = informe.grafico ? alturaGraficoComparativo(informe) : 14;
    y = drawSubTitle(doc, '3.A · Comparación de ventas por producto', y, informe, alto + 10);
  }
  if (informe.grafico) {
    y = drawGraficoComparativo(doc, informe, y);
    y += 4;
  } else {
    y = drawParrafo(doc, 'Sin datos suficientes para construir el gráfico comparativo en este período.', y, informe);
  }

  // 3.B — variaciones divergentes (misma guarda anti-huérfanos)
  {
    const alto = alturaGraficoVariaciones(informe.variaciones);
    y = drawSubTitle(doc, '3.B · Evolución de las variaciones', y, informe, alto + 12);
  }
  if (informe.variaciones.length > 0) {
    y = drawGraficoVariaciones(doc, informe, y);
    y = drawNota(
      doc,
      'Representación divergente: incrementos a la derecha (verde) y reducciones a la izquierda (rojo), en CUP. Los porcentajes solo aparecen con base comparable; los productos nuevos se marcan como NUEVO y no reciben porcentaje.',
      y,
      informe,
    );
    y += 3;
  } else {
    y = drawParrafo(doc, 'Sin variaciones que mostrar: los productos del conjunto registran los mismos ingresos en ambos tramos.', y, informe);
  }

  // 3.C — disponibilidad y cobertura (misma guarda anti-huérfanos)
  const coberturaSeleccion = seleccionCobertura(informe.riesgoCobertura);
  {
    const alto = coberturaSeleccion.length > 0 ? alturaGraficoCobertura(coberturaSeleccion) : 14;
    y = drawSubTitle(doc, '3.C · Disponibilidad y cobertura', y, informe, alto + 12);
  }
  if (coberturaSeleccion.length > 0) {
    y = drawGraficoCobertura(doc, informe, y, dias);
    y = drawNota(
      doc,
      zonasCobertura(coberturaSeleccion).numericos.length > 0
        ? `Cobertura estimada en días frente a los umbrales del tramo (D = ${dias} días; D/2 = mitad). Las guías D/2 y D solo aparecen dentro de la zona cuantitativa; los casos sin cobertura calculable se presentan como categoría textual propia. Agotamiento, riesgo de desabastecimiento y acumulación quedan diferenciados por color y por etiqueta textual. Se muestran hasta ${COBERTURA_MAX_FILAS} casos por severidad; el detalle completo está en el Anexo II. La cobertura no incorpora plazos de reposición: no se fijan fechas de agotamiento.`
        : `Estado operativo de disponibilidad de los casos mostrados: ninguno tiene existencia y velocidad simultáneas, por lo que no se genera cobertura ficticia y no se dibuja escala numérica (no se inventan valores para dibujar barras). Se muestran hasta ${COBERTURA_MAX_FILAS} casos por severidad; el detalle completo está en el Anexo II.`,
      y,
      informe,
    );
    y += 3;
  } else {
    y = drawParrafo(
      doc,
      'Sin casos de cobertura que mostrar en este período: no hay agotados con demanda activa, ni coberturas por debajo de los umbrales, ni baja rotación con existencia.',
      y,
      informe,
    );
  }

  // 4. ANÁLISIS COMPLEMENTARIO
  if (informe.complementarias.length > 0) {
    y += 6;
    registrarSeccion(secciones, '4. Análisis complementario', doc);
    paginas.complementario = doc.getCurrentPageInfo().pageNumber;
    y = drawSectionTitle(doc, '4. Análisis complementario', y, informe, 50);
    for (const tabla of informe.complementarias) {
      y = await drawSeccionTabla(doc, tabla, informe, y);
    }
  }

  // ── ANEXOS (§7: cada anexo en página nueva mediante addPage real) ──
  const anexoI = informe.anexos[0];
  if (anexoI && anexoI.filas.length > 0) {
    // I-A · Ranking comercial (horizontal): código, descripción, posiciones,
    // ventas y variaciones — separado de las cantidades (§6).
    doc.addPage('a4', 'landscape');
    drawContinuationHeader(doc, informe);
    registrarSeccion(secciones, 'ANEXO I-A · Ranking comercial', doc);
    paginas.anexoIA = doc.getCurrentPageInfo().pageNumber;
    let yI = drawAnnexHeader(
      doc, informe, 'ANEXO I-A', 'Ranking comparativo completo — comercial',
      'Productos de la unión de ambos cortes del Top, ordenados por su posición en el período analizado: ingresos y variaciones (información comercial). Las cantidades y existencias están en el Anexo I-B y el Anexo II.',
    );
    const colI = anexoI.columnas.slice(0, 8); // Código..Variación %
    const filasIA = anexoI.filas.map((r) => r.slice(0, 8));
    // Anchura por columna calibrada para magnitudes reales; para cifras
    // excepcionales (magnitudes de estrés E/F) el tamaño de la celda se
    // ajusta ADAPTATIVAMENTE (mínimo 7.6 pt) sin truncar ni partir dígitos:
    // la cifra exacta se conserva íntegra (§10) y la fila sigue legible.
    const contentWL = pageW(doc) - 2 * M;
    const anchosIA = [0.095, 0.24, 0.06, 0.06, 0.13, 0.13, 0.145, 0.14];
    const padCelda = 2.1;
    yI = await drawTabla(
      doc,
      {
        head: colI,
        body: filasIA,
        colWidths: anchosIA,
        aligns: ['left', 'left', 'center', 'center', 'right', 'right', 'right', 'right'],
        fontSize: T_TABLA,
        didParseCell: (data) => {
          if (data.row.section !== 'body') return;
          const ci = data.column.index;
          if (ci < 4) return;
          const raw = String(data.cell.raw ?? '');
          if (!raw) return;
          const wCol = anchosIA[ci] * contentWL - 2 * padCelda;
          let fs = T_TABLA;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fs);
          while (fs > 7.6 && doc.getTextWidth(raw) > wCol) {
            fs -= 0.4;
            doc.setFontSize(fs);
          }
          if (doc.getTextWidth(raw) > wCol) {
            // Límite tipográfico: sigue siendo más legible reducir que partir
            // un dígito; se marca negrita para conservar el énfasis.
            data.cell.styles.fontStyle = 'bold';
          }
          data.cell.styles.fontSize = fs;
        },
      },
      informe,
      yI,
    );
    yI = drawNota(
      doc,
      'Variación CUP = ventas del período analizado − ventas del tramo comparable, por producto. «sin base» = el tramo comparable no registró ventas de ese producto; no se calcula porcentaje.',
      yI + 1.4,
      informe,
    );
  }
  if (anexoI && anexoI.filas.length > 0) {
    // I-B · Cantidades (vertical): código, descripción, cantidades por U.M.
    doc.addPage('a4', 'portrait');
    drawContinuationHeader(doc, informe);
    registrarSeccion(secciones, 'ANEXO I-B · Cantidades del ranking', doc);
    paginas.anexoIB = doc.getCurrentPageInfo().pageNumber;
    let yI = drawAnnexHeader(
      doc, informe, 'ANEXO I-B', 'Ranking comparativo — cantidades',
      'Mismas filas del Anexo I-A en su unidad de medida propia: cantidades vendidas de cada tramo. Las cantidades nunca se suman entre productos con unidades distintas.',
    );
    const colIB = ['Código', 'Descripción', anexoI.columnas[8], anexoI.columnas[9]];
    const filasIB = anexoI.filas.map((r) => [r[0], r[1], r[8], r[9]]);
    yI = await drawTabla(
      doc,
      {
        head: colIB,
        body: filasIB,
        colWidths: [0.14, 0.42, 0.22, 0.22],
        aligns: ['left', 'left', 'right', 'right'],
        fontSize: T_TABLA,
      },
      informe,
      yI,
    );
    yI = drawNota(
      doc,
      'Cada cantidad incluye su unidad de medida oficial (u, m, Kg, L, cajas, según catálogo).',
      yI + 1.4,
      informe,
    );
  }
  const anexoII = informe.anexos[1];
  if (anexoII) {
    doc.addPage('a4', 'portrait');
    drawContinuationHeader(doc, informe);
    registrarSeccion(secciones, 'ANEXO II · Disponibilidad y cobertura', doc);
    paginas.anexoII = doc.getCurrentPageInfo().pageNumber;
    let yI = drawAnnexHeader(doc, informe, 'ANEXO II', anexoII.titulo.replace(/^Anexo II\.\s*/i, ''), anexoII.intro);
    if (anexoII.filas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(T_AUX);
      doc.setTextColor(...C_MUTED);
      yI = drawWrapped(doc, 'Sin casos en este período.', M, yI, pageW(doc) - 2 * M, LH_AUX, informe) + 2;
    } else {
      yI = await drawTabla(
        doc,
        {
          head: anexoII.columnas,
          body: anexoII.filas,
          colWidths: [0.18, 0.14, 0.13, 0.15, 0.16, 0.24],
          aligns: ['left', 'right', 'right', 'right', 'left', 'left'],
          fontSize: T_TABLA,
          fitColumnos: [1, 2, 3],
        },
        informe,
        yI,
      );
    }
    if (anexoII.nota) {
      yI = drawNota(doc, `Nota: ${anexoII.nota}`, yI + 1.4, informe) + 1.5;
    }
  }
  const anexoIII = informe.anexos[2];
  if (anexoIII) {
    doc.addPage('a4', 'portrait');
    drawContinuationHeader(doc, informe);
    registrarSeccion(secciones, 'ANEXO III · Productos sin ventas', doc);
    paginas.anexoIII = doc.getCurrentPageInfo().pageNumber;
    let yI = drawAnnexHeader(doc, informe, 'ANEXO III', anexoIII.titulo.replace(/^Anexo III\.\s*/i, ''), anexoIII.intro);
    if (anexoIII.filas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(T_AUX);
      doc.setTextColor(...C_MUTED);
      yI = drawWrapped(doc, 'Sin casos en este período.', M, yI, pageW(doc) - 2 * M, LH_AUX, informe) + 2;
    } else {
      yI = await drawTabla(
        doc,
        {
          head: anexoIII.columnas,
          body: anexoIII.filas,
          colWidths: [0.19, 0.14, 0.13, 0.11, 0.12, 0.31],
          aligns: ['left', 'left', 'right', 'right', 'right', 'left'],
          fontSize: T_TABLA,
        },
        informe,
        yI,
      );
    }
    if (anexoIII.nota) {
      yI = drawNota(doc, `Nota: ${anexoIII.nota}`, yI + 1.4, informe) + 1.5;
    }
  }

  // Anexo IV — metodología y fuentes (página nueva propia).
  doc.addPage('a4', 'portrait');
  drawContinuationHeader(doc, informe);
  registrarSeccion(secciones, 'ANEXO IV · Metodología y fuentes', doc);
  paginas.anexoIV = doc.getCurrentPageInfo().pageNumber;
  {
    let ym = drawAnnexHeader(doc, informe, 'ANEXO IV', 'Metodología y fuentes', undefined);
    const contentW = pageW(doc) - 2 * M;
    for (const bloque of informe.metodologia) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(T_AUX);
      const lineasBloque = bloque.parrafos.reduce(
        (acc, parrafo) => acc + (doc.splitTextToSize(parrafo, contentW) as string[]).length + 0.3,
        0,
      );
      const altoBloque = 6 + lineasBloque * 4.7 + 3;
      ym = ensureSpace(doc, ym, Math.min(altoBloque, 140), informe);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...C_DARK);
      doc.text(bloque.titulo, M, ym + 2);
      ym += 7.5;
      for (const parrafo of bloque.parrafos) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.4);
        doc.setTextColor(...C_DARK);
        ym = drawWrapped(doc, parrafo, M, ym, contentW, 4.7, informe) + 1.6;
      }
      ym += 3;
    }
  }

  // ── Índice de portada (páginas reales + enlaces internos) + marcadores ──
  drawIndiceFinal(doc, paginas, indice);
  aplicarMarcadores(doc, secciones);

  // ── Pie institucional + numeración «Página X de Y» (portada libre, §4) ──
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    const pw = pageW(doc);
    const ph = pageH(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(T_FOOT);
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

  aplicarMetadatos(doc, informe);
  return doc;
}

/** Descarga el informe con el nombre oficial (acción EXPLÍCITA del usuario). */
export async function exportInformeEjecutivoPdf(informe: InformeEjecutivo): Promise<void> {
  const doc = await buildInformeEjecutivoPdf(informe);
  doc.save(informeEjecutivoFileName(informe));
}
