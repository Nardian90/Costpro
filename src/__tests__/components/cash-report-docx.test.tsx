/**
 * cash-report-docx.test.tsx — MISIÓN WORD (2026-10-27).
 *
 * Batería de la exportación Word (.docx) del Reporte Entrega:
 *
 *   · GENERACIÓN: el archivo es un OOXML válido ([Content_Types].xml, rels,
 *     word/document.xml bien formado), Blob con tipo MIME correcto y nombre
 *     de archivo descriptivo (convención del Excel).
 *   · ESTRUCTURA ESPEJO DEL PDF (plantilla diario): encabezado (tienda +
 *     título + período), Resumen del Día + caja «Efectivo esperado», bloque
 *     de desglose por denominaciones, cuadre, pie de firmas de 3 columnas,
 *     tabla de ventas con marco + ENCABEZADO REPETIDO (tblHeader) + fila de
 *     TOTALES, reporte USD (hoja propia por defecto), Anexo de Auditoría
 *     (comparación por concepto + conciliación) y Órdenes de Trabajo.
 *   · INTEGRIDAD DE DATOS: mismos importes que computeDailySummary /
 *     computeCustomResultsForPdf (fórmula centralizada compartida con PDF y
 *     Excel); CUP y USD JAMÁS mezclados (formatos es-ES / en-US separados);
 *     la columna Comisión proviene de la MISMA fuente inyectada.
 *   · OPCIONES con efecto real: includeUsd / includeCashBreakdown /
 *     includeBreakdown / includeSignature / includeOtReport /
 *     includeCommissionColumn / usdSeparatePage / orientación horizontal.
 *   · PLANTILLAS: diario (default), estándar y simple (sin desglose).
 *   · CASOS ESPECIALES: reporte sin registros («Sin movimientos en el
 *     período»), muchos registros (sin truncar descripciones — Word ajusta),
 *     texto largo, sin conceptos → fail-closed.
 *
 * El builder recibe summaries + comisiones sugeridas INYECTADOS (misma vía
 * que el PDF en producción) — cero red en las pruebas.
 */
