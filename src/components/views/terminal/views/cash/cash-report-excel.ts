/**
 * cash-report-excel.ts — Exportación Excel (.xlsx) del Reporte de Entrega.
 *
 * MISIÓN 2026-10-23 — DOS SECCIONES SEPARABLES + IMPRESIÓN VERTICAL + B/N:
 *  · ESTRUCTURA ESPEJO DEL PDF (§5): cada hoja de moneda contiene
 *    SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (identidad + resumen del día
 *    + efectivo esperado + desglose por denominaciones + contado + cuadre +
 *    firmas), un SEPARADOR FÍSICO (línea de corte visible al imprimir con
 *    aire a ambos lados) y SECCIÓN 2 — DETALLE DE VENTAS (encabezado
 *    repetido con tienda/título/período + tabla + TOTALES =SUM + firmas).
 *    Salto de página MANUAL antes de la sección 2: cada sección se imprime
 *    como unidad — sin divisiones accidentales de encabezados o firmas.
 *  · IMPRESIÓN VERTICAL (§5 obligatorio): A4 RETRATO en TODAS las hojas de
 *    datos, fitToWidth=1/fitToHeight=0 (el largo fluye a varias páginas
 *    legibles), área de impresión delimitada, repetición del encabezado de
 *    la tabla de ventas (Print_Titles), encabezado/pie con numeración &P/&N.
 *  · DISEÑO BLANCO Y NEGRO (impresoras monocromáticas): fondo blanco, texto
 *    negro, líneas finas negras/grises; encabezados diferenciados por
 *    NEGRITA + TAMAÑO + BORDES (no por color); totales con borde superior
 *    doble (convención contable); importes a la derecha con formato real.
 *
 * Heredado de misiones anteriores:
 *  · D (2026-10-22) — REPARACIÓN DEL ARCHIVO DAÑADO. Causa raíz demostrada
 *    (reproducción forense del binario): el post-proceso JSZip inyectaba
 *    <calcPr> entre </sheets> y <definedNames> — el regex alternado empareja
 *    </sheets> PRIMERO porque en el XML va antes. El esquema CT_Workbook
 *    (ECMA-376 §18.2.10) exige … sheets → definedNames → calcPr …, de modo
 *    que Excel de escritorio rechaza el orden y declara el archivo dañado.
 *    Fix: inyección SIEMPRE tras </definedNames> cuando existe.
 *  · OPCIONES DEL DOCUMENTO respetadas (misma fuente que pantalla y PDF):
 *    includeCashBreakdown, includeBreakdown, includeUsd, usdSeparatePage,
 *    includeSignature, includeOtReport, includeCommissionColumn.
 *  · FIDELIDAD CONTABLE: mismas fuentes y parámetros que el PDF
 *    (fetchDiarioSummaries + computeDailySummary + salesTableColumns/Items/
 *    Qty + fetchSuggestedCommissionsByProduct); totales NÚMEROS con fórmulas
 *    REALES (=SUM, =A*C, cuadre); CUP y USD JAMÁS se suman entre sí;
 *    fullCalcOnLoad recalcula al abrir.
 *  · SEGURIDAD (B5): sanitizeExcelText prefija ' sobre = + - @ \t \r; la
 *    exportación es de solo lectura; nombre de archivo descriptivo.
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

/** Texto negro y líneas neutras — diseño B/N estricto (misión §5):
 *  fondo blanco (sin rellenos), encabezados por negrita+tamaño+bordes. */
const C_TEXT_BLACK = '000000';
const C_LINE_GRAY = '808080';   // líneas finas de tablas
const C_LINE_BLACK = '000000'; // énfasis (encabezados/totales/línea de corte)

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
  /** Grosor/estilo de línea para top/bottom ('thin' | 'double' — B/N). */
  borderStyle?: 'thin' | 'double';
  /** Color de línea (default gris neutro; negro para énfasis). */
  borderColor?: string;
}

