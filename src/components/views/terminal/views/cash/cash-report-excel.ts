/**
 * cash-report-excel.ts — Exportación Excel (.xlsx) del Reporte de Entrega.
 *
 * MISIÓN 2026-10-22 (Partes D + E):
 *  · D — REPARACIÓN DEL ARCHIVO DAÑADO. Causa raíz demostrada (reproducción
 *    forense del binario): el post-proceso JSZip inyectaba <calcPr> entre
 *    </sheets> y <definedNames> — el regex alternado (/<\/definedNames>|<\/sheets>/)
 *    empareja </sheets> PRIMERO porque en el XML va antes. El esquema
 *    CT_Workbook (ECMA-376 §18.2.10) exige la secuencia … sheets →
 *    functionGroups → externalReferences → definedNames → calcPr …, de modo
 *    que Excel de escritorio rechaza el orden y declara el archivo dañado
 *    («hemos detectado un problema con el contenido»). openpyxl y LibreOffice
 *    toleran el desorden (por eso el round-trip del CI nunca lo detectó).
 *    Fix: inyección SIEMPRE tras </definedNames> cuando existe + prueba de
 *    regresión que valida el ORDEN de los elementos del workbook.xml.
 *  · E — ESTRUCTURA ESPEJO DEL PDF: hoja principal «Reporte Entrega»
 *    (identidad COSTPRO 4 + tienda + período + generación + tipo de reporte,
 *    RESUMEN DEL DÍA, DESGLOSE DE EFECTIVO, VENTAS DEL DÍA con TOTALES y
 *    fórmulas reales, COMPROBACIÓN tabla↔resumen, FIRMAS). Con «USD en hoja
 *    separada» activo → hoja «Reporte Entrega USD» independiente con título,
 *    tienda y período identificables; desactivado → secciones USD corridas en
 *    la hoja principal (sin duplicar totales). «Órdenes de Trabajo» (opción
 *    includeOtReport) y «Nota metodológica» completan el libro.
 *  · IMPRESIÓN PROFESIONAL (E3): A4; orientación según columnas (horizontal
 *    para hojas con tabla, vertical para la nota); fitToWidth=1 fitToHeight=0
 *    (el largo fluye a varias páginas legibles); márgenes equilibrados; área
 *    de impresión delimitada (_xlnm.Print_Area al rango usado); repetición de
 *    la fila de encabezado al imprimir (_xlnm.Print_Titles, solo en hojas de
 *    una tabla — en modo compacto no se repite un encabezado CUP sobre filas
 *    USD); encabezado y pie de página con numeración (&P de &N); paneles
 *    congelados tras el bloque de identidad; anchos de columna por contenido.
 *  · OPCIONES DEL DOCUMENTO respetadas (misma fuente que pantalla y PDF):
 *    includeCashBreakdown (bloque «Desglose de efectivo» completo),
 *    includeBreakdown (filas por denominación dentro del bloque),
 *    includeUsd (secciones USD), usdSeparatePage (hoja USD propia),
 *    includeSignature (firmas), includeOtReport (hoja OT),
 *    includeCommissionColumn (columna Comisión en la tabla CUP).
 *  · FIDELIDAD CONTABLE (heredada de las misiones anteriores): mismas fuentes
 *    y parámetros que el PDF (fetchDiarioSummaries + computeDailySummary +
 *    salesTableColumns/Items/Qty + fetchSuggestedCommissionsByProduct); los
 *    totales son NÚMEROS con fórmulas REALES (=SUM, =A*C, cuadre y
 *    comprobaciones) cuyo valor cacheado es el determinado por el sistema;
 *    CUP y USD JAMÁS se suman entre sí; fullCalcOnLoad recalcula al abrir.
 *  · SEGURIDAD (B5): sanitizeExcelText prefija ' sobre = + - @ \t \r; la
 *    exportación es de solo lectura (no crea ventas ni movimientos); nombre
 *    de archivo descriptivo sin caracteres inválidos.
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
import { breakdownTotal, TEMPLATES, type Breakdown } from './cash-report-core';
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
interface CellStyle {
  bold?: boolean; sz?: number; fill?: string; right?: boolean;
  top?: boolean; bottom?: boolean; z?: string; italic?: boolean;
}

function styleCell(ws: WorkSheetLike, XLSX: XLSXModule, r: number, c: number, st: CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as (Record<string, unknown> | undefined);
  if (!cell) return;
  const border: Record<string, { style: string; color: { rgb: string } }> = {};
  if (st.top) border.top = { style: 'thin', color: { rgb: '6B7280' } };
  if (st.bottom) border.bottom = { style: 'thin', color: { rgb: '6B7280' } };
  cell.s = {
    font: { bold: st.bold === true, sz: st.sz, italic: st.italic, color: { rgb: '1F2937' } },
    fill: st.fill ? { patternType: 'solid', fgColor: { rgb: st.fill } } : undefined,
    alignment: { horizontal: st.right ? 'right' : 'left', vertical: 'center' },
    border: Object.keys(border).length > 0 ? border : undefined,
  };
  if (st.z && cell.t === 'n') cell.z = st.z;
}

/** Registro de fórmulas: coordenada + fórmula canónica (en-US, separador ,). */
interface FormulaRef { r: number; c: number; f: string }

