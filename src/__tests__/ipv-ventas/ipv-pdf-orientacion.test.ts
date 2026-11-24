/**
 * Pruebas del PDF del IPV por ORIENTACIÓN (misión 2026-11-24 fase 5) y del
 * respeto de «Ocultar columnas sin valores» (fase 4B) y de la retirada de la
 * columna «Valor histórico» (fase 3).
 *
 * Técnica: jsPDF REAL sin compresión → el stream bruto contiene los literales
 * de texto (mismo enfoque de pdf-solape.test.ts).
 *
 * Verifica:
 *  · Horizontal (por defecto): A4 apaisado (ancho > alto), tabla única.
 *  · Vertical: A4 retrato (ancho < alto) y BLOQUES de columnas con Código y
 *    Descripción REPETIDOS en cada bloque + fila TOTALES por bloque.
 *  · hiddenColumns: las columnas ocultas de la vista NO aparecen (encabezado
 *    ni totales) — el PDF refleja la vista.
 *  · Sin la columna retirada «Valor histórico» en ninguna orientación.
 *  · Encabezados repetidos en páginas siguientes (autoTable) — ambas orientaciones.
 */
import { describe, it, expect } from 'vitest';
import { buildIpvVentasPdf } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import type { IpvRow, IpvIncidence } from '@/lib/ipv-ventas/compute';

const NOMBRES_CORTOS = [
  'Taladro con batería', 'Brackerá de 12 posiciones', 'Compresor de aire',
  'Royal Cole', 'Detergente', 'Cemento Blanco 2 Kg', 'MPPT 4000W',
];

function fila(i: number): IpvRow {
  return {
    productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    sku: String(87 + i),
    name: NOMBRES_CORTOS[i % NOMBRES_CORTOS.length],
    unit: 'u',
    existenciaInicial: 10 + i,
    cantidadesVendidas: 2,
    valesSalidas: i % 2,
    entradas: 5,
    devoluciones: 0,
    ajustes: 0,
    transferencias: 0,
    existenciaFinal: 13 + i,
    ventasImporteCup: 4000 + i,
    ventasImporteUsd: i === 0 ? 67.5 : 0,
    ventasCupHistorico: 0,
    hasPeriodMovements: true,
    incidenceTypes: [],
  };
}

const incidences: IpvIncidence[] = [{
  productId: fila(0).productId, sku: fila(0).sku, name: fila(0).name,
  type: 'RECONCILIATION', detail: 'Diferencia reportada tal cual — no ajustada.',
  calculated: 26, expected: 21, difference: -5,
}];

const basePayload = {
  storeName: 'ENERVIDA-VITALLCONS',
  startDateLabel: '2026-11-01',
  endDateLabel: '2026-11-30',
  rows: Array.from({ length: 60 }, (_, i) => fila(i)),
  incidences,
  generatedAt: '2026-11-24T12:00:00.000Z',
};

describe('PDF del IPV — orientación HORIZONTAL (por defecto)', () => {
  it('A4 apaisado (ancho > alto), tabla única con todas las columnas y totales', async () => {
    const doc = await buildIpvVentasPdf(basePayload);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    expect(w).toBeGreaterThan(h); // apaisado
    expect(Math.round(w)).toBeCloseTo(841.89, 0); // A4 landscape en pt

    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    // Tabla única: «Código» aparece UNA vez por página (thead repetido)
    // más UNA del encabezado de la tabla de incidencias.
    const paginas = doc.getNumberOfPages();
    expect(raw.split('Código').length - 1).toBe(paginas + 1);
    // Todas las columnas presentes (la horizontal no divide en bloques).
    expect(raw).toContain('Ventas CUP');
    expect(raw).toContain('Ventas USD');
    expect(raw).toContain('Exist.');
    // Totales al pie.
    expect(raw).toContain('TOTALES');
    // Sin la columna retirada (fase 3).
    expect(raw).not.toContain('Valor histórico');
  });

  it('acepta orientación explícita landscape y respeta hiddenColumns (tabla y TOTALES)', async () => {
    const doc = await buildIpvVentasPdf({
      ...basePayload,
      orientation: 'landscape',
      hiddenColumns: new Set(['ventasImporteUsd', 'ajustes', 'transferencias', 'devoluciones', 'valesSalidas']),
    });
    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    // Columnas sin valores NO aparecen en encabezado ni totales («Devolu-» es
    // el fragmento del encabezado multi-línea; la nota metodológica dice
    // «Devoluciones» sin guion, por eso el fragmento es exclusivo del thead).
    expect(raw).not.toContain('Ventas USD');
    expect(raw).not.toContain('Devolu-');
    // …y las con valores permanecen.
    expect(raw).toContain('Ventas CUP');
    expect(raw).toContain('Cant.');
  });
});

describe('PDF del IPV — orientación VERTICAL (retrato, bloques de columnas)', () => {
  it('A4 retrato (ancho < alto) con Código/Descripción REPETIDOS por bloque y TOTALES por bloque', async () => {
    const doc = await buildIpvVentasPdf({ ...basePayload, orientation: 'portrait' });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    expect(h).toBeGreaterThan(w); // retrato
    expect(Math.round(w)).toBeCloseTo(595.28, 0); // A4 portrait en pt

    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    // 10 columnas visibles → ceil(10/4) = 3 bloques: «Código» aparece en el
    // encabezado de CADA bloque (más repeticiones en páginas nuevas).
    const vecesCodigo = raw.split('Código').length - 1;
    expect(vecesCodigo).toBeGreaterThanOrEqual(3);
    // TOTALES por bloque (3 bloques → al menos 3 filas de totales).
    const vecesTotales = raw.split('TOTALES').length - 1;
    expect(vecesTotales).toBeGreaterThanOrEqual(3);
    // Los importes llegan al final del informe (bloque 3) — totales visibles.
    expect(raw).toContain('Ventas CUP');
    expect(raw).toContain('Ventas USD');
    expect(raw).not.toContain('Valor histórico'); // fase 3: retirada también en vertical
  });

  it('con columnas ocultas por la vista, los bloques se recalcúlan (menos bloques)', async () => {
    const doc = await buildIpvVentasPdf({
      ...basePayload,
      orientation: 'portrait',
      hiddenColumns: new Set(['valesSalidas', 'devoluciones', 'ajustes', 'transferencias', 'ventasImporteUsd']),
    });
    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    // 5 columnas visibles → 2 bloques: «Código» en el encabezado de cada bloque
    // (y en cada página que cada bloque ocupe).
    const vecesCodigo = raw.split('Código').length - 1;
    expect(vecesCodigo).toBeGreaterThanOrEqual(2);
    // Las columnas ocultas NO aparecen tampoco en vertical («Devolu-» = thead;
    // la nota dice «Devoluciones» completa, sin guion).
    expect(raw).not.toContain('Ventas USD');
    expect(raw).not.toContain('Devolu-');
  });

  it('los encabezados se repiten en las páginas siguientes (multi-página vertical con 90 productos)', async () => {
    const doc = await buildIpvVentasPdf({
      ...basePayload,
      orientation: 'portrait',
      rows: Array.from({ length: 90 }, (_, i) => fila(i)),
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    // Con varias páginas y varios bloques, «Código» aparece en cada página de
    // cada bloque activo — siempre al menos una vez por página de bloque.
    const paginas = doc.getNumberOfPages();
    expect(raw.split('Código').length - 1).toBeGreaterThanOrEqual(paginas);
    // Pie de página numerado en todas.
    expect(raw).toContain(`Página ${paginas} de ${paginas}`);
  });
});
