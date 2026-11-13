/**
 * CP-FIN · Vista B — Estados Financieros: exportación PDF/Excel client-side.
 *
 * Patrones del repo:
 *  · PDF: createPDFDocument() de '@/lib/export/lazy-pdf' (import dinámico de
 *    jspdf — el chunk solo se descarga al exportar) + autoTable dinámico,
 *    igual que cash-report-pdf.ts / sales-history-pdf.ts.
 *  · Excel: import dinámico de '@e965/xlsx' con números reales por celda
 *    (formato #,##0.00), igual que ipv-ventas-excel.ts.
 *
 * El contenido es ESPEJO de la pantalla: misma jerarquía, mismos importes con
 * signo (ver computeIncomePresentation en types.ts para la convención del
 * Estado de Rendimiento). Pie: «Generado por COSTPRO» + fecha en cada página.
 */
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { formatCurrency } from '@/lib/utils';
import {
  computeIncomePresentation,
  type BalanceSheetData,
  type BalanceCategoryRow,
  type IncomeStatementData,
} from './types';

// ── Filas jerárquicas compartidas por PDF y Excel ───────────────────────────

export type StatementRowKind = 'section' | 'subsection' | 'row' | 'subtotal' | 'total';

export interface StatementRow {
  label: string;
  value: number | null;
  kind: StatementRowKind;
}

const sum = (rows: BalanceCategoryRow[]): number =>
  rows.reduce((acc, r) => acc + (r.saldo ?? 0), 0);

/** Jerarquía del Estado de Situación (ACTIVOS → PASIVOS → PATRIMONIO). */
export function buildBalanceRows(data: BalanceSheetData): StatementRow[] {
  const cats = data.categorias ?? [];
  const byGroup = (clase: string, grupo: string) =>
    cats.filter((c) => c.clase === clase && c.grupo === grupo);
  const rows: StatementRow[] = [];

  rows.push({ label: 'ACTIVOS', value: null, kind: 'section' });
  const actCorr = byGroup('activo', 'activo_corriente');
  if (actCorr.length) {
    rows.push({ label: 'Activo corriente', value: null, kind: 'subsection' });
    actCorr.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
    rows.push({ label: 'Total activo corriente', value: sum(actCorr), kind: 'subtotal' });
  }
  const actNoCorr = byGroup('activo', 'activo_no_corriente');
  if (actNoCorr.length) {
    rows.push({ label: 'Activo no corriente', value: null, kind: 'subsection' });
    actNoCorr.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
    rows.push({ label: 'Total activo no corriente', value: sum(actNoCorr), kind: 'subtotal' });
  }
  rows.push({ label: 'TOTAL ACTIVOS', value: data.total_activos, kind: 'total' });

  rows.push({ label: 'PASIVOS', value: null, kind: 'section' });
  const pasCorr = byGroup('pasivo', 'pasivo_corriente');
  if (pasCorr.length) {
    rows.push({ label: 'Pasivo corriente', value: null, kind: 'subsection' });
    pasCorr.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
    rows.push({ label: 'Total pasivo corriente', value: sum(pasCorr), kind: 'subtotal' });
  }
  const pasNoCorr = byGroup('pasivo', 'pasivo_no_corriente');
  if (pasNoCorr.length) {
    rows.push({ label: 'Pasivo no corriente', value: null, kind: 'subsection' });
    pasNoCorr.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
    rows.push({ label: 'Total pasivo no corriente', value: sum(pasNoCorr), kind: 'subtotal' });
  }
  rows.push({ label: 'TOTAL PASIVOS', value: data.total_pasivos, kind: 'total' });

  rows.push({ label: 'PATRIMONIO', value: null, kind: 'section' });
  const patrimonio = byGroup('patrimonio', 'patrimonio');
  patrimonio.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
  rows.push({
    label: 'Resultado del período (ingresos − gastos)',
    value: data.resultado_acumulado,
    kind: 'row',
  });
  rows.push({ label: 'PATRIMONIO TOTAL', value: data.patrimonio_total, kind: 'total' });

  return rows;
}

