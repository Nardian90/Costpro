/**
 * MISIÓN CP-DOC-COMPARAR-PRODUCTOS-001 · Gráficos 3.A y 3.B del Informe
 * Ejecutivo de Comparación de Productos — AUDITORÍA VISUAL 2026-11-27.
 *
 * Petición del propietario sobre el PDF generado («Productos Enervida.pdf»):
 *   · En 3.A y 3.B debe saberse SIN CONFUSIÓN a qué producto pertenece cada
 *     barra → banda de asociación visual alterna (C_BAND #F8FAFC) que encierra
 *     nombre + barras + marcador de tendencia del MISMO producto, más una
 *     línea separadora SUAVE entre productos (C_SEPARADOR #E2E8F0).
 *   · Las etiquetas de valor deben quedar MÁS PEGADAS a las barras
 *     (1.4 mm → 1.0 mm desde el extremo de la barra).
 *
 * El PDF se construye REAL (jsPDF vía createPDFDocument espiado) y se inspeccionan
 * las primitivas vectoriales (rect/line/text) con su color de relleno/trazo y
 * coordenadas — mismo mecanismo probado de los tests de cash-report-pdf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildComparison, type PeriodProductRow, type ProductCatalogRow } from '@/lib/product-comparison/compare';
import { buildInformeEjecutivo, type InformeInput } from '@/lib/product-comparison/informe';

// ── Log de primitivas vectoriales (rect/line/text) del jsPDF real ────────────
interface RectCall { kind: 'rect'; page: number; x: number; y: number; w: number; h: number; style: string; fill: string }
interface LineCall { kind: 'line'; page: number; x1: number; y1: number; x2: number; y2: number; stroke: string }
interface TextCall { kind: 'text'; page: number; x: number; y: number; text: string; align?: string }
type PrimCall = RectCall | LineCall | TextCall;

const primLog = vi.hoisted(() => [] as PrimCall[]);

vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as unknown as new (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>)(orientation, unit, format);
    let currentFill = '';
    let currentStroke = '';
    const origSetFill = doc.setFillColor.bind(doc) as (...a: unknown[]) => unknown;
    doc.setFillColor = (...a: unknown[]) => {
      currentFill = a.map((v) => String(v)).join(',');
      return origSetFill(...a);
    };
    const origSetDraw = doc.setDrawColor.bind(doc) as (...a: unknown[]) => unknown;
    doc.setDrawColor = (...a: unknown[]) => {
      currentStroke = a.map((v) => String(v)).join(',');
      return origSetDraw(...a);
    };
    const origRect = doc.rect.bind(doc) as (...a: unknown[]) => unknown;
    doc.rect = (...a: unknown[]) => {
      primLog.push({
        kind: 'rect', page: doc.getNumberOfPages() as number,
        x: a[0] as number, y: a[1] as number, w: a[2] as number, h: a[3] as number,
        style: String(a[4] ?? 'S'), fill: currentFill,
      });
      return origRect(...a);
    };
    const origLine = doc.line.bind(doc) as (...a: unknown[]) => unknown;
    doc.line = (...a: unknown[]) => {
      primLog.push({
        kind: 'line', page: doc.getNumberOfPages() as number,
        x1: a[0] as number, y1: a[1] as number, x2: a[2] as number, y2: a[3] as number, stroke: currentStroke,
      });
      return origLine(...a);
    };
    const origText = doc.text.bind(doc) as (...a: unknown[]) => unknown;
    doc.text = (...a: unknown[]) => {
      const t = a[0];
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      const opts = (a[3] ?? {}) as { align?: string };
      primLog.push({
        kind: 'text', page: doc.getNumberOfPages() as number,
        x: a[1] as number, y: a[2] as number, text: s, align: opts.align,
      });
      return origText(...a);
    };
    return doc;
  },
}));

import { buildInformeEjecutivoPdf } from '@/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf';

// ── Paleta esperada (misma del generador) ────────────────────────────────────
const C_BAND = '248,250,252';       // banda de asociación
const C_SEPARADOR = '226,232,240';  // hairline entre productos
const GR_ANTERIOR = '71,85,105';    // barra tramo comparable
const GR_ACTUAL = '21,128,61';      // barra período analizado
const GR_NEGATIVO = '220,38,38';    // barra divergente negativa

const M = 20;
// jsPDF a4 en mm = 210.0016 (conversión pt→mm): se usa tolerancia, no igualdad exacta.
const PAGE_W = 210.0016;
const CONTENT_W = PAGE_W - 2 * M; // 170.0016

// ── Fixture: los valores VISIBLES del PDF del propietario (Productos Enervida) ─
const row = (o: Partial<PeriodProductRow> & { product_id: string; name: string }): PeriodProductRow => ({
  sku: o.product_id.toUpperCase().slice(0, 6),
  units_sold: 0,
  units_returned: 0,
  net_cup: 0,
  ...o,
});

const catalogo = (
  { stock_current = 0, unit_of_measure = 'unidades', ...o }: Partial<ProductCatalogRow> & { id: string; name: string },
): ProductCatalogRow => ({ ...o, stock_current, unit_of_measure });

const TOP_ACTUAL: PeriodProductRow[] = [
  row({ product_id: 'inversor', name: 'Inversor', units_sold: 1, net_cup: 382000 }),
  row({ product_id: 'cola', name: 'Cemento Cola', units_sold: 22, net_cup: 220000 }),
  row({ product_id: 'royal', name: 'Royal Cole', units_sold: 59, net_cup: 147500 }),
  row({ product_id: 'cable-rojo', name: 'Cable Solar Rojo 4mm', units_sold: 29, net_cup: 120420 }),
];

const TOP_ANTERIOR: PeriodProductRow[] = [
  row({ product_id: 'tbv', name: 'Cemento TBV 50 Kg', units_sold: 78, net_cup: 1532640 }),
  row({ product_id: 'suntech', name: 'Panel de 640 W Suntech', units_sold: 3, net_cup: 481950 }),
  row({ product_id: 'cola', name: 'Cemento Cola', units_sold: 21, net_cup: 210000 }),
  row({ product_id: 'royal', name: 'Royal Cole', units_sold: 22.5, net_cup: 56250 }),
  row({ product_id: 'cable-rojo', name: 'Cable Solar Rojo 4mm', units_sold: 39, net_cup: 131760 }),
];

const CATALOGO: ProductCatalogRow[] = [
  catalogo({ id: 'inversor', name: 'Inversor', stock_current: 0 }),
  catalogo({ id: 'cola', name: 'Cemento Cola', stock_current: 45 }),
  catalogo({ id: 'royal', name: 'Royal Cole', stock_current: 6 }),
  catalogo({ id: 'cable-rojo', name: 'Cable Solar Rojo 4mm', stock_current: 135, unit_of_measure: 'metros' }),
  catalogo({ id: 'tbv', name: 'Cemento TBV 50 Kg', stock_current: 0 }),
  catalogo({ id: 'suntech', name: 'Panel de 640 W Suntech', stock_current: 6 }),
];

const input: InformeInput = {
  rows: buildComparison(TOP_ACTUAL, TOP_ANTERIOR, CATALOGO, null).rows,
  resumen: buildComparison(TOP_ACTUAL, TOP_ANTERIOR, CATALOGO, null).resumen,
  meta: {
    entidadNombre: 'ENERVIDA-VITALLCONS',
    periodoActual: { desde: '2026-11-01', hasta: '2026-11-27' },
    periodoComparacion: { desde: '2026-10-01', hasta: '2026-10-27' },
    ambito: 'ENERVIDA-VITALLCONS',
  },
  generadoEl: '2026-11-27T08:35:00.000Z',
  ventasEnPeriodoActual: null,
};

// Replicación EXACTA de fmtCompact del generador (es-CU, mismos dígitos).
const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CU', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('es-CU', { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString('es-CU', { maximumFractionDigits: 0 });
};

// Geometría replicada del gráfico A (§4.A).
const labelW_A = CONTENT_W * 0.33;
const barArea_A = CONTENT_W - labelW_A - 20;
const xBar_A = M + labelW_A;
// Geometría replicada del gráfico B (§4.B).
const labelW_B = CONTENT_W * 0.34;
const chartW_B = CONTENT_W - labelW_B - 4;
const zeroX_B = M + labelW_B + chartW_B * 0.45;
const halfPos_B = chartW_B * 0.55 - 2;
const halfNeg_B = chartW_B * 0.45 - 2;

// Serie esperada del gráfico A (orden: max(ventas) desc — engine §710-714).
const SERIES_A = [
  { name: 'Cemento TBV 50 Kg', anterior: 1532640, actual: 0 },
  { name: 'Panel de 640 W Suntech', anterior: 481950, actual: 0 },
  { name: 'Inversor', anterior: 0, actual: 382000 },
  { name: 'Cemento Cola', anterior: 210000, actual: 220000 },
  { name: 'Royal Cole', anterior: 56250, actual: 147500 },
  { name: 'Cable Solar Rojo 4mm', anterior: 131760, actual: 120420 },
];
const MAX_A = Math.max(...SERIES_A.flatMap((s) => [s.anterior, s.actual]));
const VARIACIONES_B = [
  { name: 'Inversor', difCup: 382000, esNuevo: true },
  { name: 'Royal Cole', difCup: 91250, esNuevo: false },
  { name: 'Cemento Cola', difCup: 10000, esNuevo: false },
  { name: 'Cemento TBV 50 Kg', difCup: -1532640, esNuevo: false },
  { name: 'Panel de 640 W Suntech', difCup: -481950, esNuevo: false },
  { name: 'Cable Solar Rojo 4mm', difCup: -11340, esNuevo: false },
];
const MAX_ABS_B = 1532640;

let pageA = 0;
let yTitleA = 0;
let pageB = 0;
let yTitleB = 0;

beforeEach(async () => {
  primLog.length = 0;
  await buildInformeEjecutivoPdf(buildInformeEjecutivo(input));
  const tA = primLog.find((c) => c.kind === 'text' && c.text === 'Ingresos por producto: tramo comparable vs. período analizado (CUP)');
  const tB = primLog.find((c) => c.kind === 'text' && c.text === 'Variación de ingresos por producto (CUP) — mayores movimientos del período');
  expect(tA, 'el título del gráfico 3.A debe existir en el PDF').toBeTruthy();
  expect(tB, 'el título del gráfico 3.B debe existir en el PDF').toBeTruthy();
  pageA = (tA as TextCall).page;
  yTitleA = (tA as TextCall).y;
  pageB = (tB as TextCall).page;
  yTitleB = (tB as TextCall).y;
});

const rectsEn = (page: number, fill?: string, yMin = -Infinity, yMax = Infinity) =>
  primLog.filter(
    (c): c is RectCall => c.kind === 'rect' && c.page === page && (fill === undefined || c.fill === fill) && c.y >= yMin && c.y <= yMax,
  );

const lineasEn = (page: number, stroke?: string, yMin = -Infinity, yMax = Infinity) =>
  primLog.filter(
    (c): c is LineCall => c.kind === 'line' && c.page === page && (stroke === undefined || c.stroke === stroke) && c.y1 >= yMin && c.y1 <= yMax,
  );

describe('Gráfico 3.A — delimitación visual por producto (petición del propietario)', () => {
  it('una banda de asociación por producto alterno: ceil(n/2) bandas de ancho completo', () => {
    // Fin del gráfico A = inicio del 3.B si comparten página (el título de 3.B delimita).
    const yFin = pageA === pageB ? yTitleB : Infinity;
    const bandas = rectsEn(pageA, C_BAND, yTitleA - 6, yFin);
    expect(bandas.length).toBe(Math.ceil(SERIES_A.length / 2));
    for (const b of bandas) {
      expect(b.w).toBeCloseTo(CONTENT_W, 2);
      // La banda encierra TODO el grupo: nombre + 2 barras + marcador de tendencia.
      expect(b.h).toBeGreaterThanOrEqual(11.6); // barH*2 + gapBar = 11.6
    }
  });

  it('una línea separadora SUAVE entre cada par de productos consecutivos: n-1 hairlines', () => {
    const yFin = pageA === pageB ? yTitleB : Infinity;
    const seps = lineasEn(pageA, C_SEPARADOR, yTitleA, yFin);
    expect(seps.length).toBe(SERIES_A.length - 1);
    for (const s of seps) {
      expect(s.x1).toBeCloseTo(M, 2);
      expect(s.x2).toBeCloseTo(M + CONTENT_W, 2);
    }
  });

  it('la banda se dibuja DEBAJO de las barras (z-order: ninguna barra tapada)', () => {
    const idxPrimeraBanda = primLog.findIndex((c) => c.kind === 'rect' && c.fill === C_BAND && c.page === pageA);
    const idxPrimeraBarra = primLog.findIndex((c) => c.kind === 'rect' && c.fill === GR_ANTERIOR && c.page === pageA);
    expect(idxPrimeraBanda).toBeGreaterThanOrEqual(0);
    expect(idxPrimeraBarra).toBeGreaterThanOrEqual(0);
    expect(idxPrimeraBanda).toBeLessThan(idxPrimeraBarra);
  });

  it('etiqueta de valor PEGADA a la barra: 1.0 mm desde el extremo (antes 1.4)', () => {
    const yFin = pageA === pageB ? yTitleB : Infinity;
    const textos = primLog.filter(
      (c): c is TextCall => c.kind === 'text' && c.page === pageA && c.y >= yTitleA && c.y <= yFin,
    );
    // Caso Inversor (actual = 382000, anterior = 0): barra actual del período.
    const s = SERIES_A[2];
    const wAct = Math.max((s.actual / MAX_A) * barArea_A, 0.9);
    const esperadoX = xBar_A + wAct + 1.0;
    const etiqueta = textos.find((t) => t.text === fmtCompact(s.actual) && Math.abs(t.x - esperadoX) < 0.35);
    expect(etiqueta, `el valor ${fmtCompact(s.actual)} debe estar a 1.0 mm del extremo de la barra`).toBeTruthy();
    // Caso Cemento Cola (ambas barras > 0): etiqueta del período analizado.
    const sCola = SERIES_A[3];
    const wActCola = (sCola.actual / MAX_A) * barArea_A;
    const esperadoCola = xBar_A + wActCola + 1.0;
    const etCola = textos.find((t) => t.text === fmtCompact(sCola.actual) && Math.abs(t.x - esperadoCola) < 0.35);
    expect(etCola).toBeTruthy();
  });

  it('sin ventas en un tramo ⇒ SIN barra y SIN etiqueta en ese tramo (no se inventan datos)', () => {
    const yFin = pageA === pageB ? yTitleB : Infinity;
    const textos = primLog.filter(
      (c): c is TextCall => c.kind === 'text' && c.page === pageA && c.y >= yTitleA && c.y <= yFin,
    );
    // Inversor no vendió en el tramo comparable: no existe etiqueta «0» para su barra anterior.
    const fakeCero = textos.find((t) => t.text === '0' && t.x > xBar_A);
    expect(fakeCero).toBeUndefined();
    // TBV no vendió en el período: sin etiqueta de valor de la barra actual en su fila.
    // (su fila solo tiene la etiqueta del tramo comparable 1.53 M)
    const tbvAnt = textos.filter((t) => t.text === fmtCompact(1532640));
    expect(tbvAnt.length).toBe(1); // solo el tramo comparable; el valor actual «0» no se imprime
  });
});

describe('Gráfico 3.B — delimitación visual por producto (petición del propietario)', () => {
  it('una banda por producto alterno y n-1 hairlines separadoras', () => {
    const bandas = rectsEn(pageB, C_BAND, yTitleB - 6);
    expect(bandas.length).toBe(Math.ceil(VARIACIONES_B.length / 2));
    const seps = lineasEn(pageB, C_SEPARADOR, yTitleB);
    expect(seps.length).toBe(VARIACIONES_B.length - 1);
  });

  it('etiquetas de variación PEGADAS al extremo de la barra divergente (1.0 mm)', () => {
    // Subida NUEVA (Inversor): valor a la derecha del extremo + insignia NUEVO.
    const w = (382000 / MAX_ABS_B) * halfPos_B;
    const esperadoX = zeroX_B + w + 1.0;
    const etiqueta = primLog.find(
      (c): c is TextCall => c.kind === 'text' && c.page === pageB && c.text === '+382 k' && Math.abs(c.x - esperadoX) < 0.35,
    );
    expect(etiqueta, '+382 k debe quedar a 1.0 mm del extremo de la barra verde').toBeTruthy();
    // Bajada MEDIANA (Suntech −482 k): etiqueta FUERA a la izquierda, a 1.0 mm.
    // (la rama negativa imprime valor + porcentaje como UNA sola cadena)
    const wNegS = (481950 / MAX_ABS_B) * halfNeg_B;
    const esperadoNeg = zeroX_B - wNegS - 1.0;
    const etNeg = primLog.find(
      (c): c is TextCall => c.kind === 'text' && c.page === pageB && c.text === `-${fmtCompact(481950)} (-100%)` && Math.abs(c.x - esperadoNeg) < 0.35,
    );
    expect(etNeg, `-${fmtCompact(481950)} debe quedar a 1.0 mm del extremo de la barra roja`).toBeTruthy();
    // Bajada MÁXIMA (TBV −1,53 M): sin espacio a la izquierda ⇒ regla §11 —
    // etiqueta DENTRO de la barra (texto blanco, anclada al interior).
    const wNegMax = (1532640 / MAX_ABS_B) * halfNeg_B;
    const dentro = primLog.find(
      (c): c is TextCall => c.kind === 'text' && c.page === pageB && c.text === `-${fmtCompact(1532640)} (-100%)` && Math.abs(c.x - (zeroX_B - wNegMax + 2)) < 0.35,
    );
    expect(dentro, '-1,53 M debe quedar DENTRO de la barra (fallback §11)').toBeTruthy();
  });

  it('NUEVO se identifica con insignia textual y SIN porcentaje ficticio (§4.D intacto)', () => {
    const nuevos = primLog.filter((c): c is TextCall => c.kind === 'text' && c.page === pageB && c.text === 'NUEVO');
    expect(nuevos.length).toBe(VARIACIONES_B.filter((v) => v.esNuevo).length);
    // Inversor (nuevo): NO lleva porcentaje.
    const etNuevo = primLog.find(
      (c): c is TextCall => c.kind === 'text' && c.text.includes('+382 k') && c.text.includes('%'),
    );
    expect(etNuevo).toBeUndefined();
  });
});

describe('Integridad del documento tras la mejora', () => {
  it('el PDF completo se construye sin errores y mantiene su estructura', async () => {
    const doc = await buildInformeEjecutivoPdf(buildInformeEjecutivo(input));
    const paginas = doc.getNumberOfPages();
    expect(paginas).toBeGreaterThanOrEqual(3); // portada + contenido + anexos
    const bytes = doc.output('arraybuffer') as ArrayBuffer;
    expect(bytes.byteLength).toBeGreaterThan(20_000);
  });
});