function styleCell(ws: WorkSheetLike, XLSX: XLSXModule, r: number, c: number, st: CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as (Record<string, unknown> | undefined);
  if (!cell) return;
  const lineStyle = st.borderStyle ?? 'thin';
  const lineColor = st.borderColor ?? C_LINE_GRAY;
  const border: Record<string, { style: string; color: { rgb: string } }> = {};
  if (st.top) border.top = { style: lineStyle, color: { rgb: lineColor } };
  if (st.bottom) border.bottom = { style: lineStyle, color: { rgb: lineColor } };
  cell.s = {
    font: { bold: st.bold === true, sz: st.sz, italic: st.italic, color: { rgb: C_TEXT_BLACK } },
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
        { label: 'Resumen del día (efectivo + transferencia)', amount: s.ventasTotales, kind: 'total' },
        { label: 'Ventas en efectivo', amount: s.ventasCash, kind: 'normal' },
        { label: 'Ventas por transferencia', amount: s.ventasTransfer, kind: 'normal' },
      ]
    : [
        { label: 'Resumen del día (efectivo + Zelle)', amount: s.ventasTotales, kind: 'total' },
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
  sectionRows: number[];   // filas de título de sección (merged + negrita + bordes)
  headerRows: number[];    // filas de encabezado de tabla
  totalRows: number[];     // filas de totales (negrita + borde superior doble)
  moneyCells: Array<{ r: number; c: number }>;
  qtyCells: Array<{ r: number; c: number }>;
  countCells: Array<{ r: number; c: number }>;
  underlineCells: Array<{ r: number; c: number }>; // líneas de firma
  /** Línea de corte físico entre secciones (borde inferior negro en toda la fila). */
  cutLineRows: number[];
  /** Filas de título del documento (tienda — Reporte de Venta X): negrita grande. */
  docTitleRows: number[];
  /** Filas de identidad (Tienda|Período / Dirección|Generado): negrita suave. */
  identityRows: number[];
  formulas: FormulaRef[];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  lastCol: number;         // índice 0-based de la última columna (5 = F)
}

function newSheetCtx(lastCol: number): SheetCtx {
  return {
    aoa: [], sectionRows: [], headerRows: [], totalRows: [],
    moneyCells: [], qtyCells: [], countCells: [], underlineCells: [], cutLineRows: [],
    docTitleRows: [], identityRows: [], formulas: [], merges: [], lastCol,
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

/** Coordenadas de la tabla de ventas (SECCIÓN 2) dentro de su hoja. */
interface VentasCoords {
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

  // ── Identidad del documento (tienda + título + período completo) ──
  // MISIÓN 2026-10-23 (§5): se imprime al inicio de la SECCIÓN 1 y se REPITE
  // al inicio de la SECCIÓN 2 — cada sección es identificable por sí misma
  // al separarse físicamente. El período usa '→' literal (Excel es UTF-8:
  // la flecha SÍ se renderiza aquí, a diferencia del PDF WinAnsi).
  const renderIdentity = (s: SheetCtx, currency: 'CUP' | 'USD', withTitle: boolean) => {
    if (withTitle) {
      s.aoa.push([sanitizeExcelText(`${sn} — Reporte de Venta ${currency}`)]);
      const r = s.aoa.length - 1;
      s.docTitleRows.push(r);
      s.merges.push({ s: { r, c: 0 }, e: { r, c: s.lastCol } });
    }
    s.aoa.push(['Tienda:', sanitizeExcelText(sn), '', 'Período:', periodoLbl]);
    const r1 = s.aoa.length - 1;
    s.identityRows.push(r1);
    s.merges.push({ s: { r: r1, c: 1 }, e: { r: r1, c: 2 } });
    if (s.lastCol > 4) s.merges.push({ s: { r: r1, c: 4 }, e: { r: r1, c: s.lastCol } });
    s.aoa.push(['Dirección:', sanitizeExcelText(String(storeInfo?.address || '')), '', 'Generado:', generatedAt]);
    const r2 = s.aoa.length - 1;
    s.identityRows.push(r2);
    s.merges.push({ s: { r: r2, c: 1 }, e: { r: r2, c: 2 } });
    if (s.lastCol > 4) s.merges.push({ s: { r: r2, c: 4 }, e: { r: r2, c: s.lastCol } });
    s.aoa.push([]);
  };

  // ── SEPARADOR FÍSICO entre secciones (§5): línea de corte al imprimir ──
  // Fila vacía + fila con borde inferior negro en TODAS las columnas + fila
  // vacía: aire prudente a ambos lados, imposible de confundir con los
  // bordes de las tablas (que son grises y parciales). Las celdas de la fila
  // de corte llevan un ESPACIO (no cadena vacía): aoa_to_sheet no materializa
  // celdas vacías y sin celda no hay borde que dibujar.
  const renderCutLine = (s: SheetCtx) => {
    s.aoa.push([]);
    s.aoa.push(new Array<CellValue>(s.lastCol + 1).fill(' '));
    const lineRow = s.aoa.length - 1;
    s.cutLineRows.push(lineRow);
    s.aoa.push([]);
  };

  // ── SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (comprobante standalone) ──
  const renderSection1 = (
    s: SheetCtx,
    currency: 'CUP' | 'USD',
    summary: DailySummary,
    denoms: number[],
    breakdown: Breakdown,
  ): { esperadoRow: number } => {
    const rowsByLabel = new Map<string, number>();

    // ══ RESUMEN DEL DÍA (mismas filas condicionales que el PDF §4) ══
    pushSectionTitle(s, `SECCIÓN 1 — RESUMEN Y ENTREGA DE EFECTIVO (${currency})`);
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
    if (showDesglose) {
      pushSectionTitle(s, `DESGLOSE DE EFECTIVO — ${currency}`, 'Conteo físico por denominaciones');
      const set = new Set<number>([...denoms, ...Object.keys(breakdown).map(Number)]);
      const ordered = [...set].sort((a, b) => b - a);
      const counted = ordered.filter(d => Number(breakdown[d] || 0) > 0);
      let contadoRow = -1;
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
      const cuadreRow = s.aoa.length - 1;
      s.merges.push({ s: { r: cuadreRow, c: 0 }, e: { r: cuadreRow, c: 2 } });
      s.moneyCells.push({ r: cuadreRow, c: 3 });
      s.formulas.push({ r: cuadreRow, c: 3, f: `D${contadoRow + 1}-D${esperadoRow + 1}` });
      s.aoa.push([]);
    }

    return { esperadoRow };
  };

  // ── SECCIÓN 2 — DETALLE DE VENTAS (encabezado repetido + tabla) ──
  const renderSection2 = (s: SheetCtx, currency: 'CUP' | 'USD'): VentasCoords => {
    pushSectionTitle(s, `SECCIÓN 2 — DETALLE DE VENTAS (${currency})`);
    // Encabezado repetido: la sección es identificable por sí misma (§5).
    renderIdentity(s, currency, false);

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
      // Sin asterisco de incidencia (feedback 2026-10-22): la tabla queda
      // limpia — sin nota al pie — y los importes cobrados son los reales.
      const desc = String(it.product_name || '');
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
    // Estilo de la fila TOTALES: entra en qty/moneyCells → negrita + formato
    // real + fila visualmente distinguida (borde superior doble — B/N).
    s.qtyCells.push({ r: ventasTotRow, c: 2 });
    s.moneyCells.push({ r: ventasTotRow, c: 3 });
    s.moneyCells.push({ r: ventasTotRow, c: 4 });
    if (includeCommission) s.moneyCells.push({ r: ventasTotRow, c: 5 });
    // TOTALES como fórmulas reales =SUM (misma columna que los datos)
    s.formulas.push({ r: ventasTotRow, c: 2, f: `SUM(C${ventasFirstDataRow + 1}:C${ventasLastDataRow + 1})` });
    s.formulas.push({ r: ventasTotRow, c: 3, f: `SUM(D${ventasFirstDataRow + 1}:D${ventasLastDataRow + 1})` });
    s.formulas.push({ r: ventasTotRow, c: 4, f: `SUM(E${ventasFirstDataRow + 1}:E${ventasLastDataRow + 1})` });
    if (includeCommission) s.formulas.push({ r: ventasTotRow, c: 5, f: `SUM(F${ventasFirstDataRow + 1}:F${ventasLastDataRow + 1})` });
    s.aoa.push([]);

    return { ventasHeaderRow, ventasFirstDataRow, ventasLastDataRow, ventasTotRow };
  };

  // ── Reporte completo de una moneda en DOS secciones separables ──
  // (identidad + sección 1 + firmas + línea de corte + sección 2 + firmas).
  // Devuelve la fila 0-based donde ARRANCA la sección 2 (para el salto de
  // página manual: cada sección se imprime como unidad independiente).
  const renderCurrencySheet = (
    s: SheetCtx,
    currency: 'CUP' | 'USD',
    summary: DailySummary,
    denoms: number[],
    breakdown: Breakdown,
  ): { section2StartRow: number; ventasHeaderRow: number } => {
    renderIdentity(s, currency, true);
    renderSection1(s, currency, summary, denoms, breakdown);
    if (showFirmas) renderFirmas(s);
    // La línea de corte cierra la sección 1 (línea negra al imprimir).
    renderCutLine(s);
    // El salto de página manual abre la sección 2 en página nueva (brk sobre
    // la fila del banner SECCIÓN 2 — se inyecta vía patchSheetXml).
    const section2StartRow = s.aoa.length; // 0-based fila del banner SECCIÓN 2
    const coords = renderSection2(s, currency);
    if (showFirmas) renderFirmas(s);
    return { section2StartRow, ventasHeaderRow: coords.ventasHeaderRow };
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

  // ═══════════════ HOJA 1 · «Reporte Entrega» (CUP en dos secciones) ═══════════════
  const main = newSheetCtx(5); // A..F
  const cupBreaks = renderCurrencySheet(main, 'CUP', cupSummary, cupDenoms, cupBreakdown);
  const mainRowBreaks = [cupBreaks.section2StartRow];
  const cupVentasHeaderRow = cupBreaks.ventasHeaderRow;
  // Modo compacto (§9, «USD en hoja separada» OFF): el reporte USD fluye en
  // la MISMA hoja tras el CUP (aire de separación entre ambos reportes; cada
  // bloque trae sus totales y ninguno se repite entre hojas).
  if (usdWillRender && !usdSeparate) {
    main.aoa.push([]); main.aoa.push([]);
    const usdBreaks = renderCurrencySheet(main, 'USD', usdSummary, usdDenoms, usdBreakdown);
    mainRowBreaks.push(usdBreaks.section2StartRow);
  }

  // Anchos calibrados para A4 VERTICAL con fitToWidth=1 (escala ≈ 90% — el
  // texto queda legible, sin reducción excesiva).
  const mainCols = includeCommissionCup
    ? [{ wch: 15 }, { wch: 42 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 13 }]
    : [{ wch: 15 }, { wch: 46 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 11 }];
  const wsMain = materialize(XLSX, main, mainCols, {});

  // ═══════════════ HOJA «Reporte Entrega USD» (si separada) ═══════════════
  let wsUsd: WorkSheetLike | null = null;
  let usdRowBreaks: number[] = [];
  let usdSheetLastRow = 0;
  let usdVentasHeaderRow = 0;
  if (usdWillRender && usdSeparate) {
    const usd = newSheetCtx(4); // A..E (la tabla USD no lleva Comisión)
    const usdBreaks = renderCurrencySheet(usd, 'USD', usdSummary, usdDenoms, usdBreakdown);
    usdRowBreaks = [usdBreaks.section2StartRow];
    usdVentasHeaderRow = usdBreaks.ventasHeaderRow;
    usdSheetLastRow = usd.aoa.length;
    wsUsd = materialize(XLSX, usd, [{ wch: 15 }, { wch: 46 }, { wch: 8 }, { wch: 16 }, { wch: 15 }], {});
  }

  // ═══════════════ HOJA «Órdenes de Trabajo» (§8.1 conmutable) ═══════════════
  // MISIÓN 2026-10-23 (§7): listado OPERATIVO — la API ahora filtra por
  // fecha y estado (status_group=operative): órdenes ABIERTAS del período;
  // las cerradas/completadas/anuladas no se listan (histórico conservado).
  const orders = (productionOrders as any[]) || [];
  let wsOt: WorkSheetLike | null = null;
  let otLastRow = 0;
  let otHeaderRow0 = 4;
  if (showOt) {
    const ot = newSheetCtx(5);
    ot.docTitleRows.push(0);
    ot.aoa.push(['REPORTE DE ÓRDENES DE TRABAJO']);
    ot.merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
    ot.identityRows.push(1);
    ot.aoa.push(['Tienda:', sanitizeExcelText(sn), '', 'Período:', periodoLbl]);
    ot.merges.push({ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } });
    ot.merges.push({ s: { r: 1, c: 4 }, e: { r: 1, c: 5 } });
    ot.aoa.push(['Órdenes abiertas del período (pendientes de gestión). Las cerradas, completadas o anuladas no se listan.']);
    ot.merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } });
    ot.aoa.push([]);
    ot.aoa.push(['Código', 'Clasificación', 'Descripción', 'Cantidad', 'CUP', 'USD']);
    otHeaderRow0 = ot.aoa.length - 1;
    ot.headerRows.push(otHeaderRow0);
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
    if (orders.length === 0) ot.aoa.push(['', '', 'Sin órdenes abiertas en el período']);
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
    wsOt = materialize(XLSX, ot, [{ wch: 13 }, { wch: 13 }, { wch: 44 }, { wch: 10 }, { wch: 14 }, { wch: 12 }], {});
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
    ['Estructura:', 'Hoja «Reporte Entrega» espejo del PDF (identidad compacta + resumen + desglose + ventas + firmas). Con «USD en hoja separada» activo, el detalle USD vive en su propia hoja con título, tienda y período; desactivado, corre en la hoja principal sin duplicar totales.'],
    ['Fuente de datos:', 'Mismo origen que el PDF: /api/cash-report (RPC get_cash_report v2.23.0) + items-summary + payment-totals + commissions-summary + production-orders.'],
    ['Fórmulas de Excel:', 'Los totales llevan fórmulas REALES (=SUM, =A*C, cuadre) referenciando las celdas de detalle; el valor mostrado al generar es el calculado por el sistema (computeDailySummary) y Excel recalcula al abrir el libro (fullCalcOnLoad). Editar una celda de detalle recalcula los totales en vivo.'],
    ['Comprobaciones:', 'La coincidencia tabla↔resumen es verificable en vivo: los TOTALES son =SUM de las filas de detalle y el resumen usa la fórmula central por moneda — cualquier divergencia se ve al editar.'],
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
  // Print_Titles = fila de encabezado de la TABLA DE VENTAS (sección 2): se
  // repite en las páginas de continuación del detalle. SOLO en hojas de una
  // tabla de ventas: en modo compacto (CUP+USD en la misma hoja) no se repite
  // el encabezado CUP sobre filas USD.
  const workbookNames: Array<{ Name: string; Sheet: number; Ref: string }> = [];
  const q = (sheet: string) => (sheet.includes(' ') ? `'${sheet}'` : sheet);
  const mainLastRow = main.aoa.length;
  workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: 0, Ref: `${q(MAIN_SHEET)}!$A$1:$F$${mainLastRow}` });
  if (usdSeparate || !usdWillRender) {
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: 0, Ref: `${q(MAIN_SHEET)}!$${cupVentasHeaderRow + 1}:$${cupVentasHeaderRow + 1}` });
  }
  if (wsUsd) {
    workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: usdSheetIdx, Ref: `${q(USD_SHEET)}!$A$1:$E$${usdSheetLastRow}` });
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: usdSheetIdx, Ref: `${q(USD_SHEET)}!$${usdVentasHeaderRow + 1}:$${usdVentasHeaderRow + 1}` });
  }
  if (wsOt) {
    workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: otSheetIdx, Ref: `${q(OT_SHEET)}!$A$1:$F$${otLastRow}` });
    workbookNames.push({ Name: '_xlnm.Print_Titles', Sheet: otSheetIdx, Ref: `${q(OT_SHEET)}!$${otHeaderRow0 + 1}:$${otHeaderRow0 + 1}` });
  }
  workbookNames.push({ Name: '_xlnm.Print_Area', Sheet: notaSheetIdx, Ref: `${q(NOTA_SHEET)}!$A$1:$B$${notaLastRow}` });
  (wb as unknown as { Workbook?: Record<string, unknown> }).Workbook!.Names = workbookNames;

  // ── Nombre de archivo descriptivo (misión §6), sin caracteres inválidos ──
  const snFile = sn.replace(/[^a-zA-Z0-9]+/g, '_');
  const filename = `COSTPRO_Reporte_Entrega_${snFile}_${startDate}.xlsx`
    .replace(/[^a-zA-Z0-9._\-]+/g, '_');

  // Impresión por hoja (lo consume buildCashReportExcelBlob):
  // MISIÓN 2026-10-23 (§5): A4 VERTICAL (retrato) en TODAS las hojas + pie con
  // numeración + SALTOS DE PÁGINA MANUALES antes de cada sección 2 (cada
  // sección se imprime como unidad — sin división accidental). SIN paneles
  // congelados (feedback del propietario 2026-10-22).
  const sheetFeatures: CashReportExcelResult['sheetFeatures'] = [
    { orientation: 'portrait', headerTitle: `Reporte de Entrega — ${sn}`, rowBreaks: mainRowBreaks },
    wsUsd
      ? { orientation: 'portrait', headerTitle: `Reporte de Entrega USD — ${sn}`, rowBreaks: usdRowBreaks }
      : undefined,
    wsOt
      ? { orientation: 'portrait', headerTitle: `Órdenes de Trabajo — ${sn}` }
      : undefined,
    { orientation: 'portrait', headerTitle: 'Nota metodológica' },
  ];

  return { wb, filename, sheetFeatures };
}