/** Jerarquía seccional del Estado de Rendimiento. */
export function buildIncomeRows(data: IncomeStatementData): StatementRow[] {
  const p = computeIncomePresentation(data);
  const cats = data.categorias ?? [];
  const byGroup = (grupo: string) => cats.filter((c) => c.grupo === grupo);
  const rows: StatementRow[] = [];
  const pushGroup = (label: string, grupo: string, subsection = true) => {
    const groupRows = byGroup(grupo);
    if (!groupRows.length) return;
    if (subsection) rows.push({ label, value: null, kind: 'subsection' });
    groupRows.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
  };

  rows.push({ label: 'INGRESOS OPERACIONALES', value: null, kind: 'section' });
  pushGroup('Ingresos por ventas y servicios', 'ingreso_operacional');
  pushGroup('(−) Devoluciones y ajustes', 'ajuste_ingreso');
  rows.push({ label: 'TOTAL INGRESOS NETOS', value: p.ingresosNetos, kind: 'total' });

  rows.push({ label: 'COSTO DE VENTAS', value: null, kind: 'section' });
  pushGroup('(−) Costo de los productos vendidos', 'costo_venta');
  rows.push({ label: 'UTILIDAD BRUTA', value: p.utilidadBruta, kind: 'total' });

  rows.push({ label: 'GASTOS OPERACIONALES', value: null, kind: 'section' });
  pushGroup('Gastos de operación', 'gasto_operacional');
  rows.push({ label: 'TOTAL GASTOS', value: p.gastosOperacionales, kind: 'subtotal' });
  rows.push({ label: 'RESULTADO OPERATIVO', value: p.resultadoOperativo, kind: 'total' });

  const noOpIngresos = byGroup('ingreso_no_operacional');
  const noOpGastos = byGroup('gasto_no_operacional');
  if (noOpIngresos.length || noOpGastos.length) {
    rows.push({ label: 'NO OPERACIONALES', value: null, kind: 'section' });
    noOpIngresos.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
    noOpGastos.forEach((c) => rows.push({ label: c.name, value: c.saldo, kind: 'row' }));
  }

  rows.push({ label: 'RESULTADO NETO DEL PERÍODO', value: p.resultadoNeto, kind: 'total' });
  return rows;
}

// ── PDF (jsPDF + autoTable, imports dinámicos) ──────────────────────────────

interface PdfTitleSpec {
  titulo: string;
  subtitulo: string;
}

async function renderStatementPdf(
  spec: PdfTitleSpec,
  storeName: string,
  rows: StatementRow[],
  notas: string[],
): Promise<void> {
  const doc = await createPDFDocument('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(spec.titulo, marginX, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Tienda: ${storeName}`, marginX, 56);
  doc.text(spec.subtitulo, marginX, 69);
  doc.text(
    `Generado: ${new Date().toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'short' })}`,
    pageWidth - marginX,
    69,
    { align: 'right' },
  );
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.8);
  doc.line(marginX, 76, pageWidth - marginX, 76);

  const sectionIdx = new Set<number>();
  const subsectionIdx = new Set<number>();
  const subtotalIdx = new Set<number>();
  const totalIdx = new Set<number>();
  const body: (string | number)[][] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'section') sectionIdx.add(i);
    if (r.kind === 'subsection') subsectionIdx.add(i);
    if (r.kind === 'subtotal') subtotalIdx.add(i);
    if (r.kind === 'total') totalIdx.add(i);
    const indent = r.kind === 'row' ? '    ' : r.kind === 'subsection' ? '  ' : '';
    body.push([
      `${indent}${r.label}`,
      r.value === null ? '' : Number(r.value.toFixed(2)),
    ]);
  });

  const autoTable = (await import('jspdf-autotable')).default;
  autoTable(doc, {
    startY: 84,
    head: [['Concepto', 'Importe (CUP)']],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [20, 20, 20] as [number, number, number],
      lineColor: [170, 170, 170] as [number, number, number],
      lineWidth: 0.2,
      halign: 'left',
    },
    headStyles: {
      fillColor: [235, 235, 235] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
      halign: 'left' as const,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 110, halign: 'right' as const, fontStyle: 'normal' as const },
    },
    didParseCell: (cellData) => {
      const i = cellData.row.index;
      if (cellData.section !== 'body') return;
      if (sectionIdx.has(i)) {
        cellData.cell.styles.fontStyle = 'bold';
        cellData.cell.styles.fillColor = [226, 232, 240] as [number, number, number];
        cellData.cell.styles.fontSize = 9;
      } else if (totalIdx.has(i)) {
        cellData.cell.styles.fontStyle = 'bold';
        cellData.cell.styles.fillColor = [241, 245, 249] as [number, number, number];
      } else if (subtotalIdx.has(i)) {
        cellData.cell.styles.fontStyle = 'bold';
      } else if (subsectionIdx.has(i)) {
        cellData.cell.styles.fontStyle = 'bolditalic';
      }
      if (cellData.column.index === 1 && cellData.section === 'body') {
        const raw = cellData.cell.raw;
        if (typeof raw === 'number' && raw < 0) {
          cellData.cell.styles.textColor = [190, 30, 30] as [number, number, number];
        }
      }
    },
    margin: { left: marginX, right: marginX, top: 60, bottom: 46 },
  });

  // Notas posteriores (ecuación contable / completitud), tal cual, sin ajustes.
  let cursor =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 84;
  cursor += 16;
  for (const nota of notas) {
    if (cursor > pageHeight - 60) {
      doc.addPage();
      cursor = 60;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    const lines = doc.splitTextToSize(nota, pageWidth - marginX * 2);
    doc.text(lines, marginX, cursor);
    cursor += lines.length * 10 + 4;
  }
  doc.setTextColor(0, 0, 0);

  // Pie por página: «Generado por COSTPRO» + fecha + numeración.
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    const generado = new Date().toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'short' });
    doc.text(`Generado por COSTPRO · ${generado}`, marginX, pageHeight - 20);
    doc.text(`Página ${p} de ${totalPaginas}`, pageWidth - marginX, pageHeight - 20, {
      align: 'right',
    });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(spec.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
}

