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

  it('COMPACTO · con 2 secciones por moneda el USD abre HOJA PROPIA (el salto es el margen — misión 2026-10-23)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    // La hoja 1 contiene el reporte CUP completo (2 secciones + encabezado repetido)
    expect(p1.some(t => t.includes('Reporte de Venta CUP'))).toBe(true);
    expect(p1.filter(t => t.includes('Reporte de Venta CUP')).length).toBe(2); // encabezado repetido
    expect(p1.some(t => t.includes('Reporte de Venta USD'))).toBe(false);
    // El USD abre hoja propia: guard de paginación (nada bajo el pie de página)
    const usdPage = textLog.find(e => e.text.includes('Reporte de Venta USD'))?.page ?? -1;
    expect(usdPage).toBeGreaterThan(1);
    // Sin separador de doble filete cuando NO comparten hoja (el salto ya es el margen)
    expect(lineLog.filter(l => l.lw === 0.9).length).toBe(0);
    // La LÍNEA DE CORTE entre las secciones del CUP sí queda en la hoja 1
    const cut = lineLog.filter(l => l.page === 1 && l.lw === 0.25 && (l.x2 - l.x1) >= FULL_W);
    expect(cut.length).toBeGreaterThanOrEqual(1);
  });

  it('COMPACTO · el pie de firmas del CUP queda ANTES del encabezado USD (el USD abre hoja propia si no cabe)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    // MISIÓN 2026-10-23: cada moneda = 2 secciones con SU pie; el reporte USD
    // solo comparte hoja si cabe COMPLETO (guard de paginación — nada se
    // dibuja bajo el pie de página).
    const p1 = textsOf(1);
    const idxCupPie = p1.indexOf('Hecho por:');
    expect(idxCupPie).toBeGreaterThanOrEqual(0);
    const usdHeaderEntry = textLog.find(e => e.text.includes('Reporte de Venta USD'));
    expect(usdHeaderEntry).toBeTruthy();
    // Orden en el DOCUMENTO: tabla CUP → pie CUP → (salto si no cabe) → header USD
    const idxCupTotals = p1.findIndex(t => t.includes('169.000,00') || t.includes('169,000.00'));
    expect(idxCupTotals).toBeGreaterThanOrEqual(0);
    expect(idxCupTotals).toBeLessThan(idxCupPie);
    const usdFirstIdxInDoc = textLog.findIndex(e => e.text.includes('Reporte de Venta USD'));
    const cupPieIdxInDoc = textLog.findIndex(e => e.text === 'Hecho por:');
    expect(usdFirstIdxInDoc).toBeGreaterThan(cupPieIdxInDoc);
    // Si el USD comparte hoja, su header va tras el pie CUP; si no, en hoja posterior
    if (usdHeaderEntry!.page === 1) {
      expect(p1.findIndex(t => t.includes('Reporte de Venta USD'))).toBeGreaterThan(idxCupPie);
    } else {
      expect(usdHeaderEntry!.page).toBeGreaterThan(1);
    }
  });

  it('COMPACTO · cada moneda lleva DOS pies (sección 1 + sección 2 — misión 2026-10-23)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    // Página del CUP: 2 pies (sección 1 + sección 2 del reporte CUP).
    const cupPage = textLog.find(e => e.text.includes('Reporte de Venta CUP'))?.page ?? -1;
    expect(cupPage).toBe(1);
    expect(countIn(textsOf(cupPage), 'Hecho por:')).toBe(2);
    expect(countIn(textsOf(cupPage), 'Entregado por:')).toBe(2);
    expect(countIn(textsOf(cupPage), 'Recibido por:')).toBe(2);
    // Reporte USD: en su(s) hoja(s) propia(s) con SUS 2 pies.
    const usdPage = textLog.find(e => e.text.includes('Reporte de Venta USD'))?.page ?? -1;
    expect(usdPage).toBeGreaterThan(cupPage);
    expect(countIn(textsOf(usdPage), 'Hecho por:')).toBe(2);
  });

  it('COMPACTO · nombres de la UI impresos bajo SU etiqueta en los pies de AMBAS secciones y monedas', async () => {
    await buildCashReportPdf(
      buildContext({ usdSeparatePage: false }, { madeBy: 'Ana Elabora', deliveredBy: 'Israel Leyva Velazquez', recipientName: 'Belkis Olivera Perez' }),
      summaries(),
    );
    // MISIÓN 2026-10-23: 2 secciones por moneda × 2 monedas = 4 pies + 1 en la
    // hoja de Órdenes = 5 impresiones de cada nombre.
    const all = textLog.map(e => e.text);
    expect(all.filter(t => t === 'Ana Elabora').length).toBe(5);
    expect(all.filter(t => t === 'Israel Leyva Velazquez').length).toBe(5);
    expect(all.filter(t => t === 'Belkis Olivera Perez').length).toBe(5);
    // Mapeo posicional: los tres nombres del MISMO bloque van en orden
    const idxNombreHecho = all.indexOf('Ana Elabora');
    const idxNombreEntrega = all.indexOf('Israel Leyva Velazquez');
    const idxNombreRecibe = all.indexOf('Belkis Olivera Perez');
    expect(idxNombreHecho).toBeGreaterThan(-1);
    expect(idxNombreHecho).toBeLessThan(idxNombreEntrega);
    expect(idxNombreEntrega).toBeLessThan(idxNombreRecibe);
  });

  it('COMPACTO · sin nombres en la UI NO se imprime ningún nombre hardcodeado (Israel/Belkios desaparecen)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }, {}), summaries());
    const all = textLog.map(e => e.text);
    expect(all.some(t => t.includes('Israel Leyva Velazquez'))).toBe(false);
    expect(all.some(t => t.includes('Belkis Olivera Perez'))).toBe(false);
    expect(all.some(t => t.includes('____'))).toBe(false); // el «______» del Entregado por también se fue
    // Las líneas y etiquetas SIGUEN (se firma a mano) — 2 por moneda
    const cupPage = textLog.find(e => e.text.includes('Reporte de Venta CUP'))?.page ?? -1;
    expect(countIn(textsOf(cupPage), 'Hecho por:')).toBe(2);
  });

  it('SEPARADO · hoja por moneda con DOS pies (sección 1 + sección 2) y UNO en Órdenes (misión 2026-10-23)', async () => {
    const doc = await buildCashReportPdf(
      buildContext({}, { madeBy: 'Ana Elabora', deliveredBy: 'Israel Leyva Velazquez', recipientName: 'Belkis Olivera Perez' }),
      summaries(),
    );
    // MISIÓN CONCILIACIÓN (2026-10-26): el anexo de auditoría abre hoja
    // PROPIA tras las monedas (misión §5) y fluya a las que necesite
    // (aquí 2: comparación + conciliación) → CUP + USD + Auditoría×2 + Órdenes.
    expect(doc.getNumberOfPages()).toBe(5);
    expect(textsOf(1).some(t => t.includes('Reporte de Venta USD'))).toBe(false);
    expect(textsOf(2).some(t => t.includes('Reporte de Venta USD'))).toBe(true);
    // El anexo es una página/section SEPARADA del reporte principal:
    expect(textsOf(3).some(t => t.includes('Anexo de Auditoría'))).toBe(true);
    // Encabezado COMPLETO repetido dentro de cada hoja de moneda (2× título)
    for (const page of [1, 2]) {
      expect(countIn(textsOf(page), 'Hecho por:')).toBe(2);   // pie sección 1 + pie sección 2
      expect(countIn(textsOf(page), 'Entregado por:')).toBe(2);
      expect(countIn(textsOf(page), 'Recibido por:')).toBe(2);
      expect(textsOf(page).filter(t => t.includes('Reporte de Venta')).length).toBe(2); // encabezado repetido
    }
    expect(countIn(textsOf(5), 'Hecho por:')).toBe(1);        // hoja de Órdenes: UN pie
    // Sin separador de doble filete (no comparten hoja)
    expect(lineLog.filter(l => l.lw === 0.9).length).toBe(0);
    // LÍNEA DE CORTE entre las secciones (misión §3): fina (0.25) a ancho completo
    const cut = lineLog.filter(l => l.lw === 0.25 && (l.x2 - l.x1) >= FULL_W);
    expect(cut.length).toBeGreaterThanOrEqual(2); // una por moneda (CUP + USD)
  });

  it('TOGGLE · «Líneas de firma» desactivada → el Diario ya NO imprime pies (opción antes muerta)', async () => {
    await buildCashReportPdf(buildContext({ includeSignature: false }, { madeBy: 'Ana', deliveredBy: 'Ben', recipientName: 'Carla' }), summaries());
    const all = textLog.map(e => e.text);
    expect(all.some(t => t === 'Hecho por:' || t.includes('Hecho por:'))).toBe(false);
    expect(all.some(t => t.includes('Entregado por:'))).toBe(false);
    expect(all.some(t => t.includes('Recibido por:'))).toBe(false);
    expect(all.some(t => t.includes('Ana'))).toBe(false);
  });

  it('COMPACTO SIN ESPACIO · tabla CUP que llena las hojas → USD en hoja propia (salto = margen) con SUS pies', async () => {
    // 66 productos CUP: la tabla CUP ocupa 2 hojas casi llenas → el bloque USD
    // (2 secciones + pies) ya NO cabe tras ella.
    const manyItems = Array.from({ length: 66 }, (_, i) => ({
      ...ITEMS_1710[0],
      product_id: `pid-${i}`, product_name: `Producto ${i}`, sku: String(100 + i),
      total_quantity: 1, qty_cup: 1, qty_usd: 0,
      total_cup: 100, cash_cup: 100, has_payment_incident: false,
    }));
    const s = summaries();
    s.itemsSummary = { ...s.itemsSummary!, items: [...manyItems, ITEMS_1710[1]] } as any;
    const doc = await buildCashReportPdf(buildContext({ usdSeparatePage: false }), s);
    // El USD llega tras el CUP: su sección 1 abre en la misma hoja donde
    // terminó la sección 2 del CUP (con el separador de doble filete como
    // margen) o en hoja propia — nunca pegado al contenido.
    const usdPage = textLog.find(e => e.text.includes('Reporte de Venta USD'))?.page ?? -1;
    expect(usdPage).toBeGreaterThanOrEqual(3);
    // Invariante estructural (misión 2026-10-23): 2 secciones por moneda ×
    // 2 monedas + 1 pie en la hoja de Órdenes = 5 pies en el documento.
    expect(textLog.filter(e => e.text === 'Hecho por:').length).toBe(5);
    // Si CUP y USD comparten hoja, queda el separador de doble filete (margen)
    const shared = textLog.some(e => e.page === usdPage && e.text.includes('Reporte de Venta CUP (cont.)'));
    if (shared) expect(lineLog.filter(l => l.lw === 0.9).length).toBeGreaterThanOrEqual(1);
    void doc;
  });

  it('REGRESIÓN · datos del 17/10: totales CUP 169.000 (hoja CUP) y 150.00 USD (hoja USD) intactos', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    // Hoja del CUP: cantidad 10.00 (7+1+1+1) y efectivo 169.000,00
    const cupPage = textLog.find(e => e.text.includes('Reporte de Venta CUP'))?.page ?? -1;
    const pCup = textsOf(cupPage);
    expect(pCup).toContain('10.00');
    expect(pCup.some(t => /^169[.,]000[.,]00$/.test(t))).toBe(true);
    // Hoja del USD: 150.00 efectivo en la sección USD
    const usdPage = textLog.find(e => e.text.includes('Reporte de Venta USD'))?.page ?? -1;
    const pUsd = textsOf(usdPage);
    expect(pUsd).toContain('150.00');
    expect(pUsd).toContain('Tunder Grande');
    // Cantidades físicas 11.00 NO impresas como total de hoja (no se duplican)
    expect(pCup).not.toContain('11.00');
    expect(pUsd).not.toContain('11.00');
  });
});

