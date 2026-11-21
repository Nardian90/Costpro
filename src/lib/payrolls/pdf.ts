/**
 * Nómina de Salario SC-4-06 (Res. 13/2007 MFP) — generador PDF A4 apaisado.
 *
 * Documento profesional con:
 *   · Encabezado: entidad (nombre+código snapshot del documento), tipo de
 *     nómina codificado, número NOM-NNNNNN-AAAA + «Hoja X de Y», período
 *     (desde/hasta) y moneda.
 *   · Datos de pago: modalidad (efectivo|tarjeta), cheque nominativo
 *     (número+fecha) cuando procede, reintegro bancario cuando exista.
 *   · Tabla por trabajador CON ENCABEZADOS REPETIDOS en cada página
 *     (margin.top + didDrawPage + decoratePageOnce — patrón probado del
 *     Inventario/IPV) y FILAS INDIVISIBLES (rowPageBreak: 'avoid') para no
 *     cortar nunca una línea de trabajador (ni su espacio de firma).
 *   · CONFIGURACIÓN DE COLUMNAS (presentación — misión 2026-11-21): el caller
 *     decide qué columnas aparecen (PayrollPdfOptions.visibleColumns); ocultar
 *     una columna NO modifica importes, fórmulas ni totales almacenados.
 *     Bloqueadas siempre: Nombres, Neto a Cobrar y RECIBÍ CONFORME.
 *   · SELECCIÓN DE TRABAJADORES (PayrollPdfOptions.includedWorkerIds): el PDF
 *     incluye EXCLUSIVAMENTE los workers indicados; los totales del pie se
 *     obtienen sumando los valores ya calculados por el SERVIDOR por línea
 *     (aggregateSubsetTotals — sin fórmulas nuevas) y el documento anota
 *     «Impresión parcial: N de M» para trazabilidad.
 *   · RECIBÍ CONFORME por fila: última columna de cada trabajador con espacio
 *     para firma manuscrita (alto de fila ampliado); la fila de totales NO
 *     genera firma ficticia. Sustituye al bloque único de recepción al pie
 *     (decisión del propietario; el bloque Elabora/Revisa/Contabiliza del
 *     modelo SC-4-06 se conserva).
 *   · Desglose de conceptos con sigla (clase + sigla + descripción +
 *     importe por línea de trabajador).
 *   · Pie: numeración «Página X de Y» + branding en todas las hojas.
 *
 * El caller decide: vista previa = doc.output('bloburl') (iframe), descarga
 * = doc.save() — MISMO builder (patrón Reporte Entrega).
 *
 * Sin coeficientes legales inventados: los importes de extras y conceptos
 * provienen del documento (configurados por la entidad conforme al brief).
 */

import type { jsPDF } from 'jspdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { pdfWinAnsi, splitToWidthVerified } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import type { Payroll, PayrollItem } from '@/lib/payrolls/types';
import {
  aggregateSubsetTotals,
  normalizeColumnConfig,
  PAYROLL_COLUMNS_DEFAULT,
  type PayrollColumnId,
} from '@/lib/payrolls/columns';

const MARGIN = 42;

/** Opciones de PRESENTACIÓN del documento (no afectan datos almacenados). */
export interface PayrollPdfOptions {
  /** Columnas lógicas visibles (normalizadas; null/undefined = todas). */
  visibleColumns?: PayrollColumnId[] | null;
  /** worker_id a imprimir (null/undefined = todos los del documento). */
  includedWorkerIds?: string[] | null;
}

