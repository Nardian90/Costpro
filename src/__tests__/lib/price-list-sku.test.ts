/**
 * CP-SALES-PRICE-LIST-001 — Reglas de SKU, rango e inventario/precios.
 * ========================================================================
 * Casos obligatorios de la misión (§11):
 *  · FILTROS: sin rango · 1–50 · desde 10 sin límite · hasta 50 sin límite ·
 *    rango invertido · rango sin coincidencias · filtros eliminados.
 *  · ORDENAMIENTO: 1,2,3,10,11,20,50,100,Cod1,A15,SKU-20 → numéricos primero
 *    por VALOR (no lexicográfico), alfanuméricos después (natural, sin
 *    mayúsculas); empates y ceros iniciales deterministas; precisión con ids
 *    largos (BigInt); «Cod1» NO se interpreta como 1.
 *  · INVENTARIO (modelo): stock estrictamente > 0; cero y negativo fuera;
 *    productos de otra tienda nunca llegan aquí (RLS por tienda en el RPC —
 *    se documenta); servicios sin stock fuera por el criterio absoluto.
 *  · PRECIOS: CUP y USD etiquetados por fila SIN conversión ni mezcla;
 *    precio ausente → $0,00 con la moneda por defecto de la columna
 *    (price_currency NOT NULL DEFAULT 'CUP') — nunca una etiqueta inventada.
 *  · DATOS INCOMPLETOS: sin SKU se muestra «—» y no se omite silenciosamente.
 */

import { describe, it, expect } from 'vitest';
import {
  classifySku,
  skuNumericValue,
  parseSkuRange,
  orderProductsBySku,
  applySkuRange,
} from '@/lib/price-list/sku-order';
import { buildPriceListModel, type PriceListSourceItem } from '@/lib/price-list/model';
import { formatLabeledCurrency } from '@/lib/utils';

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

const skusOf = (items: PriceListSourceItem[]) => items.map((i) => i.sku);

