/**
 * cash-report-excel.test.tsx — MISIÓN 2026-10-22 (Partes D + E).
 *
 * Batería de la misión «Reporte Entrega: persistencia, panel lateral y Excel
 * profesional sin corrupción»:
 *
 *   D — REPARACIÓN DEL BINARIO (regresión OBLIGATORIA de la misión):
 *     · el workbook.xml final respeta el ORDEN CT_Workbook (ECMA-376 §18.2.10):
 *       sheets → definedNames → calcPr (la causa raíz del archivo dañado era
 *       calcPr inyectado ANTES de definedNames);
 *     · el ZIP es válido: [Content_Types].xml, _rels/.rels, xl/workbook.xml y
 *       todas las hojas presentes y parseables;
 *     · pageSetup A4 landscape fitToWidth=1 + headerFooter con numeración
 *       (&P de &N) + sheetPr fitToPage en el XML de hoja — y NINGUNA hoja
 *       lleva paneles congelados (<pane>).
 *   E — ESTRUCTURA ESPEJO DEL PDF:
 *     · hoja principal «Reporte Entrega» (identidad compacta + resumen +
 *       desglose + ventas + firmas);
 *     · «USD en hoja separada» ON → «Reporte Entrega USD» propia; OFF →
 *       secciones USD corridas en la principal (sin duplicar totales);
 *     · opciones con efecto real: includeCashBreakdown OFF omite el bloque;
 *       includeBreakdown OFF omite las filas por denominación; includeSignature
 *       OFF omite firmas; includeUsd OFF omite secciones USD.
 *   Fidelidad contable (heredada): importes NUMÉRICOS (t='n', z=#,##0.00),
 *     CUP/USD separados, totales = fórmula del PDF (computeDailySummary,
 *     fixture 17/10 EnerVida), fórmulas reales (=SUM, =A*C, cuadre),
 *     round-trip con valores cacheados, anti-inyección = + - @, nombre
 *     descriptivo, reproducibilidad.
 *   REFINAMIENTO 2026-10-22 (feedback del propietario sobre el Excel):
 *     · identidad en 2 filas (tienda+dirección | período+generado), SIN
 *       «Tipo de reporte» ni «Monedas»;
 *     · SIN nota al pie de incidencias ni asterisco en productos;
 *     · SIN sección «COMPROBACIÓN DE CONSISTENCIA»;
 *     · SIN filas congeladas (ninguna hoja lleva <pane>).
 *
 * El builder recibe summaries + comisiones sugeridas INYECTADOS (misma vía
 * que el PDF en producción) — cero red en las pruebas.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import JSZip from 'jszip';
import {
  buildCashReportExcelWorkbook,
  buildCashReportExcelBlob,
  sanitizeExcelText,
  injectCalcPrInWorkbookXml,
} from '@/components/views/terminal/views/cash/cash-report-excel';
import { computeDailySummary } from '@/lib/cash-report/summary';
import {
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
  type CashReportPdfOptions,
  type CashReportSummaries,
} from '@/components/views/terminal/views/cash/cash-report-pdf';

// ── Fixture 17/10/2026 (EnerVida) — MISMO del test de firmas del PDF ──
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

type Row = Array<string | number | undefined>;

function rows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: '' }) as Row[];
}

function findRow(rs: Row[], label: string | number): { idx: number; row: Row } {
  const l = String(label);
  const idx = rs.findIndex(r => String(r[0] ?? '') === l);
  expect(idx, `fila con etiqueta "${l}" debe existir`).toBeGreaterThanOrEqual(0);
  return { idx, row: rs[idx] };
}

/** Celda cruda (con f/z/t) por dirección 1-based tipo Excel. */
function cell(ws: XLSX.WorkSheet, addr: string): XLSX.CellObject {
  const c = ws[addr];
  expect(c, `celda ${addr} debe existir`).toBeDefined();
  return c as XLSX.CellObject;
}

