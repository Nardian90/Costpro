/**
 * MISIÓN 2026-10-23 (§6) — PERÍODO COMPLETO, FLECHA VECTORIAL Y DOS SECCIONES.
 *
 * Construye el PDF REAL (jsPDF, plantilla Diario) y espía cada doc.text /
 * doc.line. La causa raíz del período cortado era doble:
 *   1. '→' (U+2192) NO existe en WinAnsiEncoding → jsPDF emitía basura ("!'")
 *      y el período aparecía corrupto/parcial. Ahora la flecha se DIBUJA como
 *      vector (drawTextWithArrow) — ningún doc.text lleva U+2192.
 *   2. Tienda+título (izq) y Período (der) compartían UNA línea 12pt →
 *      colisión. Ahora el encabezado son TRES líneas (tienda / título /
 *      período en línea propia) y se repite en la sección 2.
 * Además: la LÍNEA DE CORTE entre secciones (fina 0.25 + marcas 0.6 en los
 * extremos) y el pie de página con el período completo centrado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Spies: TODOS los doc.text y doc.line del jsPDF real ──
const textLog = vi.hoisted(() => [] as Array<{ page: number; text: string; x: number; y: number }>);
const lineLog = vi.hoisted(() => [] as Array<{ page: number; x1: number; y1: number; x2: number; y2: number; lw: number }>);

vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as any)(orientation, unit, format);
    const origText = doc.text.bind(doc);
    doc.text = (t: unknown, x: number, y: number, opts?: unknown) => {
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      textLog.push({ page: doc.getNumberOfPages(), text: s, x, y });
      return origText(t, x, y, opts);
    };
    let lw = 1;
    const origSetLineWidth = doc.setLineWidth.bind(doc);
    doc.setLineWidth = (w: number) => { lw = w; return origSetLineWidth(w); };
    const origLine = doc.line.bind(doc);
    doc.line = (x1: number, y1: number, x2: number, y2: number) => {
      lineLog.push({ page: doc.getNumberOfPages(), x1, y1, x2, y2, lw });
      return origLine(x1, y1, x2, y2);
    };
    return doc;
  },
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (String(url).includes('/api/commissions/calculate')) return [];
    return {};
  }),
}));

import {
  buildCashReportPdf,
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

const ITEMS = [
  { product_id: 'pid-141', product_name: 'Cemento TBV 50 Kg', sku: '141', total_quantity: 2, qty_cup: 2, qty_usd: 0, total_cup: 40000, cash_cup: 40000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
];

function ctxWith(start: string, end: string): CashReportPdfContext {
  return {
    report: {
      sales: [{ payment_method: 'cash', currency: 'CUP', total: 40000, transaction_count: 1 }],
      commissions: [], payments: [], production: [], adjustments: [], cash_flows: [], refund_rows: [], totals: {},
      sales_split: { CUP: { cash: 40000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 40000 } },
    } as any,
    template: 'diario',
    startDate: start,
    endDate: end,
    storeInfo: { name: 'ENERVIDA-VITALLCONS', logo_url: null, address: 'Calle Menocal SN', phone: null, email: null, reeup: null, nit: null },
    deliveredBy: '', recipientName: '', madeBy: '',
    cupDenoms: [1000, 500, 100], usdDenoms: [100, 50],
    cupBreakdown: { 1000: '40' }, usdBreakdown: {},
    options: { ...DEFAULT_PDF_OPTIONS, includeCommissionColumn: false, includeUsd: false },
    orientation: 'vertical',
  };
}

const summaries = (): Required<CashReportSummaries> => ({
  itemsSummary: { items: ITEMS, total_cup: 40000, total_cash: 40000, total_transfer: 0, total_zelle: 0 },
  paymentTotals: { totals: { CUP: { cash: 40000, transfer: 0, zelle: 0, total: 40000 } } },
  commissionsSummary: { workers: [], total_cup: 0 },
  productionOrders: [],
});

const textsOf = (page: number) => textLog.filter(e => e.page === page).map(e => e.text);
const FULL_W = 185;

describe('MISIÓN 2026-10-23 §6 — Período completo con flecha vectorial', () => {
  beforeEach(() => { textLog.length = 0; lineLog.length = 0; });

  it('NINGÚN doc.text contiene U+2192 (la flecha se dibuja como VECTOR, no como texto WinAnsi)', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-22'), summaries());
    expect(textLog.some(e => e.text.includes('→'))).toBe(false);
    expect(textLog.some(e => e.text.includes('\u2192'))).toBe(false);
    // Las dos fechas del período SÍ viajan como texto (segmentos before/after)
    expect(textLog.some(e => e.text.includes('Período: 2026-10-21'))).toBe(true);
    expect(textLog.some(e => e.text === '2026-10-22')).toBe(true);
  });

  it('Encabezado de TRES líneas: tienda sola, título solo, período en línea propia — y se REPITE en la sección 2', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-22'), summaries());
    const p1 = textsOf(1);
    // Línea 1: la tienda viaja SOLA (nunca concatenada con el título — sin colisión)
    expect(p1).toContain('ENERVIDA-VITALLCONS');
    expect(p1.some(t => t === 'Reporte de Venta CUP')).toBe(true);
    expect(p1.some(t => t.startsWith('ENERVIDA-VITALLCONS '))).toBe(false);
    // Línea 3: el período abre su propio segmento de texto
    expect(p1.some(t => t.startsWith('Período: 2026-10-21'))).toBe(true);
    // El encabezado COMPLETO se repite para la SECCIÓN 2 (misión §3)
    expect(p1.filter(t => t === 'Reporte de Venta CUP').length).toBe(2);
    expect(p1.filter(t => t === 'ENERVIDA-VITALLCONS').length).toBe(2);
    expect(p1.filter(t => t.startsWith('Período: 2026-10-21')).length).toBe(2);
  });

  it('Período de un SOLO día: se imprime la fecha única (sin flecha ni segunda fecha)', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-21'), summaries());
    const p1 = textsOf(1);
    expect(p1.some(t => t.startsWith('Período: 2026-10-21'))).toBe(true);
    // Sin segunda fecha de segmento: el único «2026-10-22» posible sería del período
    expect(p1.some(t => t === '2026-10-22')).toBe(false);
  });

  it('Pie de página: el período completo centrado con la flecha vectorial (ambas fechas presentes)', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-22'), summaries());
    const footerEntry = textLog.find(e => e.text.includes('CostPro — Reporte Diario'));
    expect(footerEntry).toBeTruthy();
    expect(footerEntry!.text).toContain('Período 2026-10-21');
    // El segmento posterior del pie lleva la fecha final + numeración
    const after = textLog.find(e => /2026-10-22 · Página 1 de/.test(e.text));
    expect(after).toBeTruthy();
  });

  it('LÍNEA DE CORTE entre las secciones (§3): fina (0.25) a ancho completo + marcas (0.6) en ambos extremos', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-22'), summaries());
    const cut = lineLog.filter(l => l.page === 1 && l.lw === 0.25 && (l.x2 - l.x1) >= FULL_W);
    expect(cut.length).toBeGreaterThanOrEqual(1);
    const cy = cut[0].y1;
    // Marcas de corte en los extremos: segmentos VERTICALES cortos (0.6) que
    // cruzan la línea (y1 < cy < y2) en los márgenes izquierdo y derecho.
    const ticks = lineLog.filter(l => l.page === 1 && l.lw === 0.6 && Math.abs(l.x1 - l.x2) < 1 && l.y1 < cy && l.y2 > cy);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    const tickXs = ticks.map(t => t.x1).sort((a, b) => a - b);
    expect(tickXs[0]).toBeLessThanOrEqual(11);        // margen izquierdo (m=10)
    expect(tickXs[tickXs.length - 1]).toBeGreaterThanOrEqual(199); // margen derecho (pw-m=200)
  });

  it('La línea de corte NO atraviesa textos ni firmas: va tras el pie de la sección 1 y antes del encabezado repetido', async () => {
    await buildCashReportPdf(ctxWith('2026-10-21', '2026-10-22'), summaries());
    const cut = lineLog.find(l => l.page === 1 && l.lw === 0.25 && (l.x2 - l.x1) >= FULL_W);
    expect(cut).toBeTruthy();
    // El pie de la sección 1 (línea «Hecho por:» y su filete) queda POR ENCIMA del corte
    const firstPie = textLog.find(e => e.page === 1 && e.text === 'Hecho por:');
    expect(firstPie).toBeTruthy();
    expect(firstPie!.y).toBeLessThan(cut!.y1);
    // El encabezado repetido de la sección 2 queda POR DEBAJO del corte
    const headers = textLog.filter(e => e.page === 1 && e.text === 'Reporte de Venta CUP');
    expect(headers.length).toBe(2);
    expect(headers[1].y).toBeGreaterThan(cut!.y1);
    // La tabla de la sección 2 también empieza por debajo del corte
    const tableHeader = textLog.find(e => e.page === 1 && e.text === 'Código');
    expect(tableHeader).toBeTruthy();
    expect(tableHeader!.y).toBeGreaterThan(cut!.y1);
  });
});
