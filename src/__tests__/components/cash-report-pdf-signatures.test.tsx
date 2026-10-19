/**
 * INC-2026-10-19 — «Entrega en tienda» · hoja compartida CUP+USD (§9 compacto):
 * margen lógico visual, pie de firmas en AMBOS reportes y nombres 100%
 * configurables (nada hardcodeado).
 *
 * Construye el PDF REAL (jsPDF) con el fixture del 17/10/2026 (EnerVida —
 * datos reconstruidos de la BD viva: 1 venta con 4 líneas CUP 169.000 y 1
 * línea USD 150.00) y espía cada doc.text / doc.line:
 *
 *   1. MARGEN LÓGICO: en hoja compartida, entre el fin del reporte CUP (SU pie
 *      de firmas) y el encabezado «Reporte de Venta USD» queda el separador
 *      visual (doble filete — línea gruesa lw 0.9 a ancho completo).
 *   2. AMBOS con pie de firmas: CUP y USD llevan CADA UNO su bloque
 *      Hecho/Entregado/Recibido por (2 bloques en la hoja compartida; 1 por
 *      hoja en modo separado).
 *   3. NOMBRES CONFIGURABLES: madeBy/deliveredBy/recipientName se imprimen bajo
 *      SU etiqueta; sin nombre → línea en blanco. NINGÚN fallback hardcodeado
 *      («Israel Leyva Velazquez» / «Belkis Olivera Perez» desaparecen).
 *   4. Opción «Líneas de firma» respetada (antes muerta en Diario: siempre
 *      imprimía firmas).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Spies: TODOS los doc.text y doc.line del jsPDF real ──
const textLog = vi.hoisted(() => [] as Array<{ page: number; text: string }>);
const lineLog = vi.hoisted(() => [] as Array<{ page: number; x1: number; y1: number; x2: number; y2: number; lw: number }>);

vi.mock('@/lib/export/lazy-pdf', () => ({
  createPDFDocument: async (orientation?: unknown, unit?: unknown, format?: unknown) => {
    const { jsPDF } = await import('jspdf');
    const doc = new (jsPDF as any)(orientation, unit, format);
    const origText = doc.text.bind(doc);
    doc.text = (t: unknown, x: number, y: number, opts?: unknown) => {
      const s = Array.isArray(t) ? t.map(String).join(' ') : String(t);
      textLog.push({ page: doc.getNumberOfPages(), text: s });
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

/**
 * Fixture 17/10/2026 (EnerVida) — reconstrucción REAL (buildItemsSummary) de la
 * venta única del día de negocio: 1 tx (cash 289.750 CUP canónico) con 4 líneas
 * CUP (Cemento TBV ×7, Masilla ×1, Espejo ×1, Cemento Blanco ×1 = 169.000 CUP)
 * y 1 línea USD (Tunder Grande ×1 = 150.00 USD efectivo, tasa 805).
 */
const ITEMS_1710 = [
  { product_id: 'pid-141', product_name: 'Cemento TBV 50 Kg', sku: '141', total_quantity: 7, qty_cup: 7, qty_usd: 0, total_cup: 140000, cash_cup: 140000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-146', product_name: 'Tunder Grande', sku: '146', total_quantity: 1, qty_cup: 0, qty_usd: 1, total_cup: 120750, cash_cup: 0, transfer_cup: 0, zelle_cup: 0, cash_usd: 150, transfer_usd: 0, zelle_usd: 0, usd_total: 150, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-46', product_name: 'Masilla interior blanca', sku: '46', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 22000, cash_cup: 22000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-28', product_name: 'Espejo', sku: '28', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 5000, cash_cup: 5000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-142', product_name: 'Cemento Blanco 2 Kg', sku: '142', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 2000, cash_cup: 2000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
];

function buildContext(
  options?: Partial<CashReportPdfOptions>,
  names?: { madeBy?: string; deliveredBy?: string; recipientName?: string },
): CashReportPdfContext {
  return {
    report: {
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 169000, transaction_count: 1 },
        { payment_method: 'cash', currency: 'USD', total: 150, transaction_count: 1 },
      ],
      commissions: [], payments: [], production: [], adjustments: [], totals: {},
      sales_split: {
        CUP: { cash: 169000, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 169000 },
        USD: { cash: 150, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 150 },
      },
    } as any,
    template: 'diario',
    startDate: '2026-10-17',
    endDate: '2026-10-17',
    storeInfo: { name: 'EnerVida', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null },
    deliveredBy: names?.deliveredBy ?? '',
    recipientName: names?.recipientName ?? '',
    madeBy: names?.madeBy ?? '',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: {},
    usdBreakdown: {},
    options: { ...DEFAULT_PDF_OPTIONS, ...(options || {}) },
  };
}

const summaries = (): CashReportSummaries => ({
  itemsSummary: { items: ITEMS_1710, total_cup: 289750, total_cash: 169000, total_transfer: 0, total_zelle: 0, total_quantity: 11, total_qty_cup: 10, total_qty_usd: 1, cash_cup: 169000, transfer_cup: 0, zelle_cup: 0, cash_usd: 150, transfer_usd: 0, zelle_usd: 0, usd_total: 150, count: 5 },
  commissionsSummary: { workers: [], total_cup: 0 },
  paymentTotals: { totals: {} },
  productionOrders: [],
});