/** Rango ya validado (falla el test si el rango de prueba fuese inválido). */
function okRange(desde: string, hasta: string) {
  const r = parseSkuRange(desde, hasta);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('CP-SALES-PRICE-LIST-001 · Clasificación de SKU', () => {
  it('numérico = solo dígitos; alfanumérico = con letras u otros caracteres; sin SKU = null/vacío', () => {
    expect(classifySku('1')).toBe('numeric');
    expect(classifySku('007')).toBe('numeric');
    expect(classifySku('12345678901234567890123')).toBe('numeric');
    expect(classifySku('Cod1')).toBe('alphanumeric');
    expect(classifySku('A15')).toBe('alphanumeric');
    expect(classifySku('SKU-20')).toBe('alphanumeric');
    expect(classifySku('REP01')).toBe('alphanumeric');
    expect(classifySku('1A')).toBe('alphanumeric');
    expect(classifySku('')).toBe('missing');
    expect(classifySku('   ')).toBe('missing');
    expect(classifySku(null)).toBe('missing');
    expect(classifySku(undefined)).toBe('missing');
  });

  it('valor numérico auxiliar: «Cod1» NO se interpreta como 1; ceros iniciales valen igual', () => {
    expect(skuNumericValue('Cod1')).toBeNull();
    expect(skuNumericValue('SKU-20')).toBeNull();
    expect(skuNumericValue('007')).toBe(BigInt(7));
    expect(skuNumericValue('7')).toBe(BigInt(7));
    expect(skuNumericValue('001')).toEqual(skuNumericValue('1'));
  });

  it('precisión con identificadores numéricos largos (> 2^53) — BigInt, sin errores', () => {
    const long = '12345678901234567890123';
    const items = [mkItem({ id: 'b', sku: '12345678901234567890124' }), mkItem({ id: 'a', sku: long })];
    const sorted = orderProductsBySku(items, null);
    expect(sorted[0].sku).toBe(long);
    // El Number clásico PIERDE la precisión (ambos caen en el mismo float):
    expect(Number(long)).toBe(Number('12345678901234567890124'));
    // …mientras que la clave BigInt los distingue con exactitud.
    expect(skuNumericValue(long)).not.toEqual(skuNumericValue('12345678901234567890124'));
  });
});

describe('CP-SALES-PRICE-LIST-001 · Validación del rango', () => {
  it('acepta enteros positivos, con uno o ambos límites', () => {
    expect(parseSkuRange('', '')).toEqual({ ok: true, from: null, to: null });
    expect(parseSkuRange('10', '')).toEqual({ ok: true, from: BigInt(10), to: null });
    expect(parseSkuRange('', '50')).toEqual({ ok: true, from: null, to: BigInt(50) });
    expect(parseSkuRange('1', '50')).toEqual({ ok: true, from: BigInt(1), to: BigInt(50) });
  });

  it('rechaza valores no enteros, negativos, cero y el rango invertido, con mensaje claro', () => {
    expect(parseSkuRange('abc', '')).toEqual({ ok: false, error: '«SKU desde» debe ser un entero positivo.' });
    expect(parseSkuRange('', '-5')).toEqual({ ok: false, error: '«SKU hasta» debe ser un entero positivo.' });
    expect(parseSkuRange('1.5', '')).toEqual({ ok: false, error: '«SKU desde» debe ser un entero positivo.' });
    expect(parseSkuRange('0', '')).toEqual({ ok: false, error: '«SKU desde» debe ser un entero positivo.' });
    expect(parseSkuRange('50', '10')).toEqual({ ok: false, error: 'El límite inferior no puede superar al superior.' });
  });
});

describe('CP-SALES-PRICE-LIST-001 · Ordenamiento y filtros (casos §11)', () => {
  // Fixture de la misión: 1, 2, 3, 10, 11, 20, 50, 100, Cod1, A15, SKU-20
  const fixture = () => [
    mkItem({ id: 'p100', sku: '100', name: 'P100' }),
    mkItem({ id: 'p2', sku: '2', name: 'P2' }),
    mkItem({ id: 'pCod1', sku: 'Cod1', name: 'PCod1' }),
    mkItem({ id: 'p10', sku: '10', name: 'P10' }),
    mkItem({ id: 'pA15', sku: 'A15', name: 'PA15' }),
    mkItem({ id: 'p1', sku: '1', name: 'P1' }),
    mkItem({ id: 'pSKU20', sku: 'SKU-20', name: 'PSKU20' }),
    mkItem({ id: 'p50', sku: '50', name: 'P50' }),
    mkItem({ id: 'p3', sku: '3', name: 'P3' }),
    mkItem({ id: 'p20', sku: '20', name: 'P20' }),
    mkItem({ id: 'p11', sku: '11', name: 'P11' }),
  ];
  const expectedOrder = ['1', '2', '3', '10', '11', '20', '50', '100', 'A15', 'Cod1', 'SKU-20'];

  it('sin rango: numéricos primero por VALOR (1,2,3,10,11,20,50,100 — no 1,10,100,2,20) y alfanuméricos después', () => {
    expect(skusOf(orderProductsBySku(fixture(), null))).toEqual(expectedOrder);
  });

  it('desde 1 hasta 50: numéricos 1..50 incluidos, 100 y alfanuméricos excluidos', () => {
    const range = okRange('1', '50');
    expect(skusOf(orderProductsBySku(fixture(), range))).toEqual(['1', '2', '3', '10', '11', '20', '50']);
  });

  it('desde 10 sin límite superior: 10,11,20,50,100 (solo numéricos)', () => {
    const range = okRange('10', '');
    expect(skusOf(orderProductsBySku(fixture(), range))).toEqual(['10', '11', '20', '50', '100']);
  });

  it('hasta 50 sin límite inferior: 1,2,3,10,11,20,50 (solo numéricos)', () => {
    const range = okRange('', '50');
    expect(skusOf(orderProductsBySku(fixture(), range))).toEqual(['1', '2', '3', '10', '11', '20', '50']);
  });

  it('rango sin coincidencias: resultado vacío (la interfaz lo comunica y no genera PDF)', () => {
    const range = okRange('500', '600');
    expect(orderProductsBySku(fixture(), range)).toEqual([]);
  });

  it('filtros eliminados: se recuperan todos los productos (numéricos + alfanuméricos)', () => {
    const conRango = orderProductsBySku(fixture(), okRange('1', '50'));
    expect(conRango.length).toBe(7);
    const limpio = orderProductsBySku(fixture(), null);
    expect(skusOf(limpio)).toEqual(expectedOrder);
  });

  it('rango con límites vacíos equivale a sin rango; un rango real excluye a los alfanuméricos', () => {
    // («desde» y «hasta» vacíos = filtros eliminados: vuelven TODOS los
    // grupos — el filtro conserva el orden; el ordenamiento lo aplica
    // orderProductsBySku)
    const todo = applySkuRange(fixture(), okRange('', ''));
    expect(new Set(skusOf(todo))).toEqual(new Set(expectedOrder));
    expect(todo).toHaveLength(11);
    // Con un rango real, los alfanuméricos quedan fuera (regla §4.2 explicada en la interfaz).
    const conRango = orderProductsBySku(fixture(), okRange('1', '50'));
    expect(skusOf(conRango)).toEqual(['1', '2', '3', '10', '11', '20', '50']);
  });

  it('empates numéricos y ceros iniciales: valor primero y desempate determinista (001 < 01 < 1)', () => {
    const items = [
      mkItem({ id: 'a', sku: '1', name: 'A' }),
      mkItem({ id: 'b', sku: '001', name: 'B' }), // mismo VALOR que '1'
      mkItem({ id: 'c', sku: '01', name: 'C' }),  // mismo VALOR que '1'
      mkItem({ id: 'd', sku: '1', name: 'A2' }),
    ];
    expect(skusOf(orderProductsBySku(items, null))).toEqual(['001', '01', '1', '1']);
    // Y '007' NO empata con '1': vale 7 (el valor manda sobre el formato).
    const siete = [mkItem({ id: 'x', sku: '1' }), mkItem({ id: 'y', sku: '007' })];
    expect(skusOf(orderProductsBySku(siete, null))).toEqual(['1', '007']);
  });

  it('alfanuméricos: orden natural sin mayúsculas (A15 < Cod1 < REP01 < SKU-2 < SKU-10 < sku-20)', () => {
    const items = [
      mkItem({ id: '1', sku: 'sku-20' }),
      mkItem({ id: '2', sku: 'SKU-10' }),
      mkItem({ id: '3', sku: 'Cod1' }),
      mkItem({ id: '4', sku: 'A15' }),
      mkItem({ id: '5', sku: 'REP01' }),
      mkItem({ id: '6', sku: 'SKU-2' }),
    ];
    expect(skusOf(orderProductsBySku(items, null))).toEqual(['A15', 'Cod1', 'REP01', 'SKU-2', 'SKU-10', 'sku-20']);
  });
});

describe('CP-SALES-PRICE-LIST-001 · Inventario y precios en el modelo', () => {
  const store = { id: 'store-a', name: 'Constructora del Este' };

  it('stock: estrictamente mayor que cero (cero y negativo excluidos; activos únicamente)', () => {
    const model = buildPriceListModel({
      items: [
        mkItem({ id: 'ok', sku: '1', stock_current: 3 }),
        mkItem({ id: 'cero', sku: '2', stock_current: 0 }),
        mkItem({ id: 'neg', sku: '3', stock_current: -2 }),
        mkItem({ id: 'null', sku: '4', stock_current: null }),
        mkItem({ id: 'inactivo', sku: '5', stock_current: 9, is_active: false }),
      ],
      store,
      range: null,
      generatedAt: new Date(2026, 10, 9, 10, 30),
    });
    expect(model.rows.map((r) => r.skuLabel)).toEqual(['1']);
    expect(model.meta.totalProducts).toBe(1);
  });

  it('existencia consolidada de los almacenes de la tienda: el RPC ya suma inventory por tienda (documentado); el modelo no recalcula', () => {
    // stock_current llega del servidor como SUM(inventory) de ESA tienda.
    const model = buildPriceListModel({
      items: [mkItem({ id: 'a', sku: '1', stock_current: 7 + 13 })],
      store,
      range: null,
      generatedAt: new Date(2026, 10, 9),
    });
    expect(model.meta.totalProducts).toBe(1);
  });

  it('servicios sin stock quedan fuera por el criterio absoluto de la misión (decisión documentada)', () => {
    const model = buildPriceListModel({
      items: [mkItem({ id: 'srv', sku: 'SRV-1', is_service: true, stock_current: 0 })],
      store,
      range: null,
      generatedAt: new Date(2026, 10, 9),
    });
    expect(model.meta.totalProducts).toBe(0);
  });

  it('precios: CUP y USD etiquetados por fila SIN conversión; precio ausente → 0 con la moneda por defecto', () => {
    const model = buildPriceListModel({
      items: [
        mkItem({ id: 'cup', sku: '1', price: 15300, price_currency: 'CUP' }),
        mkItem({ id: 'usd', sku: '2', price: 22.5, price_currency: 'USD' }),
        mkItem({ id: 'default', sku: '3', price: 38.5, price_currency: null }),
        mkItem({ id: 'sin-precio', sku: '4', price: null }),
      ],
      store,
      range: null,
      generatedAt: new Date(2026, 10, 9),
    });
    const byId = Object.fromEntries(model.rows.map((r) => [r.id, r.priceLabel]));
    expect(byId.cup).toBe(formatLabeledCurrency(15300, 'CUP'));
    expect(byId.usd).toBe(formatLabeledCurrency(22.5, 'USD'));
    // price_currency NOT NULL DEFAULT 'CUP' en el servidor — nunca etiqueta inventada.
    expect(byId.default).toBe(formatLabeledCurrency(38.5, 'CUP'));
    expect(byId['sin-precio']).toBe(formatLabeledCurrency(0, 'CUP'));
    expect(model.meta.currencies).toEqual(['CUP', 'USD']);
  });

  it('datos incompletos: sin SKU se muestra «—» y la fila NO se omite silenciosamente', () => {
    const model = buildPriceListModel({
      items: [
        mkItem({ id: 'con', sku: '10', name: 'Con SKU' }),
        mkItem({ id: 'sin', sku: null, name: 'Sin SKU' }),
        mkItem({ id: 'vacio', sku: '  ', name: 'SKU vacío' }),
      ],
      store,
      range: null,
      generatedAt: new Date(2026, 10, 9),
    });
    expect(model.rows.map((r) => r.skuLabel)).toEqual(['10', '—', '—']);
    expect(model.meta.totalProducts).toBe(3);
  });

  it('resumen compacto: total, rango aplicado y monedas presentes', () => {
    const model = buildPriceListModel({
      items: [mkItem({ id: '1', sku: '5', price_currency: 'CUP' }), mkItem({ id: '2', sku: '6', price_currency: 'USD' })],
      store,
      range: okRange('5', '5'),
      generatedAt: new Date(2026, 10, 9, 14, 5),
    });
    expect(model.meta.rangeFrom).toBe(BigInt(5));
    expect(model.meta.rangeTo).toBe(BigInt(5));
    expect(model.dateLabel).toBe('09/11/2026');
    expect(model.timeLabel).toBe('14:05');
  });
});
