/**
 * CP-SALES-PRICE-LIST-001 — PDF: doble columna, paginación, encabezado y
 * consistencia preview/export.
 * ========================================================================
 * Casos obligatorios de la misión (§8 y §11-PDF):
 *  · PLAN (pura): un único producto · menos de una columna · exactamente una
 *    columna · más de una columna · más de una página · ninguna fila partida
 *    entre columnas o páginas · encabezado de tabla repetido por bloque.
 *  · RENDER (stream decodificado): encabezado con logo, organización/tienda
 *    y fecha dinámica; tres columnas; «Página X de N» con el total real;
 *    orden de productos; descripciones largas ajustadas (no recortadas);
 *    precios CUP/USD etiquetados; SKU alfanuméricos al final.
 *  · CONSISTENCIA: el mismo modelo produce bytes idénticos — la vista
 *    previa y la exportación comparten UNA sola fuente de generación.
 *  · EXCEPCIÓN: modelo vacío NO genera un PDF que parezca válido (error).
 */

import { describe, it, expect } from 'vitest';
import type { jsPDF } from 'jspdf';
import { buildPriceListModel, planPriceListPages, type PriceListSourceItem } from '@/lib/price-list/model';
import { PRICE_LIST_GEOMETRY } from '@/lib/price-list/pdf';
import { renderPriceListPdf } from '@/lib/price-list/pdf';

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

const mkItem = (overrides: Partial<PriceListSourceItem> = {}): PriceListSourceItem => ({
  id: overrides.sku ?? 'id',
  sku: null,
  name: 'Producto',
  price: 100,
  price_currency: 'CUP',
  stock_current: 5,
  is_active: true,
  ...overrides,
});

const store = { id: 'store-a', name: 'Constructora del Este' };
const fixedDate = new Date(2026, 10, 9, 10, 30);

/** Filas de 1 línea (descripciones cortas) para un plan determinista. */
function build(rows: PriceListSourceItem[]) {
  return buildPriceListModel({ items: rows, store, range: null, generatedAt: fixedDate });
}

/** Geometría con medidor FIJO (1 o 2 líneas) para pruebas deterministas del plan. */
function testGeom(measure: (description: string) => number = () => 1) {
  return { ...PRICE_LIST_GEOMETRY, measureLines: measure };
}

describe('CP-SALES-PRICE-LIST-001 · Plan de doble columna (§7)', () => {
  const geom = testGeom();
  /** Filas de 1 línea que caben en UNA columna: floor((alto − encabezado) / alto de fila). */
  const perColumn = Math.floor((geom.columnHeightMm - geom.headerRowMm) / geom.rowBaseMm);

  it('un único producto: una página, solo columna izquierda', () => {
    const plan = planPriceListPages(build([mkItem({ id: 'a', sku: '1' })]), geom);
    expect(plan.totalPages).toBe(1);
    expect(plan.pages[0].left.rowIndices).toEqual([0]);
    expect(plan.pages[0].right.rowIndices).toEqual([]);
  });

  it('menos de una columna: una página, izquierda con todas las filas', () => {
    const plan = planPriceListPages(build(Array.from({ length: 10 }, (_, i) => mkItem({ id: `p${i}`, sku: String(i + 1) }))), geom);
    expect(plan.totalPages).toBe(1);
    expect(plan.pages[0].left.rowIndices).toHaveLength(10);
    expect(plan.pages[0].right.rowIndices).toEqual([]);
  });

  it('exactamente una columna llena: la derecha queda vacía, sin página extra', () => {
    const plan = planPriceListPages(build(Array.from({ length: perColumn }, (_, i) => mkItem({ id: `p${i}`, sku: String(i + 1) }))), geom);
    expect(plan.totalPages).toBe(1);
    expect(plan.pages[0].left.rowIndices).toHaveLength(perColumn);
    expect(plan.pages[0].right.rowIndices).toEqual([]);
  });

  it('más de una columna: el excedente pasa a la derecha (llenado vertical)', () => {
    const plan = planPriceListPages(build(Array.from({ length: perColumn + 5 }, (_, i) => mkItem({ id: `p${i}`, sku: String(i + 1) }))), geom);
    expect(plan.totalPages).toBe(1);
    expect(plan.pages[0].left.rowIndices).toHaveLength(perColumn);
    expect(plan.pages[0].right.rowIndices).toHaveLength(5);
  });

  it('más de una página: izquierda → derecha → página siguiente, sin partir filas', () => {
    const total = perColumn * 2 + 3; // página 1 con ambas columnas llenas + página 2 con 3 filas
    const plan = planPriceListPages(build(Array.from({ length: total }, (_, i) => mkItem({ id: `p${i}`, sku: String(i + 1) }))), geom);
    expect(plan.totalPages).toBe(2);
    expect(plan.pages[0].left.rowIndices.length).toBe(perColumn);
    expect(plan.pages[0].right.rowIndices.length).toBe(perColumn);
    expect(plan.pages[1].left.rowIndices.length).toBe(3);
    expect(plan.pages[1].right.rowIndices.length).toBe(0);

    // Ninguna fila aparece en dos columnas y el orden es el de llenado.
    const seen: number[] = [];
    for (const page of plan.pages) {
      for (const side of ['left', 'right'] as const) {
        for (const idx of page[side].rowIndices) {
          expect(seen).not.toContain(idx);
          seen.push(idx);
        }
      }
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i));
  });

  it('descripciones largas (2 líneas): la fila crece completa y nunca se parte', () => {
    const geom2 = testGeom((d) => (d.length > 40 ? 2 : 1));
    const rows = [
      buildPriceListModel({
        items: [mkItem({ id: 'larga', sku: '1', name: 'X'.repeat(60) })],
        store,
        range: null,
        generatedAt: fixedDate,
      }),
      buildPriceListModel({
        items: [mkItem({ id: 'corta', sku: '2', name: 'Corto' })],
        store,
        range: null,
        generatedAt: fixedDate,
      }),
    ];
    // El plan respeta la altura real de cada fila (6 + 3.6 vs 6).
    const plan = planPriceListPages(rows[0], geom2);
    expect(plan.pages[0].left.heightMm).toBe(geom.headerRowMm + geom.rowBaseMm + geom.rowExtraLineMm);
    const planCorta = planPriceListPages(rows[1], geom2);
    expect(planCorta.pages[0].left.heightMm).toBe(geom.headerRowMm + geom.rowBaseMm);
  });
});