describe('MISIÓN DE SEGUIMIENTO v2.23.0 · PDF Diario — reembolsos por voucher (informativo, base NETA)', () => {
  beforeEach(() => { textLog.length = 0; lineLog.length = 0; });

  it('refund por transferencia/zelle: fila informativa impresa y esperado CUP INTACTO', async () => {
    const ctx = buildContext({ usdSeparatePage: false });
    // Devolución reembolsada por transferencia (300 CUP) dentro del día del reporte
    ctx.report = {
      ...ctx.report,
      refund_rows: [
        { id: 'rf1', payment_method: 'transfer', currency: 'CUP', amount: 300, amount_cup: 300 },
        { id: 'rf2', payment_method: 'zelle', currency: 'CUP', amount: 200, amount_cup: 200 },
      ],
    } as any;
    await buildCashReportPdf(ctx, summaries());
    const p1 = textsOf(1);
    // Fila informativa del lado vouchers (brutos documentados; neto en arqueo)
    expect(p1).toContain('Reembolsos por voucher (transfer/Zelle)');
    expect(p1.some(t => /^500[.,]00$/.test(t))).toBe(true); // 300 + 200
    // El efectivo esperado NO se reduce por refunds de voucher: 169.000,00 intacto
    expect(p1.some(t => /^169[.,]000[.,]00$/.test(t))).toBe(true);
    // Sin fila de reembolsos en efectivo (no hay refunds cash)
    expect(p1).not.toContain('Reembolsos de devoluciones (efectivo)');
  });

  it('refund cash + voucher: AMBAS filas, cada medio en su término', async () => {
    const ctx = buildContext({ usdSeparatePage: false });
    ctx.report = {
      ...ctx.report,
      refund_rows: [
        { id: 'rf1', payment_method: 'cash', currency: 'CUP', amount: 100, amount_cup: 100 },
        { id: 'rf2', payment_method: 'transfer', currency: 'CUP', amount: 50, amount_cup: 50 },
      ],
    } as any;
    await buildCashReportPdf(ctx, summaries());
    const p1 = textsOf(1);
    expect(p1).toContain('Reembolsos de devoluciones (efectivo)');
    expect(p1).toContain('Reembolsos por voucher (transfer/Zelle)');
    // Esperado = 169.000 − 100 (solo el tramo cash): 168.900,00
    expect(p1.some(t => /^168[.,]900[.,]00$/.test(t))).toBe(true);
  });

  it('sin refunds de voucher: la fila NO se imprime (regresión de presentación)', async () => {
    await buildCashReportPdf(buildContext({ usdSeparatePage: false }), summaries());
    const p1 = textsOf(1);
    expect(p1).not.toContain('Reembolsos por voucher (transfer/Zelle)');
    expect(p1).not.toContain('Reembolsos de devoluciones (efectivo)');
  });
});
