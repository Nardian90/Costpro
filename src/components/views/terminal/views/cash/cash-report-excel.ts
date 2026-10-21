/**
 * cash-report-excel.ts — Exportación Excel (.xlsx) del Reporte de Entrega.
 *
 * MISIÓN EXCEL 2026-10-21 (Parte B) + MISIÓN EXCEL PROFESIONAL 2026-10-22:
 *  · .xlsx REAL (no CSV renombrado) generado client-side con `xlsx-js-style`
 *    (fork de SheetJS con estilos de celda: negrita, relleno, bordes,
 *    alineación y formatos numéricos; el chunk se carga en diferido SOLO al
 *    exportar, igual que jspdf).
 *  · FIDELIDAD AL PDF: MISMA fuente de datos y parámetros que
 *    cash-report-pdf.ts (plantilla Diario): mismo report, mismos summaries
 *    (fetchDiarioSummaries), mismas fórmulas centralizadas (computeDailySummary),
 *    mismos helpers de tabla (salesTableColumns/Items/Qty) y misma fuente de
 *    comisiones sugeridas (fetchSuggestedCommissionsByProduct — exportada
 *    del módulo PDF para reutilización EXACTA).
 *  · 2026-10-22 — FÓRMULAS REALES (misión «Exportación profesional»): los
 *    totales ya NO son solo valores escritos: cada celda de total lleva la
 *    fórmula de Excel real (=SUM, =COUNT, productos por denominación, cuadre,
 *    comprobaciones Detalle↔Resumen) referenciando las celdas de detalle.
 *    El VALOR cacheado (v) sigue siendo el determinado por la lógica central
 *    (computeDailySummary), de modo que el libro es fiel al sistema al abrirse
 *    y, si el auditor edita una celda de detalle, Excel recalcula en vivo
 *    (CalcPr.fullCalcOnLoad). Nunca se suman CUP y USD en una misma fórmula.
 *  · Estructura del libro (§3.2 de la misión): Hoja 1 «Resumen» (identidad
 *    COSTPRO 4 + tienda + período + generación + resumen por moneda con
 *    fórmulas + indicadores + comprobaciones de consistencia), Hoja 2
 *    «Detalle» (tablas de ventas CUP/USD con autofiltro y totales =SUM),
 *    Hoja 3 «Desglose» (efectivo por denominaciones con importes =A*C y
 *    cuadre en vivo), Hoja 4 «Órdenes de Trabajo» (si procede) y Hoja 5
 *    «Nota metodológica». Encabezado de la tabla de detalle repetido al
 *    imprimir (Print_Titles), paneles congelados y configuración de
 *    impresión inyectadas vía post-proceso JSZip.
 *  · SEGURIDAD (B5): sanitizeExcelText prefija ' sobre = + - @ \t \r; la
 *    descarga no crea ventas ni movimientos (solo lectura del reporte
 *    aplicado); nombre de archivo descriptivo sin caracteres inválidos.
 */

import {
  fetchDiarioSummaries,
  fetchSuggestedCommissionsByProduct,
  salesTableColumns,
  salesTableItems,
  salesTableQty,
  type CashReportPdfContext,
  type CashReportSummaries,
} from './cash-report-pdf';
import { breakdownTotal, type Breakdown } from './cash-report-core';
import {
  computeDailySummary,
  computeCuadre,
  cuadreLabel,
  type DailySummary,
} from '@/lib/cash-report/summary';

type CellValue = string | number;

const MONEY_ZFMT = '#,##0.00';
const QTY_ZFMT = '#,##0.00';
const COUNT_ZFMT = '#,##0';

/** Colores sobrios alineados con COSTPRO (§B3): grises azulados, sin chillar. */
const C_HEADER_FILL = 'E4E7EE'; // encabezados de tabla
const C_SECTION_FILL = 'EDF0F5'; // títulos de sección
const C_TOTAL_FILL = 'F4F6FA'; // filas de totales

/**
 * Neutraliza inyección de fórmulas de hoja de cálculo: cualquier texto que
 * empiece por = + - @ (o tab/CR) se prefija con apóstrofo (B5/B6-10).
 * Mismo criterio que ipv-ventas-excel.ts.
 */
export function sanitizeExcelText(v: string): string {
  if (v.length > 0 && ['=', '+', '-', '@', '\t', '\r'].some((ch) => v.startsWith(ch))) {
    return `'${v}`;
  }
  return v;
}

// ── Tipos del workbook (xlsx-js-style) ──────────────────────────────────────
type XLSXModule = typeof import('xlsx-js-style');
type WorkBookLike = import('xlsx-js-style').WorkBook;
type WorkSheetLike = import('xlsx-js-style').WorkSheet;

async function loadXlsx(): Promise<XLSXModule> {
  const mod = await import('xlsx-js-style');
  return ((mod as { default?: XLSXModule }).default ?? (mod as unknown as XLSXModule));
}

// ── Estilos (aplicados por celda tras aoa_to_sheet) ─────────────────────────
interface CellStyle { bold?: boolean; sz?: number; fill?: string; right?: boolean; top?: boolean; z?: string }

function styleCell(ws: WorkSheetLike, XLSX: XLSXModule, r: number, c: number, st: CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as (Record<string, unknown> | undefined);
  if (!cell) return;
  cell.s = {
    font: { bold: st.bold === true, sz: st.sz, color: { rgb: '1F2937' } },
    fill: st.fill ? { patternType: 'solid', fgColor: { rgb: st.fill } } : undefined,
    alignment: { horizontal: st.right ? 'right' : 'left', vertical: 'center' },
    border: st.top ? { top: { style: 'thin', color: { rgb: '6B7280' } } } : undefined,
  };
  if (st.z && cell.t === 'n') cell.z = st.z;
}

/** Registro de fórmulas: coordenada + fórmula canónica (en-US, separador ,). */
interface FormulaRef { r: number; c: number; f: string }

/**
 * Adjunta las fórmulas a las celdas (el valor v ya está como resultado cacheado).
 * NOTA: las celdas cuyo resultado es TEXTO (p. ej. =IF(...,"COHERENTE","REVISAR"))
 * conservan t='s' (shared string): xlsx-js-style no soporta t='str' y con t='s'
 * tanto sheet_to_json como Excel (tras fullCalcOnLoad) muestran el valor correcto.
 */