export interface PayrollPdfPayload {
  payroll: Payroll;
  /** Nombre de quien firma «Elabora» (created_by) — opcional para el pie. */
  elaboraNombre?: string;
  /** Configuración de columnas + selección de trabajadores (opcional). */
  options?: PayrollPdfOptions;
}

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString('es-CU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function dateTimeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-CU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Definición de columna física de la tabla (una columna lógica «tiempo» se
// despliega en Horas y/o Días según la composición de los trabajadores
// incluidos — corrige P-1: en nóminas mixtas ambas magnitudes se imprimen y
// el pie suma cada una en su unidad).
// ─────────────────────────────────────────────────────────────────────────────

interface PhysCol {
  key: string;
  head: string;
  width: number;
  align: 'left' | 'right' | 'center';
  cell: (it: PayrollItem) => string;
  foot: (t: FootTotals) => string;
  boldCell?: boolean;
}

/** Totales que alimentan el pie (servidor para el documento completo). */
interface FootTotals {
  total_workers: number;
  total_regular_hours: number;
  total_accrued_days: number;
  total_overtime_hours: number;
  total_overtime: number;
  total_complementos: number;
  total_other_earnings: number;
  total_social_security: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_vacation_days: number;
  total_vacation_amount: number;
}

const siglaList = (it: PayrollItem): string => {
  const cs = it.concepts ?? [];
  const otros = cs.filter((c) => c.kind === 'otro_haber').map((c) => c.sigla);
  if (otros.length) return otros.join(', ');
  return '—';
};

/**
 * Construye el documento de la nómina (A4 apaisado). Paginado con
 * encabezados repetidos; la misma instancia sirve para vista previa
 * (bloburl) y descarga (save).
 */
export async function buildPayrollPdf(payload: PayrollPdfPayload): Promise<jsPDF> {
  const { payroll, elaboraNombre } = payload;
  const allItems = payroll.items ?? [];

  // SELECCIÓN DE TRABAJADORES (configuración de impresión — jamás altera el
  // documento almacenado): filtra las líneas por worker_id incluido.
  const includedIds = payload.options?.includedWorkerIds;
  const items = Array.isArray(includedIds)
    ? allItems.filter((it) => includedIds.includes(it.worker_id))
    : allItems;
  if (items.length === 0) {
    throw new Error('No hay trabajadores incluidos para generar el PDF.');
  }
  const isSubset = Array.isArray(includedIds) && items.length < allItems.length;

  // Totales del PIE: documento completo = encabezado del SERVIDOR (fuente de
  // verdad); subconjunto = suma de los valores servidos por línea.
  const totals: FootTotals = isSubset
    ? aggregateSubsetTotals(items)
    : {
      total_workers: payroll.total_workers,
      total_regular_hours: payroll.total_regular_hours,
      total_accrued_days: payroll.total_accrued_days,
      total_overtime_hours: payroll.total_overtime_hours,
      total_overtime: payroll.total_overtime,
      total_complementos: payroll.total_complementos,
      total_other_earnings: payroll.total_other_earnings,
      total_social_security: payroll.total_social_security,
      total_gross: payroll.total_gross,
      total_deductions: payroll.total_deductions,
      total_net: payroll.total_net,
      total_vacation_days: payroll.total_vacation_days,
      total_vacation_amount: payroll.total_vacation_amount,
    };

  const doc = await createPDFDocument('l', 'pt', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ─────────────────────────────────────────────────────────────────────
  // Encabezado (compacto en páginas 2+): entidad, modelo, número y hoja
  // ─────────────────────────────────────────────────────────────────────
  const drawHeader = (compact: boolean): number => {
    const y0 = MARGIN;
    const tipo = (payroll.tipo_nomina || '').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 10 : 13);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfWinAnsi(`NÓMINA — ${tipo}`), pageW / 2, y0 + (compact ? 9 : 13), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(pdfWinAnsi(`Entidad: ${payroll.entidad_nombre}${payroll.entidad_codigo ? ` (${payroll.entidad_codigo})` : ''}`), MARGIN, y0 + (compact ? 19 : 26));
    doc.text(pdfWinAnsi(`Número: ${payroll.payroll_number}`), MARGIN, y0 + (compact ? 29 : 38));
    doc.text(pdfWinAnsi(`Período: ${dateLabel(payroll.period_start)} – ${dateLabel(payroll.period_end)}`), MARGIN, y0 + (compact ? 39 : 50));

    doc.text(`Moneda: ${payroll.currency}`, pageW - MARGIN, y0 + (compact ? 19 : 26), { align: 'right' });
    doc.text(pdfWinAnsi(`Modalidad de pago: ${payroll.payment_method === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}`), pageW - MARGIN, y0 + (compact ? 29 : 38), { align: 'right' });
    if (payroll.cheque_number) {
      doc.text(pdfWinAnsi(`Cheque nominativo: ${payroll.cheque_number}${payroll.cheque_date ? ` · ${dateLabel(payroll.cheque_date)}` : ''}`), pageW - MARGIN, y0 + (compact ? 39 : 50), { align: 'right' });
    }

    doc.setDrawColor(180);
    doc.line(MARGIN, y0 + (compact ? 46 : 60), pageW - MARGIN, y0 + (compact ? 46 : 60));
    return y0 + (compact ? 54 : 68);
  };

  let startY = drawHeader(false);

  // Trazabilidad de la impresión parcial (subconjunto de trabajadores).
  if (isSubset) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      pdfWinAnsi(`Impresión parcial: ${items.length} de ${allItems.length} trabajador(es) del documento — los totales corresponden a los incluidos.`),
      MARGIN, startY + 8,
    );
    startY += 14;
  }

  // ANTI-SOLAPE: cada página se decora UNA sola vez (patrón IPV).
  const decoratedPages = new Set<number>();
  decoratedPages.add(doc.getNumberOfPages());
  const decoratePageOnce = (compact: boolean): void => {
    const page = doc.getNumberOfPages();
    if (decoratedPages.has(page)) return;
    decoratedPages.add(page);
    drawHeader(compact);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Columnas físicas según configuración (REQUERIMIENTO 1) + composición
  // de tarifas de los trabajadores incluidos (P-1).
  // ─────────────────────────────────────────────────────────────────────
  const visible = normalizeColumnConfig(payload.options?.visibleColumns ?? [...PAYROLL_COLUMNS_DEFAULT]);
  const has = (c: PayrollColumnId) => visible.includes(c);
  const hasHourly = items.some((it) => it.rate_type !== 'daily');
  const hasDaily = items.some((it) => it.rate_type === 'daily');

  const rateHead = hasHourly && hasDaily
    ? 'Salario Básico\n(hora/día)'
    : hasDaily ? 'Salario Básico\n(día)' : 'Salario Básico\n(hora)';

  const cols: PhysCol[] = [];
  if (has('expediente')) cols.push({
    key: 'expediente', head: 'Exp. Lab.', width: 44, align: 'left',
    cell: (it) => pdfWinAnsi(it.expediente_laboral || '—'),
    foot: () => '',
  });
  if (has('nombres')) cols.push({
    key: 'nombres', head: 'Nombres y Apellidos', width: 108, align: 'left',
    cell: (it) => pdfWinAnsi(it.worker_names),
    foot: () => '',
  });
  if (has('categoria')) cols.push({
    key: 'categoria', head: 'Categoría\nOcupacional', width: 74, align: 'left',
    cell: (it) => pdfWinAnsi(it.categoria_ocupacional || '—'),
    foot: () => '',
  });
  if (has('salario_basico')) cols.push({
    key: 'salario_basico', head: pdfWinAnsi(rateHead), width: 54, align: 'right',
    cell: (it) => (it.rate_amount != null ? money(it.rate_amount) : '—'),
    foot: () => '', // no-aditiva: la tarifa NO se suma (regla contable)
  });
  if (has('tiempo')) {
    if (hasHourly) cols.push({
      key: 'tiempo_h', head: 'Horas\nRegulares', width: 38, align: 'right',
      cell: (it) => qty(it.regular_hours),
      foot: (t) => `${qty(t.total_regular_hours)} h`,
    });
    if (hasDaily) cols.push({
      key: 'tiempo_d', head: 'Días\nDevengados', width: 38, align: 'right',
      cell: (it) => qty(it.accrued_days),
      foot: (t) => `${qty(t.total_accrued_days)} d`,
    });
  }
  if (has('h_extras')) cols.push({
    key: 'h_extras', head: 'H. Extras\n(h)', width: 36, align: 'right',
    cell: (it) => qty(it.overtime_hours),
    foot: (t) => qty(t.total_overtime_hours),
  });
  if (has('importe_extras')) cols.push({
    key: 'importe_extras', head: 'Importe\nExtras', width: 50, align: 'right',
    cell: (it) => money(it.overtime_amount),
    foot: (t) => money(t.total_overtime),
  });
  if (has('compl_salario')) cols.push({
    key: 'compl_salario', head: 'Compl.\nSalario', width: 46, align: 'right',
    cell: (it) => money(it.total_complementos),
    foot: (t) => money(t.total_complementos),
  });
  if (has('otros_haberes')) cols.push({
    key: 'otros_haberes', head: 'Otros Hab.\n(sigla)', width: 54, align: 'left',
    cell: (it) => pdfWinAnsi(siglaList(it)),
    foot: (t) => money(t.total_other_earnings),
  });
  if (has('oblig_social')) cols.push({
    key: 'oblig_social', head: 'Oblig.\nSocial', width: 46, align: 'right',
    cell: (it) => money(it.total_social_security),
    foot: (t) => money(t.total_social_security),
  });
  if (has('total_devengado')) cols.push({
    key: 'total_devengado', head: 'Total\nDevengado', width: 58, align: 'right',
    cell: (it) => money(it.total_gross),
    foot: (t) => money(t.total_gross),
  });
  if (has('deducciones')) cols.push({
    key: 'deducciones', head: 'Deduc-\nciones', width: 48, align: 'right',
    cell: (it) => money(it.total_deductions),
    foot: (t) => money(t.total_deductions),
  });
  if (has('neto')) cols.push({
    key: 'neto', head: 'Neto a\nCobrar', width: 58, align: 'right',
    cell: (it) => money(it.total_net), boldCell: true,
    foot: (t) => money(t.total_net),
  });
  if (has('vacac_dias')) cols.push({
    key: 'vacac_dias', head: 'Vacac.\n(días)', width: 34, align: 'right',
    cell: (it) => qty(it.vacation_days),
    foot: (t) => qty(t.total_vacation_days),
  });
  if (has('vacac_importe')) cols.push({
    key: 'vacac_importe', head: 'Vacac.\nImporte', width: 50, align: 'right',
    cell: (it) => money(it.vacation_amount),
    foot: (t) => money(t.total_vacation_amount),
  });
  // RECIBÍ CONFORME: SIEMPRE la última columna (requisito del propietario).
  // Celda vacía con alto ampliado: espacio real para firma manuscrita.
  if (has('recibi_conforme')) cols.push({
    key: 'recibi_conforme', head: pdfWinAnsi('RECIBÍ\nCONFORME'), width: 92, align: 'left',
    cell: () => '',
    foot: () => '', // la fila de totales NO genera firma ficticia
  });
  if (cols.length === 0) {
    throw new Error('Configuración de columnas vacía: active al menos una columna.');
  }

  // ─ Normalización de anchos (P-3 + REQ4 «ancho según el contenido»):
  // 1) Las columnas de CIFRAS se miden con el propio motor (getTextWidth,
  //    pie en negrita incluido) para que importes como «139,300.00» NUNCA
  //    se envuelvan ni pierdan dígitos.
  // 2) Las columnas de TEXTO (expediente/nombres/categoría/otros/firma)
  //    absorben el ajuste: se escalan solo si el total excede el área.
  // 3) Si SOBRA espacio (columnas ocultas o configuración mínima), el extra
  //    va primero a RECIBÍ CONFORME (espacio real de firma — REQ3) y luego
  //    a Nombres y Apellidos.
  // De las columnas de TEXTO se mide su contenido (identificadores y cifras
  // nunca se parten); solo las de texto libre (nombres, categoría, siglas y
  // la propia firma) pueden envolver. Con colSpan y anchos medidos, el pie y
  // el encabezado se alinean con el cuerpo (verificado con pdftotext -bbox).
  const TEXT_FREE_COLS = new Set(['nombres', 'categoria', 'otros_haberes', 'recibi_conforme']);
  const CELL_PAD = 7; // cellPadding 3×2 + holgura de líneas
  // getTextWidth NO distingue la negrita de las fuentes estándar (métrica
  // idéntica a la normal): el render real de bold es ~5-12% más ancho — se
  // aplica factor de seguridad a toda cifra/encabezado en negrita.
  const BOLD_FACTOR = 1.12;
  doc.setFontSize(7.4);
  const measure = (s: string, bold = false): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    return doc.getTextWidth(pdfWinAnsi(s)) * (bold ? BOLD_FACTOR : 1);
  };
  const widths = cols.map((c) => {
    if (TEXT_FREE_COLS.has(c.key)) return c.width;
    let w = 0;
    for (const it of items) w = Math.max(w, measure(c.cell(it)));
    w = Math.max(w, measure(c.foot(totals), true));
    // Encabezado en negrita: cada línea sin partir palabra.
    for (const line of c.head.split('\n')) w = Math.max(w, measure(line, true));
    // Los ENCABEZADOS llevan \n y envuelven por diseño; la cifra manda.
    return Math.min(Math.max(30, w + CELL_PAD), 110);
  });
  const availW = pageW - 2 * MARGIN;
  const sumNeeded = widths.reduce((s, w) => s + w, 0);
  if (sumNeeded > availW) {
    // Recortan primero las columnas de texto (mínimo legible 24 pt); las
    // cifras conservan su ancho medido mientras sea físicamente posible.
    const numericSum = widths.reduce((s, w, i) => s + (TEXT_FREE_COLS.has(cols[i].key) ? 0 : w), 0);
    const textBudget = Math.max(0, availW - numericSum);
    const textSum = widths.reduce((s, w, i) => s + (TEXT_FREE_COLS.has(cols[i].key) ? w : 0), 0);
    const shrink = textSum > 0 && textBudget > 0 ? Math.min(1, textBudget / textSum) : 0;
    let scaled = widths.map((w, i) => (TEXT_FREE_COLS.has(cols[i].key) ? Math.max(24, w * (shrink || 0.6)) : w));
    const totalScaled = scaled.reduce((s, w) => s + w, 0);
    if (totalScaled > availW) {
      const f = availW / totalScaled;
      scaled = scaled.map((w) => w * f);
    }
    widths.splice(0, widths.length, ...scaled);
  }
  // Excedente → espacio de firma y nombres (con topes razonables).
  const surplus = availW - widths.reduce((s, w) => s + w, 0);
  if (surplus > 0.5) {
    const idxSig = cols.findIndex((c) => c.key === 'recibi_conforme');
    const idxNom = cols.findIndex((c) => c.key === 'nombres');
    let rest = surplus;
    const give = (idx: number, cap: number): void => {
      const add = Math.min(cap, rest);
      widths[idx] += add;
      rest -= add;
    };
    if (idxSig >= 0) give(idxSig, 80);
    if (idxNom >= 0 && rest > 0.5) give(idxNom, 120);
    if (rest > 0.5) {
      const textIdx = cols.map((_c, i) => i).filter((i) => TEXT_FREE_COLS.has(cols[i].key));
      const tSum = textIdx.reduce((s, i) => s + widths[i], 0) || 1;
      for (const i of textIdx) widths[i] += Math.max(0, Math.min(240 - widths[i], rest * (widths[i] / tSum)));
    }
    // Igualación final: cualquier resto (redondeos/topes) se reparte entre
    // TODAS las columnas — la tabla ocupa exactamente el área imprimible.
    const diff = availW - widths.reduce((s, w) => s + w, 0);
    if (diff > 0.1) {
      const per = diff / cols.length;
      for (let i = 0; i < widths.length; i++) widths[i] += per;
    }
  }

  const body = items.map((it) => cols.map((c) => ({ content: c.cell(it), styles: c.boldCell ? { fontStyle: 'bold' as const } : undefined })));

  // Pie: TOTALES en la primera columna de identidad disponible (colSpan hasta
  // Nombres) — IMPORTANTE: con colSpan=2 la celda consumida NO se incluye en
  // el arreglo (autotable ubica las siguientes en el siguiente hueco de la
  // cuadrícula; un filler duplicado desplazaría TODO el pie una columna).
  // Sin firma ficticia al final.
  const TOTALES_LABEL = pdfWinAnsi(`TOTALES · ${totals.total_workers} trabajador(es)`);
  const TOTALES_STYLES = { halign: 'left' as const, fontStyle: 'bold' as const };
  const footRow: Array<Record<string, unknown>> = [];
  let labelPlaced = false;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!labelPlaced && c.key === 'expediente' && i + 1 < cols.length && cols[i + 1].key === 'nombres') {
      footRow.push({ content: TOTALES_LABEL, colSpan: 2, styles: TOTALES_STYLES });
      i += 1; // la celda de Nombres queda consumida por el colSpan
      labelPlaced = true;
      continue;
    }
    if (!labelPlaced && (c.key === 'nombres' || c.key === 'expediente')) {
      footRow.push({ content: TOTALES_LABEL, styles: TOTALES_STYLES });
      labelPlaced = true;
      continue;
    }
    const v = c.foot(totals);
    footRow.push(
      v !== '' && c.key !== 'recibi_conforme'
        ? { content: v, styles: { fontStyle: 'bold' as const } }
        : { content: '' },
    );
  }

  const autoTable = (await import('jspdf-autotable')).default;

  autoTable(doc, {
    head: [cols.map((c) => c.head)],
    body,
    foot: [footRow],
    startY,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 54 },
    styles: {
      font: 'helvetica', fontSize: 7.4, cellPadding: 3,
      lineColor: [214, 214, 214], lineWidth: 0.35, textColor: [30, 30, 30],
      overflow: 'linebreak',
      minCellHeight: has('recibi_conforme') ? 26 : 12, // espacio real de firma
    },
    headStyles: {
      fillColor: [238, 240, 243], textColor: [20, 20, 20],
      fontStyle: 'bold', halign: 'center', fontSize: 7, minCellHeight: 20,
    },
    footStyles: { fillColor: [228, 231, 235], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: widths[i], halign: c.align }])),
    rowPageBreak: 'avoid', // P-4: una fila de trabajador nunca se divide
    didDrawPage: () => {
      if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // Desglose de conceptos con sigla (clase + sigla + descripción + importe)
  // ─────────────────────────────────────────────────────────────────────
  const conceptRows = items.flatMap((it) =>
    (it.concepts ?? []).map((c) => ({
      worker: it.worker_names,
      kind: c.kind,
      sigla: c.sigla,
      description: c.description,
      amount: c.amount,
    })),
  );

  let cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
  cursor += 24;

  if (conceptRows.length) {
    if (cursor > pageH - 200) {
      doc.addPage();
      cursor = drawHeader(true) + 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(pdfWinAnsi('CONCEPTOS POR TRABAJADOR (SIGLA · CLASE)'), MARGIN, cursor);
    cursor += 10;

    const cHead = [['Trabajador', 'Clase', 'Sigla', 'Descripción', 'Importe']];
    const cBody = conceptRows.map((r) => ([
      { content: pdfWinAnsi(r.worker) },
      { content: pdfWinAnsi(r.kind) },
      { content: pdfWinAnsi(r.sigla) },
      { content: pdfWinAnsi(r.description || '—') },
      { content: money(r.amount) },
    ]));

    autoTable(doc, {
      head: cHead,
      body: cBody,
      startY: cursor,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 54 },
      styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.6, lineColor: [214, 214, 214], lineWidth: 0.3, textColor: [30, 30, 30], overflow: 'linebreak' },
      headStyles: { fillColor: [238, 240, 243], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center', fontSize: 6.8 },
      columnStyles: {
        0: { cellWidth: 150, halign: 'left' },
        1: { cellWidth: 90, halign: 'left' },
        2: { cellWidth: 46, halign: 'left' },
        // Descripción flexible: ocupa el ancho imprimible restante (evita la
        // tabla estrecha con margen muerto a la derecha).
        3: { cellWidth: Math.max(330, availW - (150 + 90 + 46 + 60)), halign: 'left' },
        4: { cellWidth: 60, halign: 'right' },
      },
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        if (doc.getNumberOfPages() > 1) decoratePageOnce(true);
      },
    });
    cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursor;
    cursor += 20;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Notas + reintegro bancario (datos 7 del modelo)
  // ─────────────────────────────────────────────────────────────────────
  if (payroll.notes || payroll.reintegro_number) {
    if (cursor > pageH - 180) {
      doc.addPage();
      cursor = drawHeader(true) + 6;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    if (payroll.reintegro_number) {
      doc.text(
        pdfWinAnsi(`Reintegro al Banco (salarios indebidos no reclamados): ${payroll.reintegro_number}${payroll.reintegro_date ? ` · ${dateLabel(payroll.reintegro_date)}` : ''}`),
        MARGIN, cursor,
      );
      cursor += 13;
    }
    if (payroll.notes) {
      const noteLines = splitToWidthVerified(doc, pdfWinAnsi(`Notas: ${payroll.notes}`), pageW - 2 * MARGIN);
      for (const line of noteLines.slice(0, 4)) {
        doc.text(line, MARGIN, cursor);
        cursor += 11;
      }
    }
    cursor += 8;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Firmas del modelo SC-4-06: elabora / revisa y aprueba / contabiliza.
  // La RECEPCIÓN del importe es la columna RECIBÍ CONFORME por fila
  // (requisito del propietario 2026-11-21): cada trabajador firma su propia
  // línea; ya no se imprime un bloque único de recepción al pie.
  // ─────────────────────────────────────────────────────────────────────
  if (cursor > pageH - 120) {
    doc.addPage();
    cursor = drawHeader(true) + 6;
  }
  const sigY = Math.max(cursor + 10, pageH - 96);
  const colW = (pageW - 2 * MARGIN) / 3;
  const labels = ['Elabora', 'Revisa y aprueba', 'Contabiliza'];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  labels.forEach((label, i) => {
    const x = MARGIN + i * colW;
    doc.setDrawColor(120);
    doc.line(x, sigY, x + colW - 24, sigY);
    doc.text(pdfWinAnsi(label), x, sigY + 11);
    if (elaboraNombre && i === 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(pdfWinAnsi(elaboraNombre), x, sigY + 20);
      doc.setFontSize(7.5);
      doc.setTextColor(40, 40, 40);
    }
  });

  // Estado del documento (sello discreto bajo las firmas)
  const estado =
    payroll.status === 'paid' ? 'PAGADA'
      : payroll.status === 'confirmed' ? 'CONFIRMADA'
        : payroll.status === 'voided' ? 'ANULADA'
          : 'BORRADOR';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(
    payroll.status === 'voided' ? 170 : 70,
    payroll.status === 'voided' ? 40 : 70,
    payroll.status === 'voided' ? 40 : 70,
  );
  doc.text(pdfWinAnsi(`Estado: ${estado}`), MARGIN, sigY + 34);
  if (payroll.status === 'voided' && payroll.void_reason) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const motivo = splitToWidthVerified(doc, pdfWinAnsi(`Motivo de anulación: ${payroll.void_reason}`), pageW - 2 * MARGIN);
    motivo.slice(0, 2).forEach((line, i) => doc.text(line, MARGIN, sigY + 46 + i * 10));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Pie de página: numeración + hoja + branding en TODAS las hojas
  // ─────────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Página ${p} de ${pageCount}`, pageW - MARGIN, pageH - 14, { align: 'right' });
    doc.text(pdfWinAnsi(`Nómina ${payroll.payroll_number} · Hoja ${p} de ${pageCount} · ${dateTimeLabel(new Date().toISOString())}`), MARGIN, pageH - 14);
  }

  return doc;
}