/** El blob final desempaquetado con JSZip (para las validaciones XML/D3). */
async function blobZip(ctx: CashReportPdfContext) {
  const { blob } = await buildCashReportExcelBlob(ctx, SUMMARIES, COMMISSIONS);
  return JSZip.loadAsync(await blob.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE D — LA CORRUPCIÓN DEL BINARIO (regresión obligatoria)
// ═══════════════════════════════════════════════════════════════════════════
describe('PARTE D — el .xlsx final es un libro Office Open XML VÁLIDO', () => {
  it('D-REGRESIÓN: workbook.xml respeta el orden CT_Workbook — calcPr DESPUÉS de definedNames (causa raíz del archivo dañado)', async () => {
    const zip = await blobZip(buildContext());
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const order = (wbXml.match(/<(sheets|definedNames|calcPr)[ >/]/g) || []).map(s => s.slice(1, -1));
    expect(order).toContain('calcPr');
    expect(order).toContain('definedNames');
    const iSheets = order.indexOf('sheets');
    const iDn = order.indexOf('definedNames');
    const iCalc = order.indexOf('calcPr');
    expect(iCalc).toBeGreaterThan(iSheets);
    expect(iCalc).toBeGreaterThan(iDn);
  });

  it('D-3: ZIP válido con [Content_Types].xml, _rels/.rels, xl/workbook.xml y las hojas — todos los XML parseables', async () => {
    const zip = await blobZip(buildContext());
    for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']) {
      expect(zip.file(required), `${required} debe existir en el ZIP`).toBeTruthy();
    }
    const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    expect(sheets.length).toBe(4);
    const parser = new DOMParser();
    for (const name of [...sheets, '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml']) {
      const xml = await zip.file(name)!.async('string');
      const doc = parser.parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, `${name} debe ser XML parseable`).toBe(0);
    }
  });

  it('D-3: el libro abre con un lector compatible (.xlsx) — round-trip con hojas y valores', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rt = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
    expect(rt.SheetNames).toEqual(['Reporte Entrega', 'Reporte Entrega USD', 'Órdenes de Trabajo', 'Nota metodológica']);
    const rs = rows(rt.Sheets['Reporte Entrega']);
    expect(findRow(rs, 'Tienda:').row[1]).toBe('ENERVIDA-VITALLCONS');
  });

  it('E-3: impresión completa en el XML — A4 VERTICAL (misión 2026-10-23 §5), fitToWidth=1/fitToHeight=0, SIN pane congelado, headerFooter con numeración, fitToPage y SALTO MANUAL antes de la sección 2', async () => {
    const zip = await blobZip(buildContext());
    const s1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(s1).not.toContain('<pane '); // feedback 2026-10-22: sin filas congeladas
    expect(s1).toContain('pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"');
    expect(s1).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(s1).toContain('<headerFooter>');
    expect(s1).toContain('Página &amp;P de &amp;N');
    expect(s1).toContain('&amp;BReporte de Entrega — ENERVIDA-VITALLCONS');
    // MISIÓN 2026-10-23: salto de página manual antes del banner SECCIÓN 2 —
    // cada sección se imprime como unidad (sin división accidental).
    expect(s1).toMatch(/<rowBreaks count="\d+" manualBreakCount="\d+"><brk id="\d+" max="16383" man="1"\/>/);
    // Print_Area + Print_Titles definidos a nivel de workbook (encabezado repetido)
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbXml).toContain('_xlnm.Print_Area');
    expect(wbXml).toContain('_xlnm.Print_Titles');
  });

  it('E-3/refinamiento: NINGUNA hoja del libro lleva paneles congelados (<pane>)', async () => {
    const zip = await blobZip(buildContext());
    const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    expect(sheets.length).toBeGreaterThan(0);
    for (const name of sheets) {
      const xml = await zip.file(name)!.async('string');
      expect(xml, `${name} no debe llevar <pane>`).not.toContain('<pane ');
      expect(xml, `${name} no debe llevar state="frozen"`).not.toContain('state="frozen"');
    }
  });

  it('injectCalcPrInWorkbookXml: con definedNames inserta DESPUÉS; sin ellos, tras sheets; idempotente', () => {
    // Entradas realistas (los <sheets> del workbook real siempre llevan hijos)
    const conDn = '<workbook><sheets><sheet/></sheets><definedNames><definedName/></definedNames></workbook>';
    expect(injectCalcPrInWorkbookXml(conDn)).toBe('<workbook><sheets><sheet/></sheets><definedNames><definedName/></definedNames><calcPr fullCalcOnLoad="1" calcId="191029"/></workbook>');
    const sinDn = '<workbook><sheets><sheet/></sheets></workbook>';
    expect(injectCalcPrInWorkbookXml(sinDn)).toBe('<workbook><sheets><sheet/></sheets><calcPr fullCalcOnLoad="1" calcId="191029"/></workbook>');
    const yaTiene = '<workbook><sheets/><definedNames/><calcPr calcId="1"/></workbook>';
    expect(injectCalcPrInWorkbookXml(yaTiene)).toBe(yaTiene); // idempotente
    // REGRESIÓN EXACTA del bug original: la salida NUNCA coloca calcPr antes de definedNames
    const buggy = '<workbook><sheets><sheet/></sheets><calcPr calcId="1"/><definedNames/></workbook>';
    expect(injectCalcPrInWorkbookXml(buggy)).toBe(buggy); // ya tiene calcPr → idempotente (no reinyecta)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE E — estructura espejo del PDF + opciones con efecto real
// ═══════════════════════════════════════════════════════════════════════════
/** Valor de la celda que sigue a una etiqueta, buscada en TODAS las columnas. */
function valueAfterLabel(rs: Row[], label: string): string | number | undefined {
  for (const r of rs) {
    const i = r.findIndex(v => String(v ?? '') === label);
    if (i >= 0) return r[i + 1];
  }
  expect(false, `etiqueta "${label}" debe existir en alguna columna`).toBe(true);
  return undefined;
}

describe('PARTE E — estructura del libro espejo del PDF', () => {
  it('E2/refinamiento: identidad — tienda/título/período completos, sin «Tipo de reporte» ni «Monedas» (misión 2026-10-23)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    // Título del documento: tienda + título + moneda (misión §5)
    expect(rs[0][0]).toContain('ENERVIDA-VITALLCONS');
    expect(rs[0][0]).toContain('Reporte de Venta CUP');
    // Fila 1: tienda | período · Fila 2: dirección | generado
    expect(rs[1][0]).toBe('Tienda:');
    expect(rs[1][1]).toBe('ENERVIDA-VITALLCONS');
    expect(rs[1][3]).toBe('Período:');
    expect(rs[1][4]).toBe('2026-10-17');
    expect(rs[2][0]).toBe('Dirección:');
    expect(rs[2][1]).toBe('Calle 23');
    expect(rs[2][3]).toBe('Generado:');
    expect(String(rs[2][4] ?? '')).toBeTruthy();
    // La identidad termina en la fila 2 → la sección 1 empieza en la 5
    expect(rs[3].join('')).toBe('');
    // SIN filas de metadatos (feedback del propietario)
    expect(rs.find(r => String(r[0] ?? '') === 'Tipo de reporte:')).toBeUndefined();
    expect(rs.find(r => String(r[0] ?? '') === 'Monedas:')).toBeUndefined();
    expect(rs.flat().find(v => String(v ?? '').includes('NUNCA se suman'))).toBeUndefined();
  });

  it('E2: hoja principal con DOS SECCIONES separables + identidad repetida + doble pie de firmas (misión 2026-10-23 §5)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames[0]).toBe('Reporte Entrega');
    const rs = rows(wb.Sheets['Reporte Entrega']);
    // Identidad (título + 2 filas con los 4 datos)
    expect(rs[0][0]).toContain('Reporte de Venta CUP');
    expect(findRow(rs, 'Tienda:').row[1]).toBe('ENERVIDA-VITALLCONS');
    expect(findRow(rs, 'Dirección:').row[1]).toBe('Calle 23');
    expect(valueAfterLabel(rs, 'Período:')).toBe('2026-10-17');
    expect(String(valueAfterLabel(rs, 'Generado:') ?? '')).toBeTruthy();
    // SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (comprobante independiente)
    const sec1 = findRow(rs, 'SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (CUP)');
    expect(sec1.idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'DESGLOSE DE EFECTIVO — CUP').idx).toBeGreaterThan(sec1.idx);
    expect(findRow(rs, 'Efectivo contado / entregado').idx).toBeGreaterThan(sec1.idx);
    // SECCIÓN 2 — DETALLE DE VENTAS (encabezado de tabla + TOTALES)
    const sec2 = findRow(rs, 'SECCIÓN 2 — DETALLE DE VENTAS (CUP)');
    expect(sec2.idx).toBeGreaterThan(sec1.idx);
    expect(rs.findIndex(r => String(r[0] ?? '') === 'Código')).toBeGreaterThan(sec2.idx);
    // Identidad REPETIDA dentro de la sección 2 (identificable por sí misma)
    const tiendaRows = rs.filter(r => String(r[0] ?? '') === 'Tienda:');
    expect(tiendaRows.length).toBe(2);
    expect(tiendaRows[1][1]).toBe('ENERVIDA-VITALLCONS');
    expect(tiendaRows[1][3]).toBe('Período:');
    expect(tiendaRows[1][4]).toBe('2026-10-17');
    // Doble pie de firmas: una por sección
    const firmas = rs.filter(r => String(r[0] ?? '') === 'FIRMAS');
    expect(firmas.length).toBe(2);
    expect(rs.indexOf(firmas[1])).toBeGreaterThan(sec2.idx);
    // SIN sección de comprobación (feedback del propietario)
    expect(rs.find(r => String(r[0] ?? '').startsWith('COMPROBACIÓN'))).toBeUndefined();
    expect(rs.find(r => String(r[0] ?? '').includes('tabla − resumen'))).toBeUndefined();
    expect(rs.flat().find(v => String(v ?? '') === 'COHERENTE')).toBeUndefined();
    // Firmas con los nombres configurables de la UI (nada hardcodeado)
    expect(findRow(rs, 'Hecho por:').row[2]).toBe('Ana Torres');
    expect(findRow(rs, 'Entregado por:').row[2]).toBe('Israel Leyva');
    expect(findRow(rs, 'Recibido por:').row[2]).toBe('Belkis Olivera');
  });

  it('E2: «USD en hoja separada» ON → hoja «Reporte Entrega USD» con título, tienda y período propios', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames).toContain('Reporte Entrega USD');
    const rs = rows(wb.Sheets['Reporte Entrega USD']);
    expect(rs[0][0]).toContain('Reporte de Venta USD');
    expect(findRow(rs, 'Tienda:').row[1]).toBe('ENERVIDA-VITALLCONS');
    expect(valueAfterLabel(rs, 'Período:')).toBe('2026-10-17');
    expect(String(valueAfterLabel(rs, 'Generado:') ?? '')).toBeTruthy();
    expect(findRow(rs, 'SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (USD)').idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'SECCIÓN 2 — DETALLE DE VENTAS (USD)').idx).toBeGreaterThanOrEqual(0);
    // sin duplicar: la hoja principal NO contiene las secciones USD
    const main = rows(wb.Sheets['Reporte Entrega']);
    expect(main.find(r => String(r[0] ?? '').includes('(USD)'))).toBeUndefined();
  });

  it('E2: «USD en hoja separada» OFF → secciones USD corridas en la hoja principal (compacto)', async () => {
    const options: CashReportPdfOptions = { ...DEFAULT_PDF_OPTIONS, usdSeparatePage: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames).not.toContain('Reporte Entrega USD');
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(findRow(rs, 'SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (USD)').idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'DESGLOSE DE EFECTIVO — USD').idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'SECCIÓN 2 — DETALLE DE VENTAS (USD)').idx).toBeGreaterThanOrEqual(0);
  });

  it('E2: «Desglose de efectivo» OFF → el bloque de desglose se OMITE (PDF/Excel/UI consistentes)', async () => {
    const options: CashReportPdfOptions = { ...DEFAULT_PDF_OPTIONS, includeCashBreakdown: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    for (const sheet of ['Reporte Entrega', 'Reporte Entrega USD']) {
      const rs = rows(wb.Sheets[sheet]);
      expect(rs.find(r => String(r[0] ?? '').startsWith('DESGLOSE DE EFECTIVO'))).toBeUndefined();
      expect(rs.find(r => String(r[0] ?? '') === 'Efectivo contado / entregado')).toBeUndefined();
    }
  });

  it('E2/B-7: «Desglose de billetes» OFF → bloque presente SIN filas por denominación (contado directo)', async () => {
    const options: CashReportPdfOptions = { ...DEFAULT_PDF_OPTIONS, includeBreakdown: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(findRow(rs, 'DESGLOSE DE EFECTIVO — CUP').idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'Efectivo contado / entregado').row[3]).toBe(169000); // contado conservado
    expect(rs.find(r => String(r[0] ?? '') === 'Denominación')).toBeUndefined(); // sin tabla
    expect(rs.find(r => String(r[0] ?? '').startsWith('Cuadre ('))).toBeTruthy(); // cuadre presente
  });

  it('E2/B-8: «Líneas de firma» OFF → sin firmas en el Excel (paridad PDF)', async () => {
    const options: CashReportPdfOptions = { ...DEFAULT_PDF_OPTIONS, includeSignature: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    for (const sheet of ['Reporte Entrega', 'Reporte Entrega USD']) {
      const rs = rows(wb.Sheets[sheet]);
      expect(rs.find(r => String(r[0] ?? '') === 'FIRMAS')).toBeUndefined();
    }
  });

  it('E2: «Cuadre USD» (includeUsd) OFF → sin secciones USD ni hoja USD', async () => {
    const options: CashReportPdfOptions = { ...DEFAULT_PDF_OPTIONS, includeUsd: false };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames).not.toContain('Reporte Entrega USD');
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(rs.find(r => String(r[0] ?? '').includes('— USD'))).toBeUndefined();
  });

  it('E2: todas las opciones desactivadas → documento mínimo (sin desglose, USD, firmas ni OT)', async () => {
    const options: CashReportPdfOptions = {
      ...DEFAULT_PDF_OPTIONS,
      includeCashBreakdown: false, includeBreakdown: false, includeUsd: false,
      includeSignature: false, includeOtReport: false, includeCommissionColumn: false,
      usdSeparatePage: false,
    };
    const { wb } = await buildCashReportExcelWorkbook(buildContext({ options }), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames).toEqual(['Reporte Entrega', 'Nota metodológica']);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(findRow(rs, 'SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (CUP)').idx).toBeGreaterThanOrEqual(0);
    expect(findRow(rs, 'SECCIÓN 2 — DETALLE DE VENTAS (CUP)').idx).toBeGreaterThanOrEqual(0);
  });

  it('E2/refinamiento: con incidencia de pago documentada → tabla LIMPIA (sin asterisco ni nota al pie)', async () => {
    // Feedback del propietario 2026-10-22: «* Importe cobrado difiere…» no es
    // necesario en el Excel. El producto conserva su nombre e importes reales.
    const summaries = {
      ...SUMMARIES,
      itemsSummary: {
        ...SUMMARIES.itemsSummary,
        items: [{ ...ITEMS_1710[0], has_payment_incident: true }],
      },
    };
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), summaries as Required<CashReportSummaries>, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    // Sin asterisco prefijado al nombre del producto
    expect(findRow(rs, '141').row[1]).toBe('Cemento TBV 50 Kg');
    // Sin nota al pie de incidencias (en NINGUNA columna/fila)
    expect(rs.flat().find(v => String(v ?? '').includes('Importe cobrado difiere'))).toBeUndefined();
    // La hoja USD tampoco la lleva
    const usd = rows(wb.Sheets['Reporte Entrega USD']);
    expect(usd.flat().find(v => String(v ?? '').includes('Importe cobrado difiere'))).toBeUndefined();
  });

  it('nombre de archivo descriptivo y sin caracteres inválidos (misión §6)', async () => {
    const { filename } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    expect(filename).toBe('COSTPRO_Reporte_Entrega_ENERVIDA_VITALLCONS_2026-10-17.xlsx');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FIDELIDAD CONTABLE (heredada de las misiones anteriores)
// ═══════════════════════════════════════════════════════════════════════════
describe('Fidelidad contable al PDF (misma fuente, mismas fórmulas)', () => {
  it('resumen CUP: importes NUMÉRICOS (t=n, z=#,##0.00) y totales = fórmula del PDF (computeDailySummary)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    const s = computeDailySummary(buildContext().report, 'CUP', SUMMARIES.paymentTotals);
    expect(findRow(rs, 'Resumen del día (efectivo + transferencia)').row[3]).toBe(s.ventasTotales);
    expect(findRow(rs, 'Ventas en efectivo').row[3]).toBe(s.ventasCash);
    expect(findRow(rs, 'Efectivo esperado a entregar').row[3]).toBe(s.efectivoEsperado);
    const cashIdx = findRow(rs, 'Ventas en efectivo').idx;
    const c = cell(ws, `D${cashIdx + 1}`); // importe NUMÉRICO en la fila del fixture
    expect(c.t).toBe('n');
    expect(c.z).toBe('#,##0.00');
  });

  it('desglose CUP: denominaciones contadas, total contado y cuadre numérico', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    const { row: denomRow } = findRow(rs, 1000);
    expect(denomRow[2]).toBe(169);
    expect(denomRow[3]).toBe(169000);
    expect(findRow(rs, 'Efectivo contado / entregado').row[3]).toBe(169000);
    const cuadre = findRow(rs, /Cuadre \(/.test(String(rs.find(r => String(r[0] ?? '').startsWith('Cuadre ('))?.[0])) ? String(rs.find(r => String(r[0] ?? '').startsWith('Cuadre ('))![0]) : '').row;
    expect(cuadre[3]).toBe(0); // 169000 − 169000
  });

  it('tabla de ventas CUP: mismas columnas/orden que el PDF y TOTALES exactos', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    const headerIdx = rs.findIndex(r => String(r[0] ?? '') === 'Código');
    expect(rs[headerIdx]).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión']);
    const cemento = findRow(rs, '141');
    expect(cemento.row[1]).toBe('Cemento TBV 50 Kg');
    expect(cemento.row[2]).toBe(7);
    expect(cemento.row[3]).toBe(140000);
    expect(cemento.row[5]).toBe(1400); // comisión sugerida del motor real
    const tot = findRow(rs, 'TOTALES');
    expect(tot.row[2]).toBe(10);   // 7 + 1 + 1 + 1 (CUP)
    expect(tot.row[3]).toBe(169000);
    expect(tot.row[5]).toBe(1400);
  });

  it('sección USD separada: Tunder 150 USD efectivo — CUP y USD NUNCA se mezclan', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega USD']);
    expect(findRow(rs, '146').row[3]).toBe(150);
    expect(findRow(rs, 'TOTALES').row[3]).toBe(150);
    expect(findRow(rs, 'Efectivo contado / entregado').row[3]).toBe(150);
    // el desglose USD usa denominaciones de USD (100 y 50), no de CUP
    expect(findRow(rs, 100).row[3]).toBe(100);
    expect(findRow(rs, 50).row[3]).toBe(50);
  });

  it('hoja Órdenes de Trabajo: filas y totales en monedas separadas', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Órdenes de Trabajo']);
    expect(findRow(rs, 'OT-0001').row[2]).toBe('Instalación eléctrica');
    expect(findRow(rs, 'TOTALES').row[4]).toBe(5000);
    expect(findRow(rs, 'TOTALES').row[5]).toBe(0);
  });

  it('reproducibilidad: dos builds del MISMO reporte → idénticos valores de negocio', async () => {
    const a = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const b = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ra = rows(a.wb.Sheets['Reporte Entrega']);
    const rb = rows(b.wb.Sheets['Reporte Entrega']);
    const strip = (rs: Row[]) => rs.map(r => r.map(v => (typeof v === 'string' && v.includes('/2026') ? '<fecha>' : v)));
    expect(strip(ra)).toEqual(strip(rb)); // solo difiere la fecha de generación
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FÓRMULAS REALES (§4 de la misión profesional — conservadas en la estructura)
// ═══════════════════════════════════════════════════════════════════════════
describe('Fórmulas reales del libro (misma hoja: tabla ↔ resumen ↔ desglose)', () => {
  it('TOTALES con =SUM sobre el rango exacto de filas de datos; importes de denominación =A*C; contado =SUM', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    const totIdx = findRow(rs, 'TOTALES').idx;
    for (const col of ['C', 'D', 'E', 'F']) {
      const c = cell(ws, `${col}${totIdx + 1}`);
      expect(c.f, `TOTALES ${col} debe llevar fórmula`).toMatch(/^SUM\(/);
    }
    // Refinamiento (gap preexistente): la fila TOTALES lleva formato de dinero
    // real y negrita — antes salía con formato General y sin estilo.
    const dTot = cell(ws, `D${totIdx + 1}`) as unknown as { z?: string; s?: { font?: { bold?: boolean } } };
    expect(dTot.z).toBe('#,##0.00');
    expect(dTot.s?.font?.bold).toBe(true);
    const aTot = cell(ws, `A${totIdx + 1}`) as unknown as { s?: { font?: { bold?: boolean } } };
    expect(aTot.s?.font?.bold).toBe(true); // etiqueta «TOTALES» en negrita
    const denomIdx = findRow(rs, 1000).idx;
    expect(cell(ws, `D${denomIdx + 1}`).f).toBe(`A${denomIdx + 1}*C${denomIdx + 1}`);
    const contadoIdx = findRow(rs, 'Efectivo contado / entregado').idx;
    expect(cell(ws, `D${contadoIdx + 1}`).f).toMatch(/^SUM\(D\d+:D\d+\)$/);
  });

  it('resumen: ventas totales y esperado como fórmulas de componentes (misma cadena contable)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    const totalIdx = findRow(rs, 'Resumen del día (efectivo + transferencia)').idx;
    expect(cell(ws, `D${totalIdx + 1}`).f).toMatch(/^D\d+\+D\d+$/);
    const espIdx = findRow(rs, 'Efectivo esperado a entregar').idx;
    expect(cell(ws, `D${espIdx + 1}`).f).toMatch(/^D\d+$/); // componentes del fixture
  });

  it('cuadre = contado − esperado (misma hoja, fórmula viva)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    const contadoIdx = findRow(rs, 'Efectivo contado / entregado').idx;
    const espIdx = findRow(rs, 'Efectivo esperado a entregar').idx;
    const cuadreRow = rs.findIndex(r => String(r[0] ?? '').startsWith('Cuadre ('));
    expect(cell(ws, `D${cuadreRow + 1}`).f).toBe(`D${contadoIdx + 1}-D${espIdx + 1}`);
  });

  it('round-trip XLSX.write→XLSX.read: las fórmulas =SUM sobreviven con su valor cacheado', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rt = XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' });
    const ws = rt.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    const totIdx = findRow(rs, 'TOTALES').idx;
    const c = cell(ws, `D${totIdx + 1}`);
    expect(c.f).toMatch(/^SUM\(/);
    expect(c.v).toBe(169000); // valor cacheado del sistema sobrevive al round-trip
  });

  it('reporte sin datos: fila informativa sin números y las fórmulas no la cuentan', async () => {
    const emptySummaries: Required<CashReportSummaries> = {
      itemsSummary: { items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 },
      paymentTotals: { totals: {} },
      commissionsSummary: { workers: [], total_cup: 0 },
      productionOrders: [],
    };
    const ctx = buildContext();
    ctx.report = { sales: [], commissions: [], payments: [], production: [], adjustments: [], cash_flows: [], refund_rows: [], totals: {}, start_date: '2026-10-17', end_date: '2026-10-17' } as unknown as CashReportPdfContext['report'];
    const { wb } = await buildCashReportExcelWorkbook(ctx, emptySummaries, new Map());
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);
    // La fila informativa vive en la columna Descripción (B) — sin números.
    expect(rs.find(r => String(r[1] ?? '') === 'Sin movimientos en el período')).toBeTruthy();
    const totIdx = findRow(rs, 'TOTALES').idx;
    expect(cell(ws, `D${totIdx + 1}`).v).toBe(0);
    // La fila informativa (texto en B) no entra en el =SUM — el rango solo
    // cubre filas de datos (vacías aquí) y el resultado cacheado es 0.
    expect(cell(ws, `D${totIdx + 1}`).f).toMatch(/^SUM\(D\d+:D\d+\)$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEGURIDAD Y ROBUSTEZ (B5/B6 — heredadas)
// ═══════════════════════════════════════════════════════════════════════════
describe('Seguridad y robustez', () => {
  it('sanitizeExcelText: = + - @ quedan prefijados con apóstrofo', () => {
    expect(sanitizeExcelText('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeExcelText('+cmd')).toBe("'+cmd");
    expect(sanitizeExcelText('-1')).toBe("'-1");
    expect(sanitizeExcelText('@x')).toBe("'@x");
    expect(sanitizeExcelText('Texto normal')).toBe('Texto normal');
  });

  it('un producto llamado "=SUM(A1)" se exporta como texto inofensivo', async () => {
    const summaries = {
      ...SUMMARIES,
      itemsSummary: {
        ...SUMMARIES.itemsSummary,
        items: [{ ...ITEMS_1710[0], product_name: '=SUM(A1)*2' }],
      },
    };
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), summaries as Required<CashReportSummaries>, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    const prod = rs.find(r => String(r[1] ?? '').includes('SUM'));
    expect(String(prod?.[1])).toBe("'=SUM(A1)*2");
  });
});