function attachFormulas(ws: WorkSheetLike, XLSX: XLSXModule, refs: FormulaRef[]) {
  for (const { r, c, f } of refs) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr] as (Record<string, unknown> | undefined);
    if (!cell) continue;
    cell.f = f;
  }
}

// ── Filas del resumen (MISMA lógica condicional del PDF Diario §4) ─────────
interface IncomeRow { label: string; amount: number; kind: 'total' | 'normal' | 'expense' | 'info' }

function incomeRowsFor(s: DailySummary, currency: 'CUP' | 'USD'): IncomeRow[] {
  const rows: IncomeRow[] = currency === 'CUP'
    ? [
        { label: 'Ventas totales (efectivo + transferencia)', amount: s.ventasTotales, kind: 'total' },
        { label: 'Ventas en efectivo', amount: s.ventasCash, kind: 'normal' },
        { label: 'Ventas por transferencia', amount: s.ventasTransfer, kind: 'normal' },
      ]
    : [
        { label: 'Ventas totales (efectivo + Zelle)', amount: s.ventasTotales, kind: 'total' },
        { label: 'Ventas en efectivo', amount: s.ventasCash, kind: 'normal' },
        { label: 'Venta por Zelle', amount: s.ventasZelle, kind: 'normal' },
      ];
  if (currency === 'CUP') {
    if (s.ventasZelle > 0) rows.push({ label: 'Ventas por Zelle', amount: s.ventasZelle, kind: 'normal' });
    if (s.ventasMixed > 0) rows.push({ label: 'Ventas mixtas sin desglosar', amount: s.ventasMixed, kind: 'info' });
    if (s.otIngresosCash > 0) rows.push({ label: 'Órdenes de trabajo (anticipos)', amount: s.otIngresosCash, kind: 'normal' });
    if (s.comisionesCash > 0) rows.push({ label: 'Comisiones pagadas en efectivo', amount: s.comisionesCash, kind: 'expense' });
    if (s.comisionesTransfer > 0) rows.push({ label: 'Comisiones pagadas por transferencia', amount: s.comisionesTransfer, kind: 'info' });
    if (s.serviciosRecibidosCash > 0) rows.push({ label: 'Servicios recibidos pagados en efectivo', amount: s.serviciosRecibidosCash, kind: 'expense' });
    if (s.recibosProveedoresCash > 0) rows.push({ label: 'Pagos a proveedores (efectivo)', amount: s.recibosProveedoresCash, kind: 'expense' });
    if (s.ajustesPositivos > 0) rows.push({ label: 'Ajustes extraordinarios (+)', amount: s.ajustesPositivos, kind: 'normal' });
    if (s.ajustesNegativos > 0) rows.push({ label: 'Ajustes extraordinarios (−)', amount: s.ajustesNegativos, kind: 'expense' });
    if (s.ingresosCaja > 0) rows.push({ label: 'Ingresos de caja (fondo y otros)', amount: s.ingresosCaja, kind: 'normal' });
    if (s.egresosCaja > 0) rows.push({ label: 'Egresos de caja (fondo y otros)', amount: s.egresosCaja, kind: 'expense' });
    if (s.reembolsosCash > 0) rows.push({ label: 'Reembolsos de devoluciones (efectivo)', amount: s.reembolsosCash, kind: 'expense' });
    if (s.reembolsosVoucher > 0) rows.push({ label: 'Reembolsos por voucher (transfer/Zelle)', amount: s.reembolsosVoucher, kind: 'info' });
  } else {
    if (s.comisionesCash > 0) rows.push({ label: 'Comisiones pagadas en efectivo', amount: s.comisionesCash, kind: 'expense' });
    if (s.serviciosRecibidosCash > 0) rows.push({ label: 'Servicios recibidos pagados en efectivo', amount: s.serviciosRecibidosCash, kind: 'expense' });
  }
  return rows;
}

export interface CashReportExcelResult {
  /** Workbook completo (inspeccionable en pruebas con sheet_to_json). */
  wb: WorkBookLike;
  /** Nombre de archivo descriptivo (COSTPRO_Reporte_Entrega_<Tienda>_<fecha>.xlsx). */
  filename: string;
  /** Configuración de congelado/impresión por hoja (la consume buildCashReportExcelBlob). */
  sheetFeatures: Array<{ freezeAfterRow?: number; landscape?: boolean } | undefined>;
}

// ── Registro de coordenadas por hoja (para cablear fórmulas entre hojas) ────
interface VentasCoords {
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
  totRow: number;
}
interface DesgloseCoords {
  firstDenomRow: number;
  lastDenomRow: number;
  contadoRow: number;
  cuadreRow: number;
}
interface ResumenCoords {
  rowsByLabel: Map<string, number>;
  esperadoRow: number;
  kpiLineasRow: number;
  checkEfectivoRow: number;
  checkTransferRow: number;
  estadoEfectivoRow: number;
  estadoTransferRow: number;
}

/**
 * Construye el workbook Excel del Reporte de Entrega (plantilla Diario —
 * la misma del PDF por defecto). NO descarga: la descarga es responsabilidad
 * de descargarCashReportExcel (separación para testear la estructura del
 * libro sin efectos secundarios de navegador).
 */