/**
 * Adjunta las fórmulas a las celdas (el valor v ya está como resultado cacheado).
 * NOTA: las celdas cuyo resultado es TEXTO (p. ej. =IF(...,"COHERENTE","REVISAR"))
 * conservan t='str' (xlsx-js-style lo escribe así): Excel (tras fullCalcOnLoad)
 * muestra el valor correcto.
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

// ── Constructor de hoja (estado por hoja — espejo del PDF) ──────────────────
interface SheetCtx {
  aoa: CellValue[][];
  sectionRows: number[];   // filas de título de sección (merged + fill)
  headerRows: number[];    // filas de encabezado de tabla
  totalRows: number[];     // filas de totales (negrita + relleno)
  moneyCells: Array<{ r: number; c: number }>;
  qtyCells: Array<{ r: number; c: number }>;
  countCells: Array<{ r: number; c: number }>;
  underlineCells: Array<{ r: number; c: number }>; // líneas de firma
  formulas: FormulaRef[];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  lastCol: number;         // índice 0-based de la última columna (5 = F)
}

function newSheetCtx(lastCol: number): SheetCtx {
  return {
    aoa: [], sectionRows: [], headerRows: [], totalRows: [],
    moneyCells: [], qtyCells: [], countCells: [], underlineCells: [],
    formulas: [], merges: [], lastCol,
  };
}

/** Título de sección: merged A..lastCol, negrita, relleno sobrio. */
function pushSectionTitle(s: SheetCtx, title: string, subtitle?: string) {
  s.aoa.push(subtitle ? [title, '', '', '', '', ''] : [title]);
  const r = s.aoa.length - 1;
  s.sectionRows.push(r);
  s.merges.push({ s: { r, c: 0 }, e: { r, c: s.lastCol } });
  return r;
}

/** Coordenadas de un bloque de reporte (una moneda) dentro de su hoja. */
interface BlockCoords {
  rowsByLabel: Map<string, number>;
  esperadoRow: number;
  contadoRow: number;
  cuadreRow: number;
  ventasHeaderRow: number;
  ventasFirstDataRow: number;
  ventasLastDataRow: number;
  ventasTotRow: number;
}

export interface CashReportExcelResult {
  wb: WorkBookLike;
  filename: string;
  /** Congelado/impresión por hoja (lo consume buildCashReportExcelBlob). */
  sheetFeatures: Array<SheetPrint | undefined>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export async function buildCashReportExcelWorkbook(
  ctx: CashReportPdfContext,
  summaries?: CashReportSummaries,
  suggestedCommissions?: Map<string, number>,
): Promise<CashReportExcelResult> {
  const XLSX = await loadXlsx();
  const { report, startDate, endDate, storeInfo, template, deliveredBy, recipientName, madeBy, cupBreakdown, usdBreakdown, cupDenoms, usdDenoms, options } = ctx;

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
  const templateLabel = TEMPLATES.find(t => t.id === template)?.label ?? String(template);

  // ── Opciones del documento (misma fuente que pantalla y PDF) ──
  const usdWillRender = options.includeUsd !== false && (
    usdSummary.ventasTotales > 0 || usdSummary.ventasCash > 0
    || breakdownTotal(usdBreakdown) > 0
    || itemsWithCommission.some((it: any) => (Number(it.usd_total || 0)) > 0)
  );
  const usdSeparate = options.usdSeparatePage !== false;
  const showDesglose = options.includeCashBreakdown !== false;
  const showDenoms = options.includeBreakdown !== false;
  const showFirmas = options.includeSignature !== false;
  const showOt = options.includeOtReport !== false;
  const includeCommissionCup = options.includeCommissionColumn !== false;

  const wb = XLSX.utils.book_new();
  // Recalcular TODAS las fórmulas al abrir el archivo en Excel (el escritor de
  // xlsx-js-style no serializa CalcPr: se inyecta vía post-proceso JSZip).
  (wb as unknown as { Workbook?: Record<string, unknown> }).Workbook = {
    CalcPr: { fullCalcOnLoad: true },
  };

  // ── Renderiza un bloque de reporte (una moneda) dentro de una hoja ──
  const renderReportBlock = (
    s: SheetCtx,
    currency: 'CUP' | 'USD',
    summary: DailySummary,
    denoms: number[],
    breakdown: Breakdown,
  ): BlockCoords => {
    const rowsByLabel = new Map<string, number>();

    // ══ RESUMEN DEL DÍA (mismas filas condicionales que el PDF §4) ══
    pushSectionTitle(s, `RESUMEN DEL DÍA — ${currency}`);
    const rows = incomeRowsFor(summary, currency);
    for (const r of rows) {
      // Regla B4 + paridad PDF §4: los egresos llevan SU signo contable
      // (negativo — igual que el PDF imprime −); las filas info, positivo.
      const amount = r.kind === 'expense' ? -Math.abs(r.amount) : r.amount;
      s.aoa.push([r.label, '', '', amount]);
      const rowIdx = s.aoa.length - 1;
      rowsByLabel.set(r.label, rowIdx);
      s.merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } }); // etiqueta A:C
      if (r.kind !== 'total') s.moneyCells.push({ r: rowIdx, c: 3 });
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
    s.formulas.push({
      r: totalRowIdx, c: 3,
      f: components.map((row) => `D${row + 1}`).join('+'),
    });
    s.totalRows.push(totalRowIdx);
    s.moneyCells.push({ r: totalRowIdx, c: 3 });

