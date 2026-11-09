/**
 * PIE DE FIRMA UNIFICADO de los modelos SC — referencia de diseño del
 * propietario (2026-11-09)
 * ======================================================================
 * Sustituye a la antigua cuadrícula con marcos (CP-DOC-SC-DATA-MAPPING-006)
 * y verifica la GEOMETRÍA y el CONTENIDO del nuevo pie:
 *  · Áreas de firma ABIERTAS (sin cajas): línea de rúbrica compartiendo la
 *    MISMA Y en toda la fila y cargo centrado EN MAYÚSCULAS debajo.
 *  · Nombre dinámico ENCIMA de la línea cuando COSTPRO lo conoce.
 *  · Sección de datos con título + regla («TRANSPORTADOR:») y cuadrícula de
 *    campos «Etiqueta: valor/línea» — la FIRMA del transportador es un campo
 *    más de la cuadrícula (línea de cumplimentación siempre presente).
 *  · Campos sueltos tras las firmas («No. Consecutivo del modelo» SC-2-09).
 *  · El conjunto completo (firmas + secciones) se mueve JUNTO a una página
 *    nueva si no cabe — ninguna firma separada de su contenido.
 *  · measureRes11SignatureFooterHeight coincide exactamente con el dibujo.
 */

import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  drawRes11SignatureFooter,
  measureRes11SignatureFooterHeight,
  type Res11SignatureFooterSpec,
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
  vi.spyOn(doc, 'rect').mockImplementation((x, y, w, h, _style) => {
    rects.push({ x, y, w, h });
    return doc;
  });
  vi.spyOn(doc, 'line').mockImplementation((x1, y1, x2, y2) => {
    lines.push({ x1, y1, x2, y2 });
    return doc;
  });
  return { doc, rects, lines, addPage };
}

const tresEmpleados: Res11SignatureFooterSpec = {
  signatures: [
    { role: 'Firma del empleado que recepciona' },
    { role: 'Firma del empleado que contabiliza' },
    { role: 'Firma del empleado que anota en el Control de Inventario' },
  ],
  columns: 3,
};

const specSc204Completo: Res11SignatureFooterSpec = {
  ...tresEmpleados,
  fieldsSection: {
    title: 'Transportador',
    columns: 2,
    fields: [
      { label: 'Nombre:', value: 'Juan Pérez' },
      { label: 'Chapa:', value: 'P 123 456' },
      { label: 'Carné de identidad:', value: '91080512345' },
      { label: 'Casilla:', value: '' },
      { label: 'Firma:', value: '' },
      { label: 'Guía aérea:', value: '' },
    ],
  },
};