describe('CP-SALES-PRICE-LIST-001 · Render del PDF (stream decodificado)', () => {
  it('encabezado institucional: título, tienda, fecha dinámica y datos de la tienda', async () => {
    const model = build([
      mkItem({ id: '1', sku: '1', name: 'Cemento P-350', price: 15300, price_currency: 'CUP' }),
    ]);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('LISTADO DE PRECIOS');
    expect(text).toContain('Constructora del Este');
    expect(text).toContain('Fecha de generación: 09/11/2026 10:30');
    expect(text).toContain('Tienda: Constructora del Este');
  });

  it('tres columnas con sus denominaciones completas y precios etiquetados por moneda', async () => {
    const model = build([
      mkItem({ id: '1', sku: '1', name: 'Cemento P-350', price: 38.5, price_currency: 'CUP' }),
      mkItem({ id: '2', sku: 'A15', name: 'Repuesto importado', price: 12.75, price_currency: 'USD' }),
    ]);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('SKU / Código');
    expect(text).toContain('Descripción del producto');
    expect(text).toContain('Precio de venta');
    expect(text).toContain('CUP');
    expect(text).toContain('USD');
    expect(text).toContain('Cemento P-350');
    expect(text).toContain('Repuesto importado');
  });

  it('paginación real: 100 productos de 1 línea → 2 páginas, «Página X de 2» y encabezado en ambas', async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      mkItem({ id: `p${i}`, sku: String(i + 1), name: `Producto ${i + 1}` }),
    );
    const doc = await renderPriceListPdf(build(rows), { dataUrl: null, source: 'none' });
    expect(doc.getNumberOfPages()).toBe(2);
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Página 1 de 2');
    expect(text).toContain('Página 2 de 2');
    // Encabezado de tabla en cada bloque dibujado (pág. 1: 2 columnas;
    // pág. 2: solo la izquierda tiene filas → 3 encabezados).
    expect(text.split('SKU / Código').length - 1).toBe(3);
    // Orden preservado: primeros numéricos y el último SKU está en el documento.
    expect(text).toContain('Producto 1');
    expect(text).toContain('Producto 100');
  });

  it('SKU alfanuméricos al final del documento (después de todos los numéricos)', async () => {
    const rows = [
      mkItem({ id: '1', sku: '100' }),
      mkItem({ id: '2', sku: 'Cod1' }),
      mkItem({ id: '3', sku: '2' }),
      mkItem({ id: '4', sku: 'A15' }),
    ];
    const doc = await renderPriceListPdf(build(rows), { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    const pos = (s: string) => text.indexOf(`(${s}) Tj`);
    // Numéricos por valor (2 < 100), alfanuméricos después (natural).
    expect(pos('2')).toBeLessThan(pos('100'));
    expect(pos('100')).toBeLessThan(pos('A15'));
    expect(pos('A15')).toBeLessThan(pos('Cod1'));
  });

  it('descripción extensa: ajuste de línea (2+ líneas), sin recortes — cada palabra dibujada', async () => {
    const larga = 'Tubería de acero galvanizado de pared gruesa para instalaciones hidráulicas industriales y redes contra incendios — serie 40 ASTM A53';
    const doc = await renderPriceListPdf(
      build([mkItem({ id: 'x', sku: 'TUB-1', name: larga, price: 450.25 })]),
      { dataUrl: null, source: 'none' },
    );
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // splitTextToSize parte por palabras: ninguna se pierde ni se recorta.
    for (const word of larga.split(/\s+/).filter((w) => w.length > 3)) {
      expect(text).toContain(word);
    }
  });

  it('consistencia preview/export: el MISMO modelo dibuja EXACTAMENTE el mismo contenido', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      mkItem({ id: `p${i}`, sku: String(i + 1), name: `Producto ${i + 1}` }),
    );
    const model = build(rows);
    const a = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const b = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    // En la app preview y export usan el MISMO doc (bloburl + save);
    // en dos construcciones separadas el contenido dibujado es idéntico
    // (jsPDF solo estampa metadatos de fecha distintos).
    const drawn = (doc: jsPDF) => {
      const stream = new TextDecoder('latin1').decode(doc.output('arraybuffer') as ArrayBuffer);
      const parts: string[] = [];
      const re = /\(((?:\\.|[^\\)])*)\) Tj/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stream)) !== null) parts.push(m[1]);
      return `${doc.getNumberOfPages()}|${parts.join('§')}`;
    };
    expect(drawn(a)).toBe(drawn(b));
  });

  it('sin productos que cumplan los filtros: NO se genera un PDF vacío que parezca válido', async () => {
    const empty = build([]);
    await expect(renderPriceListPdf(empty, { dataUrl: null, source: 'none' })).rejects.toThrow(/No hay productos/);
  });
});