    // Efectivo esperado como FÓRMULA viva (misma cadena contable del sistema):
    // efectivoEsperado = ventasCash + otIngresos + ajustes(+) + ingresosCaja
    //                    − comisiones − servicios − proveedores − ajustes(−)
    //                    − egresosCaja − reembolsosCash
    const esperadoLbl = currency === 'CUP' ? 'Efectivo esperado a entregar' : 'Efectivo esperado a entregar (USD)';
    s.aoa.push([esperadoLbl, '', '', summary.efectivoEsperado]);
    const esperadoRow = s.aoa.length - 1;
    rowsByLabel.set(esperadoLbl, esperadoRow);
    s.merges.push({ s: { r: esperadoRow, c: 0 }, e: { r: esperadoRow, c: 2 } });
    s.moneyCells.push({ r: esperadoRow, c: 3 });
    s.totalRows.push(esperadoRow);
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
    s.formulas.push({ r: esperadoRow, c: 3, f: esperadoFormula.length > 0 ? esperadoFormula : '0' });
    s.aoa.push([]);

    // ══ DESGLOSE DE EFECTIVO (opción «Desglose de efectivo») ══
    let contadoRow = -1;
    let cuadreRow = -1;
    if (showDesglose) {
      pushSectionTitle(s, `DESGLOSE DE EFECTIVO — ${currency}`, 'Conteo físico por denominaciones');
      const set = new Set<number>([...denoms, ...Object.keys(breakdown).map(Number)]);
      const ordered = [...set].sort((a, b) => b - a);
      const counted = ordered.filter(d => Number(breakdown[d] || 0) > 0);
      if (showDenoms) {
        // «Desglose de billetes»: filas por denominación (§8.3: cantidad 0 no se imprime)
        s.aoa.push(['Denominación', '', 'Cantidad', 'Importe']);
        const hr = s.aoa.length - 1;
        s.headerRows.push(hr);
        const firstDenomRow = s.aoa.length;
        let printed = 0;
        for (const d of counted) {
          const cnt = Number(breakdown[d] || 0);
          s.aoa.push([d, '', cnt, cnt * d]);
          const r = s.aoa.length - 1;
          s.countCells.push({ r, c: 2 });
          s.moneyCells.push({ r, c: 3 });
          // Fórmula real por línea: importe = denominación × cantidad
          s.formulas.push({ r, c: 3, f: `A${r + 1}*C${r + 1}` });
          printed++;
        }
        if (printed === 0) s.aoa.push(['Sin efectivo contado', '', '', '']);
        const lastDenomRow = firstDenomRow + Math.max(printed - 1, 0);
        // Contado = SUMA de los importes por denominación
        const totalCounted = breakdownTotal(breakdown);
        s.aoa.push(['Efectivo contado / entregado', '', '', totalCounted]);
        contadoRow = s.aoa.length - 1;
        s.merges.push({ s: { r: contadoRow, c: 0 }, e: { r: contadoRow, c: 2 } });
        s.moneyCells.push({ r: contadoRow, c: 3 });
        s.totalRows.push(contadoRow);
        if (printed > 0) s.formulas.push({ r: contadoRow, c: 3, f: `SUM(D${firstDenomRow + 1}:D${lastDenomRow + 1})` });
      } else {
        // Bloque presente sin filas por denominación: contado directo.
        const totalCounted = breakdownTotal(breakdown);
        s.aoa.push(['Efectivo contado / entregado', '', '', totalCounted]);
        contadoRow = s.aoa.length - 1;
        s.merges.push({ s: { r: contadoRow, c: 0 }, e: { r: contadoRow, c: 2 } });
        s.moneyCells.push({ r: contadoRow, c: 3 });
        s.totalRows.push(contadoRow);
      }
      // Cuadre en vivo: contado (esta hoja) − esperado (RESUMEN de esta hoja).
      const cuadre = computeCuadre(breakdownTotal(breakdown), summary.efectivoEsperado);
      const state = cuadreLabel(cuadre);
      s.aoa.push([`Cuadre (${state.toUpperCase()})`, '', '', cuadre]);
      cuadreRow = s.aoa.length - 1;
      s.merges.push({ s: { r: cuadreRow, c: 0 }, e: { r: cuadreRow, c: 2 } });
      s.moneyCells.push({ r: cuadreRow, c: 3 });
      s.formulas.push({ r: cuadreRow, c: 3, f: `D${contadoRow + 1}-D${esperadoRow + 1}` });
      s.aoa.push([]);
    }

