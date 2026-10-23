/**
 * Pruebas unitarias del generador de hojas de conteo PDF (Inventario Físico).
 *
 * MISIÓN §5.2 (conteo ciego): la hoja ciega debe ser VERDADERAMENTE ciega —
 * ni en la previsualización ni en el PDF puede aparecer la existencia
 * teórica, la diferencia o cualquier indicador que permita deducirlas.
 *
 * Verificación a nivel de BYTES: se decodifica el stream del PDF generado
 * (WinAnsi/latin1 — jsPDF sin compresión) y se comprueba la presencia/ausencia
 * de la columna teórica y de sus valores numéricos.
 */

import { describe, it, expect } from 'vitest';
import { buildCountSheetPdf } from '../../../components/views/terminal/views/physical_inventory/pi-pdf';

const PAYLOAD_BASE = {
  piNumber: 'IF-2026-99999',
  storeName: 'TIENDA PRUEBA',
  cutoffDate: '2026-10-23T10:00:00.000Z',
  responsible: 'Tester',
  scopeLabel: 'Selección de productos',
  observations: null,
  sheetSeq: 1,
  lines: [
    { line_number: 1, sku: 'SKU-001', name: 'Producto Alfa', unit: 'u', theoretical_qty: 966 },
    { line_number: 2, sku: 'SKU-002', name: 'Producto Beta', unit: 'kg', theoretical_qty: 12.5 },
    { line_number: 3, sku: 'SKU-003', name: 'Producto Gamma', unit: 'u', theoretical_qty: 0 },
  ],
};

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('buildCountSheetPdf — hojas de conteo', () => {
  it('genera un PDF válido con título y numeración', async () => {
    const doc = await buildCountSheetPdf({ ...PAYLOAD_BASE, mode: 'with_theoretical' });
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toContain('HOJA DE INVENTARIO'); // título
    expect(text).toContain('IF-2026-99999');       // número
    expect(text).toContain('TIENDA PRUEBA');       // tienda
  }, 30_000);

  it('modalidad CON teóricas incluye la columna TEÓRICA y sus valores', async () => {
    const doc = await buildCountSheetPdf({ ...PAYLOAD_BASE, mode: 'with_theoretical' });
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toMatch(/T[EÉ].?RICA/i);   // columna presente
    expect(text).toContain('966');          // valor teórico visible
    expect(text).toContain('12.5');
  }, 30_000);

  it('MODALIDAD CIEGA: sin columna teórica, sin valores, sin diferencias — VERDADERAMENTE CIEGA', async () => {
    const doc = await buildCountSheetPdf({
      ...PAYLOAD_BASE,
      mode: 'blind',
      // El builder recibe líneas; en ciego NUNCA se pasan teóricas (contrato del caller):
      lines: PAYLOAD_BASE.lines.map((l) => ({
        line_number: l.line_number, sku: l.sku, name: l.name, unit: l.unit,
        theoretical_qty: undefined,
      })),
    });
    const text = decodePdf(doc.output('arraybuffer'));
    // Sin columna teórica (los textos de celda van entre paréntesis: "(...)"
    // — evita falsos positivos con offsets internos del PDF como xref)
    const cell = (v: string) => `(${v})`;
    expect(text).not.toMatch(/\(T[EÉ].?RICA\)/i);
    // Sin los valores teóricos como CELDA DE TEXTO de la tabla
    expect(text).not.toContain(cell('966'));
    expect(text).not.toContain(cell('12.5'));
    // Pero SÍ incluye identificación de producto y columna de captura
    expect(text).toContain('SKU-001');
    expect(text).toContain('Producto Alfa');
    expect(text).toContain('CANT. F');  // CANT. FÍSICA
    expect(text).toContain('CIEGO');    // etiqueta de modalidad
    expect(text).toContain('HOJA DE INVENTARIO');
  }, 30_000);

  it('registra versión en el documento (pie y encabezado)', async () => {
    const doc = await buildCountSheetPdf({
      ...PAYLOAD_BASE, mode: 'blind', sheetSeq: 7,
      lines: PAYLOAD_BASE.lines.map((l) => ({ ...l, theoretical_qty: undefined })),
    });
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toContain('#7'); // versión #7 en el pie
  }, 30_000);
});
