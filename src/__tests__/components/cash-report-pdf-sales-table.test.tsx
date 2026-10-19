/**
 * AUDITORÍA 2026-10-19 — «Entrega en tienda»: ESTRUCTURA del PDF Diario.
 *
 * Construye el PDF REAL (jsPDF) con el fixture del 16/10/2026 (EnerVida) y
 * espira cada doc.text para inspeccionar lo que se imprime por hoja:
 *
 *   Defecto A — hoja CUP sin columna «USD»: en la página CUP no se dibuja el
 *   encabezado «USD» ni el total «40.00» (el importe vive SOLO en la hoja USD).
 *
 *   Defecto B — cantidad por moneda: el SKU 128 imprime Cant. 1.00 en la hoja
 *   CUP (1 unidad cobrada en CUP) y Cant. 2.00 en la hoja USD (2 unidades ×
 *   20 USD = 40.00 USD) — la cantidad física (3) NO se atribuye a una sola
 *   moneda ni se duplica entre hojas (total CUP 39.00 + total USD 2.00 = 41).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Spy de TODOS los doc.text del jsPDF real (inspección sin pdf-parser) ────
const textLog = vi.hoisted(() => [] as Array<{ page: number; text: string }>);

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

// ── Mock apiFetch: solo /api/commissions/calculate (los summaries se pasan directos) ──
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
  type CashReportPdfOptions,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

/** Fixture items-summary del 16/10/2026 (EnerVida) — importes reales. */
const ITEMS_1610 = [
  { product_id: 'pid-141', product_name: 'Cemento TBV 50 Kg', sku: '141', total_quantity: 5, qty_cup: 5, qty_usd: 0, total_cup: 100000, cash_cup: 100000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 2, has_payment_incident: false },
  { product_id: 'pid-128', product_name: 'Brecker 63 AMP Corriente alterna', sku: '128', total_quantity: 3, qty_cup: 1, qty_usd: 2, total_cup: 47400, cash_cup: 16000, transfer_cup: 0, zelle_cup: 0, cash_usd: 40, transfer_usd: 0, zelle_usd: 0, usd_total: 40, transactions_count: 2, has_payment_incident: true },
  { product_id: 'pid-15', product_name: 'Cemento Cola', sku: '15', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 10000, cash_cup: 10000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-84', product_name: 'Conector XT60', sku: '84', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 6500, cash_cup: 6500, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-48', product_name: 'Nudo de media', sku: '48', total_quantity: 25, qty_cup: 25, qty_usd: 0, total_cup: 6250, cash_cup: 6250, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-157', product_name: 'Royal Cole', sku: '157', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 2500, cash_cup: 2500, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-158', product_name: 'Detergente liquido', sku: '158', total_quantity: 3, qty_cup: 3, qty_usd: 0, total_cup: 2400, cash_cup: 0, transfer_cup: 2400, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 3, has_payment_incident: false },
  { product_id: 'pid-113', product_name: 'Goma Termo Retractil', sku: '113', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 100, cash_cup: 100, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-108', product_name: 'Cajita Breckera sencilla gris', sku: '108', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 0, cash_cup: 12000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: true },
];

function buildContext(options?: Partial<CashReportPdfOptions>): CashReportPdfContext {
  return {
    report: {
      sales: [], commissions: [], payments: [], production: [], adjustments: [], totals: {},
      sales_split: {
        CUP: { cash: 153350, transfer: 2400, zelle: 0, mixedUnsplit: 0, total: 155750 },
        USD: { cash: 40, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 40 },
      },
    } as any,
    template: 'diario',
    startDate: '2026-10-16',
    endDate: '2026-10-16',
    storeInfo: { name: 'EnerVida', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null },
    deliveredBy: 'Auditor',
    recipientName: 'Receptor',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: {},
    usdBreakdown: {},
    options: { ...DEFAULT_PDF_OPTIONS, ...(options || {}) },
  };
}

const summaries = (): CashReportSummaries => ({
  itemsSummary: { items: ITEMS_1610, total_cup: 178650, total_cash: 153350, total_transfer: 2400, total_zelle: 0, total_quantity: 41, total_qty_cup: 39, total_qty_usd: 2, cash_cup: 153350, transfer_cup: 2400, zelle_cup: 0, cash_usd: 40, transfer_usd: 0, zelle_usd: 0, usd_total: 40, count: 9 },
  commissionsSummary: { workers: [], total_cup: 0 },
  paymentTotals: { totals: {} },
  productionOrders: [],
});

const textsOf = (page: number) => textLog.filter(e => e.page === page).map(e => e.text);
const rowAfter = (texts: string[], sku: string) => {
  const idx = texts.indexOf(sku);
  expect(idx, `fila del SKU ${sku} presente`).toBeGreaterThanOrEqual(0);
  return texts.slice(idx, idx + 5);
};

describe('AUDITORÍA 2026-10-19 · PDF Diario «Entrega en tienda» — estructura por hoja', () => {
  beforeEach(() => { textLog.length = 0; });

  it('se generan las hojas CUP y USD (y la de Órdenes) sin errores', async () => {
    const doc = await buildCashReportPdf(buildContext(), summaries());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const p1 = textsOf(1);
    expect(p1.some(t => t.includes('Reporte de Venta CUP'))).toBe(true);
    const p2 = textsOf(2);
    expect(p2.some(t => t.includes('Reporte de Venta USD'))).toBe(true);
  });

  it('DEFECTO A · la hoja CUP NO imprime encabezado de columna «USD» ni el total 40.00 (viven en la hoja USD)', async () => {
    await buildCashReportPdf(buildContext(), summaries());
    const p1 = textsOf(1);
    // Encabezados de la tabla CUP: exactamente estas columnas
    for (const h of ['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión']) {
      expect(p1).toContain(h);
    }
    // NI el encabezado «USD» NI el importe USD del 128 ni el total USD
    expect(p1).not.toContain('USD');
    expect(p1).not.toContain('40.00');
    // La hoja USD conserva el detalle en USD con sus medios
    const p2 = textsOf(2);
    expect(p2).toContain('Efectivo (USD)');
    expect(p2).toContain('Zelle');
    expect(p2).toContain('40.00');
  });

  it('DEFECTO B · SKU 128: Cant. 1.00 + 16.000 CUP en la hoja CUP; Cant. 2.00 + 40.00 USD en la hoja USD', async () => {
    await buildCashReportPdf(buildContext(), summaries());
    // Hoja CUP: fila 128 → desc (con marca de incidencia), 1.00, efectivo CUP
    const cupRow = rowAfter(textsOf(1), '128');
    expect(cupRow[1].startsWith('* Brecker 63 AMP')).toBe(true); // incidencia documentada
    expect(cupRow[2]).toBe('1.00');   // 1 unidad cobrada en CUP
    expect(cupRow[3]).toMatch(/^16[.,]000/); // 16.000 CUP (incluye el sobrepago +200)
    // Hoja USD: fila 128 → desc, 2.00, 40.00
    const usdRow = rowAfter(textsOf(2), '128');
    expect(usdRow[1].startsWith('* Brecker 63 AMP')).toBe(true);
    expect(usdRow[2]).toBe('2.00');   // 2 unidades cobradas en USD
    expect(usdRow[3]).toBe('40.00');  // 2 × 20.00 USD
  });

  it('DEFECTO B · totales de cantidad por hoja: 39.00 (CUP) + 2.00 (USD) = 41 físicas — sin duplicar', async () => {
    await buildCashReportPdf(buildContext(), summaries());
    const p1 = textsOf(1);
    const p2 = textsOf(2);
    expect(p1).toContain('39.00'); // Σ qty_cup impresa en la fila de totales de la hoja CUP
    expect(p2).toContain('2.00');  // Σ qty_usd impresa en la fila de totales de la hoja USD
    // La cantidad física total (41 → «41.00») NO se imprime como total de NINGUNA hoja
    expect(p1).not.toContain('41.00');
    expect(p2).not.toContain('41.00');
    // Totales de importes por hoja — cada moneda solo en su hoja
    expect(p1).toContain('153.350,00'); // efectivo CUP (es-ES) — o separador dependiente de ICU
    expect(p2).toContain('40.00');
    expect(p1).not.toContain('40.00');
  });

  it('REGRESIÓN · los demás productos conservan sus cantidades e importes en la hoja CUP', async () => {
    await buildCashReportPdf(buildContext(), summaries());
    const p1 = textsOf(1);
    const r141 = rowAfter(p1, '141');
    expect(r141[2]).toBe('5.00');    // 4 + 1 agrupadas
    const r158 = rowAfter(p1, '158');
    expect(r158[2]).toBe('3.00');    // 3 transferencias de 800
    expect(r158[4]).toMatch(/^2[.,]400/); // transfer. 2.400 CUP
    const r108 = rowAfter(p1, '108');
    expect(r108[2]).toBe('1.00');
    expect(r108[3]).toMatch(/^12[.,]000/); // incidencia SKU 108 sigue documentada
  });

  it('REGRESIÓN · plantilla sin columna Comisión (§8.2): la hoja CUP tampoco tiene «USD»', async () => {
    await buildCashReportPdf(buildContext({ includeCommissionColumn: false }), summaries());
    const p1 = textsOf(1);
    expect(p1).not.toContain('Comisión');
    expect(p1).not.toContain('USD');
    expect(p1).toContain('Efectivo (CUP)');
    expect(p1).toContain('Transfer. (CUP)');
  });

  it('REGRESIÓN · día sin cobros USD: la hoja USD no se genera (no hay importes que detallar)', async () => {
    const noUsdItems = ITEMS_1610.map(i => ({ ...i, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, qty_usd: 0 }));
    const s = summaries();
    s.itemsSummary = { ...s.itemsSummary!, items: noUsdItems, usd_total: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0 } as any;
    const ctx = buildContext();
    ctx.report = {
      sales: [], commissions: [], payments: [], production: [], adjustments: [], totals: {},
      sales_split: { CUP: { cash: 153350, transfer: 2400, zelle: 0, mixedUnsplit: 0, total: 155750 } },
    } as any;
    const doc = await buildCashReportPdf(ctx, s);
    const allTexts = textLog.map(e => e.text);
    expect(allTexts.some(t => t.includes('Reporte de Venta USD'))).toBe(false);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2); // CUP + Órdenes siguen existiendo
  });
});