    // ══ VENTAS DEL DÍA (mismas columnas/orden que el PDF) ══
    pushSectionTitle(s, `VENTAS DEL DÍA — ${currency}`);
    const includeCommission = currency === 'CUP' && includeCommissionCup;
    const cols = salesTableColumns(currency, includeCommission);
    s.aoa.push(cols);
    const ventasHeaderRow = s.aoa.length - 1;
    s.headerRows.push(ventasHeaderRow);
    const items = salesTableItems(itemsWithCommission, currency);
    const ventasFirstDataRow = s.aoa.length;
    for (const it of items) {
      // Cobros en la MONEDA REAL — MISMA regla del PDF (nunca se suman CUP y USD)
      const cash = currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0);
      const transfer = currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0);
      const qty = salesTableQty(it, currency);
      const desc = (it.has_payment_incident ? '* ' : '') + String(it.product_name || '');
      const row: CellValue[] = [sanitizeExcelText(String(it.sku || '')), sanitizeExcelText(desc), qty, cash, transfer];
      if (includeCommission) row.push(Number(it.commission_suggested || 0));
      s.aoa.push(row);
      s.qtyCells.push({ r: s.aoa.length - 1, c: 2 });
      s.moneyCells.push({ r: s.aoa.length - 1, c: 3 });
      s.moneyCells.push({ r: s.aoa.length - 1, c: 4 });
      if (includeCommission) s.moneyCells.push({ r: s.aoa.length - 1, c: 5 });
    }
    if (items.length === 0) {
      // Sin movimientos: fila informativa SIN números (no cuenta en los =SUM)
      s.aoa.push(['', 'Sin movimientos en el período']);
    }
    const ventasLastDataRow = s.aoa.length - 1;
    const ventasTotRow = s.aoa.length;
    const totCash = items.reduce((acc, it) => acc + (currency === 'CUP' ? Number(it.cash_cup || 0) : Number(it.cash_usd || 0) + Number(it.transfer_usd || 0)), 0);
    const totTransfer = items.reduce((acc, it) => acc + (currency === 'CUP' ? Number(it.transfer_cup || 0) + Number(it.zelle_cup || 0) : Number(it.zelle_usd || 0)), 0);
    const totQty = items.reduce((acc, it) => acc + salesTableQty(it, currency), 0);
    const totRow: CellValue[] = ['TOTALES', '', totQty, totCash, totTransfer];
    if (includeCommission) totRow.push(items.reduce((acc, it) => acc + Number(it.commission_suggested || 0), 0));
    s.aoa.push(totRow);
    s.totalRows.push(ventasTotRow);
    // TOTALES como fórmulas reales =SUM (misma columna que los datos)
    s.formulas.push({ r: ventasTotRow, c: 2, f: `SUM(C${ventasFirstDataRow + 1}:C${ventasLastDataRow + 1})` });
    s.formulas.push({ r: ventasTotRow, c: 3, f: `SUM(D${ventasFirstDataRow + 1}:D${ventasLastDataRow + 1})` });
    s.formulas.push({ r: ventasTotRow, c: 4, f: `SUM(E${ventasFirstDataRow + 1}:E${ventasLastDataRow + 1})` });
    if (includeCommission) s.formulas.push({ r: ventasTotRow, c: 5, f: `SUM(F${ventasFirstDataRow + 1}:F${ventasLastDataRow + 1})` });
    if (currency === 'CUP' && itemsWithCommission.some((it: any) => it.has_payment_incident)) {
      s.aoa.push(['* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada).']);
    }
    s.aoa.push([]);

    // ══ COMPROBACIÓN DE CONSISTENCIA (tabla ↔ resumen, misma hoja) ══
    pushSectionTitle(s, `COMPROBACIÓN DE CONSISTENCIA — ${currency}`);
    // Efectivo: columna «Efectivo» de la tabla vs la fila del resumen con la
    // MISMA composición que el PDF:
    //  · CUP → ventas en efectivo.
    //  · USD → la columna de la tabla agrupa cash+transfer, y el resumen USD
    //    no imprime fila de transferencia ⇒ base = total − zelle.
    const zelleRowIdx = rowsByLabel.get('Venta por Zelle') ?? rowsByLabel.get('Ventas por Zelle');
    const efResumenExpr = currency === 'CUP'
      ? `D${(rowsByLabel.get('Ventas en efectivo')!) + 1}`
      : (zelleRowIdx !== undefined
          ? `D${totalRowIdx + 1}-D${zelleRowIdx + 1}`
          : `D${totalRowIdx + 1}`);
    const efCheckLabel = currency === 'CUP' ? 'Efectivo' : 'Efectivo (cash + tarjeta)';
    s.aoa.push([`${efCheckLabel}: tabla − resumen`, '', '', 0]);
    const checkEfRow = s.aoa.length - 1;
    s.merges.push({ s: { r: checkEfRow, c: 0 }, e: { r: checkEfRow, c: 2 } });
    s.moneyCells.push({ r: checkEfRow, c: 3 });
    s.formulas.push({ r: checkEfRow, c: 3, f: `ROUND(D${ventasTotRow + 1}-(${efResumenExpr}),2)` });
    s.aoa.push(['Estado de la comprobación (efectivo)', '', '', 'COHERENTE']);
    const estadoEfRow = s.aoa.length - 1;
    s.merges.push({ s: { r: estadoEfRow, c: 0 }, e: { r: estadoEfRow, c: 2 } });
    s.formulas.push({ r: estadoEfRow, c: 3, f: `IF(ABS(D${checkEfRow + 1})<0.005,"COHERENTE","REVISAR")` });

    // Transferencia/Zelle: columna «Transfer.» (CUP: transfer+zelle) o «Zelle»
    // (USD) de la tabla vs las filas correspondientes del resumen.
    const trRefRows = currency === 'CUP'
      ? [
          rowsByLabel.get('Ventas por transferencia'),
          rowsByLabel.get('Ventas por Zelle'),
        ].filter((v): v is number => v !== undefined)
      : [rowsByLabel.get('Venta por Zelle')].filter((v): v is number => v !== undefined);
    const trResumenExpr = trRefRows.length > 0 ? trRefRows.map((row) => `D${row + 1}`).join('+') : '0';
    const trCheckLabel = currency === 'CUP' ? 'Transferencia' : 'Zelle';
    s.aoa.push([`${trCheckLabel}: tabla − resumen`, '', '', 0]);
    const checkTrRow = s.aoa.length - 1;
    s.merges.push({ s: { r: checkTrRow, c: 0 }, e: { r: checkTrRow, c: 2 } });
    s.moneyCells.push({ r: checkTrRow, c: 3 });
    s.formulas.push({ r: checkTrRow, c: 3, f: `ROUND(E${ventasTotRow + 1}-(${trResumenExpr}),2)` });
    s.aoa.push(['Estado de la comprobación (transferencia)', '', '', 'COHERENTE']);
    const estadoTrRow = s.aoa.length - 1;
    s.merges.push({ s: { r: estadoTrRow, c: 0 }, e: { r: estadoTrRow, c: 2 } });
    s.formulas.push({ r: estadoTrRow, c: 3, f: `IF(ABS(D${checkTrRow + 1})<0.005,"COHERENTE","REVISAR")` });
    s.aoa.push([]);

    return {
      rowsByLabel, esperadoRow, contadoRow, cuadreRow,
      ventasHeaderRow, ventasFirstDataRow, ventasLastDataRow, ventasTotRow,
    };
  };

  // ── Firmas (paridad con el PDF: solo si «Líneas de firma» está activa) ──
  const renderFirmas = (s: SheetCtx) => {
    pushSectionTitle(s, 'FIRMAS');
    const pairs: Array<[string, string]> = [
      ['Hecho por:', madeBy || ''],
      ['Entregado por:', deliveredBy || ''],
      ['Recibido por:', recipientName || ''],
    ];
    for (const [label, name] of pairs) {
      // Etiqueta en A:B (merged) · nombre sobre línea de firma en C:D (merged
      // con borde inferior — sin nombre, la línea queda en blanco a mano).
      s.aoa.push([label, '', name, '', '', '']);
      const r = s.aoa.length - 1;
      s.merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
      s.merges.push({ s: { r, c: 2 }, e: { r, c: 3 } });
      s.underlineCells.push({ r, c: 2 });
      s.underlineCells.push({ r, c: 3 });
    }
    s.aoa.push([]);
  };

  // ═══════════════ HOJA 1 · «Reporte Entrega» (bloque CUP) ═══════════════
  const main = newSheetCtx(5); // A..F
  main.aoa.push(['COSTPRO 4 MULTITIENDA — REPORTE DE ENTREGA']);
  main.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  main.aoa.push(['Tienda:', sanitizeExcelText(sn)]);
  main.merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: 5 } });
  if (storeInfo?.address) {
    main.aoa.push(['Dirección:', sanitizeExcelText(String(storeInfo.address))]);
    main.merges.push({ s: { r: 2, c: 1 }, e: { r: 2, c: 5 } });
  }
  main.aoa.push(['Período:', periodoLbl]);
  main.aoa.push(['Generado:', generatedAt]);
  main.aoa.push(['Tipo de reporte:', sanitizeExcelText(templateLabel)]);
  main.aoa.push(['Monedas:', 'CUP y USD por separado — los importes NUNCA se suman entre monedas']);
  const mainFreezeAfterRow = main.aoa.length; // bloque de identidad congelado
  main.aoa.push([]);

  const cupCoords = renderReportBlock(main, 'CUP', cupSummary, cupDenoms, cupBreakdown);
  // Modo compacto (§9, «USD en hoja separada» OFF): secciones USD corridas en
  // la MISMA hoja, tras el bloque CUP (sin duplicar totales: cada bloque trae
  // los suyos y ninguno se repite entre hojas).
  if (usdWillRender && !usdSeparate) {
    renderReportBlock(main, 'USD', usdSummary, usdDenoms, usdBreakdown);
  }
  if (showFirmas) renderFirmas(main);

  const mainCols = includeCommissionCup
    ? [{ wch: 18 }, { wch: 46 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 14 }]
    : [{ wch: 18 }, { wch: 50 }, { wch: 9 }, { wch: 17 }, { wch: 17 }, { wch: 12 }];
  const wsMain = materialize(XLSX, main, mainCols, {
    // Autofiltro SOLO sobre la tabla de ventas CUP (una por hoja).
    autofilter: cupCoords.ventasLastDataRow >= cupCoords.ventasFirstDataRow
      ? `A${cupCoords.ventasHeaderRow + 1}:F${cupCoords.ventasLastDataRow + 1}`
      : undefined,
  });

  // ═══════════════ HOJA «Reporte Entrega USD» (si separada) ═══════════════
  let wsUsd: WorkSheetLike | null = null;
  let usdCoordsSep: BlockCoords | null = null;
  let usdIdentityRows = 0;
  let usdSheetLastRow = 0;
  if (usdWillRender && usdSeparate) {
    const usd = newSheetCtx(4); // A..E (la tabla USD no lleva Comisión)
    usd.aoa.push(['REPORTE DE ENTREGA — USD']);
    usd.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
    usd.aoa.push(['Tienda:', sanitizeExcelText(sn)]);
    usd.merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: 4 } });
    usd.aoa.push(['Período:', periodoLbl]);
    usd.aoa.push(['Generado:', generatedAt]);
    usdIdentityRows = usd.aoa.length;
    usd.aoa.push([]);
    usdCoordsSep = renderReportBlock(usd, 'USD', usdSummary, usdDenoms, usdBreakdown);
    if (showFirmas) renderFirmas(usd);
    usdSheetLastRow = usd.aoa.length;
    wsUsd = materialize(XLSX, usd, [{ wch: 18 }, { wch: 50 }, { wch: 9 }, { wch: 17 }, { wch: 16 }], {
      autofilter: usdCoordsSep.ventasLastDataRow >= usdCoordsSep.ventasFirstDataRow
        ? `A${usdCoordsSep.ventasHeaderRow + 1}:E${usdCoordsSep.ventasLastDataRow + 1}`
        : undefined,
    });
  }

  // ═══════════════ HOJA «Órdenes de Trabajo» (§8.1 conmutable) ═══════════════
  const orders = (productionOrders as any[]) || [];
  let wsOt: WorkSheetLike | null = null;
  let otLastRow = 0;
  if (showOt) {
    const ot = newSheetCtx(5);
    ot.aoa.push(['REPORTE DE ÓRDENES DE TRABAJO']);
    ot.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
    ot.aoa.push(['Tienda:', sanitizeExcelText(sn)]);
    ot.aoa.push(['Período:', periodoLbl]);
    ot.aoa.push([]);
    ot.aoa.push(['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD']);
    ot.headerRows.push(4);
    let totCup = 0, totUsd = 0;
    const otFirstDataRow = ot.aoa.length;
    for (const ord of orders) {
      const num = String(ord.order_number || '');
      const desc = String(ord.description || ord.title || ord.customer_name || 'Orden de trabajo');
      const cupAmt = Number(ord.advance_currency === 'CUP' ? ord.advance_amount : (ord.budget_currency === 'CUP' ? ord.budget_total : 0));
      const usdAmt = Number(ord.advance_currency === 'USD' ? ord.advance_amount : (ord.budget_currency === 'USD' ? ord.budget_total : 0));
      totCup += cupAmt; totUsd += usdAmt;
      ot.aoa.push([sanitizeExcelText(num), 'Trabajo', sanitizeExcelText(desc), 1, cupAmt, usdAmt]);
    }
    const otLastDataRow = ot.aoa.length - 1;
    if (orders.length === 0) ot.aoa.push(['', '', 'Sin órdenes en el período']);
    const otTotRow = ot.aoa.length;
    ot.aoa.push(['TOTALES', '', '', orders.length, totCup, totUsd]);
    ot.totalRows.push(otTotRow);
    // TOTALES como fórmulas =SUM reales (monedas en columnas separadas)
    ot.formulas.push({ r: otTotRow, c: 3, f: `SUM(D${otFirstDataRow + 1}:D${otLastDataRow + 1})` });
    ot.formulas.push({ r: otTotRow, c: 4, f: `SUM(E${otFirstDataRow + 1}:E${otLastDataRow + 1})` });
    ot.formulas.push({ r: otTotRow, c: 5, f: `SUM(F${otFirstDataRow + 1}:F${otLastDataRow + 1})` });
    for (let r = otFirstDataRow; r <= otTotRow; r += 1) {
      ot.moneyCells.push({ r, c: 4 });
      ot.moneyCells.push({ r, c: 5 });
      ot.countCells.push({ r, c: 3 });
    }
    otLastRow = ot.aoa.length;
    wsOt = materialize(XLSX, ot, [{ wch: 16 }, { wch: 14 }, { wch: 48 }, { wch: 11 }, { wch: 15 }, { wch: 12 }], {
      autofilter: orders.length > 0 ? `A5:F${5 + orders.length}` : undefined,
    });
  }

  // ═══════════════ HOJA «Nota metodológica» (auditoría del documento) ═══════════════
  const nota = newSheetCtx(1);
  nota.aoa.push(['NOTA METODOLÓGICA — REPORTE ENTREGA']);
  nota.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
  nota.aoa.push([]);
  const notaRows: Array<[string, string]> = [
    ['Fórmula central (por moneda):', 'Efectivo esperado = ventas en efectivo + anticipos de OT + ajustes (+) + ingresos de caja − comisiones en efectivo − servicios recibidos − pagos a proveedores − ajustes (−) − egresos de caja − reembolsos en efectivo'],
    ['Cuadre:', 'Efectivo contado (desglose por denominaciones) − efectivo esperado. Negativo = FALTANTE · Positivo = SOBRANTE · |dif| < 0,005 = cuadrado.'],
    ['Monedas:', 'CUP y USD se contabilizan por separado en secciones propias; NUNCA se suman importes de monedas distintas — tampoco en las fórmulas de Excel.'],
    ['Estructura:', 'Hoja «Reporte Entrega» espejo del PDF (resumen + desglose + ventas + comprobación + firmas). Con «USD en hoja separada» activo, el detalle USD vive en su propia hoja con título, tienda y período; desactivado, corre en la hoja principal sin duplicar totales.'],
    ['Fuente de datos:', 'Mismo origen que el PDF: /api/cash-report (RPC get_cash_report v2.23.0) + items-summary + payment-totals + commissions-summary + production-orders.'],
    ['Fórmulas de Excel:', 'Los totales llevan fórmulas REALES (=SUM, =A*C, cuadre y comprobaciones tabla↔resumen) referenciando las celdas de detalle; el valor mostrado al generar es el calculado por el sistema (computeDailySummary) y Excel recalcula al abrir el libro (fullCalcOnLoad). Editar una celda de detalle recalcula totales y comprobaciones en vivo.'],
    ['Comprobaciones:', 'La hoja compara el total de la tabla de ventas contra el resumen por moneda y por medio de pago (=IF(|dif|<0,005,"COHERENTE","REVISAR")). Una incidencia de pago documentada (*) puede producir REVISAR — es información de auditoría, no un defecto de la exportación.'],
    ['Comisiones sugeridas:', 'Motor real de reglas (/api/commissions/calculate) — idéntico al PDF; sin reglas configuradas la sugerencia es 0.'],
    ['Reembolsos:', 'Solo los pagados EN EFECTIVO reducen el esperado (regla P1). Los reembolsos por voucher (transfer/Zelle) son informativos (base NETA v2.23.0, decisión del propietario 2026-10-21).'],
    ['Impresión:', 'A4 con ajuste al ancho de una página (fitToWidth) — el largo fluye a varias páginas con el encabezado de tabla repetido; numeración en el pie (Página N de M).'],
    ['Seguridad:', 'Los textos que podrían interpretarse como fórmulas (= + - @) se exportan prefijados con apóstrofo — inyección neutralizada. La descarga es de solo lectura: no crea ventas, ni movimientos, ni altera datos.'],
    ['Reproducibilidad:', 'Repetir la exportación del mismo período produce los mismos datos de negocio (solo cambia la fecha de generación).'],
  ];
  for (const [k, v] of notaRows) nota.aoa.push([k, v]);
  const notaLastRow = nota.aoa.length;
  const wsNota = materialize(XLSX, nota, [{ wch: 24 }, { wch: 120 }], {});

  // ═══════════════ ORDEN DE HOJAS + nombres de impresión ═══════════════
  const MAIN_SHEET = 'Reporte Entrega';
  const USD_SHEET = 'Reporte Entrega USD';
  const OT_SHEET = 'Órdenes de Trabajo';
  const NOTA_SHEET = 'Nota metodológica';

  XLSX.utils.book_append_sheet(wb, wsMain, MAIN_SHEET);
  if (wsUsd) XLSX.utils.book_append_sheet(wb, wsUsd, USD_SHEET);
  if (wsOt) XLSX.utils.book_append_sheet(wb, wsOt, OT_SHEET);
  XLSX.utils.book_append_sheet(wb, wsNota, NOTA_SHEET);
  // Índices 0-based de hoja (mismo orden de append):
  const usdSheetIdx = wsUsd ? 1 : -1;
  const otSheetIdx = wsOt ? (wsUsd ? 2 : 1) : -1;
  const notaSheetIdx = (wsUsd ? 2 : 1) + (wsOt ? 1 : 0);

  // Encabezados y áreas de impresión (_xlnm.Print_Titles / _xlnm.Print_Area,
  // definidos a nivel de workbook con índice 0-based de hoja).
  // Print_Titles SOLO en hojas de UNA tabla: en modo compacto (CUP+USD en la
  // misma hoja) no se repite el encabezado CUP sobre filas USD.
  const workbookNames: Array<{ Name: string; Sheet: number; Ref: string }> = [];
  const q = (sheet: string) => (sheet.includes(' ') ? `'${sheet}'` : sheet);
  const mainLastRow = main.aoa.length;
  workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: 0, Ref: `${q(MAIN_SHEET)}!$A$1:$F$${mainLastRow}` });
  if (usdSeparate || !usdWillRender) {
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: 0, Ref: `${q(MAIN_SHEET)}!$${cupCoords.ventasHeaderRow + 1}:$${cupCoords.ventasHeaderRow + 1}` });
  }
  if (wsUsd && usdCoordsSep) {
    workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: usdSheetIdx, Ref: `${q(USD_SHEET)}!$A$1:$E$${usdSheetLastRow}` });
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: usdSheetIdx, Ref: `${q(USD_SHEET)}!$${usdCoordsSep.ventasHeaderRow + 1}:$${usdCoordsSep.ventasHeaderRow + 1}` });
  }
  if (wsOt) {
    workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: otSheetIdx, Ref: `${q(OT_SHEET)}!$A$1:$F$${otLastRow}` });
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: otSheetIdx, Ref: `${q(OT_SHEET)}!$5:$5` });
  }
  workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: notaSheetIdx, Ref: `${q(NOTA_SHEET)}!$A$1:$B$${notaLastRow}` });
  (wb as unknown as { Workbook?: Record<string, unknown> }).Workbook!.Names = workbookNames;

  // ── Nombre de archivo descriptivo (misión §6), sin caracteres inválidos ──
  const snFile = sn.replace(/[^a-zA-Z0-9]+/g, '_');
  const filename = `COSTPRO_Reporte_Entrega_${snFile}_${startDate}.xlsx`
    .replace(/[^a-zA-Z0-9._\-]+/g, '_');

  // Congelado/impresión por hoja (lo consume buildCashReportExcelBlob):
  // principal/USD: identidad congelada + A4 horizontal + pie con numeración.
  const sheetFeatures: CashReportExcelResult['sheetFeatures'] = [
    { freezeAfterRow: mainFreezeAfterRow, orientation: 'landscape', headerTitle: `Reporte de Entrega — ${sn}` },
    wsUsd
      ? { freezeAfterRow: usdIdentityRows, orientation: 'landscape', headerTitle: `Reporte de Entrega USD — ${sn}` }
      : undefined,
    wsOt
      ? { freezeAfterRow: 5, orientation: 'landscape', headerTitle: `Órdenes de Trabajo — ${sn}` }
      : undefined,
    { orientation: 'portrait', headerTitle: 'Nota metodológica' },
  ];

  return { wb, filename, sheetFeatures };
}

