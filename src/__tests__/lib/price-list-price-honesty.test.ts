/**
 * price-list-price-honesty.test.ts — CP-OPERATIONAL-CLASS-002 §5/§7/§10.
 *
 * Representación HONESTA del precio en pantalla y documento (misión P1):
 *  · price NULL → «Sin precio» (jamás un «$ 0.00» falso).
 *  · price 0 → precio cero legítimo configurado, con su formato y moneda.
 *  · price > 0 → formato monetario actual, sin conversión.
 *  · El filtro «Sin precio» produce documentos donde esos artículos no
 *    aparecen falsamente con 0.00 (quedan fuera o aparecen como Sin precio).
 *  · selectPriceListRows (§7) es el ÚNICO pipeline: el contador en vivo de la
 *    vista coincide EXACTAMENTE con las filas del modelo generado, incluido
 *    el rango de SKU.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPriceListModel,
  selectPriceListRows,
  type PriceListSourceItem,
  type PriceListModel,
} from '@/lib/price-list/model';
import { renderPriceListPdf } from '@/lib/price-list/pdf';
import { UNCLASSIFIED_FILTER } from '@/lib/price-list/operational-filters';

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

function mkItem(over: Partial<PriceListSourceItem> & { id: string }): PriceListSourceItem {
  return {
    sku: over.id,
    name: `Producto ${over.id}`,
    price: 100,
    price_currency: 'CUP',
    stock_current: 10,
    is_active: true,
    operational_class: 'venta',
    ...over,
  } as PriceListSourceItem;
}

const STORE = { id: 's1', name: 'Tienda Central' };
const fixedDate = new Date(2026, 10, 9, 10, 30);

const DATASET: PriceListSourceItem[] = [
  mkItem({ id: '1', name: 'Con precio positivo', price: 150 }),
  mkItem({ id: '2', name: 'Sin precio (NULL)', price: null }),
  mkItem({ id: '3', name: 'Cero legítimo', price: 0 }),
  mkItem({ id: '4', name: 'Histórico sin clasificar', operational_class: null, price: 300 }),
];

describe('CP-OPERATIONAL-CLASS-002 §5 · precio NULL ≠ cero en pantalla (modelo)', () => {

  it('price NULL → priceLabel «Sin precio» (nunca $0.00 falso)', () => {
    const model = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt: fixedDate });
    const row = model.rows.find((r) => r.id === '2');
    expect(row?.priceLabel).toBe('Sin precio');
  });

  it('price 0 → «Sin precio» (HALLAZGO PostgreSQL real: price NOT NULL DEFAULT 0)', () => {
    const model = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt: fixedDate });
    const row = model.rows.find((r) => r.id === '3');
    // El esquema vigente NO distingue cero legítimo de no configurado
    // (NOT NULL DEFAULT 0; is_complete usa price>0): mostrarlo como cero
    // en un listado induciría a regalar el artículo.
    expect(row?.priceLabel).toBe('Sin precio');
  });

  it('price > 0 conserva el formato monetario actual (sin conversión)', () => {
    const model = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt: fixedDate });
    const row = model.rows.find((r) => r.id === '1');
    expect(row?.priceLabel).toContain('CUP');
    expect(row?.priceLabel).toContain('150');
    expect(row?.priceLabel).not.toBe('Sin precio');
  });
});

describe('CP-OPERATIONAL-CLASS-002 §5 · la distinción llega al PDF', () => {

  it('el PDF muestra «Sin precio» para price NULL y NO lo numera como 0.00', async () => {
    const model: PriceListModel = buildPriceListModel({
      items: [mkItem({ id: '2', name: 'Articulo pendiente de precio', price: null })],
      store: STORE,
      range: null,
      generatedAt: fixedDate,
    });
    expect(model.rows).toHaveLength(1);
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Sin precio');
    expect(text).toContain('Articulo pendiente de precio');
  });

  it('el PDF muestra «Sin precio» para el cero (representación honesta del esquema vigente)', async () => {
    const model: PriceListModel = buildPriceListModel({
      items: [mkItem({ id: '3', name: 'Articulo con precio cero', price: 0 })],
      store: STORE,
      range: null,
      generatedAt: fixedDate,
    });
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Sin precio');
    expect(text).toContain('Articulo con precio cero');
    // NUNCA un «$ 0.00» en el documento.
    expect(text).not.toContain('$0.00 CUP');
  });

  it('el documento mixto: NULL y 0 → «Sin precio»; positivo → formato con moneda', async () => {
    const model: PriceListModel = buildPriceListModel({
      items: [mkItem({ id: '2', price: null }), mkItem({ id: '3', price: 0 }), mkItem({ id: '5', price: 42.5 })],
      store: STORE,
      range: null,
      generatedAt: fixedDate,
    });
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Sin precio');
    expect(text).toContain('42');
    expect(text).toContain('CUP');
    expect(text).not.toContain('$0.00 CUP');
  });
});

describe('CP-OPERATIONAL-CLASS-002 §5 · el filtro «Sin precio» no produce 0.00 falsos', () => {

  it('filtrar Sin precio devuelve SOLO los sin precio (NULL y 0), con label honesto', () => {
    const model = buildPriceListModel({
      items: DATASET,
      store: STORE,
      range: null,
      generatedAt: fixedDate,
      operationalFilter: { classes: [], priceStatus: 'without_price' },
    });
    expect(model.rows.map((r) => r.id)).toEqual(['2', '3']);
    // NINGUNA fila incluida muestra un importe falso: ambas son «Sin precio».
    for (const row of model.rows) expect(row.priceLabel).toBe('Sin precio');
  });

  it('filtrar Con precio excluye NULL y cero (criterio real del sistema)', () => {
    const model = buildPriceListModel({
      items: DATASET,
      store: STORE,
      range: null,
      generatedAt: fixedDate,
      operationalFilter: { classes: [], priceStatus: 'with_price' },
    });
    expect(model.rows.map((r) => r.id).sort()).toEqual(['1', '4']);
  });
});

describe('CP-OPERATIONAL-CLASS-002 §7 · contador en vivo ≡ modelo (único pipeline)', () => {

  const NEUTRO = { classes: [], priceStatus: 'all' as const };
  const CASO_A = { classes: ['venta' as const], priceStatus: 'without_price' as const };

  it('selectPriceListRows aplica stock/activo × clasificación × precio × rango SKU', () => {
    // Rango 1-2 con filtro Caso A (Venta sin precio): solo id 2 (SKU '2').
    expect(selectPriceListRows(DATASET, { from: BigInt(1), to: BigInt(2) }, CASO_A).map((i) => i.id)).toEqual(['2']);
    // Rango que excluye al id 2 → vacío (el filtro compone, no se ignora).
    expect(selectPriceListRows(DATASET, { from: BigInt(90), to: BigInt(99) }, CASO_A)).toEqual([]);
    // Neutro sin rango = dataset completo.
    expect(selectPriceListRows(DATASET, { from: null, to: null }, NEUTRO)).toHaveLength(4);
  });

  it('el contador (selectPriceListRows.length) COINCIDE con las filas del modelo en todas las combinaciones', () => {
    const combinaciones = [
      NEUTRO,
      CASO_A,
      { classes: [UNCLASSIFIED_FILTER], priceStatus: 'without_price' as const },
      { classes: ['venta' as const], priceStatus: 'with_price' as const },
    ];
    const rangos = [
      { from: null, to: null },
      { from: BigInt(1), to: BigInt(3) },
      { from: BigInt(2), to: BigInt(4) },
    ];
    for (const filter of combinaciones) {
      for (const range of rangos) {
        const count = selectPriceListRows(DATASET, range, filter).length;
        const model = buildPriceListModel({
          items: DATASET,
          store: STORE,
          range,
          generatedAt: fixedDate,
          operationalFilter: filter,
        });
        expect(model.meta.totalProducts).toBe(count);
        expect(model.rows).toHaveLength(count);
      }
    }
  });

  it('los productos agotados e inactivos quedan fuera de ambos (criterio vigente intacto)', () => {
    const dataset = [
      ...DATASET,
      mkItem({ id: '9', price: null, stock_current: 0 }),
      mkItem({ id: '10', price: null, is_active: false }),
    ];
    const count = selectPriceListRows(dataset, { from: null, to: null }, CASO_A).length;
    const model = buildPriceListModel({
      items: dataset,
      store: STORE,
      range: null,
      generatedAt: fixedDate,
      operationalFilter: CASO_A,
    });
    expect(count).toBe(model.meta.totalProducts);
    // Venta + sin precio + stock>0 + activo: id 2 (NULL) e id 3 (cero) —
    // los agregados id 9 (stock 0) e id 10 (inactivo) quedan excluidos.
    expect(model.rows.map((r) => r.id)).toEqual(['2', '3']);
  });
});
