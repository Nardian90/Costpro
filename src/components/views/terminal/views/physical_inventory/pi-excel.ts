/**
 * Inventario Físico — plantilla Excel e importación de conteos.
 *
 * PATRÓN DEL PROYECTO (catalog-service.ts):
 *   - Carga perezosa vía createWorkbook() (@e965/xlsx)
 *   - Plantilla oficial generada por COSTPRO con encabezados claros
 *   - La importación se valida CONTRA las líneas del inventario (nunca contra
 *     el catálogo completo) usando el identificador estable de línea (uuid)
 *     — no el nombre del producto.
 *
 * REGLA DE CIEGO: en blind_mode la plantilla NO incluye existencias teóricas
 * ni diferencias; la persona que cuenta solo ve identificación + cantidad.
 *
 * REGLA DE VACÍO ≠ CERO: una celda de cantidad vacía se omite (la línea
 * permanece pendiente); un 0 explícito se importa como cero contado.
 */

import { createWorkbook } from '@/lib/export/lazy-excel';
import type { PILine } from './pi-types';

// ──────────────────────────────────────────────────────────────────────────
// Plantilla oficial
// ──────────────────────────────────────────────────────────────────────────

export interface TemplatePayload {
  piNumber: string;
  storeName: string;
  cutoffDate: string;
  responsible: string;
  blind: boolean;
  lines: PILine[];
}

const HEADER_FILL = 'E4E7EE';
const THIN_BORDER = { style: 'thin', color: { rgb: '6B7280' } as const };