// ── Materialización de una hoja (estilos + fórmulas + formato) ──────────────
function materialize(
  XLSX: XLSXModule,
  s: SheetCtx,
  cols: Array<{ wch: number }>,
  opts: { autofilter?: string },
): WorkSheetLike {
  const ws = XLSX.utils.aoa_to_sheet(s.aoa);
  for (const r of s.sectionRows) {
    styleCell(ws, XLSX, r, 0, { bold: true, sz: 11, fill: C_SECTION_FILL, top: true });
    for (let c = 1; c <= s.lastCol; c += 1) styleCell(ws, XLSX, r, c, { fill: C_SECTION_FILL, top: true });
  }
  for (const r of s.headerRows) {
    for (let c = 0; c <= s.lastCol; c += 1) {
      styleCell(ws, XLSX, r, c, { bold: true, fill: C_HEADER_FILL, right: c >= 2, top: true });
    }
  }
  for (const m of s.moneyCells) {
    const isTotal = s.totalRows.includes(m.r);
    styleCell(ws, XLSX, m.r, m.c, {
      bold: isTotal, right: true, z: MONEY_ZFMT,
      fill: isTotal ? C_TOTAL_FILL : undefined, top: isTotal,
    });
  }
  for (const qc of s.qtyCells) styleCell(ws, XLSX, qc.r, qc.c, { right: true, z: QTY_ZFMT });
  for (const cc of s.countCells) styleCell(ws, XLSX, cc.r, cc.c, { right: true, z: COUNT_ZFMT });
  for (const u of s.underlineCells) styleCell(ws, XLSX, u.r, u.c, { bottom: true });
  styleCell(ws, XLSX, 0, 0, { bold: true, sz: 14, fill: C_SECTION_FILL });
  attachFormulas(ws, XLSX, s.formulas);
  ws['!cols'] = cols;
  ws['!merges'] = s.merges;
  ws['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  if (opts.autofilter) ws['!autofilter'] = { ref: opts.autofilter };
  return ws;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESO (JSZip): pane de congelado + configuración de impresión +
// encabezado/pie con numeración + CalcPr. xlsx-js-style no escribe estas
// piezas; se inyectan en el XML ANTES de descargar. JSZip ya es dependencia
// directa del stack.
// ═══════════════════════════════════════════════════════════════════════════

export interface SheetPrint {
  /** Filas congeladas (ySplit) — el bloque de identidad queda visible. */
  freezeAfterRow?: number;
  /** Orientación del papel (hojas con tabla: horizontal; nota: vertical). */
  orientation?: 'portrait' | 'landscape';
  /** Título del encabezado de impresión (el pie lleva la numeración &P/&N). */
  headerTitle?: string;
}

/** Escapa un texto para incrustarlo en un atributo/elemento XML. */
function escapeXmlText(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  const orientation = feat.orientation ?? 'landscape';
  if (orientation) {
    // fitToPage: <sheetPr> debe preceder a <dimension>
    if (!out.includes('<sheetPr')) {
      out = out.replace(/(<worksheet[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
    }
    // A4 (paperSize 9) + ajuste al ancho de UNA página; el largo fluye a
    // varias páginas (fitToHeight 0 = sin límite vertical) — E3.
    const ps = `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>`;
    // Encabezado (título centrado en negrita) y pie con numeración de páginas.
    // Códigos de formato: &C centra · &B negrita · &P página · &N total.
    const hf = feat.headerTitle
      ? `<headerFooter><oddHeader>&amp;C&amp;B${escapeXmlText(feat.headerTitle)}</oddHeader><oddFooter>&amp;C Página &amp;P de &amp;N</oddFooter></headerFooter>`
      : `<headerFooter><oddFooter>&amp;C Página &amp;P de &amp;N</oddFooter></headerFooter>`;
    if (out.includes('<pageSetup')) {
      out = out.replace(/(<pageSetup[^>]*\/>)/, `$1${hf}`);
    } else if (out.includes('<pageMargins')) {
      out = out.replace(/(<pageMargins[^>]*\/>)/, `$1${ps}${hf}`);
    } else {
      out = out.replace(/<\/sheetData>/, `</sheetData>${ps}${hf}`);
    }
  }
  return out;
}

/**
 * MISIÓN 2026-10-22 (Parte D) — LA CORRECCIÓN DE LA CORRUPCIÓN:
 * inyecta <calcPr> SIEMPRE en posición válida del esquema CT_Workbook
 * (ECMA-376 §18.2.10): … <sheets> → <functionGroups>? → <externalReferences>?
 * → <definedNames>? → <calcPr>? … ⇒ calcPr va TRAS </definedNames> cuando
 * existen (Print_Titles/Print_Area/_FilterDatabase los generan), y solo tras
 * </sheets> en su ausencia. El código anterior usaba el regex alternado
 * /(<\/definedNames>|<\/sheets>)/ que empareja </sheets> PRIMERO (va antes
 * en el documento) ⇒ calcPr ANTES de <definedNames> ⇒ orden inválido ⇒
 * Excel de escritorio declara el archivo dañado.
 */
export function injectCalcPrInWorkbookXml(wbXml: string): string {
  if (wbXml.includes('<calcPr')) return wbXml;
  const calc = '<calcPr fullCalcOnLoad="1" calcId="191029"/>';
  if (wbXml.includes('</definedNames>')) return wbXml.replace('</definedNames>', `</definedNames>${calc}`);
  if (wbXml.includes('<definedNames/>')) return wbXml.replace('<definedNames/>', `<definedNames/>${calc}`);
  return wbXml.replace('</sheets>', `</sheets>${calc}`);
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
  // CalcPr, se inyecta en el XML del workbook en posición de esquema válida.
  const wbPath = 'xl/workbook.xml';
  const wbFile = zip.file(wbPath);
  if (wbFile) {
    const wbXml = await wbFile.async('string');
    zip.file(wbPath, injectCalcPrInWorkbookXml(wbXml));
  }
  const out = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return out as unknown as ArrayBuffer;
}

/**
 * Construye el .xlsx final (estilos + pane congelado + impresión + CalcPr) y
 * devuelve el Blob listo para descargar. Sin efectos contables: consume el
 * reporte ya aplicado (misma fuente que el PDF).
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