import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import {
  buildCashReportWordDocument,
  buildCashReportWordBlob,
  cashReportWordFilename,
} from '@/components/views/terminal/views/cash/cash-report-docx';
import { computeDailySummary } from '@/lib/cash-report/summary';
import {
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
  type CashReportPdfOptions,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

// ── Fixture 17/10/2026 (EnerVida) — MISMO del test del Excel ──
// 1 venta CUP 169.000 (4 líneas) + 1 línea USD 150.00 efectivo.
const ITEMS_1710 = [
  { product_id: 'pid-141', product_name: 'Cemento TBV 50 Kg', sku: '141', total_quantity: 7, qty_cup: 7, qty_usd: 0, total_cup: 140000, cash_cup: 140000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-146', product_name: 'Tunder Grande', sku: '146', total_quantity: 1, qty_cup: 0, qty_usd: 1, total_cup: 120750, cash_cup: 0, transfer_cup: 0, zelle_cup: 0, cash_usd: 150, transfer_usd: 0, zelle_usd: 0, usd_total: 150, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-46', product_name: 'Masilla interior blanca', sku: '46', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 22000, cash_cup: 22000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-28', product_name: 'Espejo', sku: '28', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 5000, cash_cup: 5000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
  { product_id: 'pid-142', product_name: 'Cemento Blanco 2 Kg', sku: '142', total_quantity: 1, qty_cup: 1, qty_usd: 0, total_cup: 2000, cash_cup: 2000, transfer_cup: 0, zelle_cup: 0, cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0, transactions_count: 1, has_payment_incident: false },
];

const SUMMARIES: Required<CashReportSummaries> = {
  itemsSummary: { items: ITEMS_1710, total_cup: 169000, total_cash: 169000, total_transfer: 0, total_zelle: 0 },
  paymentTotals: {
    totals: {
      CUP: { cash: 169000, transfer: 0, zelle: 0, total: 169000 },
      USD: { cash: 150, transfer: 0, zelle: 0, total: 150 },
    },
  },
  commissionsSummary: { workers: [], total_cup: 0 },
  productionOrders: [
    { order_number: 'OT-0001', description: 'Instalación eléctrica', advance_currency: 'CUP', advance_amount: 5000 },
  ],
};

const COMMISSIONS = new Map<string, number>([['pid-141', 1400]]);

function buildContext(over?: Partial<CashReportPdfContext>): CashReportPdfContext {
  return {
    report: {
      sales: [
        { payment_method: 'cash', currency: 'CUP', total: 169000, transaction_count: 1 },
        { payment_method: 'cash', currency: 'USD', total: 150, transaction_count: 1 },
      ],
      commissions: [], payments: [], production: [], adjustments: [], cash_flows: [], refund_rows: [],
      totals: {}, start_date: '2026-10-17', end_date: '2026-10-17',
    } as unknown as CashReportPdfContext['report'],
    template: 'diario',
    startDate: '2026-10-17',
    endDate: '2026-10-17',
    storeInfo: {
      name: 'ENERVIDA-VITALLCONS', logo_url: null, address: 'Calle 23', phone: null,
      email: null, reeup: null, nit: null,
    },
    deliveredBy: 'Israel Leyva',
    recipientName: 'Belkis Olivera',
    madeBy: 'Ana Torres',
    cupDenoms: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
    usdDenoms: [100, 50, 20, 10, 5, 1],
    cupBreakdown: { 1000: '169' }, // 169.000 CUP contados
    usdBreakdown: { 100: '1', 50: '1' }, // 150 USD contados
    options: { ...DEFAULT_PDF_OPTIONS },
    orientation: 'vertical',
    ...over,
  };
}

/** Empaqueta el documento y devuelve el XML principal + el zip. */
async function pack(ctx: CashReportPdfContext, over?: { summaries?: CashReportSummaries; commissions?: Map<string, number> }) {
  const { doc } = await buildCashReportWordDocument(
    ctx,
    over?.summaries ?? SUMMARIES,
    over?.commissions ?? COMMISSIONS,
  );
  const buffer = new Uint8Array(await Packer.toBuffer(doc));
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return { xml, zip, buffer };
}

/** Texto plano del document.xml (solo runs w:t). */
function textOf(xml: string): string {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map(s => s.replace(/<[^>]+>/g, ''))
    .join('\n');
}

describe('MISIÓN WORD — generación de archivo válido', () => {
  it('produce un paquete OOXML completo y bien formado', async () => {
    const { zip, xml } = await pack(buildContext());
    expect(await zip.file('[Content_Types].xml')?.async('string')).toBeTruthy();
    expect(await zip.file('_rels/.rels')?.async('string')).toBeTruthy();
    expect(xml).toBeTruthy();
    // document.xml bien formado (parseable sin error de sintaxis XML).
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    expect(parsed.getElementsByTagName('parsererror').length).toBe(0);
    // Es un documento WordProcessingML real (no HTML renombrado).
    expect(xml).toContain('<w:document');
    expect(xml).toContain('wordprocessingml');
  });

  it('el Blob tiene el tipo MIME de Word y el nombre de archivo es descriptivo', async () => {
    const { blob, filename } = await buildCashReportWordBlob(buildContext(), SUMMARIES, COMMISSIONS);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(blob.size).toBeGreaterThan(1000);
    expect(filename).toBe('COSTPRO_Reporte_Entrega_ENERVIDA_VITALLCONS_2026-10-17.docx');
    // El blob se puede re-abrir como ZIP válido (round-trip de descarga).
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('word/document.xml')).toBeTruthy();
  });

  it('nombre de archivo sanitiza caracteres inválidos', () => {
    expect(cashReportWordFilename('Tienda/Perú *2', '2026-10-17'))
      .toBe('COSTPRO_Reporte_Entrega_Tienda_Per_2_2026-10-17.docx');
  });

  it('sin conceptos activos → fail-closed (misma guardia que PDF y Excel)', async () => {
    const ctx = buildContext({
      concepts: {
        saldoInicial: false, resumenDia: false, ventasEfectivo: false, ventasTransferencia: false,
        ventasZelle: false, equivalenciaCup: false, ingresosCaja: false, egresosCaja: false,
        otrosEgresos: false, otIngresos: false, ajustes: false, reembolsos: false,
      },
    });
    await expect(buildCashReportWordDocument(ctx, SUMMARIES, COMMISSIONS))
      .rejects.toThrow('Selecciona al menos un concepto para el reporte.');
  });
});

describe('MISIÓN WORD — plantilla DIARIO: estructura espejo del PDF', () => {
  it('reproduce encabezado, resumen, desglose, firmas, tabla de ventas, anexo y órdenes', async () => {
    const { xml } = await pack(buildContext());
    const text = textOf(xml);
    // Encabezado (3 líneas del PDF §3/§6).
    expect(text).toContain('ENERVIDA-VITALLCONS');
    expect(text).toContain('Reporte de Venta CUP');
    expect(text).toContain('Período: 2026-10-17');
    // Sección 1: resumen + caja de esperado + desglose + cuadre.
    expect(text).toContain('Resumen del Día');
    expect(text).toContain('Saldo inicial / fondo de caja');
    expect(text).toContain('Ventas en efectivo');
    expect(text).toContain('Efectivo esperado a entregar');
    expect(text).toContain('Desglose de efectivo CUP');
    expect(text).toContain('Denominación');
    expect(text).toContain('Efectivo contado / entregado');
    expect(text).toContain('Cuadre (cuadrado)');
    // Pie de firmas de 3 columnas (nombres de la UI, nada hardcodeado).
    expect(text).toContain('Hecho por:');
    expect(text).toContain('Entregado por:');
    expect(text).toContain('Recibido por:');
    expect(text).toContain('Ana Torres');
    expect(text).toContain('Israel Leyva');
    expect(text).toContain('Belkis Olivera');
    // Sección 2: tabla de ventas (columnas del Diario CUP con Comisión).
    expect(text).toContain('Código');
    expect(text).toContain('Descripción');
    expect(text).toContain('Efectivo (CUP)');
    expect(text).toContain('Transfer. (CUP)');
    expect(text).toContain('Comisión');
    expect(text).toContain('Cemento TBV 50 Kg');
    expect(text).toContain('TOTALES');
    // Reporte USD (hoja propia por defecto) con SU formato en-US.
    expect(text).toContain('Reporte de Venta USD');
    expect(text).toContain('Venta por Zelle');
    // Anexo de auditoría.
    expect(text).toContain('Anexo de Auditoría — Reporte Entrega');
    expect(text).toContain('Hoja CUP — comparación por concepto');
    expect(text).toContain('Efectivo esperado OFICIAL (fórmula completa COSTPRO)');
    expect(text).toContain('Hoja CUP — conciliación configurado vs oficial');
    // Órdenes de trabajo.
    expect(text).toContain('Reporte de Órdenes de Trabajo');
    expect(text).toContain('OT-0001');
    expect(text).toContain('Instalación eléctrica');
  });

  it('la tabla de ventas REPITE su encabezado en páginas siguientes (tblHeader)', async () => {
    const { xml } = await pack(buildContext());
    expect(xml).toContain('<w:tblHeader');
  });

  it('importes EXACTOS de la fórmula centralizada (misma que PDF/Excel)', async () => {
    const { xml } = await pack(buildContext());
    const text = textOf(xml);
    const cupSummary = computeDailySummary(buildContext().report, 'CUP', SUMMARIES.paymentTotals as never);
    const fmtCup = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
    // Ventas en efectivo CUP del resumen.
    expect(text).toContain(fmtCup(cupSummary.ventasCash));
    // Efectivo esperado personalizado (con todos los conceptos = oficial).
    expect(text).toContain(fmtCup(cupSummary.efectivoEsperado));
    // Comisión sugerida inyectada (misma fuente del PDF): 1.400,00.
    expect(text).toContain('1.400,00');
    // Contado por denominaciones: 169 × 1.000 = 169.000,00.
    expect(text).toContain('169.000,00');
    // USD: cobro 150 con formato en-US (JAMÁS mezclado con CUP).
    expect(text).toContain('150.00');
    // Desglose USD: 1×100 + 1×50.
    expect(text).toContain('100.00');
    expect(text).toContain('50.00');
  });

  it('CUP y USD permanecen SEPARADOS: la hoja CUP no suma importes USD', async () => {
    const { xml } = await pack(buildContext());
    const text = textOf(xml);
    // La venta USD (150.00) NO se presenta como efectivo CUP: el esperado CUP
    // del fixture es 169.000,00 (sin sumar el cobro USD).
    const cupSummary = computeDailySummary(buildContext().report, 'CUP', SUMMARIES.paymentTotals as never);
    const fmtCup = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
    expect(cupSummary.efectivoEsperado).toBe(169000);
    expect(text).toContain(fmtCup(169000));
    // No existe una suma combinada 169.150 en el documento.
    expect(text).not.toContain('169.150');
  });

  it('USD en hoja propia (default): secciones de Word separadas con pies propios', async () => {
    const { xml } = await pack(buildContext());
    // 4 secciones (CUP / USD / Auditoría / Órdenes) → 4 sectPr.
    const sectCount = (xml.match(/<w:sectPr/g) || []).length;
    expect(sectCount).toBe(4);
    expect(textOf(xml)).toContain('Reporte de Venta USD');
  });

  it('modo compacto (usdSeparatePage OFF): USD fluye tras el CUP en la MISMA sección', async () => {
    const ctx = buildContext({ options: { ...DEFAULT_PDF_OPTIONS, usdSeparatePage: false } });
    const { xml } = await pack(ctx);
    const sectCount = (xml.match(/<w:sectPr/g) || []).length;
    expect(sectCount).toBe(3); // CUP+USD / Auditoría / Órdenes
    expect(textOf(xml)).toContain('Reporte de Venta USD');
  });

  it('pie de página con numeración Página X de Y y etiqueta de sección', async () => {
    const { zip } = await pack(buildContext());
    const footers = Object.keys(zip.files).filter(n => /^word\/footer\d+\.xml$/.test(n));
    expect(footers.length).toBeGreaterThan(0);
    const first = await zip.file(footers[0])!.async('string');
    expect(first).toContain('CostPro — Reporte Diario (Vertical) · ENERVIDA-VITALLCONS');
    expect(first).toContain('PAGE');
    expect(first).toContain('NUMPAGES');
  });
});

describe('MISIÓN WORD — opciones del documento con efecto real', () => {
  const opt = (o: Partial<CashReportPdfOptions>): CashReportPdfOptions => ({ ...DEFAULT_PDF_OPTIONS, ...o });

  it('includeUsd OFF → sin reporte USD', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeUsd: false }) }));
    const text = textOf(xml);
    expect(text).not.toContain('Reporte de Venta USD');
    expect(text).toContain('Reporte de Venta CUP');
  });

  it('includeCashBreakdown OFF → sin bloque de desglose (Resumen intacto)', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeCashBreakdown: false }) }));
    const text = textOf(xml);
    expect(text).not.toContain('Desglose de efectivo CUP');
    expect(text).not.toContain('Denominación');
    expect(text).toContain('Resumen del Día');
    expect(text).toContain('Efectivo esperado a entregar');
  });

  it('includeBreakdown OFF → bloque presente SIN filas por denominación', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeBreakdown: false }) }));
    const text = textOf(xml);
    expect(text).toContain('Desglose de efectivo CUP');
    expect(text).not.toContain('Denominación');
    expect(text).toContain('Efectivo contado / entregado');
    expect(text).toContain('Cuadre (cuadrado)');
  });

  it('includeSignature OFF → sin pie de firmas', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeSignature: false }) }));
    const text = textOf(xml);
    expect(text).not.toContain('Hecho por:');
    expect(text).not.toContain('Entregado por:');
    expect(text).toContain('Resumen del Día');
  });

  it('includeOtReport OFF → sin reporte de Órdenes de Trabajo', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeOtReport: false }) }));
    const text = textOf(xml);
    expect(text).not.toContain('Reporte de Órdenes de Trabajo');
    expect(text).toContain('Anexo de Auditoría');
  });

  it('includeCommissionColumn OFF → sin columna Comisión en la hoja CUP', async () => {
    const { xml } = await pack(buildContext({ options: opt({ includeCommissionColumn: false }) }));
    const text = textOf(xml);
    expect(text).not.toContain('Comisión');
    expect(text).toContain('Efectivo (CUP)');
  });

  it('orientación horizontal → pgSz landscape (297×210)', async () => {
    const { xml } = await pack(buildContext({ orientation: 'horizontal' }));
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="16838"[^>]*w:h="11906"/);
    expect(xml).toContain('w:orient="landscape"');
    expect(textOf(xml)).toContain('Horizontal');
  });

  it('orientación vertical (default) → A4 retrato', async () => {
    const { xml } = await pack(buildContext());
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
  });

  it('márgenes del PDF Diario (10mm laterales) y papel A4', async () => {
    const { xml } = await pack(buildContext());
    // 10mm = 567 twips — docx emite right antes que left (orden del esquema).
    expect(xml).toMatch(/<w:pgMar[^>]*w:right="56\d"/);
    expect(xml).toMatch(/<w:pgMar[^>]*w:left="56\d"/);
  });
});

