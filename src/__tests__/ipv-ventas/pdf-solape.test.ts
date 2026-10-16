/**
 * MISIÓN PRESENTACIÓN 2026-10-16 — regresión del solape de encabezados en la
 * 1ª página del PDF del IPV.
 *
 * DEFECTO: autoTable llama a didDrawPage también al INICIAR la página 1, así
 * que se dibujaba el header compacto ENCIMA del header completo (texto
 * superpuesto solo en la 1ª página; el resto de páginas quedaba correcto).
 *
 * FIX: registro decoratedPages — cada página se decora UNA sola vez (1ª =
 * completo; siguientes = compacto).
 *
 * El PDF de jsPDF se genera sin compresión → el título «INGRESOS POR VENTAS»
 * aparece UNA vez por página en el stream bruto. Antes del fix: páginas + 1
 * (la 1ª lo pintaba dos veces). Después del fix: exactamente = nº de páginas.
 */
import { describe, it, expect } from 'vitest';
import { buildIpvVentasPdf } from '@/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf';
import type { IpvRow, IpvIncidence } from '@/lib/ipv-ventas/compute';

function fila(i: number): IpvRow {
  return {
    productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    sku: String(100 + i),
    name: `Producto de prueba ${i} — relleno para forzar paginación del PDF`,
    unit: 'u',
    existenciaInicial: 10,
    cantidadesVendidas: 2,
    valesSalidas: 0,
    entradas: 5,
    devoluciones: 0,
    ajustes: 0,
    transferencias: 0,
    existenciaFinal: 13,
    ventasImporteCup: 4000,
    ventasImporteUsd: 0,
    hasPeriodMovements: true,
    incidenceTypes: [],
  };
}

describe('PDF del IPV — solape de encabezados y multi-página', () => {
  it('página 1 con header pintado UNA sola vez (n.º títulos = n.º páginas) y ≥2 páginas', async () => {
    const rows = Array.from({ length: 90 }, (_, i) => fila(i));
    const incidences: IpvIncidence[] = [{
      productId: rows[0].productId,
      sku: rows[0].sku,
      name: rows[0].name,
      type: 'RECONCILIATION',
      detail: 'Incidencia sintética para ejercitar la sección del PDF.',
      calculated: 26,
      expected: 21,
      difference: -5,
    }];
    const doc = await buildIpvVentasPdf({
      storeName: 'Tienda de Prueba',
      startDateLabel: '2026-10-14',
      endDateLabel: '2026-10-15',
      rows,
      incidences,
      generatedAt: '2026-10-16T12:00:00.000Z',
    });

    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(2); // escenario real: tabla que pagina

    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    const titulos = raw.split('INGRESOS POR VENTAS').length - 1;
    // Antes del fix: pages + 1 (la 1ª página pintaba el título dos veces,
    // solapado). Después del fix: exactamente UN título por página.
    expect(titulos).toBe(pages);

    // Estructura mínima del documento
    expect(raw).toContain('TOTALES');
    expect(raw).toContain('Incidencias de conciliación');
    expect(raw).toContain('Página 1 de');
  });

  it('documento con una sola página también queda sin título duplicado', async () => {
    const doc = await buildIpvVentasPdf({
      storeName: 'Tienda Pequeña',
      startDateLabel: '2026-10-14',
      endDateLabel: '2026-10-14',
      rows: [fila(1), fila(2)],
      incidences: [],
      generatedAt: '2026-10-16T12:00:00.000Z',
    });
    const raw = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    expect(raw.split('INGRESOS POR VENTAS').length - 1).toBe(doc.getNumberOfPages());
  });
});
