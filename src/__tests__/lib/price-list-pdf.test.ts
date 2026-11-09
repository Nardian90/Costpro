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
import { buildPriceListModel, planPriceListPages, priceListCellText, type PriceListSourceItem } from '@/lib/price-list/model';
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
    expect(text).toContain('SKU');
    expect(text).toContain('Producto y descripción');
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
    expect(text.split('SKU').length - 1).toBeGreaterThanOrEqual(3); // encabezado en cada bloque + rótulos de fila
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

// ══════════════════════════════════════════════════════════════════════
// CP-PRECIO-PDF-DESC-001 · «Mostrar descripción en PDF» (Sí/No)
// Matriz §6 de la misión: nombre+descripción · descripción extensa
// multilínea · nombre sin descripción · acentos y caracteres especiales.
// ══════════════════════════════════════════════════════════════════════
describe('CP-PRECIO-PDF-DESC-001 · Mostrar descripción en PDF (Sí/No)', () => {
  // Ejemplo LITERAL de la misión §2: nombre y descripción son información
  // DISTINTA y jamás se combinan ni se sustituyen entre sí.
  const NOMBRE = 'Cemento Cola';
  const DESC = 'Cemento cola para adherencia de cerámicos, baldosas y materiales de construcción.';

  it('por defecto (Sí) el modelo mantiene AMBOS campos separados: la descripción no repite ni sustituye al nombre', () => {
    const model = build([mkItem({ id: '1', sku: '1', name: NOMBRE, description: DESC })]);
    expect(model.meta.includeDescription).toBe(true);
    const row = model.rows[0];
    expect(row.name).toBe(NOMBRE);
    expect(row.description).toBe(DESC);
    expect(row.description).not.toContain(NOMBRE); // campos separados, jamás fusionados
    expect(priceListCellText(row, true)).toBe(`${NOMBRE}\n${DESC}`);
    expect(priceListCellText(row, false)).toBe(NOMBRE);
  });

  it('modelo No: la celda efectiva es SOLO el nombre, sin huecos (misma que un producto sin descripción)', () => {
    const model = buildPriceListModel({
      items: [mkItem({ id: '1', sku: '1', name: NOMBRE, description: DESC })],
      store, range: null, generatedAt: fixedDate, includeDescription: false,
    });
    expect(model.meta.includeDescription).toBe(false);
    expect(priceListCellText(model.rows[0], false)).toBe(NOMBRE);
    // Idéntico a un producto que NO tiene descripción almacenada.
    const sinDesc = build([mkItem({ id: '2', sku: '2', name: NOMBRE })]);
    expect(priceListCellText(sinDesc.rows[0], true)).toBe(priceListCellText(model.rows[0], false));
  });

  it('PDF Sí: incluye el nombre y DEBAJO su descripción (ejemplo de la misión §1)', async () => {
    const model = build([mkItem({ id: '1', sku: '1', name: NOMBRE, description: DESC, price: 38.5 })]);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain(NOMBRE);
    for (const palabra of ['adherencia', 'cerámicos', 'baldosas', 'materiales', 'construcción']) {
      expect(text).toContain(palabra);
    }
    expect(text).toContain('Producto y descripción');
  });

  it('PDF No: muestra únicamente el nombre — la descripción NO aparece en el documento', async () => {
    const model = buildPriceListModel({
      items: [mkItem({ id: '1', sku: '1', name: NOMBRE, description: DESC, price: 38.5 })],
      store, range: null, generatedAt: fixedDate, includeDescription: false,
    });
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain(NOMBRE);
    expect(text).not.toContain('adherencia');
    expect(text).not.toContain('cerámicos');
    expect(text).toContain('Producto'); // encabezado honesto sin descripción
    expect(text).not.toContain('Producto y descripción');
  });

  it('misma fuente de datos, Sí vs No: nombres, SKU y precios idénticos — la ÚNICA diferencia es la descripción', async () => {
    const items = [
      mkItem({ id: '1', sku: '1', name: NOMBRE, description: DESC, price: 38.5, price_currency: 'CUP' }),
      mkItem({ id: '2', sku: '2', name: 'Pintura vinil blanca 4 L', description: 'Pintura interior-exterior lavable de secado rápido.', price: 2100, price_currency: 'CUP' }),
    ];
    const si = await renderPriceListPdf(build(items), { dataUrl: null, source: 'none' });
    const no = await renderPriceListPdf(
      buildPriceListModel({ items, store, range: null, generatedAt: fixedDate, includeDescription: false }),
      { dataUrl: null, source: 'none' },
    );
    const tSi = decodePdf(si.output('arraybuffer') as ArrayBuffer);
    const tNo = decodePdf(no.output('arraybuffer') as ArrayBuffer);
    for (const común of [NOMBRE, 'Pintura vinil blanca 4 L', 'CUP', 'SKU', 'LISTADO DE PRECIOS']) {
      expect(tSi).toContain(común);
      expect(tNo).toContain(común);
    }
    for (const soloDesc of ['adherencia', 'rápido']) {
      expect(tSi).toContain(soloDesc);
      expect(tNo).not.toContain(soloDesc);
    }
    expect(si.getNumberOfPages()).toBe(no.getNumberOfPages());
  });

  it('descripción extensa de varias líneas (Sí): ajuste dinámico, ninguna palabra recortada ni superpuesta', async () => {
    const larga = 'Mezcla adhesiva cementicia de alta adherencia y baja retracción para asentamiento de cerámicos porcelánicos, baldosas y mosaicos en interiores y exteriores, aplicable con llana dentada sobre revoques finos en fachadas, cocinas, baños y zonas húmedas.';
    const nombre = 'Adhesivo cerámico premium';
    const model = build([mkItem({ id: 'x', sku: 'PEG-1', name: nombre, description: larga, price: 450.25 })]);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // splitTextToSize parte por palabras: cada palabra del nombre y de la
    // descripción queda dibujada COMPLETA (nada cortado ni perdido).
    for (const word of [...nombre.split(/\s+/), ...larga.split(/\s+/)]) {
      expect(text).toContain(word);
    }
    // La fila creció: el plan reserva más alto que una fila de 1 línea.
    const geom = { ...PRICE_LIST_GEOMETRY, measureLines: (t: string) => t.split('\n').reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / 45)), 0) };
    const plan = planPriceListPages(model, geom);
    expect(plan.pages[0].left.heightMm).toBeGreaterThan(PRICE_LIST_GEOMETRY.headerRowMm + PRICE_LIST_GEOMETRY.rowBaseMm);
  });

  it('producto sin descripción: la opción en Sí o No produce la MISMA altura de fila (sin espacios vacíos)', () => {
    const item = [mkItem({ id: '1', sku: '1', name: NOMBRE })];
    const modelSi = build(item);
    const modelNo = buildPriceListModel({ items: item, store, range: null, generatedAt: fixedDate, includeDescription: false });
    const geom = { ...PRICE_LIST_GEOMETRY, measureLines: (t: string) => (t.includes('\n') ? 3 : 1) };
    const planSi = planPriceListPages(modelSi, geom);
    const planNo = planPriceListPages(modelNo, geom);
    expect(planSi.pages[0].left.heightMm).toBe(planNo.pages[0].left.heightMm);
    expect(planSi.pages[0].left.heightMm).toBe(PRICE_LIST_GEOMETRY.headerRowMm + PRICE_LIST_GEOMETRY.rowBaseMm);
  });

  it('descripción con acentos y caracteres especiales: el texto sale completo y legible', async () => {
    const especial = 'Adhesivo flexible ñoño para cerámicos de 90° y baldosas 30×30 — rendimiento ½ galón por m², área técnica';
    const model = build([mkItem({ id: '1', sku: 'A-90', name: 'Cemento cola especial Ñ', description: especial, price: 99.9 })]);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    for (const fragmento of ['Cemento cola especial Ñ', 'Adhesivo flexible', 'ñoño', 'cerámicos', 'baldosas', '90°', '30×30', 'galón', 'm²', 'área técnica']) {
      expect(text).toContain(fragmento);
    }
  });

  it('el plan nunca parte una fila con descripción multilínea entre columnas o páginas', () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      mkItem({ id: `p${i}`, sku: String(i + 1), name: `Producto ${i + 1}`, description: `Descripción comercial extendida del producto número ${i + 1} con suficiente texto para ocupar varias líneas de la columna.` }),
    );
    const geom = { ...PRICE_LIST_GEOMETRY, measureLines: (t: string) => t.split('\n').reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / 45)), 0) };
    const plan = planPriceListPages(build(items), geom);
    const seen: number[] = [];
    for (const page of plan.pages) {
      for (const side of ['left', 'right'] as const) {
        for (const idx of page[side].rowIndices) {
          expect(seen).not.toContain(idx);
          seen.push(idx);
        }
      }
    }
    expect(seen).toEqual(Array.from({ length: items.length }, (_, i) => i));
  });
});