describe('MISIÓN WORD — plantillas Estándar y Simple', () => {
  it('estándar: título, resumen de flujo de caja, productos vendidos y anexo', async () => {
    const ctx = buildContext({ template: 'estandar' });
    const { xml } = await pack(ctx, {
      summaries: {
        itemsSummary: SUMMARIES.itemsSummary,
        commissionsSummary: { workers: [{ worker_name: 'Ana Torres', ci: '91021712345', count: 2, periods: ['2026-10'], cash_paid: 500, transfer_paid: 0, zelle_paid: 0, total_amount_cup: 500 }], total_cup: 500, total_cash: 500, total_transfer: 0, total_zelle: 0 },
      },
    });
    const text = textOf(xml);
    expect(text).toContain('REPORTE DE CAJA — ENTREGA DE DINERO');
    expect(text).toContain('RESUMEN — FLUJO DE CAJA CUP');
    expect(text).toContain('INGRESOS');
    expect(text).toContain('Ventas en Efectivo');
    expect(text).toContain('SUBTOTAL INGRESOS');
    expect(text).toContain('DINERO A ENTREGAR EN EFECTIVO');
    expect(text).toContain('PRODUCTOS VENDIDOS');
    expect(text).toContain('Cemento TBV 50 Kg');
    expect(text).toContain('COMISIONES A TRABAJADORES');
    expect(text).toContain('Ana Torres');
    expect(text).toContain('DESGLOSE DE BILLETES PARA ENTREGA');
    expect(text).toContain('Desglose CUP');
    expect(text).toContain('TOTAL CONTADO');
    expect(text).toContain('ANEXO DE AUDITORÍA — REPORTE PERSONALIZADO');
    expect(text).toContain('HOJA CUP — COMPARACIÓN POR CONCEPTO');
    // El pie del Estándar es el del PDF («Reporte de Caja»).
    const { zip } = await pack(ctx);
    const footers = Object.keys(zip.files).filter(n => /^word\/footer\d+\.xml$/.test(n));
    const first = await zip.file(footers[0])!.async('string');
    expect(first).toContain('CostPro — Reporte de Caja');
  });

  it('simple: sin desglose ni USD (fidelidad a SU descripción — igual que el PDF)', async () => {
    const ctx = buildContext({ template: 'simple' });
    const { xml } = await pack(ctx, {
      summaries: { itemsSummary: SUMMARIES.itemsSummary, commissionsSummary: SUMMARIES.commissionsSummary },
    });
    const text = textOf(xml);
    expect(text).toContain('REPORTE DE CAJA — ENTREGA DE DINERO');
    expect(text).not.toContain('DESGLOSE DE BILLETES PARA ENTREGA');
    expect(text).not.toContain('Desglose CUP');
    expect(text).toContain('PRODUCTOS VENDIDOS');
  });
});