const textsOf = (page: number) => textLog.filter(e => e.page === page).map(e => e.text);
const countIn = (texts: string[], needle: string) => texts.filter(t => t === needle).length;
/** A4 vertical: pw=210, m=10 → ancho de contenido 190mm. */
const FULL_W = 185; // ≥ contenido − margen de redondeo

describe('INC-2026-10-19 · PDF Diario — hoja compartida CUP+USD: margen visual, pies de firmas y nombres configurables', () => {
  beforeEach(() => { textLog.length = 0; lineLog.length = 0; });

  it('COMPACTO · CUP y USD comparten la misma hoja y queda MARGEN LÓGICO entre ambos reportes', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    // Ambos reportes en la hoja 1 (el USD «si cabe» — caso del reporte del 17/10)
    expect(p1.some(t => t.includes('Reporte de Venta CUP'))).toBe(true);
    expect(p1.some(t => t.includes('Reporte de Venta USD'))).toBe(true);
    // Separador visual: doble filete (fino 0.3 + grueso 0.9) a ANCHO COMPLETO
    const thin = lineLog.filter(l => l.page === 1 && l.lw === 0.3 && (l.x2 - l.x1) >= FULL_W);
    const thick = lineLog.filter(l => l.page === 1 && l.lw === 0.9 && (l.x2 - l.x1) >= FULL_W);
    expect(thick.length).toBeGreaterThanOrEqual(1); // filete grueso del separador
    expect(thin.length).toBeGreaterThanOrEqual(1);  // filete fino del separador
    // El grueso va JUSTO debajo del fino (doble filete, ~1.6mm de separación)
    const t0 = thin[0], k0 = thick[0];
    expect(k0.y1 - t0.y1).toBeGreaterThan(0);
    expect(k0.y1 - t0.y1).toBeLessThanOrEqual(3);
  });

  it('COMPACTO · el pie de firmas del CUP queda ENTRE la tabla CUP y el encabezado USD (ya no arranca pegado)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    const idxCupPie = p1.indexOf('Hecho por:');
    const idxUsdHeader = p1.findIndex(t => t.includes('Reporte de Venta USD'));
    expect(idxCupPie).toBeGreaterThanOrEqual(0);
    expect(idxUsdHeader).toBeGreaterThan(idxCupPie); // orden: tabla CUP → pie CUP → separador → header USD
    // El último texto del reporte CUP (fila de totales 169.000,00) va ANTES del pie
    const idxTotals = p1.findIndex(t => t.includes('169.000,00') || t.includes('169,000.00'));
    expect(idxTotals).toBeGreaterThanOrEqual(0);
    expect(idxTotals).toBeLessThan(idxCupPie);
  });

  it('COMPACTO · AMBOS reportes llevan su pie de firmas (2 bloques Hecho/Entregado/Recibido por en la hoja)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    expect(countIn(p1, 'Hecho por:')).toBe(2);
    expect(countIn(p1, 'Entregado por:')).toBe(2);
    expect(countIn(p1, 'Recibido por:')).toBe(2);
    // Pie de página de la hoja compartida: ambas secciones listadas. El pie se
    // dibuja tras doc.setPage(i) (el spy no distingue página corriente) → se
    // identifica por su propio texto «Página 1 de N».
    expect(textLog.some(e => e.text.includes('CUP + USD') && e.text.includes('Página 1 de'))).toBe(true);
  });

  it('COMPACTO · nombres de la UI impresados bajo SU etiqueta en ambos pies (mapeo Hecho/Entregado/Recibido)', async () => {
    await buildCashReportPdf(
      buildContext({ usdSeparatePage: false }, { madeBy: 'Ana Elabora', deliveredBy: 'Israel Leyva Velazquez', recipientName: 'Belkis Olivera Perez' }),
      summaries(),
    );
    const p1 = textsOf(1);
    expect(countIn(p1, 'Ana Elabora')).toBe(2);             // Hecho por (nuevo campo)
    expect(countIn(p1, 'Israel Leyva Velazquez')).toBe(2);  // Entregado por (antes: ________)
    expect(countIn(p1, 'Belkis Olivera Perez')).toBe(2);    // Recibido por
    // Mapeo posicional: tras cada etiqueta viene SU nombre
    const idxHecho = p1.indexOf('Hecho por:');
    expect(p1[idxHecho + 1]).toBe('Entregado por:'); // etiquetas contiguas del bloque
    const idxNombreHecho = p1.indexOf('Ana Elabora');
    const idxNombreEntrega = p1.indexOf('Israel Leyva Velazquez');
    const idxNombreRecibe = p1.indexOf('Belkis Olivera Perez');
    expect(idxNombreHecho).toBeGreaterThan(-1);
    // Los tres nombres del MISMO bloque van en orden Hecho → Entregado → Recibido
    expect(idxNombreHecho).toBeLessThan(idxNombreEntrega);
    expect(idxNombreEntrega).toBeLessThan(idxNombreRecibe);
  });

  it('COMPACTO · sin nombres en la UI NO se imprime ningún nombre hardcodeado (Israel/Belkios desaparecen)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }, {}), summaries());
    const all = textLog.map(e => e.text);
    expect(all.some(t => t.includes('Israel Leyva Velazquez'))).toBe(false);
    expect(all.some(t => t.includes('Belkis Olivera Perez'))).toBe(false);
    expect(all.some(t => t.includes('____'))).toBe(false); // el «______» del Entregado por también se fue
    // Las líneas y etiquetas SIGUEN (se firma a mano)
    const p1 = textsOf(1);
    expect(countIn(p1, 'Hecho por:')).toBe(2);
  });

  it('SEPARADO · regresión: hoja por reporte con UN pie de firmas cada una (CUP 1 · USD 2 · Órdenes 3)', async () => {
    const doc = await buildCashReportPdf(
      buildContext({}, { madeBy: 'Ana Elabora', deliveredBy: 'Israel Leyva Velazquez', recipientName: 'Belkis Olivera Perez' }),
      summaries(),
    );
    expect(doc.getNumberOfPages()).toBe(3); // CUP + USD + Órdenes (default includeOtReport)
    expect(textsOf(1).some(t => t.includes('Reporte de Venta USD'))).toBe(false);
    expect(textsOf(2).some(t => t.includes('Reporte de Venta USD'))).toBe(true);
    for (const page of [1, 2, 3]) {
      expect(countIn(textsOf(page), 'Hecho por:')).toBe(1);
      expect(countIn(textsOf(page), 'Entregado por:')).toBe(1);
      expect(countIn(textsOf(page), 'Recibido por:')).toBe(1);
    }
    // Sin separador (el salto de hoja YA es el margen)
    expect(lineLog.filter(l => l.lw === 0.9).length).toBe(0);
  });

  it('TOGGLE · «Líneas de firma» desactivada → el Diario ya NO imprime pies (opción antes muerta)', async () => {
    await buildCashReportPdf(buildContext({ includeSignature: false }, { madeBy: 'Ana', deliveredBy: 'Ben', recipientName: 'Carla' }), summaries());
    const all = textLog.map(e => e.text);
    expect(all.some(t => t === 'Hecho por:' || t.includes('Hecho por:'))).toBe(false);
    expect(all.some(t => t.includes('Entregado por:'))).toBe(false);
    expect(all.some(t => t.includes('Recibido por:'))).toBe(false);
    expect(all.some(t => t.includes('Ana'))).toBe(false);
  });

  it('COMPACTO SIN ESPACIO · tabla CUP que llena las hojas → USD en hoja propia (salto = margen) con su pie', async () => {
    // 66 productos CUP: la tabla CUP ocupa 2 hojas casi llenas → el bloque USD
    // (resumen + tabla + pie) ya NO cabe tras ella.
    const manyItems = Array.from({ length: 66 }, (_, i) => ({
      ...ITEMS_1710[0],
      product_id: `pid-${i}`, product_name: `Producto ${i}`, sku: String(100 + i),
      total_quantity: 1, qty_cup: 1, qty_usd: 0,
      total_cup: 100, cash_cup: 100, has_payment_incident: false,
    }));
    const s = summaries();
    s.itemsSummary = { ...s.itemsSummary!, items: [...manyItems, ITEMS_1710[1]] } as any;
    const doc = await buildCashReportPdf(buildContext({ usdSeparatePage: false }), s);
    // El USD NO comparte la última hoja del CUP: está en hoja propia
    const usdPage = textLog.find(e => e.text.includes('Reporte de Venta USD'))?.page ?? -1;
    expect(usdPage).toBeGreaterThanOrEqual(3);
    expect(countIn(textsOf(usdPage), 'Hecho por:')).toBe(1); // UN pie (el del reporte USD)
    // Sin separador de doble filete (no comparten hoja)
    expect(lineLog.filter(l => l.lw === 0.9).length).toBe(0);
    // La tabla CUP conserva SU pie en su última hoja (fijo al pie de página)
    const lastCupPage = usdPage - 1;
    expect(countIn(textsOf(lastCupPage), 'Hecho por:')).toBe(1);
    void doc;
  });

  it('REGRESIÓN · datos del 17/10: totales CUP 169.000 (hoja CUP) y 150.00 USD (hoja USD) intactos', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    // Cantidad CUP de la hoja compartida: 10.00 (7+1+1+1) y efectivo 169.000,00
    expect(p1).toContain('10.00');
    expect(p1.some(t => /^169[.,]000[.,]00$/.test(t))).toBe(true);
    // USD: 150.00 efectivo en la sección USD de la misma hoja
    expect(p1).toContain('150.00');
    expect(p1).toContain('Tunder Grande');
    // Cantidades físicas 11.00 NO impresas como total de hoja (no se duplican)
    expect(p1).not.toContain('11.00');
  });
});
