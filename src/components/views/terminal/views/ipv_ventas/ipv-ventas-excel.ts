/**
 * IPV — Ingresos por Ventas: exportación Excel (.xlsx).
 *
 * MISIÓN §11:
 *  · Una fila por producto, MISMO orden de columnas que la tabla y el PDF
 *    (misma ejecución del informe → escenario K).
 *  · Cantidades e importes como NÚMEROS REALES (no texto), con formatos
 *    numéricos (#,##0.### / #,##0.00) aplicados a nivel de celda.
 *  · Códigos de producto como TEXTO (conserva ceros iniciales) y sanitizados
 *    contra inyección de fórmulas (= + − @ → se prefijan con apóstrofe).
 *  · Hoja "Incidencias" claramente separada y conciliada con la hoja resumen.
 *  · Totales idénticos a los del informe visible (totalsFromRows sobre las
 *    filas filtradas — el caller pasa las MISMAS filas que pintó la tabla).
 *  · N/D se escribe como texto "N/D" (no como 0 falso).
 */

import { totalsFromRows, type IpvRow, type IpvIncidence } from '@/lib/ipv-ventas/compute';
import { IPV_COLUMN_LABELS } from '@/lib/ipv-ventas/format';

export interface IpvExcelPayload {
  storeName: string;
  startDateLabel: string;
  endDateLabel: string;
  rows: IpvRow[];
  incidences: IpvIncidence[];
  generatedAt: string;
  excludedCount?: number;
}

type CellValue = string | number;

const QTY_ZFMT = "#,##0.####";
const MONEY_ZFMT = '#,##0.00';

/**
 * Neutraliza CSV/formula injection: los valores de texto que Excel podría
 * interpretar como fórmula se prefijan con apóstrofe (convención segura).
 */
export function sanitizeExcelText(v: string): string {
  if (v.length > 0 && ['=', '+', '-', '@', '\t', '\r'].some((ch) => v.startsWith(ch))) {
    return `'${v}`;
  }
  return v;
}

function qtyCell(v: number | null): CellValue {
  return v === null ? 'N/D' : v;
}

