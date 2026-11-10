/**
 * cash-report-pdf-services-breakdown.test.tsx — MISIÓN 2026-11-11 (Reporte
 * Entrega). Documento REAL (plantilla Diario) con el caso del brief:
 *
 *   RESUMEN DEL DÍA — ventas efectivo 94.595,00 · Servicios recibidos en
 *   efectivo −11.100,00 · Efectivo esperado 83.495,00.
 *
 * Verifica:
 *   · Opción DESMARCADA (default): PDF SIN desglose — formato actual intacto.
 *   · Opción MARCADA: sub-filas por concepto (› Comisión −2.900,00,
 *     › Salario Fijo −5.000,00, › Otros −3.200,00) INMEDIATAMENTE debajo de
 *     la línea global, importes con signo negativo.
 *   · El EFECTIVO ESPERADO es IDÉNTICO con la opción activada y desactivada
 *     (el desglose explica la deducción; NO es una nueva deducción).
 *   · Conciliación visible: 2.900 + 5.000 + 3.200 = 11.100.
 *   · Períodos sin Servicios Recibidos: el documento se genera igual.
 *   · Hoja USD: mismo desglose con SU moneda nativa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const textLog: Array<{ page: number; text: string; x: number; y: number }> = [];
vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as any)(orientation, unit, format);
    const orig = doc.text.bind(doc);
    doc.text = (t: unknown, x: number, y: number, opts?: unknown) => {
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      textLog.push({ page: doc.getNumberOfPages(), text: s, x, y });
      return orig(t, x, y, opts);
    };
    return doc;
  },
}));
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async () => ({})),
}));

import {
  buildCashReportPdf,
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

const DESGLOSE_CUP = [
  { concept: 'Comisión', total: 2900, count: 1 },
  { concept: 'Salario Fijo', total: 5000, count: 2 },
  { concept: 'Otros', total: 3200, count: 1 },
];

/** Reporte del brief: 94.595 efectivo − 11.100 servicios = 83.495 esperado. */
function reporteBrief(conDesglose: boolean) {
  return {
    sales: [{ payment_method: 'cash', currency: 'CUP', transaction_count: 5, total: 94595, total_cup: 94595 }],
    sales_split: { CUP: { cash: 94595, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 94595 } },
    payments: [{ payment_method: 'cash', currency: 'CUP', ref_type: 'service', payment_count: 3, total: 11100, total_cup: 11100 }],
    commissions: [],
    production: [],
    totals: { sales_total_cup: 94595, payments_total_cup: 11100, commissions_total_cup: 0, balance_cup: 83495 },
    start_date: '2026-11-10T04:00:00.000Z',
    end_date: '2026-11-11T03:59:59.999Z',
    cash_balance_cup: 83495,
    cash_breakdown: [],
    ...(conDesglose ? { servicios_recibidos_por_concepto: { CUP: DESGLOSE_CUP } } : {}),
  } as never;
}

function ctxFor(report: never, options = { ...DEFAULT_PDF_OPTIONS }): CashReportPdfContext {
  return {
    report,
    template: 'diario',
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    storeInfo: { name: 'Tienda Demo', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null },
    deliveredBy: 'Entrega',
    recipientName: 'Recibe',
    madeBy: 'Elabora',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: {},
    usdBreakdown: {},
    options,
    orientation: 'vertical',
  };
}

async function textsOf(ctx: CashReportPdfContext): Promise<string[]> {
  textLog.length = 0;
  await buildCashReportPdf(ctx);
  return textLog.map(t => t.text);
}

beforeEach(() => {
  textLog.length = 0;
});