/** PDF del Estado de Situación Financiera a una fecha de corte. */
export async function exportBalanceSheetPdf(data: BalanceSheetData, storeName: string): Promise<void> {
  const notas: string[] = [];
  const eq = data.ecuacion;
  notas.push(
    `Ecuación contable: ACTIVOS ${formatCurrency(eq.activos)} = PASIVOS + PATRIMONIO ${formatCurrency(
      eq.pasivos_mas_patrimonio,
    )}.`,
  );
  notas.push(
    eq.equilibrado
      ? 'Ecuación cuadrada: la diferencia es 0.00 CUP.'
      : `Diferencia: ${formatCurrency(eq.diferencia)} CUP (reportada tal cual; el sistema no genera ajustes automáticos).`,
  );
  if (data.completitud.sin_apertura && data.completitud.primer_documento) {
    notas.push(
      `Estado incompleto: no existen saldos iniciales (apertura). Configure los saldos iniciales en Configuración de Documentos antes del ${data.completitud.primer_documento}.`,
    );
  }
  if (data.completitud.apertura_tardia) {
    notas.push(
      `Apertura tardía: el primer movimiento es del ${data.completitud.primer_documento} y la apertura del ${data.completitud.primera_apertura}; las cifras previas a la apertura no están representadas.`,
    );
  }
  await renderStatementPdf(
    {
      titulo: 'ESTADO DE SITUACION FINANCIERA',
      subtitulo: `Fecha de corte: ${data.as_of}`,
    },
    storeName,
    buildBalanceRows(data),
    notas,
  );
}

/** PDF del Estado de Rendimiento de un período. */
export async function exportIncomeStatementPdf(
  data: IncomeStatementData,
  storeName: string,
  from: string,
  to: string,
): Promise<void> {
  const p = computeIncomePresentation(data);
  const notas = [
    `Resultado neto del período: ${formatCurrency(p.resultadoNeto)} CUP${
      p.resultadoNeto < 0 ? ' (el período cerró con pérdida)' : ''
    }.`,
  ];
  await renderStatementPdf(
    {
      titulo: 'ESTADO DE RENDIMIENTO',
      subtitulo: `Período: ${from} hasta ${to}`,
    },
    storeName,
    buildIncomeRows(data),
    notas,
  );
}

// ── Excel (@e965/xlsx, import dinámico) ─────────────────────────────────────

const MONEY_ZFMT = '#,##0.00';

async function exportStatementExcel(
  titulo: string,
  storeName: string,
  periodoTexto: string,
  rows: StatementRow[],
  fileSlug: string,
): Promise<void> {
  const XLSX = (await import('@e965/xlsx')).default ?? (await import('@e965/xlsx'));
  const aoa: (string | number)[][] = [
    [titulo],
    ['Tienda:', storeName],
    [periodoTexto],
    ['Generado:', new Date().toLocaleString('es-CU')],
    [],
    ['Concepto', 'Importe (CUP)'],
  ];
  rows.forEach((r) => {
    const label =
      r.kind === 'section'
        ? r.label
        : r.kind === 'subsection'
          ? `  ${r.label}`
          : r.kind === 'row'
            ? `    ${r.label}`
            : r.label;
    aoa.push([label, r.value === null ? '' : Number(r.value.toFixed(2))]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = 6; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && cell.t === 'n') cell.z = MONEY_ZFMT;
  }
  ws['!cols'] = [{ wch: 58 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estado');
  const safeStore = storeName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  XLSX.writeFile(wb, `${fileSlug}_${safeStore}.xlsx`);
}

/** Excel del Estado de Situación Financiera. */
export async function exportBalanceSheetExcel(data: BalanceSheetData, storeName: string): Promise<void> {
  await exportStatementExcel(
    'ESTADO DE SITUACIÓN FINANCIERA',
    storeName,
    `Fecha de corte: ${data.as_of}`,
    buildBalanceRows(data),
    `estado_situacion_${data.as_of}`,
  );
}

/** Excel del Estado de Rendimiento. */
export async function exportIncomeExcel(
  data: IncomeStatementData,
  storeName: string,
  from: string,
  to: string,
): Promise<void> {
  await exportStatementExcel(
    'ESTADO DE RENDIMIENTO',
    storeName,
    `Período: ${from} — ${to}`,
    buildIncomeRows(data),
    `estado_rendimiento_${from}_${to}`,
  );
}