export async function buildCashReportExcelWorkbook(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<CashReportExcelResult> {
  const XLSX = await loadXlsx();
  const { report, startDate, endDate, storeInfo, deliveredBy, recipientName, madeBy, cupBreakdown, usdBreakdown, cupDenoms, usdDenoms, options } = ctx;

  // ── Mismos summaries que el PDF (fetch una vez si no vienen inyectados) ──
  const { itemsSummary, paymentTotals, productionOrders } = (summaries && summaries.itemsSummary && summaries.paymentTotals && summaries.productionOrders !== undefined)
    ? summaries as Required<CashReportSummaries>
    : await fetchDiarioSummaries(startDate, endDate);

  // ── Comisión sugerida: MISMA fuente que el PDF (B2/B4 — sin 2ª lógica) ──
  const suggestedByProduct = suggestedCommissions ?? await fetchSuggestedCommissionsByProduct(startDate, endDate);
  const itemsWithCommission = ((((itemsSummary as Record<string, unknown>) ?? {}).items as any[]) || []).map((it: any) => ({
    ...it,
    commission_suggested: Number(suggestedByProduct.get(String(it.product_id)) || 0),
  }));

  // ── Resúmenes por moneda: fórmula centralizada (B4) ──
  const cupSummary = computeDailySummary(report, 'CUP', paymentTotals);
  const usdSummary = computeDailySummary(report, 'USD', paymentTotals);

  const periodoLbl = startDate === endDate ? startDate : `${startDate} → ${endDate}`;
  const sn = storeInfo?.name || 'Tienda';
  const generatedAt = new Date().toLocaleString('es');

  const usdWillRender = options.includeUsd !== false && (
    usdSummary.ventasTotales > 0 || usdSummary.ventasCash > 0
    || breakdownTotal(usdBreakdown) > 0
    || itemsWithCommission.some((it: any) => (Number(it.usd_total || 0)) > 0)
  );

  const wb = XLSX.utils.book_new();
  // Recalcular TODAS las fórmulas al abrir el archivo en Excel: garantiza que
  // lo que muestra la app coincida siempre con el libro vivo.
  (wb as unknown as { Workbook?: Record<string, unknown> }).Workbook = {
    CalcPr: { fullCalcOnLoad: true },
  };

  // ═══════════════════ HOJA 2 · «Detalle» (tablas de ventas) ═══════════════════
  // Se construye primero: el «Resumen» referencia sus rangos de totales.
  const dAoa: CellValue[][] = [];
  dAoa.push([`DETALLE DE VENTAS — ${sn.toUpperCase()}`]);
  dAoa.push(['Período:', periodoLbl]);
  dAoa.push([]);

  const dSectionRows: number[] = [];
  const dHeaderRows: number[] = [];
  const dTotalRows: number[] = [];
  const dMoneyCells: Array<{ r: number; c: number }> = [];
  const dQtyCells: Array<{ r: number; c: number }> = [];
  const dFormulas: FormulaRef[] = [];
  const ventasCoords: Partial<Record<'CUP' | 'USD', VentasCoords>> = {};
  let firstVentasHeaderRow = -1; // autofiltro: SOLO la primera tabla (limitación
  let firstVentasLastRow = -1;   // de xlsx: un AutoFilter por hoja)

  const renderVentasEn = (currency: 'CUP' | 'USD') => {
    const includeCommission = currency === 'CUP' && options.includeCommissionColumn !== false;
    const cols = salesTableColumns(currency, includeCommission);
    dAoa.push([`VENTAS DEL DÍA — ${currency}`]);
    dSectionRows.push(dAoa.length - 1);
    dAoa.push(cols);
    dHeaderRows.push(dAoa.length - 1);
    const headerRow = dAoa.length - 1;
    if (firstVentasHeaderRow === -1) firstVentasHeaderRow = headerRow;
    const items = salesTableItems(itemsWithCommission, currency);
    let totCash = 0, totTransfer = 0, totQty = 0;
    const firstDataRow = dAoa.length;
    for (const it of items) {
      // Cobros en la MONEDA REAL — MISMA regla del PDF (nunca se suman CUP y USD)
      const cash = currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0);
      const transfer = currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0);
      const qty = salesTableQty(it, currency);
      totCash += cash; totTransfer += transfer; totQty += qty;
      const desc = (it.has_payment_incident ? '* ' : '') + String(it.product_name || '');
      const row: CellValue[] = [sanitizeExcelText(String(it.sku || '')), sanitizeExcelText(desc), qty, cash, transfer];
      if (includeCommission) row.push(Number(it.commission_suggested || 0));
      dAoa.push(row);
      dQtyCells.push({ r: dAoa.length - 1, c: 2 });
      dMoneyCells.push({ r: dAoa.length - 1, c: 3 });
      dMoneyCells.push({ r: dAoa.length - 1, c: 4 });
      if (includeCommission) dMoneyCells.push({ r: dAoa.length - 1, c: 5 });
    }
    if (items.length === 0) {
      // Sin movimientos: fila informativa SIN números (no cuenta como línea
      // en el COUNT ni suma en los =SUM — el texto se ignora aritméticamente)
      dAoa.push(['', 'Sin movimientos en el período']);
    }
    const lastDataRow = dAoa.length - 1;
    const totRowIdx = dAoa.length;
    // TOTALES como fórmulas reales =SUM (misma columna que los datos)
    const totRow: CellValue[] = ['TOTALES', '', totQty, totCash, totTransfer];
    if (includeCommission) {
      const totCommission = items.reduce((s, it) => s + Number(it.commission_suggested || 0), 0);
      totRow.push(totCommission);
    }
    dAoa.push(totRow);
    dTotalRows.push(dAoa.length - 1);
    dFormulas.push({ r: totRowIdx, c: 2, f: `SUM(C${firstDataRow + 1}:C${lastDataRow + 1})` });
    dFormulas.push({ r: totRowIdx, c: 3, f: `SUM(D${firstDataRow + 1}:D${lastDataRow + 1})` });
    dFormulas.push({ r: totRowIdx, c: 4, f: `SUM(E${firstDataRow + 1}:E${lastDataRow + 1})` });
    if (includeCommission) dFormulas.push({ r: totRowIdx, c: 5, f: `SUM(F${firstDataRow + 1}:F${lastDataRow + 1})` });
    if (firstVentasLastRow === -1 && items.length > 0) {
      firstVentasLastRow = lastDataRow; // última fila de datos (totales aún no empujada)
    }
    ventasCoords[currency] = { headerRow, firstDataRow, lastDataRow, totRow: totRowIdx };
    if (currency === 'CUP' && itemsWithCommission.some((it: any) => it.has_payment_incident)) {
      dAoa.push(['* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).']);
    }
    dAoa.push([]);
  };

  renderVentasEn('CUP');
  if (usdWillRender) renderVentasEn('USD');

  const wsDetalle = XLSX.utils.aoa_to_sheet(dAoa);
  for (const r of dSectionRows) styleCell(wsDetalle, XLSX, r, 0, { bold: true, sz: 11, fill: C_SECTION_FILL, top: true });
  for (const r of dHeaderRows) {
    for (let c = 0; c <= 5; c += 1) {
      styleCell(wsDetalle, XLSX, r, c, { bold: true, fill: C_HEADER_FILL, right: c >= 2, top: true });
    }
  }
  for (const m of dMoneyCells) {
    const isTotal = dTotalRows.includes(m.r);
    styleCell(wsDetalle, XLSX, m.r, m.c, {
      bold: isTotal, right: true, z: MONEY_ZFMT,
      fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
    });
  }
  for (const q of dQtyCells) styleCell(wsDetalle, XLSX, q.r, q.c, { right: true, z: QTY_ZFMT });
  styleCell(wsDetalle, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });
  attachFormulas(wsDetalle, XLSX, dFormulas);
  wsDetalle['!cols'] = [
    { wch: 16 }, // A: Código
    { wch: 44 }, // B: Descripción
    { wch: 11 }, // C: Cant.
    { wch: 17 }, // D: Efectivo
    { wch: 17 }, // E: Transfer./Zelle
    { wch: 14 }, // F: Comisión
  ];
  wsDetalle['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  wsDetalle['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  if (firstVentasHeaderRow !== -1 && firstVentasLastRow !== -1) {
    const lastCol = XLSX.utils.encode_col(5);
    wsDetalle['!autofilter'] = { ref: `A${firstVentasHeaderRow + 1}:${lastCol}${firstVentasLastRow + 1}` };
  }

  // ═══════════════════ HOJA 3 · «Desglose» (efectivo por denominaciones) ═══════════════════
  const gAoa: CellValue[][] = [];
  gAoa.push([`DESGLOSE DE EFECTIVO — ${sn.toUpperCase()}`]);
  gAoa.push(['Período:', periodoLbl]);
  gAoa.push([]);

  const gSectionRows: number[] = [];
  const gHeaderRows: number[] = [];
  const gTotalRows: number[] = [];
  const gMoneyCells: Array<{ r: number; c: number }> = [];
  const gCountCells: Array<{ r: number; c: number }> = [];
  const gFormulas: FormulaRef[] = [];
  const desgloseCoords: Partial<Record<'CUP' | 'USD', DesgloseCoords>> = {};
  const resumenCoords: Partial<Record<'CUP' | 'USD', ResumenCoords>> = {}; // se llena al construir Resumen

  const renderDesgloseEn = (currency: 'CUP' | 'USD', denoms: number[], breakdown: Breakdown) => {
    gAoa.push([`DESGLOSE DE EFECTIVO ${currency}`]);
    gSectionRows.push(gAoa.length - 1);
    gAoa.push(['Denominación', '', 'Cantidad', 'Importe']);
    gHeaderRows.push(gAoa.length - 1);
    const set = new Set<number>([...denoms, ...Object.keys(breakdown).map(Number)]);
    const ordered = [...set].sort((a, b) => b - a);
    let printed = 0;
    const firstDenomRow = gAoa.length;
    for (const d of ordered) {
      const cnt = Number(breakdown[d] || 0);
      if (cnt <= 0) continue; // §8.3 del PDF: cantidad 0 → fila no se imprime
      gAoa.push([d, '', cnt, cnt * d]);
      const r = gAoa.length - 1;
      gCountCells.push({ r, c: 2 });
      gMoneyCells.push({ r, c: 3 });
      // Fórmula real por línea: importe = denominación × cantidad
      gFormulas.push({ r, c: 3, f: `A${r + 1}*C${r + 1}` });
      printed++;
    }
    const lastDenomRow = firstDenomRow + Math.max(printed - 1, 0);
    if (printed === 0) gAoa.push(['Sin efectivo contado', '', '', 0]);
    const totalCounted = breakdownTotal(breakdown);
    const contadoRow = gAoa.length;
    gAoa.push(['Efectivo contado / entregado', '', '', totalCounted]);
    gMoneyCells.push({ r: contadoRow, c: 3 });
    gTotalRows.push(contadoRow);
    if (printed > 0) gFormulas.push({ r: contadoRow, c: 3, f: `SUM(D${firstDenomRow + 1}:D${lastDenomRow + 1})` });
    const cuadreRow = gAoa.length;
    const cuadre = computeCuadre(totalCounted, currency === 'CUP' ? cupSummary.efectivoEsperado : usdSummary.efectivoEsperado);
    const state = cuadreLabel(cuadre);
    gAoa.push([`Cuadre (${state.toUpperCase()})`, '', '', cuadre]);
    gMoneyCells.push({ r: cuadreRow, c: 3 });
    // Fórmula de cuadre en vivo: contado (esta hoja) − esperado (Resumen).
    // La referencia a Resumen se cablea DESPUÉS de construir esa hoja.
    desgloseCoords[currency] = { firstDenomRow, lastDenomRow, contadoRow, cuadreRow };
    gAoa.push([]);
  };

  renderDesgloseEn('CUP', cupDenoms, cupBreakdown);
  if (usdWillRender) renderDesgloseEn('USD', usdDenoms, usdBreakdown);

  const wsDesglose = XLSX.utils.aoa_to_sheet(gAoa);
  for (const r of gSectionRows) styleCell(wsDesglose, XLSX, r, 0, { bold: true, sz: 11, fill: C_SECTION_FILL, top: true });
  for (const r of gHeaderRows) {
    for (let c = 0; c <= 3; c += 1) {
      styleCell(wsDesglose, XLSX, r, c, { bold: true, fill: C_HEADER_FILL, right: c >= 2, top: true });
    }
  }
  for (const m of gMoneyCells) {
    const isTotal = gTotalRows.includes(m.r);
    styleCell(wsDesglose, XLSX, m.r, m.c, {
      bold: isTotal, right: true, z: MONEY_ZFMT,
      fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
    });
  }
  for (const q of gCountCells) styleCell(wsDesglose, XLSX, q.r, q.c, { right: true, z: COUNT_ZFMT });
  styleCell(wsDesglose, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });
  // (las fórmulas del Desglose se adjuntan tras cablear el cuadre con el Resumen)
  wsDesglose['!cols'] = [
    { wch: 34 }, // A: Denominación / etiquetas
    { wch: 6 },  // B: separador
    { wch: 12 }, // C: Cantidad
    { wch: 18 }, // D: Importe
  ];
  wsDesglose['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  wsDesglose['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };

  // ═══════════════════ HOJA 1 · «Resumen» ═══════════════════
  const rAoa: CellValue[][] = [];
  rAoa.push(['COSTPRO 4 — REPORTE DE ENTREGA']);
  rAoa.push(['Tienda:', sanitizeExcelText(sn)]);
  if (storeInfo?.address) rAoa.push(['Dirección:', sanitizeExcelText(String(storeInfo.address))]);
  rAoa.push(['Período:', periodoLbl]);
  rAoa.push(['Generado:', generatedAt]);
  rAoa.push(['Monedas:', 'CUP y USD por separado — los importes NUNCA se suman entre monedas']);
  const resumenFreezeAfterRow = rAoa.length; // filas de identidad congeladas (0-based count)
  rAoa.push([]);

  const rSectionRows: number[] = [];
  const rTotalRows: number[] = [];
  const rKpiRows: number[] = [];
  const rCheckRows: number[] = [];
  const rMoneyCells: Array<{ r: number; c: number }> = [];
  const rCountCells: Array<{ r: number; c: number }> = [];
  const rFormulas: FormulaRef[] = [];

  const renderResumenEn = (s: DailySummary, currency: 'CUP' | 'USD') => {
    rAoa.push([`RESUMEN DEL DÍA — ${currency}`]);
    rSectionRows.push(rAoa.length - 1);
    const rowsByLabel = new Map<string, number>();
    const rows = incomeRowsFor(s, currency);
    for (const r of rows) {
      // Regla B4 + paridad PDF §4: los egresos llevan SU signo contable
      // (negativo — igual que el PDF imprime −); las filas info, positivo.
      const amount = r.kind === 'expense' ? -Math.abs(r.amount) : r.amount;
      rAoa.push([r.label, '', '', amount]);
      const rowIdx = rAoa.length - 1;
      rowsByLabel.set(r.label, rowIdx);
      if (r.kind !== 'total') rMoneyCells.push({ r: rowIdx, c: 3 });
    }
    // Total de ventas como FÓRMULA viva: suma exacta de los componentes
    // renderizados (ventasTotales = cash + transfer + zelle + mixed).
    const totalLabel = rows[0].label;
    const totalRowIdx = rowsByLabel.get(totalLabel)!;
    const components = [
      rowsByLabel.get('Ventas en efectivo'),
      rowsByLabel.get('Ventas por transferencia'),
      rowsByLabel.get('Ventas por Zelle'),
      rowsByLabel.get('Venta por Zelle'),
      rowsByLabel.get('Ventas mixtas sin desglosar'),
    ].filter((v): v is number => v !== undefined);
    rFormulas.push({
      r: totalRowIdx, c: 3,
      f: components.map((row) => `D${row + 1}`).join('+'),
    });
    rTotalRows.push(totalRowIdx);
    rMoneyCells.push({ r: totalRowIdx, c: 3 });

    // Efectivo esperado como FÓRMULA viva (misma cadena contable del sistema):
    // efectivoEsperado = ventasCash + otIngresos + ajustes(+) + ingresosCaja
    //                    − comisiones − servicios − proveedores − ajustes(−)
    //                    − egresosCaja − reembolsosCash
    const esperadoLbl = currency === 'CUP' ? 'Efectivo esperado a entregar' : 'Efectivo esperado a entregar (USD)';
    rAoa.push([esperadoLbl, '', '', s.efectivoEsperado]);
    const esperadoRow = rAoa.length - 1;
    rMoneyCells.push({ r: esperadoRow, c: 3 });
    rTotalRows.push(esperadoRow);
    const posTerms = [
      rowsByLabel.get('Ventas en efectivo'),
      rowsByLabel.get('Órdenes de trabajo (anticipos)'),
      rowsByLabel.get('Ajustes extraordinarios (+)'),
      rowsByLabel.get('Ingresos de caja (fondo y otros)'),
    ].filter((v): v is number => v !== undefined);
    const negTerms = [
      rowsByLabel.get('Comisiones pagadas en efectivo'),
      rowsByLabel.get('Servicios recibidos pagados en efectivo'),
      rowsByLabel.get('Pagos a proveedores (efectivo)'),
      rowsByLabel.get('Ajustes extraordinarios (−)'),
      rowsByLabel.get('Egresos de caja (fondo y otros)'),
      rowsByLabel.get('Reembolsos de devoluciones (efectivo)'),
    ].filter((v): v is number => v !== undefined);
    const esperadoFormula =
      posTerms.map((row) => `D${row + 1}`).join('+') +
      (negTerms.length > 0 ? (posTerms.length > 0 ? '-' : '') + negTerms.map((row) => `D${row + 1}`).join('-') : '');
    rFormulas.push({ r: esperadoRow, c: 3, f: esperadoFormula.length > 0 ? esperadoFormula : '0' });
    rAoa.push([]);

    // ── Indicadores (verificables con el Detalle) ──
    rAoa.push([`INDICADORES — ${currency}`]);
    rSectionRows.push(rAoa.length - 1);
    const vCoords = ventasCoords[currency];
    const items = salesTableItems(itemsWithCommission, currency);
    // Líneas de detalle: fórmula COUNT sobre la columna Cant. de «Detalle»
    rAoa.push(['Líneas de detalle (productos)', '', '', items.length]);
    const lineasRow = rAoa.length - 1;
    rCountCells.push({ r: lineasRow, c: 3 });
    rKpiRows.push(lineasRow);
    if (vCoords && vCoords.lastDataRow >= vCoords.firstDataRow) {
      rFormulas.push({ r: lineasRow, c: 3, f: `COUNT('Detalle'!C${vCoords.firstDataRow + 1}:C${vCoords.lastDataRow + 1})` });
    }
    // Operaciones registradas: conteo de transacciones del origen (items-summary)
    const opsCount = items.reduce((acc, it: any) => acc + Number(it.transactions_count || 0), 0);
    rAoa.push(['Operaciones registradas', '', '', opsCount]);
    rCountCells.push({ r: rAoa.length - 1, c: 3 });
    rKpiRows.push(rAoa.length - 1);
    rAoa.push([]);

    // ── Comprobaciones de consistencia Detalle ↔ Resumen (fórmulas vivas) ──
    rAoa.push([`COMPROBACIONES DE CONSISTENCIA — ${currency}`]);
    rSectionRows.push(rAoa.length - 1);
    if (vCoords) {
      // Efectivo: columna «Efectivo» del Detalle vs filas del Resumen con la
      // MISMA composición que el PDF:
      //  · CUP → ventas en efectivo.
      //  · USD → la columna del Detalle agrupa cash+transfer, y el Resumen USD
      //    no imprime fila de transferencia ⇒ base = total − zelle (ambas
      //    filas existen y son celdas reales).
      const zelleRowIdx = rowsByLabel.get('Venta por Zelle') ?? rowsByLabel.get('Ventas por Zelle');
      const efResumenExpr = currency === 'CUP'
        ? `D${(rowsByLabel.get('Ventas en efectivo')! ) + 1}`
        : (zelleRowIdx !== undefined
            ? `D${totalRowIdx + 1}-D${zelleRowIdx + 1}`
            : `D${totalRowIdx + 1}`);
      const efCheckLabel = currency === 'CUP' ? 'Efectivo' : 'Efectivo (cash + tarjeta)';
      rAoa.push([`${efCheckLabel}: Detalle − Resumen (${currency})`, '', '', 0]);
      const checkEfRow = rAoa.length - 1;
      rMoneyCells.push({ r: checkEfRow, c: 3 });
      rCheckRows.push(checkEfRow);
      rFormulas.push({
        r: checkEfRow, c: 3,
        f: `ROUND('Detalle'!D${vCoords.totRow + 1}-(${efResumenExpr}),2)`,
      });
      rAoa.push(['Estado de la comprobación (efectivo)', '', '', 'COHERENTE']);
      const estadoEfRow = rAoa.length - 1;
      rCheckRows.push(estadoEfRow);
      rFormulas.push({ r: estadoEfRow, c: 3, f: `IF(ABS(D${checkEfRow + 1})<0.005,"COHERENTE","REVISAR")` });

      // Transferencia/Zelle: columna «Transfer.» (CUP: transfer+zelle) o
      // «Zelle» (USD) del Detalle vs las filas correspondientes del Resumen.
      const trRefRows = currency === 'CUP'
        ? [
            rowsByLabel.get('Ventas por transferencia'),
            rowsByLabel.get('Ventas por Zelle'),
          ].filter((v): v is number => v !== undefined)
        : [rowsByLabel.get('Venta por Zelle')].filter((v): v is number => v !== undefined);
      const trResumenExpr = trRefRows.length > 0 ? trRefRows.map((row) => `D${row + 1}`).join('+') : '0';
      const trCheckLabel = currency === 'CUP' ? 'Transferencia' : 'Zelle';
      rAoa.push([`${trCheckLabel}: Detalle − Resumen (${currency})`, '', '', 0]);
      const checkTrRow = rAoa.length - 1;
      rMoneyCells.push({ r: checkTrRow, c: 3 });
      rCheckRows.push(checkTrRow);
      rFormulas.push({
        r: checkTrRow, c: 3,
        f: `ROUND('Detalle'!E${vCoords.totRow + 1}-(${trResumenExpr}),2)`,
      });
      rAoa.push([`Estado de la comprobación (${trCheckLabel.toLowerCase()})`, '', '', 'COHERENTE']);
      const estadoTrRow = rAoa.length - 1;
      rCheckRows.push(estadoTrRow);
      rFormulas.push({ r: estadoTrRow, c: 3, f: `IF(ABS(D${checkTrRow + 1})<0.005,"COHERENTE","REVISAR")` });

      // Cuadre (referencia viva al Desglose): contado − esperado
      const gCoords = desgloseCoords[currency];
      if (gCoords) {
        rAoa.push([`Cuadre según desglose (${currency})`, '', '', 0]);
        const cuadreRefRow = rAoa.length - 1;
        rMoneyCells.push({ r: cuadreRefRow, c: 3 });
        rCheckRows.push(cuadreRefRow);
        rFormulas.push({ r: cuadreRefRow, c: 3, f: `Desglose!D${gCoords.cuadreRow + 1}` });
      }
    }
    rAoa.push([]);

    resumenCoords[currency] = {
      rowsByLabel,
      esperadoRow,
      kpiLineasRow: lineasRow,
      checkEfectivoRow: -1,
      checkTransferRow: -1,
      estadoEfectivoRow: -1,
      estadoTransferRow: -1,
    };
  };

  renderResumenEn(cupSummary, 'CUP');
  if (usdWillRender) renderResumenEn(usdSummary, 'USD');

  // ── Cuadre del Desglose: cablear referencia al esperado del Resumen ──
  for (const currency of ['CUP', 'USD'] as const) {
    const gCoords = desgloseCoords[currency];
    const rCoords = resumenCoords[currency];
    if (gCoords && rCoords) {
      gFormulas.push({
        r: gCoords.cuadreRow, c: 3,
        f: `D${gCoords.contadoRow + 1}-Resumen!D${rCoords.esperadoRow + 1}`,
      });
    }
  }
  attachFormulas(wsDesglose, XLSX, gFormulas); // importes =A*C, contado =SUM, cuadre en vivo

  // ── Firmas (paridad con el PDF: solo si «Líneas de firma» está activa) ──
  if (options.includeSignature !== false) {
    rAoa.push(['FIRMAS']);
    rSectionRows.push(rAoa.length - 1);
    rAoa.push(['Hecho por:', sanitizeExcelText(madeBy || '')]);
    rAoa.push(['Entregado por:', sanitizeExcelText(deliveredBy || '')]);
    rAoa.push(['Recibido por:', sanitizeExcelText(recipientName || '')]);
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(rAoa);
  for (const r of rSectionRows) styleCell(wsResumen, XLSX, r, 0, { bold: true, sz: 11, fill: C_SECTION_FILL, top: true });
  for (const r of rTotalRows) {
    styleCell(wsResumen, XLSX, r, 3, { bold: true, right: true, z: MONEY_ZFMT, fill: C_TOTAL_FILL, top: true });
  }
  for (const m of rMoneyCells) {
    if (rTotalRows.includes(m.r)) continue;
    styleCell(wsResumen, XLSX, m.r, m.c, { right: true, z: MONEY_ZFMT });
  }
  for (const q of rCountCells) {
    const isKpi = rKpiRows.includes(q.r);
    styleCell(wsResumen, XLSX, q.r, q.c, { bold: isKpi, right: true, z: COUNT_ZFMT, fill: isKpi ? C_TOTAL_FILL : undefined });
  }
  for (const r of rCheckRows) {
    styleCell(wsResumen, XLSX, r, 3, { right: true, z: MONEY_ZFMT });
  }
  styleCell(wsResumen, XLSX, 0, 0, { bold: true, sz: 14, fill: C_SECTION_FILL });
  attachFormulas(wsResumen, XLSX, rFormulas);
  wsResumen['!cols'] = [
    { wch: 44 }, // A: etiquetas
    { wch: 22 }, // B: valores de identidad
    { wch: 6 },  // C: separador
    { wch: 18 }, // D: importes
  ];
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  wsResumen['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };

  // ═══════════════════ HOJA 4 · «Órdenes de Trabajo» (§8.1 conmutable) ═══════════════════
  const orders = (productionOrders as any[]) || [];
  let wsOt: WorkSheetLike | null = null;
  if (options.includeOtReport !== false) {
    const otAoa: CellValue[][] = [
      ['REPORTE DE ÓRDENES DE TRABAJO'],
      ['Tienda:', sanitizeExcelText(sn)],
      ['Período:', periodoLbl],
      [],
      ['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD'],
    ];
    let totCup = 0, totUsd = 0;
    const otFirstDataRow = otAoa.length;
    for (const ord of orders) {
      const num = String(ord.order_number || '');
      const desc = String(ord.description || ord.title || ord.customer_name || 'Orden de trabajo');
      const cupAmt = Number(ord.advance_currency === 'CUP' ? ord.advance_amount : (ord.budget_currency === 'CUP' ? ord.budget_total : 0));
      const usdAmt = Number(ord.advance_currency === 'USD' ? ord.advance_amount : (ord.budget_currency === 'USD' ? ord.budget_total : 0));
      totCup += cupAmt; totUsd += usdAmt;
      otAoa.push([sanitizeExcelText(num), 'Trabajo', sanitizeExcelText(desc), 1, cupAmt, usdAmt]);
    }
    const otLastDataRow = otAoa.length - 1;
    if (orders.length === 0) otAoa.push(['', '', 'Sin órdenes en el período']);
    const otTotRow = otAoa.length;
    otAoa.push(['TOTALES', '', '', orders.length, totCup, totUsd]);
    const wsOtLocal = XLSX.utils.aoa_to_sheet(otAoa);
    for (let c = 3; c <= 5; c += 1) {
      for (let r = 5; r < otAoa.length; r += 1) {
        const isTotal = r === otAoa.length - 1;
        styleCell(wsOtLocal, XLSX, r, c, {
          bold: isTotal, right: true, z: c === 3 ? COUNT_ZFMT : MONEY_ZFMT,
          fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
        });
      }
    }
    for (let c = 0; c <= 5; c += 1) styleCell(wsOtLocal, XLSX, 4, c, { bold: true, fill: C_HEADER_FILL, top: true, right: c >= 3 });
    styleCell(wsOtLocal, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });
    // TOTALES como fórmulas =SUM reales (monedas en columnas separadas)
    const otFormulas: FormulaRef[] = [
      { r: otTotRow, c: 3, f: `SUM(D${otFirstDataRow + 1}:D${otLastDataRow + 1})` },
      { r: otTotRow, c: 4, f: `SUM(E${otFirstDataRow + 1}:E${otLastDataRow + 1})` },
      { r: otTotRow, c: 5, f: `SUM(F${otFirstDataRow + 1}:F${otLastDataRow + 1})` },
    ];
    attachFormulas(wsOtLocal, XLSX, otFormulas);
    wsOtLocal['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 48 }, { wch: 11 }, { wch: 15 }, { wch: 12 }];
    wsOtLocal['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    wsOtLocal['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
    if (orders.length > 0) {
      wsOtLocal['!autofilter'] = { ref: `A5:F${5 + orders.length}` };
    }
    wsOt = wsOtLocal;
  }

  // ═══════════════════ HOJA 5 · «Nota metodológica» (B3) ═══════════════════
  const notaAoa: CellValue[][] = [
    ['NOTA METODOLÓGICA — REPORTE ENTREGA'],
    [],
    ['Fórmula central (por moneda):', 'Efectivo esperado = ventas en efectivo + anticipos de OT + ajustes (+) + ingresos de caja − comisiones en efectivo − servicios recibidos − pagos a proveedores − ajustes (−) − egresos de caja − reembolsos en efectivo'],
    ['Cuadre:', 'Efectivo contado (desglose por denominaciones) − efectivo esperado. Negativo = FALTANTE · Positivo = SOBRANTE · |dif| < 0,005 = cuadrado.'],
    ['Monedas:', 'CUP y USD se contabilizan por separado en secciones propias; NUNCA se suman importes de monedas distintas — tampoco en las fórmulas de Excel.'],
    ['Fuente de datos:', 'Mismo origen que el PDF: /api/cash-report (RPC get_cash_report v2.23.0) + items-summary + payment-totals + commissions-summary + production-orders.'],
    ['Fórmulas de Excel:', 'Los totales llevan fórmulas REALES (=SUM, =COUNT, =A*C, cuadre y comprobaciones Detalle↔Resumen) referenciando las celdas de detalle; el valor mostrado al generar es el calculado por el sistema (computeDailySummary) y Excel recalcula al abrir el libro (fullCalcOnLoad). Editar una celda de detalle recalcula totales y comprobaciones en vivo.'],
    ['Comprobaciones:', 'La hoja Resumen compara el total de la hoja Detalle contra el Resumen por moneda y por medio de pago (=IF(|dif|<0,005;"COHERENTE";"REVISAR")). Una incidencia de pago documentada (*) puede producir REVISAR — es información de auditoría, no un defecto de la exportación.'],
    ['Comisiones sugeridas:', 'Motor real de reglas (/api/commissions/calculate) — idéntico al PDF; sin reglas configuradas la sugerencia es 0.'],
    ['Reembolsos:', 'Solo los pagados EN EFECTIVO reducen el esperado (regla P1). Los reembolsos por voucher (transfer/Zelle) son informativos (base NETA v2.23.0, decisión del propietario 2026-10-21).'],
    ['Seguridad:', 'Los textos que podrían interpretarse como fórmulas (= + - @) se exportan prefijados con apóstrofo — inyección neutralizada. La descarga es de solo lectura: no crea ventas, ni movimientos, ni altera datos.'],
    ['Reproducibilidad:', 'Repetir la exportación del mismo período produce los mismos datos de negocio (solo cambia la fecha de generación).'],
  ];
  const wsNota = XLSX.utils.aoa_to_sheet(notaAoa);
  wsNota['!cols'] = [{ wch: 24 }, { wch: 120 }];
  wsNota['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  styleCell(wsNota, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });

  // ═══════════════════ ORDEN DE HOJAS + encabezados de impresión ═══════════════════
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');
  XLSX.utils.book_append_sheet(wb, wsDesglose, 'Desglose');
  if (wsOt) XLSX.utils.book_append_sheet(wb, wsOt, 'Órdenes de Trabajo');
  XLSX.utils.book_append_sheet(wb, wsNota, 'Nota metodológica');

  // Encabezado de la tabla de detalle repetido al imprimir varias páginas
  // (_xlnm.Print_Titles — definido a nivel de workbook, índice 0-based de hoja).
  const detalleSheetIdx = 1; // «Detalle» es la segunda hoja
  const cupHeaderRow = ventasCoords.CUP?.headerRow;
  if (cupHeaderRow !== undefined) {
    (wb as unknown as { Workbook?: Record<string, unknown> }).Workbook!.Names = [
      {
        Name: '_xlnm.Print_Titles',
        Sheet: detalleSheetIdx,
        Ref: `Detalle!$${cupHeaderRow + 1}:$${cupHeaderRow + 1}`,
      },
    ];
  }

  // ── Nombre de archivo descriptivo (misión §6), sin caracteres inválidos ──
  const snFile = sn.replace(/[^a-zA-Z0-9]+/g, '_');
  const filename = `COSTPRO_Reporte_Entrega_${snFile}_${startDate}.xlsx`
    .replace(/[^a-zA-Z0-9._\-]+/g, '_');

  // Congelado/impresión por hoja (lo consume buildCashReportExcelBlob):
  // Resumen: bloque de identidad visible; Detalle: título + cabecera CUP fijas.
  const sheetFeatures: CashReportExcelResult['sheetFeatures'] = [
    { freezeAfterRow: resumenFreezeAfterRow, landscape: true },
    { freezeAfterRow: (ventasCoords.CUP?.headerRow ?? 2) + 1, landscape: true },
    undefined,
    undefined,
    undefined,
  ];

  return { wb, filename, sheetFeatures };
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESO (JSZip): pane de congelado + configuración de impresión.
// xlsx-js-style no las escribe nativamente; se inyectan en el XML de la hoja
// ANTES de descargar. JSZip ya es dependencia directa del stack.
// ═══════════════════════════════════════════════════════════════════════════

interface SheetPrint { freezeAfterRow?: number; landscape?: boolean }

function patchSheetXml(xml: string, feat: SheetPrint): string {
  let out = xml;
  if (feat.freezeAfterRow && feat.freezeAfterRow > 0) {
    const topLeft = `A${feat.freezeAfterRow + 1}`;
    const pane = `<pane ySplit="${feat.freezeAfterRow}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${topLeft}" sqref="${topLeft}"/>`;
    // xlsx-js-style escribe <sheetViews><sheetView …/></sheetViews>
    out = out.replace(
      /<sheetView([^>]*?)\/>/,
      `<sheetView$1>${pane}</sheetView>`,
    );
  }
  if (feat.landscape) {
    // fitToPage: <sheetPr> debe preceder a <dimension>
    if (!out.includes('<sheetPr')) {
      out = out.replace(/(<worksheet[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
    }
    // pageSetup: inmediatamente tras <pageMargins>
    const ps = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
    if (out.includes('<pageMargins')) {
      out = out.replace(/(<pageMargins[^>]*\/>)/, `$1${ps}`);
    } else {
      out = out.replace(/<\/sheetData>/, `</sheetData>${ps}`);
    }
  }
  return out;
}

async function patchWorkbook(
  data: ArrayBuffer,
  sheetFeatures: Array<SheetPrint | undefined>,
): Promise<ArrayBuffer> {
  const mod = await import('jszip');
  const JSZip = (mod as { default?: typeof import('jszip') }).default ?? (mod as unknown as typeof import('jszip'));
  const zip = await JSZip.loadAsync(data);
  // El orden de hojas del wb coincide con sheet1.xml, sheet2.xml, … (el
  // archivo acaba de ser generado por nosotros — correspondencia determinista).
  for (let i = 0; i < sheetFeatures.length; i += 1) {
    const feat = sheetFeatures[i];
    if (!feat) continue;
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    zip.file(path, patchSheetXml(xml, feat));
  }
  // Recalcular TODAS las fórmulas al abrir en Excel: xlsx-js-style no escribe
  // CalcPr, se inyecta en el XML del workbook (después de definedNames).
  const wbPath = 'xl/workbook.xml';
  const wbFile = zip.file(wbPath);
  if (wbFile) {
    const wbXml = await wbFile.async('string');
    if (!wbXml.includes('<calcPr')) {
      zip.file(wbPath, wbXml.replace(/(<\/definedNames>|<\/sheets>)/, `$1<calcPr fullCalcOnLoad="1" calcId="191029"/>`));
    }
  }
  const out = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return out as unknown as ArrayBuffer;
}

/**
 * Construye el .xlsx final (estilos + pane congelado + impresión) y devuelve
 * el Blob listo para descargar. Sin efectos contables: consume el reporte ya
 * aplicado (misma fuente que el PDF).
 */
export async function buildCashReportExcelBlob(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<{ blob: Blob; filename: string }> {
  const XLSX = await loadXlsx();
  const { wb, filename, sheetFeatures } = await buildCashReportExcelWorkbook(ctx, summaries, suggestedCommissions);
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const patched = await patchWorkbook(raw, sheetFeatures);
  const blob = new Blob([patched], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { blob, filename };
}

/** Descarga en el navegador (patrón del PDF: acción explícita del usuario). */
export async function descargarCashReportExcel(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<string> {
  const { blob, filename } = await buildCashReportExcelBlob(ctx, summaries, suggestedCommissions);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}
