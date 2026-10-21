/**
 * cash-report-excel.ts — Exportación Excel (.xlsx) del Reporte de Entrega.
 *
 * MISIÓN EXCEL 2026-10-21 (Parte B de la misión doble):
 *  · .xlsx REAL (no CSV renombrado) generado client-side con `xlsx-js-style`
 *    (dependencia ya presente del stack — fork de SheetJS con estilos de
 *    celda: negrita, relleno, bordes, alineación y formatos numéricos; el
 *    chunk se carga en diferido SOLO al exportar, igual que jspdf).
 *  · FIDELIDAD AL PDF: MISMA fuente de datos y parámetros que
 *    cash-report-pdf.ts (plantilla Diario): mismo report, mismos summaries
 *    (fetchDiarioSummaries), mismas fórmulas centralizadas (computeDailySummary),
 *    mismos helpers de tabla (salesTableColumns/Items/Qty) y misma fuente de
 *    comisiones sugeridas (fetchSuggestedCommissionsByProduct — exportada
 *    del módulo PDF para reutilización EXACTA). Los totales se escriben como
 *    VALORES numéricos ya determinados por la lógica central — sin fórmulas
 *    Excel que recalculen lo que el sistema dicta (regla B4).
 *  · Estructura del libro (B3): hoja principal «Reporte Entrega» que
 *    reproduce el documento (encabezado, resumen CUP/USD, desgloses,
 *    tablas de ventas con autofiltro, firmas) + hoja «Órdenes de Trabajo»
 *    (si procede) + hoja «Nota metodológica». Importes numéricos reales
 *    (z #,##0.00), textos sanitizados contra inyección de fórmulas,
 *    encabezado congelado (pane) y configuración de impresión (horizontal,
 *    ajuste a 1 página de ancho) inyectadas vía post-proceso JSZip.
 *  · SEGURIDAD (B5): sanitizeExcelText prefija ' sobre = + - @ \t \r; la
 *    descarga no crea ventas ni movimientos (solo lectura del reporte
 *    aplicado); nombre de archivo espejo del PDF sin caracteres inválidos.
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
  /** Nombre de archivo espejo del PDF (sin caracteres inválidos). */
  filename: string;
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

  const wb = XLSX.utils.book_new();

  // ═══════════════════ HOJA 1 · «Reporte Entrega» ═══════════════════
  const aoa: CellValue[][] = [];
  aoa.push(['REPORTE DIARIO — ENTREGA DE DINERO']);
  aoa.push(['Tienda:', sanitizeExcelText(sn)]);
  aoa.push(['Período:', periodoLbl]);
  aoa.push(['Generado:', generatedAt]);
  aoa.push(['Monedas:', 'CUP y USD por separado — los importes NUNCA se suman entre monedas']);
  aoa.push([]);

  // Registros de estilo mientras se construye
  const sectionRows: number[] = []; // títulos de sección
  const headerRows: number[] = []; // cabeceras de tabla
  const totalRows: number[] = []; // filas de totales
  const moneyCells: Array<{ r: number; c: number }> = []; // importes numéricos
  const countCells: Array<{ r: number; c: number }> = []; // cantidades enteras
  const qtyCells: Array<{ r: number; c: number }> = []; // cantidades decimales
  let firstVentasHeaderRow = -1; // autofiltro: SOLO la primera tabla (limitación
  let firstVentasLastRow = -1;   // de xlsx: un AutoFilter por hoja)

  const sectionHeader = (label: string) => {
    aoa.push([label]);
    sectionRows.push(aoa.length - 1);
  };

  const renderResumen = (s: DailySummary, currency: 'CUP' | 'USD') => {
    sectionHeader(`RESUMEN DEL DÍA — ${currency}`);
    for (const r of incomeRowsFor(s, currency)) {
      // Regla B4 + paridad PDF §4: los egresos llevan SU signo contable
      // (negativo — igual que el PDF imprime −); las filas info, positivo.
      const amount = r.kind === 'expense' ? -Math.abs(r.amount) : r.amount;
      aoa.push([r.label, '', '', amount]);
      moneyCells.push({ r: aoa.length - 1, c: 3 });
      if (r.kind === 'total') totalRows.push(aoa.length - 1);
    }
    const esperadoLbl = currency === 'CUP' ? 'Efectivo esperado a entregar' : 'Efectivo esperado a entregar (USD)';
    aoa.push([esperadoLbl, '', '', s.efectivoEsperado]);
    moneyCells.push({ r: aoa.length - 1, c: 3 });
    totalRows.push(aoa.length - 1);
    aoa.push([]);
  };

  const renderDesglose = (currency: 'CUP' | 'USD', denoms: number[], breakdown: Breakdown) => {
    sectionHeader(`DESGLOSE DE EFECTIVO ${currency}`);
    aoa.push(['Denominación', '', 'Cantidad', 'Importe']);
    headerRows.push(aoa.length - 1);
    const set = new Set<number>([...denoms, ...Object.keys(breakdown).map(Number)]);
    const ordered = [...set].sort((a, b) => b - a);
    let printed = 0;
    for (const d of ordered) {
      const cnt = Number(breakdown[d] || 0);
      if (cnt <= 0) continue; // §8.3 del PDF: cantidad 0 → fila no se imprime
      aoa.push([d, '', cnt, cnt * d]);
      countCells.push({ r: aoa.length - 1, c: 2 });
      moneyCells.push({ r: aoa.length - 1, c: 3 });
      printed++;
    }
    if (printed === 0) aoa.push(['Sin efectivo contado', '', '', 0]);
    const totalCounted = breakdownTotal(breakdown);
    aoa.push(['Efectivo contado / entregado', '', '', totalCounted]);
    moneyCells.push({ r: aoa.length - 1, c: 3 });
    totalRows.push(aoa.length - 1);
    const cuadre = computeCuadre(totalCounted, currency === 'CUP' ? cupSummary.efectivoEsperado : usdSummary.efectivoEsperado);
    const state = cuadreLabel(cuadre);
    aoa.push([`Cuadre (${state.toUpperCase()})`, '', '', cuadre]);
    moneyCells.push({ r: aoa.length - 1, c: 3 });
    aoa.push([]);
  };

  const renderVentas = (currency: 'CUP' | 'USD') => {
    const includeCommission = currency === 'CUP' && options.includeCommissionColumn !== false;
    const cols = salesTableColumns(currency, includeCommission);
    sectionHeader(`VENTAS DEL DÍA — ${currency}`);
    aoa.push(cols);
    headerRows.push(aoa.length - 1);
    if (firstVentasHeaderRow === -1) firstVentasHeaderRow = aoa.length - 1;
    const items = salesTableItems(itemsWithCommission, currency);
    let totCash = 0, totTransfer = 0, totQty = 0;
    for (const it of items) {
      // Cobros en la MONEDA REAL — MISMA regla del PDF (nunca se suman CUP y USD)
      const cash = currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0);
      const transfer = currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0);
      const qty = salesTableQty(it, currency);
      totCash += cash; totTransfer += transfer; totQty += qty;
      const desc = (it.has_payment_incident ? '* ' : '') + String(it.product_name || '');
      const row: CellValue[] = [sanitizeExcelText(String(it.sku || '')), sanitizeExcelText(desc), qty, cash, transfer];
      if (includeCommission) row.push(Number(it.commission_suggested || 0));
      aoa.push(row);
      qtyCells.push({ r: aoa.length - 1, c: 2 });
      moneyCells.push({ r: aoa.length - 1, c: 3 });
      moneyCells.push({ r: aoa.length - 1, c: 4 });
      if (includeCommission) moneyCells.push({ r: aoa.length - 1, c: 5 });
    }
    if (items.length === 0) {
      aoa.push(['', 'Sin movimientos en el período', 0, 0, 0, ...(includeCommission ? [0] : [])]);
    }
    // Rango de datos del autofiltro (la PRIMERA tabla — xlsx permite UN
    // AutoFilter por hoja): cabecera + filas de productos, SIN la fila de
    // totales (filtrar no debe ocultar el total).
    if (firstVentasHeaderRow !== -1 && firstVentasLastRow === -1 && items.length > 0) {
      firstVentasLastRow = aoa.length - 1; // última fila de datos (totales aún no empujada)
    }
    const totRow: CellValue[] = ['TOTALES', '', totQty, totCash, totTransfer];
    if (includeCommission) {
      const totCommission = items.reduce((s, it) => s + Number(it.commission_suggested || 0), 0);
      totRow.push(totCommission);
    }
    aoa.push(totRow);
    totalRows.push(aoa.length - 1);
    if (currency === 'CUP' && itemsWithCommission.some((it: any) => it.has_payment_incident)) {
      aoa.push(['* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).']);
    }
    aoa.push([]);
  };

  // ── Sección CUP (mismo orden del PDF §4: resumen + desglose, luego tabla) ──
  renderResumen(cupSummary, 'CUP');
  renderDesglose('CUP', cupDenoms, cupBreakdown);
  renderVentas('CUP');

  // ── Sección USD (si procede — mismo criterio del PDF) ──
  const usdWillRender = options.includeUsd !== false && (
    usdSummary.ventasTotales > 0 || usdSummary.ventasCash > 0
    || breakdownTotal(usdBreakdown) > 0
    || itemsWithCommission.some((it: any) => (Number(it.usd_total || 0)) > 0)
  );
  if (usdWillRender) {
    renderResumen(usdSummary, 'USD');
    renderDesglose('USD', usdDenoms, usdBreakdown);
    renderVentas('USD');
  }

  // ── Firmas (paridad con el PDF: solo si «Líneas de firma» está activa) ──
  if (options.includeSignature !== false) {
    sectionHeader('FIRMAS');
    aoa.push(['Hecho por:', sanitizeExcelText(madeBy || '')]);
    aoa.push(['Entregado por:', sanitizeExcelText(deliveredBy || '')]);
    aoa.push(['Recibido por:', sanitizeExcelText(recipientName || '')]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Estilos y formatos por celda ──
  for (const r of sectionRows) styleCell(ws, XLSX, r, 0, { bold: true, sz: 11, fill: C_SECTION_FILL, top: true });
  for (const r of headerRows) {
    for (let c = 0; c <= 5; c += 1) {
      styleCell(ws, XLSX, r, c, { bold: true, fill: C_HEADER_FILL, right: c >= 2, top: true });
    }
  }
  for (const m of moneyCells) {
    const isTotal = totalRows.includes(m.r);
    styleCell(ws, XLSX, m.r, m.c, {
      bold: isTotal, right: true, z: MONEY_ZFMT,
      fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
    });
  }
  for (const q of qtyCells) styleCell(ws, XLSX, q.r, q.c, { right: true, z: QTY_ZFMT });
  for (const q of countCells) styleCell(ws, XLSX, q.r, q.c, { right: true, z: COUNT_ZFMT });
  styleCell(ws, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });

  // ── Geometría e impresión de la hoja ──
  ws['!cols'] = [
    { wch: 40 }, // A: etiquetas / Código
    { wch: 34 }, // B: Descripción
    { wch: 11 }, // C: Cant. / Cantidad
    { wch: 16 }, // D: Efectivo / Importe
    { wch: 16 }, // E: Transfer.
    { wch: 14 }, // F: Comisión
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
  ws['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  // Autofiltro de la primera tabla de ventas (xlsx permite UNO por hoja).
  if (firstVentasHeaderRow !== -1 && firstVentasLastRow !== -1) {
    const lastCol = XLSX.utils.encode_col(5);
    ws['!autofilter'] = { ref: `A${firstVentasHeaderRow + 1}:${lastCol}${firstVentasLastRow + 1}` };
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Entrega');

  // ═══════════════════ HOJA 2 · «Órdenes de Trabajo» (§8.1 conmutable) ═══════════════════
  const orders = (productionOrders as any[]) || [];
  if (options.includeOtReport !== false) {
    const otAoa: CellValue[][] = [
      ['REPORTE DE ÓRDENES DE TRABAJO'],
      ['Tienda:', sanitizeExcelText(sn)],
      ['Período:', periodoLbl],
      [],
      ['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD'],
    ];
    let totCup = 0, totUsd = 0;
    for (const ord of orders) {
      const num = String(ord.order_number || '');
      const desc = String(ord.description || ord.title || ord.customer_name || 'Orden de trabajo');
      const cupAmt = Number(ord.advance_currency === 'CUP' ? ord.advance_amount : (ord.budget_currency === 'CUP' ? ord.budget_total : 0));
      const usdAmt = Number(ord.advance_currency === 'USD' ? ord.advance_amount : (ord.budget_currency === 'USD' ? ord.budget_total : 0));
      totCup += cupAmt; totUsd += usdAmt;
      otAoa.push([sanitizeExcelText(num), 'Trabajo', sanitizeExcelText(desc), 1, cupAmt, usdAmt]);
    }
    if (orders.length === 0) otAoa.push(['', '', 'Sin órdenes en el período', 0, 0, 0]);
    otAoa.push(['TOTALES', '', '', orders.length, totCup, totUsd]);
    const wsOt = XLSX.utils.aoa_to_sheet(otAoa);
    for (let c = 3; c <= 5; c += 1) {
      for (let r = 5; r < otAoa.length; r += 1) {
        const isTotal = r === otAoa.length - 1;
        styleCell(wsOt, XLSX, r, c, {
          bold: isTotal, right: true, z: c === 3 ? COUNT_ZFMT : MONEY_ZFMT,
          fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
        });
      }
    }
    for (let c = 0; c <= 5; c += 1) styleCell(wsOt, XLSX, 4, c, { bold: true, fill: C_HEADER_FILL, top: true, right: c >= 3 });
    styleCell(wsOt, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });
    wsOt['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 48 }, { wch: 11 }, { wch: 15 }, { wch: 12 }];
    wsOt['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    wsOt['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
    if (orders.length > 0) {
      wsOt['!autofilter'] = { ref: `A5:F${5 + orders.length}` };
    }
    XLSX.utils.book_append_sheet(wb, wsOt, 'Órdenes de Trabajo');
  }

  // ═══════════════════ HOJA 3 · «Nota metodológica» (B3) ═══════════════════
  const notaAoa: CellValue[][] = [
    ['NOTA METODOLÓGICA — REPORTE ENTREGA'],
    [],
    ['Fórmula central (por moneda):', 'Efectivo esperado = ventas en efectivo + anticipos de OT + ajustes (+) + ingresos de caja − comisiones en efectivo − servicios recibidos − pagos a proveedores − ajustes (−) − egresos de caja − reembolsos en efectivo'],
    ['Cuadre:', 'Efectivo contado (desglose por denominaciones) − efectivo esperado. Negativo = FALTANTE · Positivo = SOBRANTE · |dif| < 0,005 = cuadrado.'],
    ['Monedas:', 'CUP y USD se contabilizan por separado en secciones propias; NUNCA se suman importes de monedas distintas.'],
    ['Fuente de datos:', 'Mismo origen que el PDF: /api/cash-report (RPC get_cash_report v2.23.0) + items-summary + payment-totals + commissions-summary + production-orders.'],
    ['Totales:', 'Los totales se exportan como VALORES numéricos determinados por la lógica central (computeDailySummary) — sin fórmulas Excel que recalculen datos ya dictados por el sistema.'],
    ['Comisiones sugeridas:', 'Motor real de reglas (/api/commissions/calculate) — idéntico al PDF; sin reglas configuradas la sugerencia es 0.'],
    ['Reembolsos:', 'Solo los pagados EN EFECTIVO reducen el esperado (regla P1). Los reembolsos por voucher (transfer/Zelle) son informativos (base NETA v2.23.0, decisión del propietario 2026-10-21).'],
    ['Seguridad:', 'Los textos que podrían interpretarse como fórmulas (= + - @) se exportan prefijados con apóstrofo — inyección neutralizada.'],
    ['Reproducibilidad:', 'Repetir la exportación del mismo período produce los mismos datos de negocio (solo cambia la fecha de generación).'],
  ];
  const wsNota = XLSX.utils.aoa_to_sheet(notaAoa);
  wsNota['!cols'] = [{ wch: 24 }, { wch: 120 }];
  wsNota['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  styleCell(wsNota, XLSX, 0, 0, { bold: true, sz: 13, fill: C_SECTION_FILL });
  XLSX.utils.book_append_sheet(wb, wsNota, 'Nota metodológica');

  // ── Nombre de archivo: espejo del PDF (B3), sin caracteres inválidos ──
  const snFile = sn.replace(/\s+/g, '_');
  const filename = (ctx.template === 'diario'
    ? `reporte_diario_${snFile}_${startDate}.xlsx`
    : `reporte_caja_${snFile}_${startDate}.xlsx`
  ).replace(/[^a-zA-Z0-9._\-]+/g, '_');

  return { wb, filename };
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
  const { wb, filename } = await buildCashReportExcelWorkbook(ctx, summaries, suggestedCommissions);
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  // Hoja 1: congelar tras el bloque de identificación (filas 1-5 visibles
  // siempre) + impresión horizontal ajustando a 1 página de ancho. Las demás
  // hojas quedan sin congelado (documentos cortos).
  const patched = await patchWorkbook(raw, [
    { freezeAfterRow: 5, landscape: true },
    undefined,
    undefined,
  ]);
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