describe('Pie de firma unificado SC (línea arriba, cargo en MAYÚSCULAS debajo)', () => {
  it('áreas ABIERTAS: sin marcos y las tres líneas de una fila a la MISMA Y', () => {
    const { doc, rects, lines } = instrument();
    const startY = 150;
    const endY = drawRes11SignatureFooter(doc, tresEmpleados, startY);

    // La referencia abandona las cajas: ningún rect en el pie.
    expect(rects).toHaveLength(0);
    // Solo las 3 líneas de firma; TODAS horizontales y a la misma altura.
    expect(lines).toHaveLength(3);
    const ys = new Set(lines.map((l) => l.y1));
    expect(ys.size).toBe(1);
    // Columnas iguales que cubren el ancho útil (con margen interior de 3 mm).
    const [a, b, c] = lines;
    const colW = CONTENT_W / 3;
    expect(a.x1).toBeCloseTo(MARGIN_X + 3, 3);
    expect(a.x2).toBeCloseTo(MARGIN_X + colW - 3, 3);
    expect(b.x1).toBeCloseTo(MARGIN_X + colW + 3, 3);
    expect(c.x2).toBeCloseTo(MARGIN_X + CONTENT_W - 3, 3);
    // La Y final coincide con la medición (el caller decide saltos con ella).
    expect(endY).toBeCloseTo(
      startY + measureRes11SignatureFooterHeight(doc, tresEmpleados),
      3,
    );
  });

  it('el cargo más largo manda: la fila reserva 2 líneas de denominación', () => {
    const { doc } = instrument();
    // El tercer cargo («...ANOTA EN EL CONTROL DE INVENTARIO») envuelve a
    // dos líneas a 7 pt en columna de ~58 mm.
    const hLargo = measureRes11SignatureFooterHeight(doc, tresEmpleados);
    const hCorto = measureRes11SignatureFooterHeight(doc, {
      signatures: tresEmpleados.signatures.slice(0, 2),
      columns: 3,
    });
    expect(hLargo).toBeGreaterThan(hCorto);
  });

  it('el nombre dinámico se consigna ENCIMA de la línea (el cargo sigue debajo)', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    drawRes11SignatureFooter(
      doc,
      {
        signatures: [
          {
            role: 'Realiza el inventario (nombre y firma)',
            name: 'Marta Rodríguez',
          },
        ],
        columns: 1,
      },
      100,
    );
    const text = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(text).toContain('Marta Rodríguez');
    // (los paréntesis llegan escapados en el stream del PDF)
    expect(text).toContain('REALIZA EL INVENTARIO');
    expect(text).toContain('NOMBRE Y FIRMA');
  });

  it('sección «TRANSPORTADOR:»: regla a lo ancho y 6 campos con su línea (la FIRMA incluida)', () => {
    const { doc, lines } = instrument();
    const startY = 120;
    drawRes11SignatureFooter(doc, specSc204Completo, startY);
    // 3 líneas de firmas + 1 regla del título + 6 líneas de campos.
    expect(lines).toHaveLength(3 + 1 + 6);
    // La regla del título abarca prácticamente todo el ancho útil
    // (x+1.5 → x+w-1.5 = CONTENT_W - 3).
    const regla = lines.find((l) => l.x2 - l.x1 > CONTENT_W - 8);
    expect(regla).toBeDefined();
    // La regla queda DEBAJO del título y ENCIMA de la cuadrícula de campos.
    const firmaYs = lines.slice(0, 3).map((l) => l.y1);
    expect(Math.max(...firmaYs)).toBeLessThan(regla!.y1);
    expect(endYConsistente(doc, specSc204Completo, startY)).toBe(true);
  });

  it('el conjunto completo (firmas + transportador) salta JUNTO a una página nueva', () => {
    const { doc, lines, addPage } = instrument();
    const startY = LETTER_H - 40; // no cabe el pie completo
    drawRes11SignatureFooter(doc, specSc204Completo, startY);

    expect(addPage).toHaveBeenCalledTimes(1);
    // Todo el pie quedó en la página nueva, en su zona superior.
    const ys = lines.map((l) => l.y1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...ys)).toBeLessThan(150);
  });

  it('campo suelto tras las firmas («No. Consecutivo del modelo» del SC-2-09)', () => {
    const { doc, lines } = instrument();
    const startY = 150;
    const spec: Res11SignatureFooterSpec = {
      signatures: [
        { role: 'Entrega los productos (nombre y firma)' },
        { role: 'Recibe los productos (nombre y firma)' },
        { role: 'Autoriza la Transferencia' },
      ],
      columns: 3,
      trailingFields: [{ label: 'No. Consecutivo del modelo:' }],
      trailingColumns: 2,
    };
    const endY = drawRes11SignatureFooter(doc, spec, startY);
    // 3 líneas de firma + 1 línea del campo suelto.
    expect(lines).toHaveLength(4);
    expect(endY).toBeCloseTo(startY + measureRes11SignatureFooterHeight(doc, spec), 3);
  });

  it('render: cargos en MAYÚSCULAS y «TRANSPORTADOR:» con dos puntos en el PDF', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    drawRes11SignatureFooter(doc, specSc204Completo, 120);
    const text = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
    expect(text).toContain('TRANSPORTADOR:');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE RECEPCIONA');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE CONTABILIZA');
    expect(text).toContain('Carné de identidad:');
    expect(text).toContain('Guía aérea:');
  });
});

/** El dibujo consume exactamente el alto medido (invariante measure = draw). */
function endYConsistente(
  doc: jsPDF,
  spec: Res11SignatureFooterSpec,
  startY: number,
): boolean {
  const endY = drawRes11SignatureFooter(doc, spec, startY);
  return Math.abs(endY - (startY + measureRes11SignatureFooterHeight(doc, spec))) < 0.01;
}
