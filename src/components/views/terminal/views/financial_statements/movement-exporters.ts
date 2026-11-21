/**
 * CP-FIN-REC-001/PR B — Exportación documental del mayor por categoría.
 *
 * Excel (misión §6): TODOS los movimientos del servidor (páginas completas,
 * nunca solo las cargadas en pantalla) con integridad verificada
 * (exportados = total del servidor; sin duplicidades; aborta sin archivo
 * parcial si falla una página) + hoja Resumen que reconstruye el saldo final.
 *
 * PDF (misión §7): mismo conjunto de datos para idéntica cuenta/período/
 * generación, tras un diálogo obligatorio de selección de fechas.
 *
 * Patrones del repo: @e965/xlsx con números reales por celda (ipv-ventas),
 * jsPDF+autoTable con import dinámico (exporters.ts), sin valores originales
 * inventados (amount_origin null → celda vacía).
 */
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { fetchCategoryDetail } from './fin-api';
import type { CategoryDetailData, MovementRow } from './types';

const PAGE = 200; // límite máximo del endpoint category-detail

export interface AllMovementsResult {
  movimientos: MovementRow[];
  total: number;
  saldoInicial: number;
  clase: string | null;
  generacion: { id: string | null; code: string | null };
  desde: string;
  hasta: string;
}

/**
 * Recupera TODAS las páginas del servidor. Integridad obligatoria (misión §6):
 *  · cada página debe traer filas mientras falten;
 *  · sin duplicados por id de movimiento;
 *  · la cantidad final debe ser EXACTAMENTE el total del servidor;
 *  · cualquier fallo aborta con excepción (NUNCA un archivo parcial).
 */
export async function fetchAllCategoryMovements(
  storeId: string,
  category: string,
  from: string,
  to: string,
  token: string | null,
): Promise<AllMovementsResult> {
  const all: MovementRow[] = [];
  const seen = new Set<string>();
  let total = 0;
  let envelope: CategoryDetailData | null = null;

  for (let guard = 0; guard < 200; guard++) {
    const page: CategoryDetailData = await fetchCategoryDetail(
      storeId,
      category,
      from,
      to,
      PAGE,
      all.length,
      token,
    );
    envelope = page;
    total = page.total ?? 0;
    const rows = page.movimientos ?? [];
    for (const m of rows) {
      if (seen.has(m.id)) {
        throw new Error(`Integridad de exportación: movimiento duplicado ${m.id} (exportación abortada)`);
      }
      seen.add(m.id);
    }
    all.push(...rows);
    if (all.length >= total || rows.length === 0) break;
  }

  if (all.length !== total) {
    throw new Error(
      `Integridad de exportación: ${all.length} de ${total} movimientos (exportación abortada — reintenta)`,
    );
  }

  const extended = envelope as (CategoryDetailData & {
    saldo_inicial?: number;
    clase?: string | null;
    generacion?: { id: string | null; code: string | null };
  }) | null;
  return {
    movimientos: all,
    total,
    saldoInicial: extended?.saldo_inicial ?? 0,
    clase: extended?.clase ?? null,
    generacion: extended?.generacion ?? { id: null, code: null },
    desde: from,
    hasta: to,
  };
}

// ── Excel ────────────────────────────────────────────────────────────────────

const MONEY_ZFMT = '#,##0.00';

export interface CategoryExportContext {
  storeName: string;
  categoryName: string;
  categoryCode: string;
  /** Período exportado (para encabezados). */
  from: string;
  to: string;
  /** Indica si el rango es un corte (balance: from=1900-01-01). */
  esCorte: boolean;
}