// ── Materialización de una hoja (estilos B/N + fórmulas + formato) ──────────
function materialize(
  XLSX: XLSXModule,
  s: SheetCtx,
  cols: Array<{ wch: number }>,
  opts: { autofilter?: string },
): WorkSheetLike {
  const ws = XLSX.utils.aoa_to_sheet(s.aoa);
  // Títulos de sección (B/N): negrita + cuerpo mayor + doble filete arriba/abajo
  // — SIN rellenos (misión §5: encabezados por negrita+tamaño+bordes).
  for (const r of s.sectionRows) {
    styleCell(ws, XLSX, r, 0, { bold: true, sz: 11, top: true, bottom: true, borderColor: C_LINE_BLACK });
    for (let c = 1; c <= s.lastCol; c += 1) styleCell(ws, XLSX, r, c, { top: true, bottom: true, borderColor: C_LINE_BLACK });
  }
  // Encabezados de tabla (B/N): negrita + filete superior negro + inferior gris.
  for (const r of s.headerRows) {
    for (let c = 0; c <= s.lastCol; c += 1) {
      styleCell(ws, XLSX, r, c, { bold: true, right: c >= 2, top: true, bottom: true, borderColor: C_LINE_BLACK });
    }
  }
  // Importes: alineados a la derecha con formato real; los totales llevan
  // borde superior DOBLE (convención contable B/N) + negrita.
  for (const m of s.moneyCells) {
    const isTotal = s.totalRows.includes(m.r);
    styleCell(ws, XLSX, m.r, m.c, {
      bold: isTotal, right: true, z: MONEY_ZFMT,
      top: isTotal, borderStyle: isTotal ? 'double' : 'thin', borderColor: isTotal ? C_LINE_BLACK : C_LINE_GRAY,
    });
  }
  for (const qc of s.qtyCells) {
    const isTotal = s.totalRows.includes(qc.r);
    styleCell(ws, XLSX, qc.r, qc.c, { bold: isTotal, right: true, z: QTY_ZFMT, top: isTotal && qc.c === 2, borderStyle: isTotal ? 'double' : 'thin', borderColor: isTotal ? C_LINE_BLACK : C_LINE_GRAY });
  }
  for (const cc of s.countCells) styleCell(ws, XLSX, cc.r, cc.c, { right: true, z: COUNT_ZFMT });
  for (const u of s.underlineCells) styleCell(ws, XLSX, u.r, u.c, { bottom: true, borderColor: C_LINE_BLACK });
  // Etiqueta (columna A) de las filas de totales: negrita con borde superior
  // doble — la fila completa se distingue como total (B/N, sin rellenos).
  for (const r of s.totalRows) styleCell(ws, XLSX, r, 0, { bold: true, top: true, borderStyle: 'double', borderColor: C_LINE_BLACK });
  // Título del documento (tienda — Reporte de Venta X): negrita grande.
  for (const r of s.docTitleRows) styleCell(ws, XLSX, r, 0, { bold: true, sz: 13 });
  // Identidad (Tienda/Período/Dirección/Generado): etiquetas en negrita.
  for (const r of s.identityRows) {
    styleCell(ws, XLSX, r, 0, { bold: true });
    styleCell(ws, XLSX, r, 3, { bold: true });
  }
  // LÍNEA DE CORTE físico (§5): borde inferior NEGRO grueso en TODAS las
  // columnas de la fila — claramente visible al imprimir, con aire a ambos
  // lados (las filas vacías alrededor la separan de tablas y firmas).
  for (const r of s.cutLineRows) {
    for (let c = 0; c <= s.lastCol; c += 1) {
      styleCell(ws, XLSX, r, c, { bottom: true, borderStyle: 'double', borderColor: C_LINE_BLACK });
    }
  }
  attachFormulas(ws, XLSX, s.formulas);
  ws['!cols'] = cols;
  ws['!merges'] = s.merges;
  ws['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  if (opts.autofilter) ws['!autofilter'] = { ref: opts.autofilter };
  return ws;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESO (JSZip): configuración de impresión + encabezado/pie con
// numeración + CalcPr. xlsx-js-style no escribe estas piezas; se inyectan
// en el XML ANTES de descargar. JSZip ya es dependencia directa del stack.
// ═══════════════════════════════════════════════════════════════════════════

export interface SheetPrint {
  /** Orientación del papel — MISIÓN 2026-10-23 (§5): VERTICAL en todas. */
  orientation?: 'portrait' | 'landscape';
  /** Título del encabezado de impresión (el pie lleva la numeración &P/&N). */
  headerTitle?: string;
  /** Filas 0-based sobre las que se fuerza SALTO DE PÁGINA MANUAL (brk):
  *  cada sección del reporte se imprime como unidad independiente. */
  rowBreaks?: number[];
}

/** Escapa un texto para incrustarlo en un atributo/elemento XML. */
function escapeXmlText(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function patchSheetXml(xml: string, feat: SheetPrint): string {
  let out = xml;
  const orientation = feat.orientation ?? 'portrait';
  if (orientation) {
    // fitToPage: <sheetPr> debe preceder a <dimension>
    if (!out.includes('<sheetPr')) {
      out = out.replace(/(<worksheet[^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
    }
    // A4 (paperSize 9) + ajuste al ancho de UNA página; el largo fluye a
    // varias páginas (fitToHeight 0 = sin límite vertical) — E3/§5 vertical.
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
  // SALTOS DE PÁGINA MANUALES (misión §5): cada sección se imprime como
  // unidad — la sección 2 (detalle de ventas) abre página propia. OOXML:
  // <brk id="N"/> dentro de <rowBreaks> corta ENCIMA de la fila N (0-based).
  // Posición válida del esquema: rowBreaks va tras headerFooter/pageSetup.
  if (feat.rowBreaks && feat.rowBreaks.length > 0) {
    const brks = feat.rowBreaks
      .map((r) => `<brk id="${r}" max="16383" man="1"/>`)
      .join('');
    const rb = `<rowBreaks count="${feat.rowBreaks.length}" manualBreakCount="${feat.rowBreaks.length}">${brks}</rowBreaks>`;
    if (out.includes('</headerFooter>')) {
      out = out.replace('</headerFooter>', `</headerFooter>${rb}`);
    } else if (out.includes('<pageSetup')) {
      out = out.replace(/(<pageSetup[^>]*\/>)/, `$1${rb}`);
    } else {
      out = out.replace(/<\/sheetData>/, `</sheetData>${rb}`);
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