export async function downloadCountTemplate(payload: TemplatePayload): Promise<void> {
  const XLSX = await createWorkbook();
  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Información del inventario
  const info: string[][] = [
    ['INVENTARIO FÍSICO — PLANTILLA DE CONTEO'],
    [],
    ['Inventario', payload.piNumber],
    ['Tienda', payload.storeName],
    ['Fecha de corte', new Date(payload.cutoffDate).toLocaleString('es-ES')],
    ['Responsable', payload.responsible || '—'],
    ['Modalidad', payload.blind ? 'CONTEO CIEGO (sin existencias teóricas)' : 'Con existencias teóricas'],
    [],
    ['INSTRUCCIONES'],
    ['1. Registre la cantidad física contada en la columna "Cantidad Física".'],
    ['2. Un 0 explícito significa "contado y no hay existencia". Una celda VACÍA significa "no contado" (la línea queda pendiente).'],
    ['3. No elimine ni modifique las columnas "ID Línea", "Código" o "Nº" — se usan para vincular el conteo.'],
    ['4. No cambie el orden de las columnas ni agregue filas nuevas: use solo las filas existentes.'],
    ['5. Las cantidades admiten decimales cuando la unidad lo requiera (p. ej. 1.5 kg).'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 42 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Información');

  // ── Hoja 2: Conteo
  const header = payload.blind
    ? ['Nº', 'ID Línea', 'Código', 'Producto', 'Unidad', 'Cantidad Física', 'Observaciones']
    : ['Nº', 'ID Línea', 'Código', 'Producto', 'Unidad', 'Teórica (informativa)', 'Cantidad Física', 'Observaciones'];

  const rows: (string | number)[][] = payload.lines.map((l) =>
    payload.blind
      ? [l.line_number, l.id, l.sku || '', l.name, l.unit, '', '']
      : [l.line_number, l.id, l.sku || '', l.name, l.unit, Number(l.theoretical_qty ?? 0), '', '']
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const nCols = header.length;
  const lastCol = XLSX.utils.encode_col(nCols - 1);
  // Encabezado en negrita + fondo (xlsx-js-style NO mezclado aquí: la plantilla
  // usa @e965/xlsx; los estilos de celda se aplican con z === '@' de texto simple)
  (ws as unknown as { ['!format' as string]: unknown })['!freeze'] = 'A2';
  ws['!cols'] = payload.blind
    ? [{ wch: 6 }, { wch: 38 }, { wch: 16 }, { wch: 42 }, { wch: 10 }, { wch: 16 }, { wch: 32 }]
    : [{ wch: 6 }, { wch: 38 }, { wch: 16 }, { wch: 42 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 32 }];
  // Cantidad física como número editable
  const qtyCol = payload.blind ? 'F' : 'G';
  for (let r = 2; r <= rows.length + 1; r++) {
    const cell = ws[`${qtyCol}${r}`];
    if (cell) cell.z = '#,##0.####';
  }
  void lastCol;
  XLSX.utils.book_append_sheet(wb, ws, 'Conteo');

  XLSX.writeFile(wb, `Plantilla_Conteo_${payload.piNumber.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`);
}

// ──────────────────────────────────────────────────────────────────────────
// Importación con validación (previsualización antes de confirmar)
// ──────────────────────────────────────────────────────────────────────────

export interface ImportRow {
  rowNumber: number;      // fila del Excel (1-indexed, contando encabezado)
  item_id: string;         // uuid de la línea
  counted_qty: number | null;
  notes: string | null;
  line: PILine;            // línea destino
}

export interface ImportError {
  rowNumber: number;
  message: string;
  raw: string;
}

export interface ImportReport {
  valid: ImportRow[];              // listas para aplicar
  errors: ImportError[];           // inválidas (no se aplican)
  duplicates: ImportError[];       // ID Línea repetido en el archivo
  notFound: ImportError[];         // ID/código no pertenece al inventario
  withoutQty: number;              // filas válidas sin cantidad (se omiten)
  explicitZeros: number;           // ceros explícitos
  conflicts: Array<{ row: ImportRow; current: number | null }>; // ya contado con otro valor
  totalRows: number;
}

/** Header map flexible ES (mismas claves de la plantilla oficial). */
function matchHeader(value: unknown, keys: string[]): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return keys.some((k) => v === k || v.startsWith(k));
}

export async function parseCountImport(
  file: File,
  lines: PILine[]
): Promise<{ report: ImportReport; fatal?: string }> {
  const XLSX = await createWorkbook();
  const buf = await file.arrayBuffer();
  let wb: ReturnType<typeof XLSX.read> extends Promise<infer T> ? T : never;
  try {
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    return {
      report: emptyReport(),
      fatal: 'El archivo no es un Excel válido (.xlsx / .xls).',
    };
  }

  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes('conteo')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { report: emptyReport(), fatal: 'El archivo no contiene hojas legibles.' };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
  if (raw.length === 0) {
    return { report: emptyReport(), fatal: 'La hoja de conteo no tiene filas de datos.' };
  }

  const report = emptyReport();
  report.totalRows = raw.length;

  // Detectar columnas obligatorias en la primera fila
  const first = raw[0] ?? {};
  const keys = Object.keys(first).map((k) => k.toLowerCase());
  const colId = keys.find((k) => matchHeader(k, ['id línea', 'id linea', 'id_linea', 'line id']));
  const colQty = keys.find((k) => matchHeader(k, ['cantidad física', 'cantidad fisica', 'cantidad', 'contado', 'qty']));
  const colObs = keys.find((k) => matchHeader(k, ['observaciones', 'observacion', 'notes']));
  if (!colId || !colQty) {
    return {
      report,
      fatal:
        'Faltan columnas obligatorias: "ID Línea" y "Cantidad Física". Use la plantilla oficial de COSTPRO.',
    };
  }

  const linesById = new Map(lines.map((l) => [l.id, l]));
  const seenIds = new Set<string>();

  raw.forEach((row, idx) => {
    const rowNumber = idx + 2; // encabezado en fila 1
    const idRaw = String(row[Object.keys(row).find((k) => k.toLowerCase() === colId) ?? ''] ?? '').trim();
    const qtyRaw = row[Object.keys(row).find((k) => k.toLowerCase() === colQty) ?? ''];
    const obsRaw = row[Object.keys(row).find((k) => k.toLowerCase() === colObs) ?? ''];

    // Filas de información vacías → ignorar
    if (!idRaw && (qtyRaw === null || qtyRaw === '') && !obsRaw) return;

    if (!idRaw) {
      report.errors.push({ rowNumber, message: 'Sin ID de línea', raw: JSON.stringify(row).slice(0, 120) });
      return;
    }
    const line = linesById.get(idRaw);
    if (!line) {
      report.notFound.push({
        rowNumber,
        message: 'La línea no pertenece a este inventario (o es de otra tienda)',
        raw: idRaw,
      });
      return;
    }
    if (seenIds.has(idRaw)) {
      report.duplicates.push({ rowNumber, message: 'ID de línea duplicado en el archivo', raw: idRaw });
      return;
    }
    seenIds.add(idRaw);

    // Cantidad: vacío = omitir; inválida = error; negativa = error
    let qty: number | null = null;
    if (qtyRaw !== null && qtyRaw !== '' && qtyRaw !== undefined) {
      const n = Number(qtyRaw);
      if (!Number.isFinite(n) || n < 0) {
        report.errors.push({
          rowNumber,
          message: `Cantidad inválida: "${String(qtyRaw).slice(0, 24)}"`,
          raw: String(qtyRaw),
        });
        return;
      }
      qty = n;
    }

    if (qty === null) {
      report.withoutQty++;
      return; // celda vacía → se omite (NO es cero, NO error)
    }
    if (qty === 0) report.explicitZeros++;

    const importRow: ImportRow = {
      rowNumber,
      item_id: idRaw,
      counted_qty: qty,
      notes: obsRaw ? String(obsRaw).slice(0, 300) : null,
      line,
    };

    // Conflicto: la línea ya tenía un valor distinto capturado
    if (line.counted_qty !== null && Number(line.counted_qty) !== qty) {
      report.conflicts.push({ row: importRow, current: Number(line.counted_qty) });
    }
    report.valid.push(importRow);
  });

  return { report };
}

function emptyReport(): ImportReport {
  return {
    valid: [],
    errors: [],
    duplicates: [],
    notFound: [],
    withoutQty: 0,
    explicitZeros: 0,
    conflicts: [],
    totalRows: 0,
  };
}
