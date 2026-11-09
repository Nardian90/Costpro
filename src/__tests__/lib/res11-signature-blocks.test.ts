/**
 * CP-DOC-SC-DATA-MAPPING-006 · ajuste de densidad de firmas (2026-11-08)
 * ======================================================================
 * Verifica la GEOMETRÍA del arreglo de firmas del SC-2-04 acordado con el
 * propietario:
 *  · Fila superior: las TRES firmas de empleados en columnas iguales.
 *  · Fila inferior: FIRMA DEL TRANSPORTADOR a lo ancho (spanAll) con sus
 *    cinco datos en sub-columnas dentro del bloque (fieldsColumns) — roba
 *    bastante menos alto que apilarlos en una celda estrecha.
 *  · La línea de firma comparte la MISMA Y entre los bloques de una fila.
 *  · El conjunto completo se mueve junto a una página nueva si no cabe.
 *  · La modalidad histórica (sin spanAll/fieldsColumns) no cambia.
 */

import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  drawRes11SignatureBlocks,
  measureRes11SignatureBlocksHeight,
  type Res11SignatureBlock,
} from '@/lib/legal/res11-shared';

const LETTER_W = 215.9;
const LETTER_H = 279.4;
const MARGIN_X = 12;
const CONTENT_W = LETTER_W - MARGIN_X * 2;

function instrument() {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const addPage = vi.spyOn(doc, 'addPage');
  vi.spyOn(doc, 'rect').mockImplementation((x, y, w, h, style) => {
    rects.push({ x, y, w, h });
    return doc;
  });
  vi.spyOn(doc, 'line').mockImplementation((x1, y1, x2, y2) => {
    lines.push({ x1, y1, x2, y2 });
    return doc;
  });
  return { doc, rects, lines, addPage };
}

const bloqueEmpleados = (): Res11SignatureBlock[] => [
  { title: 'Firma del empleado que recepciona' },
  { title: 'Firma del empleado que contabiliza' },
  { title: 'Firma del empleado que anota en el Control de Inventario' },
  {
    title: 'Firma del Transportador',
    spanAll: true,
    fieldsColumns: 2,
    fields: [
      { label: 'Nombre:', value: 'Juan Pérez' },
      { label: 'Carné de identidad:', value: '91080512345' },
      { label: 'Chapa:', value: 'P 123 456' },
      { label: 'Casilla:', value: '' },
      { label: 'Guía aérea:', value: '' },
    ],
  },
];

describe('Arreglo de firmas SC-2-04 (fila de 3 + transportador a lo ancho)', () => {
  it('las tres firmas de empleados comparten fila y el transportador ocupa el ancho completo debajo', () => {
    const { doc, rects, lines } = instrument();
    const startY = 150;
    const endY = drawRes11SignatureBlocks(doc, bloqueEmpleados(), startY, { columns: 3 });

    // 4 bloques: 3 celdas (≈61.97 mm) + 1 bloque a lo ancho (191.9 mm).
    expect(rects).toHaveLength(4);
    const cellW = (CONTENT_W - 2 * 3) / 3;
    const [recepciona, contabiliza, anota, transportador] = rects;

    expect(recepciona.x).toBeCloseTo(MARGIN_X, 3);
    expect(contabiliza.x).toBeCloseTo(MARGIN_X + cellW + 3, 3);
    expect(anota.x).toBeCloseTo(MARGIN_X + 2 * (cellW + 3), 3);
    for (const r of [recepciona, contabiliza, anota]) {
      expect(r.w).toBeCloseTo(cellW, 3);
      expect(r.y).toBeCloseTo(startY, 3); // MISMA fila, misma Y de origen
      expect(r.h).toBeCloseTo(recepciona.h, 3); // misma altura en la fila
    }
    expect(transportador.w).toBeCloseTo(CONTENT_W, 3); // a lo ancho
    expect(transportador.x).toBeCloseTo(MARGIN_X, 3);
    expect(transportador.y).toBeCloseTo(startY + recepciona.h + 2, 3); // fila DEBAJO

    // El transportador compacto roba menos alto que las tres celdas juntas.
    expect(transportador.h).toBeLessThan(recepciona.h * 1.5);

    // Línea de firma compartida dentro de cada fila.
    const firmaYFila1 = lines
      .filter((l) => Math.abs(l.y1 - (startY + recepciona.h - 6)) < 0.01)
      .map((l) => l.y1);
    expect(firmaYFila1).toHaveLength(3);

    // La Y final coincide con la medición (el caller usa el mismo número
    // para decidir el salto de página).
    expect(endY).toBeCloseTo(
      startY + measureRes11SignatureBlocksHeight(doc, bloqueEmpleados(), { columns: 3 }),
      3,
    );
  });

  it('el conjunto completo salta a una página nueva si no cabe (nunca firmas separadas)', () => {
    const { doc, rects, addPage } = instrument();
    const startY = LETTER_H - 40; // no cabe el bloque completo
    drawRes11SignatureBlocks(doc, bloqueEmpleados(), startY, { columns: 3 });

    expect(addPage).toHaveBeenCalledTimes(1);
    // Todo el conjunto quedó en la página nueva, alineado desde arriba.
    for (const r of rects) {
      expect(r.y).toBeGreaterThanOrEqual(16);
      expect(r.y).toBeLessThan(70);
    }
  });

  it('la modalidad histórica (sin spanAll) no cambia: celda con etiqueta a la izquierda y valor a la mitad', () => {
    const { doc, rects } = instrument();
    const startY = 100;
    drawRes11SignatureBlocks(
      doc,
      [{ title: 'Firma del transportador', fields: [{ label: 'Nombre:', value: 'X' }] }],
      startY,
      { columns: 2 },
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].w).toBeCloseTo((CONTENT_W - 3) / 2, 3);
    expect(rects[0].h).toBe(30); // mínimo común (título + rúbrica + línea)
  });

  it('los datos del transportador a lo ancho se reparten en sub-columnas (3 líneas para 5 campos)', () => {
    const { doc, rects } = instrument();
    // Alto del transportador solo: título + 2 líneas de datos + rúbrica + firma.
    const soloTransportador: Res11SignatureBlock[] = [
      { ...bloqueEmpleados()[3] },
    ];
    const h = measureRes11SignatureBlocksHeight(doc, soloTransportador, { columns: 3 });
    // 8 título + 3×5 datos + 10 rúbrica + 7 firma = 40 (> mínimo 30).
    expect(h).toBe(40);
    // En celda estrecha con 1 sub-columna los mismos datos ocuparían 5 líneas.
    const apilado = measureRes11SignatureBlocksHeight(
      doc,
      [{ title: 'Firma del Transportador', fields: soloTransportador[0].fields }],
      { columns: 2 },
    );
    expect(apilado).toBeGreaterThan(h);
    expect(rects).toHaveLength(0);
  });
});