export async function exportCategoryMovementsExcel(
  result: AllMovementsResult,
  ctx: CategoryExportContext,
): Promise<void> {
  const XLSX = (await import('@e965/xlsx')).default ?? (await import('@e965/xlsx'));

  const n2 = (v: number | null | undefined): number | '' =>
    v == null || !Number.isFinite(v) ? '' : Number(v.toFixed(2));

  // Hoja 1 — Movimientos: una fila por movimiento (misión §6, todas las columnas).
  const head = [
    'Fecha económica', 'Fecha de contabilización', 'ID movimiento', 'ID asiento',
    'Nº documento', 'ID documento origen', 'Tipo documental', 'Evento', 'Sentido',
    'Débito (CUP)', 'Crédito (CUP)', 'Importe contable CUP', 'Importe de la línea',
    'Moneda', 'Moneda original', 'Importe original', 'Tasa documentada',
    'Descripción', 'Generación contable',
  ];
  const body = result.movimientos.map((m) => [
    m.economic_date,
    (m.posted_at ?? '').slice(0, 19).replace('T', ' '),
    m.id,
    m.entry_id,
    m.document_number ?? (m.document_id ?? ''),
    m.document_id ?? '',
    m.document_type ?? '',
    m.event ?? '',
    m.sense === 'debito' ? 'Débito' : 'Crédito',
    m.sense === 'debito' ? n2(m.amount_cup) : '',
    m.sense === 'credito' ? n2(m.amount_cup) : '',
    n2(m.amount_cup),
    n2(m.amount),
    m.currency ?? '',
    m.currency_origin ?? '',
    // NUNCA se inventa el importe original cuando no está registrado.
    m.amount_origin == null ? '' : Number(m.amount_origin.toFixed(2)),
    m.currency && m.currency !== 'CUP' ? 1 : '',
    (m.description ?? '').trim(),
    result.generacion.code ?? '',
  ]);
  const movAOA = [
    ['MAYOR POR CUENTA — MOVIMIENTOS'],
    ['Tienda:', ctx.storeName],
    ['Cuenta:', `${ctx.categoryCode} · ${ctx.categoryName}`],
    [ctx.esCorte ? `Fecha de corte: ${ctx.to}` : `Período: ${ctx.from} — ${ctx.to}`],
    ['Generación contable:', result.generacion.code ?? '—'],
    ['Generado:', new Date().toLocaleString('es-CU')],
    [],
    head,
    ...body,
  ];
  const wsMov = XLSX.utils.aoa_to_sheet(movAOA);
  const range = XLSX.utils.decode_range(wsMov['!ref'] ?? 'A1');
  for (let r = 7; r <= range.e.r; r++) {
    for (const c of [9, 10, 11, 12, 15, 16]) {
      const cell = wsMov[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 'n') cell.z = MONEY_ZFMT;
    }
  }
  wsMov['!cols'] = [
    { wch: 12 }, { wch: 19 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 20 },
    { wch: 16 }, { wch: 15 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 17 },
    { wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 12 },
  ];
  wsMov['!freeze'] = { xSplit: 0, ySplit: 8 };

  // Hoja 2 — Resumen: reconstrucción del saldo por secuencia contable.
  const totalDebitos = result.movimientos.reduce((a, m) => a + (m.sense === 'debito' ? m.amount_cup : 0), 0);
  const totalCreditos = result.movimientos.reduce((a, m) => a + (m.sense === 'credito' ? m.amount_cup : 0), 0);
  const esDebito = result.clase === 'activo' || result.clase === 'gasto';
  const saldoFinal = esDebito
    ? result.saldoInicial + totalDebitos - totalCreditos
    : result.saldoInicial - totalDebitos + totalCreditos;
  const resAOA: (string | number)[][] = [
    ['RESUMEN DEL MAYOR POR CUENTA'],
    ['Empresa / Tienda', ctx.storeName],
    ['Cuenta', ctx.categoryName],
    ['Código contable', ctx.categoryCode],
    ['Clase contable', result.clase ?? '—'],
    [ctx.esCorte ? 'Fecha de corte' : 'Período', ctx.esCorte ? ctx.to : `${ctx.from} — ${ctx.to}`],
    ['Generación contable', result.generacion.code ?? '—'],
    ['Cantidad de movimientos', result.movimientos.length],
    ['Saldo inicial', Number(result.saldoInicial.toFixed(2))],
    ['Total débitos', Number(totalDebitos.toFixed(2))],
    ['Total créditos', Number(totalCreditos.toFixed(2))],
    ['Saldo final', Number(saldoFinal.toFixed(2))],
    ['Fecha de generación', new Date().toLocaleString('es-CU')],
    [],
    ['Reconstrucción del saldo final',
      esDebito
        ? 'saldo inicial + débitos − créditos (naturaleza débito: activo/gasto)'
        : 'saldo inicial − débitos + créditos (naturaleza crédito)'],
    ['Exportados = total del servidor', `${result.movimientos.length} = ${result.total}`],
  ];
  const wsRes = XLSX.utils.aoa_to_sheet(resAOA);
  const rrange = XLSX.utils.decode_range(wsRes['!ref'] ?? 'A1');
  for (let r = 1; r <= rrange.e.r; r++) {
    const cell = wsRes[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && cell.t === 'n') cell.z = MONEY_ZFMT;
  }
  wsRes['!cols'] = [{ wch: 34 }, { wch: 44 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos');
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');
  const safeStore = ctx.storeName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  XLSX.writeFile(wb, `mayor_${ctx.categoryCode}_${ctx.from}_${ctx.to}_${safeStore}.xlsx`);
}

// ── PDF (misión §7: mismo conjunto de datos que el Excel) ────────────────────

export async function exportCategoryMovementsPdf(
  result: AllMovementsResult,
  ctx: CategoryExportContext,
): Promise<void> {
  const doc = await createPDFDocument('l', 'pt', 'a4'); // horizontal: columnas contables
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 30;

  const totalDebitos = result.movimientos.reduce((a, m) => a + (m.sense === 'debito' ? m.amount_cup : 0), 0);
  const totalCreditos = result.movimientos.reduce((a, m) => a + (m.sense === 'credito' ? m.amount_cup : 0), 0);
  const esDebito = result.clase === 'activo' || result.clase === 'gasto';
  const saldoFinal = esDebito
    ? result.saldoInicial + totalDebitos - totalCreditos
    : result.saldoInicial - totalDebitos + totalCreditos;
  const fmt = (n: number) => n.toFixed(2);

  // Encabezado (misión §7.2): tienda, cuenta, código, período, generación, fecha.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MAYOR POR CUENTA — MOVIMIENTOS DEL PERÍODO', marginX, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Tienda: ${ctx.storeName}`, marginX, 52);
  doc.text(`Cuenta: ${ctx.categoryCode} · ${ctx.categoryName}`, marginX, 64);
  doc.text(
    `${ctx.esCorte ? `Fecha de corte: ${ctx.to}` : `Período: ${ctx.from} hasta ${ctx.to}`}`,
    marginX, 76,
  );
  doc.text(`Generación contable: ${result.generacion.code ?? '—'}`, marginX, 88);
  doc.text(
    `Generado: ${new Date().toLocaleString('es-CU', { dateStyle: 'short', timeStyle: 'short' })}`,
    pageWidth - marginX, 88, { align: 'right' },
  );
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.8);
  doc.line(marginX, 94, pageWidth - marginX, 94);

  const body = result.movimientos.map((m) => [
    m.economic_date,
    m.document_number || (m.document_id ? m.document_id.slice(0, 8) : '—'),
    m.document_type ?? '',
    m.event ?? '',
    m.sense === 'debito' ? Number(m.amount_cup.toFixed(2)) : '',
    m.sense === 'credito' ? Number(m.amount_cup.toFixed(2)) : '',
    Number(m.amount_cup.toFixed(2)),
    m.currency_origin && m.currency_origin !== 'CUP'
      ? m.amount_origin != null
        ? `${m.currency_origin} ${m.amount_origin.toFixed(2)}`
        : `${m.currency_origin} (no registrado)`
      : '—',
    (m.description ?? '').trim().slice(0, 60) || '—',
  ]);

  const autoTable = (await import('jspdf-autotable')).default;
  autoTable(doc, {
    startY: 100,
    head: [['Fecha', 'Documento', 'Tipo', 'Evento', 'Débito', 'Crédito', 'Importe CUP', 'Moneda original', 'Descripción']],
    body: body.length ? body : [['', '', '', '', '', '', '', '', 'Sin movimientos en el período']],
    theme: 'grid',
    styles: {
      font: 'helvetica', fontSize: 7.5, cellPadding: 2.5,
      textColor: [20, 20, 20] as [number, number, number],
      lineColor: [175, 175, 175] as [number, number, number], lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [235, 235, 235] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: 'bold' as const,
    },
    // Encabezados repetidos en páginas sucesivas (misión §7.3).
    showHead: 'everyPage',
    columnStyles: {
      4: { halign: 'right' as const }, 5: { halign: 'right' as const }, 6: { halign: 'right' as const },
    },
    didParseCell: (cellData) => {
      if (cellData.section === 'body' && cellData.column.index === 6) {
        const raw = cellData.cell.raw;
        if (typeof raw === 'number' && raw < 0) {
          cellData.cell.styles.textColor = [190, 30, 30] as [number, number, number];
        }
      }
    },
    margin: { left: marginX, right: marginX, top: 60, bottom: 52 },
  });

  // Resumen final (misión §7.2): saldo inicial, débitos, créditos, saldo final, nº.
  let cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  cursor += 16;
  const lineas: [string, string][] = [
    ['Saldo inicial', fmt(result.saldoInicial)],
    ['Total débitos del período', fmt(totalDebitos)],
    ['Total créditos del período', fmt(totalCreditos)],
    ['Saldo final', fmt(saldoFinal)],
    ['Número de movimientos', String(result.movimientos.length)],
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RESUMEN DEL PERÍODO', marginX, cursor);
  cursor += 12;
  for (const [label, value] of lineas) {
    if (cursor > pageHeight - 60) {
      doc.addPage();
      cursor = 60;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(label, marginX, cursor);
    doc.text(value, marginX + 180, cursor, { align: 'right' });
    cursor += 11;
  }

  // Pie por página: numeración + identificación (misión §7.3).
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Generado por COSTPRO · ${ctx.storeName} · ${ctx.categoryCode}`,
      marginX, pageHeight - 18,
    );
    doc.text(`Página ${p} de ${totalPaginas}`, pageWidth - marginX, pageHeight - 18, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  doc.save(`mayor_${ctx.categoryCode}_${ctx.from}_${ctx.to}`.toLowerCase() + '.pdf');
}