export async function buildIpvVentasWorkbook(payload: IpvExcelPayload): Promise<void> {
  const XLSX = (await import('@e965/xlsx')).default ?? (await import('@e965/xlsx'));
  const totals = totalsFromRows(payload.rows);

  const wb = XLSX.utils.book_new();

  // ── Hoja 1: IPV (resumen) ─────────────────────────────────────────────────
  const aoa: CellValue[][] = [
    ['IPV — INGRESOS POR VENTAS'],
    ['Tienda:', payload.storeName],
    ['Período:', `${payload.startDateLabel} — ${payload.endDateLabel}`],
    ['Generado:', new Date(payload.generatedAt).toLocaleString('es')],
    ['Monedas:', 'CUP contable (tasa histórica por venta); USD nativo informativo'],
    ['Productos incluidos:', payload.rows.length],
    [],
    [
      IPV_COLUMN_LABELS.sku,
      IPV_COLUMN_LABELS.name,
      IPV_COLUMN_LABELS.existenciaInicial,
      IPV_COLUMN_LABELS.cantidadesVendidas,
      IPV_COLUMN_LABELS.valesSalidas,
      IPV_COLUMN_LABELS.entradas,
      IPV_COLUMN_LABELS.devoluciones,
      IPV_COLUMN_LABELS.ajustes,
      IPV_COLUMN_LABELS.transferencias,
      IPV_COLUMN_LABELS.existenciaFinal,
      IPV_COLUMN_LABELS.ventasImporteCup,
      IPV_COLUMN_LABELS.ventasImporteUsd,
    ],
  ];

  for (const r of payload.rows) {
    aoa.push([
      sanitizeExcelText(r.sku),
      sanitizeExcelText(r.name),
      qtyCell(r.existenciaInicial),
      r.cantidadesVendidas,
      r.valesSalidas,
      r.entradas,
      r.devoluciones,
      r.ajustes,
      r.transferencias,
      qtyCell(r.existenciaFinal),
      r.ventasImporteCup,
      r.ventasImporteUsd,
    ]);
  }

  aoa.push([
    'TOTALES',
    '',
    qtyCell(totals.existenciaInicial),
    totals.cantidadesVendidas,
    totals.valesSalidas,
    totals.entradas,
    totals.devoluciones,
    totals.ajustes,
    totals.transferencias,
    qtyCell(totals.existenciaFinal),
    totals.ventasImporteCup,
    totals.ventasImporteUsd,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Formatos numéricos por columna (datos empiezan en la fila 9, 0-idx 8)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let R = 8; R <= range.e.r; R += 1) {
    for (const C of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.t === 'n') cell.z = QTY_ZFMT;
    }
    for (const C of [10, 11]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && cell.t === 'n') cell.z = MONEY_ZFMT;
    }
  }

  ws['!cols'] = [
    { wch: 14 }, { wch: 38 }, { wch: 12 }, { wch: 12 }, { wch: 11 },
    { wch: 10 }, { wch: 13 }, { wch: 9 }, { wch: 14 }, { wch: 12 },
    { wch: 15 }, { wch: 12 },
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'IPV');

  // ── Hoja 2: Incidencias de conciliación ──────────────────────────────────
  const incAoa: CellValue[][] = [
    ['Incidencias de conciliación — diferencias reportadas tal cual, no ajustadas'],
    ['Tienda:', payload.storeName, 'Período:', `${payload.startDateLabel} — ${payload.endDateLabel}`],
    [],
    ['Código', 'Producto', 'Tipo', 'Calculado (ledger)', 'Esperado (canónico)', 'Diferencia', 'Detalle'],
  ];
  for (const i of payload.incidences) {
    incAoa.push([
      sanitizeExcelText(i.sku),
      sanitizeExcelText(i.name),
      i.type,
      i.calculated === null || i.calculated === undefined ? 'N/D' : i.calculated,
      i.expected === null || i.expected === undefined ? '' : i.expected,
      i.difference === null || i.difference === undefined ? '' : i.difference,
      sanitizeExcelText(i.detail),
    ]);
  }
  if (payload.incidences.length === 0) {
    incAoa.push(['(sin incidencias)']);
  }
  incAoa.push([]);
  incAoa.push([`Productos excluidos por la regla de inclusión (saldo y movimientos nulos): ${payload.excludedCount ?? 0}`]);

  const wsInc = XLSX.utils.aoa_to_sheet(incAoa);
  wsInc['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 18 }, { wch: 17 }, { wch: 18 }, { wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInc, 'Incidencias');

  // ── Hoja 3: Nota metodológica ─────────────────────────────────────────────
  const noteAoa: CellValue[][] = [
    ['Nota metodológica del IPV'],
    [],
    ['Fórmula de conciliación:', 'Existencia final = Existencia inicial + Entradas + Devoluciones − Cantidades vendidas − Vales de salida ± Ajustes ± Transferencias'],
    ['Existencia inicial:', 'Saldo reconstruido del ledger de movimientos (stock_movements.quantity_change) anterior a la fecha inicial del período. N/D = no reconstruible (carga inicial previa al ledger).'],
    ['Fuente de cantidades:', 'stock_movements (ledger canónico; fecha operativa movement_date). Nunca se mezclan kardex_entries ni tablas de venta para cantidades.'],
    ['Fuente de importes:', 'transaction_items de ventas con estado "completed" del período (precio capturado al vender, convertido a CUP con la tasa histórica de cada venta). Devoluciones completadas se restan por producto.'],
    ['Monedas:', 'La columna Ventas (CUP) es la moneda contable del sistema. La columna Ventas USD es informativa (importe nativo de líneas vendidas en USD); NO se suman entre sí.'],
    ['Regla de inclusión:', 'Se incluye un producto con existencia inicial ≠ 0, o movimientos en el período, o existencia final ≠ 0, o importe vendido, o incidencia de conciliación.'],
    ['Descuentos:', 'El importe usa la línea bruta cobrada: en COSTPRO, transactions.total_amount = suma de líneas brutas (item_discount_value es informativo, verificado en BD).'],
  ];
  const wsNote = XLSX.utils.aoa_to_sheet(noteAoa);
  wsNote['!cols'] = [{ wch: 22 }, { wch: 130 }];
  XLSX.utils.book_append_sheet(wb, wsNote, 'Nota metodológica');

  await XLSX.writeFile(wb, `IPV_${payload.storeName}_${payload.startDateLabel}_${payload.endDateLabel}.xlsx`.replace(/[^a-zA-Z0-9._\-]+/g, '_'));
}
