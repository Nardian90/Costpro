/**
 * cash-report-excel.test.tsx — MISIÓN EXCEL 2026-10-21 (Parte B).
 *
 * Batería B6 del brief: el .xlsx es un libro real y FIEL al PDF.
 *
 *   1. El archivo se abre como libro .xlsx válido (JSZip + XML de hoja).
 *   2. Hojas, títulos, columnas y filas coinciden con lo esperado.
 *   3. Los importes son NUMÉRICOS (celdas t='n') con formato #,##0.00.
 *   4. CUP y USD conservan su separación (secciones propias, sin mezcla).
 *   5. Los totales del Excel coinciden con la MISMA fórmula del PDF
 *      (computeDailySummary — fixture 17/10 EnerVida del test de firmas).
 *   6. Órdenes de trabajo en hoja propia con sus totales.
 *   7. Textos que empiezan por = + - @ quedan prefijados (anti-inyección).
 *   8. Post-proceso: pane congelado (ySplit=5), impresión landscape
 *      fitToWidth=1 y autofiltro presentes en el XML final.
 *   9. Nombre de archivo espejo del PDF sin caracteres inválidos.
 *  10. Reproducibilidad: dos builds del mismo reporte → mismos valores.
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
} from '@/components/views/terminal/views/cash/cash-report-excel';
import { computeDailySummary } from '@/lib/cash-report/summary';
import {
  DEFAULT_PDF_OPTIONS,
  type CashReportPdfContext,
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
    options: DEFAULT_PDF_OPTIONS,
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

describe('cash-report-excel — estructura del libro (B6-1/2)', () => {
  it('produce las hojas esperadas: Reporte Entrega, Órdenes de Trabajo, Nota metodológica', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    expect(wb.SheetNames).toEqual(['Reporte Entrega', 'Órdenes de Trabajo', 'Nota metodológica']);
  });

  it('encabezado con título, tienda, período y fecha de generación', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(rs[0][0]).toBe('REPORTE DIARIO — ENTREGA DE DINERO');
    expect(String(rs[1][0])).toBe('Tienda:');
    expect(rs[1][1]).toBe('ENERVIDA-VITALLCONS');
    expect(String(rs[2][0])).toBe('Período:');
    expect(rs[2][1]).toBe('2026-10-17');
    expect(String(rs[3][0])).toBe('Generado:');
    expect(String(rs[3][1]).length).toBeGreaterThan(5);
  });

  it('nombre de archivo espejo del PDF, sin caracteres inválidos', async () => {
    const { filename } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    expect(filename).toBe('reporte_diario_ENERVIDA-VITALLCONS_2026-10-17.xlsx');
    const { filename: f2 } = await buildCashReportExcelWorkbook(
      buildContext({ storeInfo: { name: 'EnerVida & Cía', logo_url: null, address: null, phone: null, email: null, reeup: null, nit: null } }),
      SUMMARIES, COMMISSIONS,
    );
    expect(f2).not.toMatch(/[&íáéóúñ]/);
    expect(f2).toMatch(/^reporte_diario_.+\.xlsx$/);
  });
});

describe('cash-report-excel — fidelidad contable al PDF (B6-3/4/5)', () => {
  it('resumen CUP: importes NUMÉRICOS (t=n, z=#,##0.00) y totales = fórmula del PDF', async () => {
    const ctx = buildContext();
    const { wb } = await buildCashReportExcelWorkbook(ctx, SUMMARIES, COMMISSIONS);
    const ws = wb.Sheets['Reporte Entrega'];
    const rs = rows(ws);

    // MISMA fórmula que el PDF (computeDailySummary) — fuente única B4
    const cup = computeDailySummary(ctx.report, 'CUP', SUMMARIES.paymentTotals);
    expect(cup.ventasCash).toBe(169000);
    expect(cup.efectivoEsperado).toBe(169000);

    const ventas = findRow(rs, 'Ventas en efectivo');
    expect(ventas.row[3]).toBe(169000);
    const wsCell = ws[XLSX.utils.encode_cell({ r: ventas.idx, c: 3 })] as { t: string; z?: string };
    expect(wsCell.t).toBe('n');
    expect(wsCell.z).toBe('#,##0.00');

    const esperado = findRow(rs, 'Efectivo esperado a entregar');
    expect(esperado.row[3]).toBe(169000);
    expect((ws[XLSX.utils.encode_cell({ r: esperado.idx, c: 3 })] as { t: string }).t).toBe('n');
  });

  it('desglose CUP: denominaciones contadas, total contado y cuadre numérico', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);

    const denominacion = findRow(rs, 1000); // fila '1000'
    expect(denominacion.row[2]).toBe(169); // cantidad
    expect(denominacion.row[3]).toBe(169000); // importe = 169 × 1000

    const contado = findRow(rs, 'Efectivo contado / entregado');
    expect(contado.row[3]).toBe(169000);
    const cuadre = findRow(rs, 'Cuadre (CUADRADO)');
    expect(cuadre.row[3]).toBe(0); // contado 169.000 − esperado 169.000
  });

  it('tabla de ventas CUP: mismas columnas/orden que el PDF y TOTALES exactos', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);

    const header = findRow(rs, 'Código');
    expect(header.row.slice(0, 6)).toEqual(['Código', 'Descripción', 'Cant.', 'Efectivo (CUP)', 'Transfer. (CUP)', 'Comisión']);

    // 4 productos CUP (Tunder vive SOLO en la hoja USD — mismo criterio del PDF)
    const cemento = findRow(rs, '141');
    expect(cemento.row[1]).toBe('Cemento TBV 50 Kg');
    expect(cemento.row[2]).toBe(7);
    expect(cemento.row[3]).toBe(140000);
    expect(cemento.row[5]).toBe(1400); // comisión sugerida del motor real

    const tot = findRow(rs, 'TOTALES');
    expect(tot.row[2]).toBe(10); // 7+1+1+1
    expect(tot.row[3]).toBe(169000);
    expect(tot.row[4]).toBe(0);
    expect(tot.row[5]).toBe(1400);
  });

  it('sección USD separada: Tunder 150 USD efectivo — CUP y USD NUNCA se mezclan', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);

    // El producto USD aparece UNA sola vez (fila de la sección USD, sin col Comisión)
    const tunderRows = rs.filter(r => r[1] === 'Tunder Grande');
    expect(tunderRows).toHaveLength(1);
    expect(tunderRows[0][2]).toBe(1);
    expect(tunderRows[0][3]).toBe(150);
    expect(tunderRows[0][4]).toBe(0);
    expect(tunderRows[0][5]).toBe(''); // sin columna Comisión en la hoja USD

    // Resumen USD: esperado = 150 (ventas cash USD), en celda numérica
    const usdEsperado = rs.filter(r => String(r[0] ?? '') === 'Efectivo esperado a entregar (USD)');
    expect(usdEsperado).toHaveLength(1);
    expect(usdEsperado[0][3]).toBe(150);

    // El cuadre USD usa el esperado USD (contado 150 − esperado 150 = 0)
    const usdCuadre = rs.filter(r => String(r[0] ?? '').startsWith('Cuadre ('));
    expect(usdCuadre).toHaveLength(2);
    expect(usdCuadre[0][3]).toBe(0); // CUP
    expect(usdCuadre[1][3]).toBe(0); // USD
  });

  it('hoja Órdenes de Trabajo: filas y totales en monedas separadas', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rsOt = rows(wb.Sheets['Órdenes de Trabajo']);
    expect(rsOt[4].slice(0, 6)).toEqual(['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD']);
    const ot = findRow(rsOt, 'OT-0001');
    expect(ot.row[1]).toBe('Trabajo');
    expect(ot.row[2]).toBe('Instalación eléctrica');
    expect(ot.row[3]).toBe(1);
    expect(ot.row[4]).toBe(5000);
    expect(ot.row[5]).toBe(0);
    const tot = findRow(rsOt, 'TOTALES');
    expect(tot.row[4]).toBe(5000);
    expect(tot.row[5]).toBe(0);
  });

  it('firmas del documento (mismos nombres configurables que el PDF)', async () => {
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const rs = rows(wb.Sheets['Reporte Entrega']);
    expect(findRow(rs, 'Hecho por:').row[1]).toBe('Ana Torres');
    expect(findRow(rs, 'Entregado por:').row[1]).toBe('Israel Leyva');
    expect(findRow(rs, 'Recibido por:').row[1]).toBe('Belkis Olivera');
  });

  it('reproducibilidad: dos builds del MISMO reporte → idénticos valores de negocio', async () => {
    const a = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const b = await buildCashReportExcelWorkbook(buildContext(), SUMMARIES, COMMISSIONS);
    const ra = rows(a.wb.Sheets['Reporte Entrega']);
    const rb = rows(b.wb.Sheets['Reporte Entrega']);
    // Compara TODAS las filas salvo la fecha de generación (metadato)
    const stripMeta = (rs: Row[]) => rs.map((r, i) => (i === 3 ? [r[0], ''] : r));
    expect(stripMeta(ra)).toEqual(stripMeta(rb));
  });
});

describe('cash-report-excel — seguridad y robustez (B6-7/8/10)', () => {
  it('sanitizeExcelText: = + - @ quedan prefijados con apóstrofo', () => {
    expect(sanitizeExcelText('=SUM(A1:A5)')).toBe("'=SUM(A1:A5)");
    expect(sanitizeExcelText('+1')).toBe("'+1");
    expect(sanitizeExcelText('-1')).toBe("'-1");
    expect(sanitizeExcelText('@cmd')).toBe("'@cmd");
    expect(sanitizeExcelText('Cemento Cola')).toBe('Cemento Cola');
    expect(sanitizeExcelText('')).toBe('');
  });

  it('un producto llamado "=SUM(A1)" se exporta como texto inofensivo', async () => {
    const items = [{
      ...ITEMS_1710[0],
      product_id: 'pid-x', sku: '=1+2', product_name: '=SUM(A1:A5)',
    }];
    const summaries: Required<CashReportSummaries> = { ...SUMMARIES, itemsSummary: { ...SUMMARIES.itemsSummary, items } };
    const { wb } = await buildCashReportExcelWorkbook(buildContext(), summaries, new Map());
    const rs = rows(wb.Sheets['Reporte Entrega']);
    const fila = findRow(rs, "'=1+2");
    expect(fila.row[1]).toBe("'=SUM(A1:A5)");
  });

  it('el blob final es un xlsx VÁLIDO con pane congelado, impresión landscape y autofiltro', async () => {
    const { blob } = await buildCashReportExcelBlob(buildContext(), SUMMARIES, COMMISSIONS);
    expect(blob.size).toBeGreaterThan(4000);
    const buf = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    const sheet1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    // B3: fila de encabezado congelada (bloque de identificación siempre visible)
    expect(sheet1).toContain('ySplit="5"');
    expect(sheet1).toContain('state="frozen"');
    // B3: impresión horizontal ajustada a 1 página de ancho
    expect(sheet1).toContain('orientation="landscape"');
    expect(sheet1).toContain('fitToWidth="1"');
    expect(sheet1).toContain('fitToPage="1"');
    // B3: autofiltro sobre la tabla de ventas
    expect(sheet1).toContain('<autoFilter');

    // Workbook válido: 3 hojas registradas
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect((wbXml.match(/<sheet /g) || []).length).toBe(3);
  });
});
