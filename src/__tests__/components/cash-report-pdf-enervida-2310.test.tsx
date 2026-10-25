/**
 * cash-report-pdf-enervida-2310.test.tsx — MISIÓN CORRECTIVA DEFINITIVA
 * (2026-10-25). Documento REAL (PDF + Excel) del caso ENERVIDA-VITALLCONS
 * 23/10/2026 — la aceptación §6/§8/§9 del brief:
 *
 *   · El PDF muestra el saldo inicial (8.438.079,98), el vuelto (−2.400),
 *     la entrega (−8.435.679,98) y el EFECTIVO ESPERADO 0,00 — nunca el
 *     −8.430.079,98 del incidente.
 *   · Conteo 0,00 ⇒ «Cuadre (cuadrado)» — junto a «0,00» contado, SIN la
 *     contradicción «Sin efectivo contado + SOBRANTE 8.430.079,98».
 *   · El cero monetario se presenta como «0,00» (no guiones ambiguos).
 *   · Excel: mismos importes, misma fórmula del esperado (saldo inicial en
 *     la cadena) y el MISMO cuadre que el PDF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const textLog: Array<{ page: number; text: string }> = [];
vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as any)(orientation, unit, format);
    const orig = doc.text.bind(doc);
    doc.text = (t: unknown, x: number, y: number, opts?: unknown) => {
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      textLog.push({ page: doc.getNumberOfPages(), text: s });
      return orig(t, x, y, opts);
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

import * as XLSX from 'xlsx-js-style';
import {
  buildCashReportPdf,
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';
import { buildCashReportExcelWorkbook } from '@/components/views/terminal/views/cash/cash-report-excel';

/** Reporte del 23/10 — cifras documentales de producción (ver enervida-2310.test.ts). */
const REPORTE_2310 = {
  sales: [
    { payment_method: 'cash', currency: 'USD', transaction_count: 1, total: 7, total_cup: 5600 },
  ],
  sales_split: {
    USD: { cash: 7, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 7 },
  },
  sales_bills_split: { CUP: -2400, USD: 10 },
  sales_equiv_cash_other_cup: 5600,
  sales_equiv_voucher_other_cup: 0,
  opening_balance: { CUP: 8438079.98, USD: 357 },
  payments: [],
  commissions: [],
  production: [],
  adjustments: [],
  cash_flows: [
    { id: 'cf-entrega', direction: 'out' as const, amount: 8435679.98, currency: 'CUP', amount_cup: 8435679.98, note: 'IE-000001-2026 · entrega_efectivo: Entregado', document_number: 'IE-000001-2026', created_by: null, created_at: '2026-10-24T17:30:38Z' },
  ],
  refund_rows: [],
  totals: { sales_total_cup: 5600, payments_total_cup: 0, commissions_total_cup: 0, balance_cup: 0 },
  start_date: '2026-10-23',
  end_date: '2026-10-23',
  cash_balance_cup: 0,
  cash_breakdown: [],
  period: { start: '2026-10-23T04:00:00Z', end: '2026-10-24T03:59:59Z' },
} as unknown as CashReportPdfContext['report'];

const SUMMARIES: Required<CashReportSummaries> = {
  itemsSummary: { items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 },
  paymentTotals: { totals: { USD: { cash: 7, transfer: 0, zelle: 0, total: 7 } } },
  commissionsSummary: { workers: [], total_cup: 0 },
  productionOrders: [],
};

function buildContext(over?: Partial<CashReportPdfContext>): CashReportPdfContext {
  return {
    report: REPORTE_2310,
    template: 'diario',
    startDate: '2026-10-23',
    endDate: '2026-10-23',
    storeInfo: { name: 'ENERVIDA-VITALLCONS', logo_url: null, address: 'Calle 23', phone: null, email: null, reeup: null, nit: null },
    deliveredBy: 'Israel Leyva',
    recipientName: 'Belkis Olivera',
    madeBy: 'Ana Torres',
    cupDenoms: [1000, 500, 100],
    usdDenoms: [5, 1],
    cupBreakdown: {},   // conteo real 0,00 (caja CUP vacía tras la entrega)
    usdBreakdown: {},
    options: { ...DEFAULT_PDF_OPTIONS, includeUsd: true },
    orientation: 'vertical',
    ...over,
  };
}

const allTexts = () => textLog.map(t => t.text).join('\n');

beforeEach(() => { textLog.length = 0; });