describe('MISIÓN 2026-11-11 · desglose de Servicios Recibidos por concepto en el PDF', () => {
  it('escenario 1 · opción DESMARCADA (default): el PDF NO contiene desglose — formato actual intacto', async () => {
    const texts = await textsOf(ctxFor(reporteBrief(true), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: false }));
    expect(texts.some(t => t.includes('Servicios recibidos pagados en efectivo'))).toBe(true);
    expect(texts.some(t => t.includes('›'))).toBe(false);
    expect(DEFAULT_PDF_OPTIONS.breakdownServicesByConcept).toBe(false);
  });

  it('escenario 2 · opción MARCADA: sub-filas por concepto con signo negativo, debajo de la línea global', async () => {
    const texts = await textsOf(ctxFor(reporteBrief(true), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    const parentIdx = texts.findIndex(t => t.includes('Servicios recibidos pagados en efectivo'));
    const esperadoIdx = texts.findIndex(t => t.includes('Efectivo esperado'));
    expect(parentIdx).toBeGreaterThan(-1);
    // Sub-filas presentes con el prefijo jerárquico:
    for (const label of ['› Comisión', '› Salario Fijo', '› Otros']) {
      const idx = texts.findIndex(t => t === label);
      expect(idx).toBeGreaterThan(parentIdx); // subordinadas: DESPUÉS de la línea global
      expect(idx).toBeLessThan(esperadoIdx);  // y ANTES del bloque del esperado
    }
    // Importes con signo negativo (ilustrativos del brief):
    expect(texts).toContain('-2.900,00');
    expect(texts).toContain('-5.000,00');
    expect(texts).toContain('-3.200,00');
    // La línea global se MANTIENE (no se sustituye):
    const negIdx = texts.findIndex(t => t === '-11.100,00');
    expect(negIdx).toBeGreaterThan(-1);
    expect(negIdx).toBeLessThan(texts.findIndex(t => t === '› Comisión'));
  });

  it('escenario 13 · el EFECTIVO ESPERADO (83.495,00) es IDÉNTICO con la opción activada y desactivada', async () => {
    const off = await textsOf(ctxFor(reporteBrief(true), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: false }));
    const on = await textsOf(ctxFor(reporteBrief(true), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    expect(off).toContain('83.495,00');
    expect(on).toContain('83.495,00');
    // Las filas NO-desglose son idénticas 1:1 (presentación pura): se excluyen
    // las sub-filas (prefijo «›») y SUS importes (deducción explicada, no
    // reintroducida) — todo lo demás debe coincidir exactamente.
    const subAmounts = new Set(['-2.900,00', '-5.000,00', '-3.200,00']);
    const baseOff = off.filter(t => !t.includes('›'));
    const baseOn = on.filter(t => !t.includes('›') && !subAmounts.has(t));
    expect(baseOn).toEqual(baseOff);
    // Conciliación visible: la suma de los conceptos = el total global.
    expect(on).toContain('-11.100,00');
  });

  it('escenario 12 (documento) · sub-filas NO duplican la deducción: solo aparece un total global', async () => {
    const texts = await textsOf(ctxFor(reporteBrief(true), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    const globals = texts.filter(t => t === '-11.100,00').length;
    expect(globals).toBe(1);
  });

  it('escenario 9 · período SIN Servicios Recibidos: el documento se genera igual, sin filas de desglose', async () => {
    const sinServicios = {
      sales: [{ payment_method: 'cash', currency: 'CUP', transaction_count: 2, total: 5000, total_cup: 5000 }],
      sales_split: { CUP: { cash: 5000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 5000 } },
      payments: [],
      commissions: [],
      production: [],
      totals: { sales_total_cup: 5000, payments_total_cup: 0, commissions_total_cup: 0, balance_cup: 5000 },
      start_date: '2026-11-10T04:00:00.000Z',
      end_date: '2026-11-11T03:59:59.999Z',
      cash_balance_cup: 5000,
      cash_breakdown: [],
    } as never;
    const texts = await textsOf(ctxFor(sinServicios, { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    expect(texts.some(t => t.includes('Servicios recibidos'))).toBe(false);
    expect(texts).toContain('5.000,00');
    expect(texts.some(t => t.includes('›'))).toBe(false);
  });

  it('reporte sin datos de desglose (campo ausente) + opción activada → SIN sub-filas y sin fallo', async () => {
    const texts = await textsOf(ctxFor(reporteBrief(false), { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    expect(texts).toContain('-11.100,00');
    expect(texts.some(t => t.includes('›'))).toBe(false);
  });

  it('hoja USD: el desglose usa SU moneda nativa (importes con formato USD)', async () => {
    const reporteUsd = {
      sales: [
        { payment_method: 'cash', currency: 'CUP', transaction_count: 5, total: 94595, total_cup: 94595 },
        { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 100, total_cup: 80000 },
      ],
      sales_split: {
        CUP: { cash: 94595, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 94595 },
        USD: { cash: 100, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 100 },
      },
      payments: [
        { payment_method: 'cash', currency: 'CUP', ref_type: 'service', payment_count: 3, total: 11100, total_cup: 11100 },
        { payment_method: 'cash', currency: 'USD', ref_type: 'service', payment_count: 1, total: 15, total_cup: 12000 },
      ],
      commissions: [],
      production: [],
      totals: { sales_total_cup: 174595, payments_total_cup: 23100, commissions_total_cup: 0, balance_cup: 151495 },
      start_date: '2026-11-10T04:00:00.000Z',
      end_date: '2026-11-11T03:59:59.999Z',
      cash_balance_cup: 83495,
      cash_breakdown: [],
      servicios_recibidos_por_concepto: {
        CUP: DESGLOSE_CUP,
        USD: [{ concept: 'Custodios', total: 15, count: 1 }],
      },
    } as never;
    const texts = await textsOf(ctxFor(reporteUsd, { ...DEFAULT_PDF_OPTIONS, breakdownServicesByConcept: true }));
    expect(texts).toContain('› Custodios');
    // El bloque Resumen del Día formatea ambas hojas con la convención es-ES
    // (comportamiento preexistente de renderIncomeBlock — parity con la línea
    // global de servicios de la hoja USD):
    expect(texts).toContain('-15,00');
    expect(texts).toContain('› Comisión'); // hoja CUP intacta
  });
});
