/**
 * REGRESIÓN — desborde de la nota «Conciliación: …» al pie de la última hoja
 * del PDF del IPV (reportado 2026-10-16, PR #1411).
 *
 * DEFECTO: la nota metodológica contenía «−» (U+2212 MINUS SIGN), un carácter
 * FUERA de WinAnsiEncoding — la codificación de las fuentes estándar de jsPDF
 * (Helvetica). Ante ese carácter jsPDF conmuta el renglón completo a la ruta
 * de dibujo UTF-16BE (bytes NUL-padded): el renglón se DIBUJA más ancho de lo
 * que splitTextToSize lo MIDIÓN (métricas de un solo byte), terminaba en
 * x≈843.5 pt — más allá del borde físico de la hoja A4 horizontal (841.89 pt)
 * — y cada visor lo recortaba a mitad de palabra, perdiendo el tramo final
 * («…del ledger de movimientos…tasa histórica por»). Además «−» se pintaba
 * con el glifo equivocado («"»).
 *
 * FIX: pdfWinAnsi() normaliza los glifos a WinAnsi y splitToWidthVerified()
 * verifica con getTextWidth que ningún renglón exceda el ancho imprimible.
 *
 * Evidencia en el stream bruto (jsPDF sin compresión):
 *  · Antes:  '( \0C\0o\0n\0c\0i\0l\0i\0a\0c\0i…' → ruta UTF-16BE corrupta.
 *  · Después: '(Conciliación: … Devoluciones - Cantidades vendidas - Vales…'
 *    → literal WinAnsi de un byte, dentro de márgenes.
 */
import { describe, it, expect } from 'vitest';
import {
  buildIpvVentasPdf,
  pdfWinAnsi,
  splitToWidthVerified,
} from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import type { IpvRow, IpvIncidence } from '@/lib/ipv-ventas/compute';

const NOMBRES_CORTOS = [
  'Taladro con batería y barrena',
  'Brackerá de 12 posiciones',
  'Compresor de aire',
  'Barbilla de Aterramientos',
  'Royal Cole',
  'Detergente',
  'Grey cerámico beige 50x50',
  'Losa Porcelanato 25x60',
  'Batería 12.8v100Ah',
  'MPPT 4000W',
  'Cemento Blanco 2 Kg',
];

function fila(i: number): IpvRow {
  return {
    productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    sku: String(142 + i),
    name: NOMBRES_CORTOS[i % NOMBRES_CORTOS.length],
    unit: 'u',
    existenciaInicial: 10 + i,
    cantidadesVendidas: i % 3 === 0 ? 2 : 0,
    valesSalidas: i % 7 === 0 ? 1 : 0,
    entradas: i % 5 === 0 ? 3 : 0,
    devoluciones: 0,
    ajustes: 0,
    transferencias: 0,
    existenciaFinal: 10 + i,
    ventasImporteCup: i % 3 === 0 ? 4000 : 0,
    ventasImporteUsd: 0,
    hasPeriodMovements: i % 3 === 0,
    incidenceTypes: [],
  };
}

/** Extrae los literales «(…) Tj» de un segmento de stream PDF, desescapados. */
function extraerLiteralesTj(stream: string): string[] {
  const out: string[] = [];
  const re = /\((?:\\.|[^\\()])*\)/g;
  for (const m of stream.match(re) ?? []) {
    out.push(m.slice(1, -1).replace(/\\([()\\])/g, '$1'));
  }
  return out;
}

describe('PDF del IPV — nota de conciliación dentro de márgenes (PR #1411)', () => {
  it('pdfWinAnsi normaliza los caracteres fuera de WinAnsi', () => {
    expect(pdfWinAnsi('A − B')).toBe('A - B');
    expect(pdfWinAnsi('«x» \u2011 \u2013 \u2026 \u00A0')).toBe('«x» - - ...  ');
    expect(pdfWinAnsi('Existencia final')).toBe('Existencia final'); // texto limpio intacto
    expect(pdfWinAnsi('± Ajustes')).toBe('± Ajustes'); // ± SÍ está en WinAnsi: intacto
  });

  it('splitToWidthVerified: ningún renglón excede el ancho imprimible', async () => {
    const doc = await createPDFDocument('l', 'pt', 'a4');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    const printable = doc.internal.pageSize.getWidth() - 36 * 2;
    const largo = 'Conciliación: ' + 'palabra '.repeat(200);
    const lines = splitToWidthVerified(doc, largo, printable);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(doc.getTextWidth(line)).toBeLessThanOrEqual(printable + 0.35);
    }
  });

  it('caso real (94 productos, 4 páginas): la nota se dibuja en un solo byte y dentro de la hoja', async () => {
    const rows = Array.from({ length: 94 }, (_, i) => fila(i));
    const incidences: IpvIncidence[] = [{
      productId: rows[0].productId,
      sku: rows[0].sku,
      name: rows[0].name,
      type: 'RECONCILIATION',
      detail: 'Diferencia entre el total reconstruido del ledger y la existencia canónica actual.',
      calculated: 26,
      expected: 21,
      difference: -5,
    }];
    const doc = await buildIpvVentasPdf({
      storeName: 'ENERVIDA-VITALLCONS',
      startDateLabel: '2026-10-14',
      endDateLabel: '2026-10-15',
      rows,
      incidences,
      generatedAt: '2026-10-16T12:00:00.000Z',
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4); // caso real: 4 hojas

    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');

    // 1) La nota YA NO viaja por la ruta UTF-16BE (bytes NUL-padded) → lo
    //    medido == lo dibujado en cualquier visor.
    expect(raw.includes('\x00C\x00o\x00n\x00c\x00i\x00l\x00i\x00a\x00c\x00i')).toBe(false);

    // 2) El menos tipográfico se dibuja como «-» ASCII (glifo correcto y seguro).
    expect(raw).toContain('Devoluciones - Cantidades vendidas - Vales de salida');
    expect(raw).not.toContain('\u2212');
    // El par UTF-16BE de U+2212 (0x22 0x12) ya no puede aparecer en la nota.
    expect(raw.includes('\x22\x12')).toBe(false);

    // 3) Cada renglón de la nota, medido con la MISMA fuente del documento,
    //    queda dentro del ancho imprimible (margen a margen).
    const printable = doc.internal.pageSize.getWidth() - 36 * 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    const bloqueNota = raw.slice(raw.indexOf('/F3 6.8 Tf'), raw.indexOf('/F3 6.8 Tf') + 2000);
    const renglones = extraerLiteralesTj(bloqueNota).filter(
      (s) => s.startsWith('Conciliación') || s.startsWith('venta') || s.includes('excluyen'),
    );
    expect(renglones.length).toBeGreaterThanOrEqual(2); // la nota parte en varios renglones
    for (const linea of renglones) {
      expect(doc.getTextWidth(linea)).toBeLessThanOrEqual(printable + 0.5);
    }
    // Y el tramo que antes se perdía ahora está presente en el stream:
    expect(raw).toContain('importes de las líneas de venta');
  });
});