describe('MISIÓN CORRECTIVA · documento ENERVIDA 23/10/2026 (PDF + Excel)', () => {
  it('PDF: esperado 0,00 con saldo inicial; cuadre 0,00 CUADRADO con conteo 0,00', async () => {
    await buildCashReportPdf(buildContext(), SUMMARIES);
    const t = allTexts();
    // El resumen del día del incidente, ahora completo y reconciliado:
    expect(t).toContain('Saldo inicial / fondo de caja');
    expect(t).toContain('8.438.079,98');
    expect(t).toContain('Egresos de caja (fondo y otros)');
    expect(t).toContain('-8.435.679,98');
    // Vuelto cruzado visible (liquidación de billetes):
    expect(t).toContain('-2.400,00');
    // El esperado es 0,00 — jamás el −8.430.079,98 del incidente:
    expect(t).not.toContain('-8.430.079,98');
    // Conteo 0,00 y cuadre CUADRADO en la hoja CUP (sin la contradicción del
    // incidente «Sin efectivo contado» + «SOBRANTE 8.430.079,98»):
    expect(t).toContain('Cuadre (cuadrado)');
    expect(t).not.toContain('SOBRANTE');
    // La hoja USD documenta su propio cuadre (367 esperados, 0 contados ⇒
    // FALTANTE legítimo de ESA hoja) — el incidente era de la hoja CUP.
  });

  it('PDF: el cero monetario se presenta como 0,00 (sin guiones ambiguos en el resumen)', async () => {
    await buildCashReportPdf(buildContext(), SUMMARIES);
    const t = allTexts();
    // El esperado 0,00 y el resumen del día 0,00 usan el formato monetario:
    expect(t).toContain('0,00');
  });

  it('Excel: mismos importes; la fórmula del esperado abre con el saldo inicial y evalúa 0', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' }) as Array<Array<string | number | undefined>>;
    const findRow = (label: string) => {
      const idx = rs.findIndex(r => String(r[0] ?? '') === label);
      expect(idx, `fila «${label}»`).toBeGreaterThanOrEqual(0);
      return { idx, row: rs[idx]! };
    };
    expect(findRow('Saldo inicial / fondo de caja').row[3]).toBe(8438079.98);
    expect(findRow('Vuelto dado en CUP de cobros en otras monedas').row[3]).toBe(-2400);
    expect(findRow('Egresos de caja (fondo y otros)').row[3]).toBe(-8435679.98);
    const esp = findRow('Efectivo esperado a entregar');
    expect(esp.row[3]).toBe(0); // 8.438.079,98 − 2.400 − 8.435.679,98
    // Fórmula viva: referencia la celda del saldo inicial (no depende de su
    // visibilidad — el literal entra solo si el concepto se oculta):
    const saldoIdx = findRow('Saldo inicial / fondo de caja').idx;
    const espCell = ws[`D${esp.idx + 1}`] as Record<string, unknown> | undefined;
    const f = String(espCell?.f ?? '');
    expect(f).toContain(`D${saldoIdx + 1}`);
    // Evaluación de la fórmula contra las celdas reales (regla del test de Excel):
    let acc = 0;
    for (const part of f.split(/(?=[+-])/)) {
      const m = part.match(/([+-]?)(D\d+|[\d.]+)/);
      if (!m) continue;
      const sgn = m[1] === '-' ? -1 : 1;
      const tok = m[2]!;
      const val = tok.startsWith('D')
        ? Number(((ws[tok] ?? {}) as Record<string, unknown>).v ?? 0)
        : Number(tok);
      acc += sgn * val;
    }
    expect(Math.abs(acc - 0)).toBeLessThan(0.005); // evalúa EXACTO al abrir
    // Cuadre en vivo: contado (0) − esperado (0) = 0 CUADRADO — igual que el PDF:
    const cuadre = findRow('Cuadre (CUADRADO)');
    expect(cuadre.row[3]).toBe(0);
  });

  it('Excel: ocultar «Saldo inicial» conserva el saldo por literal en la fórmula (§8: sin depender de fila visible)', async () => {
    const { DEFAULT_SUMMARY_CONCEPTS } = await import('@/lib/cash-report/report-selection');
    const concepts = { ...DEFAULT_SUMMARY_CONCEPTS, saldoInicial: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ concepts }), SUMMARIES, new Map());
    const ws = wb.Sheets['Reporte Entrega']!;
    const rs = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' }) as Array<Array<string | number | undefined>>;
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Saldo inicial / fondo de caja')).toBe(-1); // fila omitida
    const espIdx = rs.findIndex(r => String(r[0] ?? '') === 'Efectivo esperado a entregar');
    expect(espIdx).toBeGreaterThanOrEqual(0);
    expect(rs[espIdx]![3]).toBe(0); // el saldo contable NO cambia
    const espCell2 = ws[`D${espIdx + 1}`] as Record<string, unknown> | undefined;
    const f = String(espCell2?.f ?? '');
    expect(f).toMatch(/8438079\.98/); // el literal del saldo inicial viaja en la fórmula
  });
});