describe('MISIÓN WORD — casos especiales', () => {
  it('reporte sin registros → estado vacío explícito en la tabla', async () => {
    const ctx = buildContext({
      report: {
        sales: [], commissions: [], payments: [], production: [], adjustments: [],
        cash_flows: [], refund_rows: [], totals: {},
        start_date: '2026-10-17', end_date: '2026-10-17',
      } as unknown as CashReportPdfContext['report'],
      cupBreakdown: {}, usdBreakdown: {},
    });
    // Sin registros TAMBIÉN en el items-summary (misma vía del PDF: la tabla
    // de ventas se alimenta de items-summary, no del array de grupos).
    const { xml } = await pack(ctx, {
      summaries: {
        ...SUMMARIES,
        itemsSummary: { items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 },
      },
    });
    const text = textOf(xml);
    expect(text).toContain('Sin movimientos en el período');
    // El documento sigue siendo válido y completo (resumen en cero visible).
    expect(text).toContain('Resumen del Día');
  });

  it('muchos registros: TODAS las filas se exportan (sin truncar descripciones)', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      product_id: `pid-${i}`, product_name: `Producto de prueba con nombre largo número ${i} para validar el ajuste de línea`,
      sku: `SKU-${1000 + i}`, total_quantity: 2, qty_cup: 2, qty_usd: 0,
      total_cup: 1000 * (i + 1), cash_cup: 1000 * (i + 1), transfer_cup: 0, zelle_cup: 0,
      cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0,
      transactions_count: 1, has_payment_incident: false,
    }));
    const summaries: CashReportSummaries = {
      ...SUMMARIES,
      itemsSummary: { items: many, total_cup: 1830000, total_cash: 1830000, total_transfer: 0, total_zelle: 0 },
    };
    const { xml } = await pack(buildContext(), { summaries });
    const text = textOf(xml);
    // La PRIMERA y la ÚLTIMA fila están (sin omisiones para «que quepa»).
    expect(text).toContain('Producto de prueba con nombre largo número 0');
    expect(text).toContain('Producto de prueba con nombre largo número 59');
    // El texto largo NO se trunca con «…» (Word ajusta el renglón).
    expect(text).not.toContain('para validar el ajust…');
  });

  it('incidencia de pago documentada → asterisco y leyenda del PDF', async () => {
    const items = ITEMS_1710.map(it => it.product_id === 'pid-28' ? { ...it, has_payment_incident: true } : it);
    const summaries: CashReportSummaries = { ...SUMMARIES, itemsSummary: { ...SUMMARIES.itemsSummary, items } };
    const { xml } = await pack(buildContext(), { summaries });
    const text = textOf(xml);
    expect(text).toContain('* Espejo');
    expect(text).toContain('* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).');
  });

  it('período de varios días → flecha Unicode completa en encabezado y pie', async () => {
    const ctx = buildContext({ startDate: '2026-10-15', endDate: '2026-10-18' });
    const { xml } = await pack(ctx);
    const text = textOf(xml);
    expect(text).toContain('Período: 2026-10-15 → 2026-10-18');
    const { zip } = await pack(ctx);
    const footers = Object.keys(zip.files).filter(n => /^word\/footer\d+\.xml$/.test(n));
    const first = await zip.file(footers[0])!.async('string');
    expect(first).toContain('2026-10-15 → 2026-10-18');
  });
});
