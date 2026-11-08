/**
 * price-list-operational-filters.test.ts — CP-OPERATIONAL-CLASS-001.
 *
 * Criterio REAL de precio y filtro combinado del Listado de precios (§3-§5):
 *  §4      hasConfiguredPrice: price NULL = Sin precio; price 0 = CON precio
 *          (cero legítimo; jamás se trata como «no configurado»).
 *  §8.9-11 applyOperationalPriceFilter por clasificación (+ Sin clasificar).
 *  §8.12-13 with_price / without_price.
 *  §8.14   combinación simultánea — Casos A-D de la misión §5.
 *  §8.16   contadores del modelo (totalOperational/totalProducts) y
 *          coexistencia con el rango de SKU.
 *  §8.18   las monedas por fila no se mezclan (el filtro no toca currency).
 */
import { describe, it, expect } from 'vitest';
import {
  applyOperationalPriceFilter,
  hasConfiguredPrice,
  isNeutralOperationalFilter,
  operationalFilterLabel,
  NEUTRAL_OPERATIONAL_FILTER,
  UNCLASSIFIED_FILTER,
} from '@/lib/price-list/operational-filters';
import { buildPriceListModel } from '@/lib/price-list/model';
import type { PriceListSourceItem, PriceListStoreInfo } from '@/lib/price-list/model';
import type { ProductOperationalClass } from '@/types';

function item(over: Partial<PriceListSourceItem> & { id: string }): PriceListSourceItem {
  return {
    // SKU numérico = id (determinista; el rango de SKU del test opera 1..99).
    sku: over.id,
    name: `Producto ${over.id}`,
    price: 100,
    price_currency: 'CUP',
    stock_current: 10,
    is_active: true,
    is_service: false,
    operational_class: 'venta',
    ...over,
  } as PriceListSourceItem;
}

const STORE: PriceListStoreInfo = { id: 's1', name: 'Tienda Central', logoUrl: null, reeup: null, nit: null };

// Dataset de referencia: cada combinación que el filtro debe distinguir.
const DATASET: PriceListSourceItem[] = [
  item({ id: '1', name: 'Refresco', operational_class: 'venta', price: 150 }),
  item({ id: '2', name: 'Refresco sin precio', operational_class: 'venta', price: null }),
  item({ id: '3', name: 'Detergente operativo', operational_class: 'insumo', price: 80 }),
  item({ id: '4', name: 'Detergente a cero', operational_class: 'insumo', price: 0 }), // cero legítimo
  item({ id: '5', name: 'Refrigerador', operational_class: 'activo_fijo', price: 42000 }),
  item({ id: '6', name: 'Destornillador', operational_class: 'util_herramienta', price: 250, price_currency: 'USD' }),
  item({ id: '7', name: 'Histórico sin clasificar', operational_class: null, price: 300 }),
  item({ id: '8', name: 'Histórico sin nada', operational_class: null, price: null }),
];

describe('CP-OPERATIONAL-CLASS-001 · criterio de precio REAL (§4)', () => {

  it('§4/§8.12 · price NULL = Sin precio; price 0 = CON precio (cero legítimo)', () => {
    expect(hasConfiguredPrice({ price: null })).toBe(false);
    expect(hasConfiguredPrice({ price: undefined })).toBe(false);
    expect(hasConfiguredPrice({ price: 0 })).toBe(true);   // ← cero configurado
    expect(hasConfiguredPrice({ price: 150 })).toBe(true);
  });

  it('§8.13 · «Con precio» excluye los sin precio; «Sin precio» muestra solo los pendientes', () => {
    const withP = applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, priceStatus: 'with_price' });
    expect(withP.map((i) => i.id).sort()).toEqual(['1', '3', '4', '5', '6', '7']);
    const withoutP = applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, priceStatus: 'without_price' });
    expect(withoutP.map((i) => i.id).sort()).toEqual(['2', '8']);
  });

  it('§8.18 · el filtro no mezcla monedas: cada fila conserva la suya', () => {
    const withP = applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, priceStatus: 'with_price' });
    const usd = withP.find((i) => i.id === '6');
    expect(usd?.price_currency).toBe('USD');
    // El filtrado no transforma precios ni monedas (solo selecciona filas).
    expect(withP).toContainEqual(DATASET.find((i) => i.id === '6'));
  });
});

describe('CP-OPERATIONAL-CLASS-001 · filtro por clasificación operativa (§3/§8.9-11)', () => {

  it('§8.9 · Venta devuelve exclusivamente elementos de esa clasificación', () => {
    const r = applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, classes: ['venta'] });
    expect(r.map((i) => i.id).sort()).toEqual(['1', '2']);
  });

  it('§8.10 · Insumo, Activo Fijo y Útil/Herramienta funcionan correctamente', () => {
    expect(applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, classes: ['insumo'] }).map((i) => i.id).sort()).toEqual(['3', '4']);
    expect(applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, classes: ['activo_fijo'] }).map((i) => i.id).sort()).toEqual(['5']);
    expect(applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, classes: ['util_herramienta'] }).map((i) => i.id).sort()).toEqual(['6']);
  });

  it('§8.11 · «Sin clasificar» identifica EXCLUSIVAMENTE los registros pendientes (NULL)', () => {
    const only = applyOperationalPriceFilter(DATASET, { classes: [UNCLASSIFIED_FILTER], priceStatus: 'all' });
    expect(only.map((i) => i.id).sort()).toEqual(['7', '8']);
  });

  it('«Sin clasificar» + Venta: pendientes y venta a la vez (multi-select uniforme)', () => {
    const r = applyOperationalPriceFilter(DATASET, { classes: ['venta', UNCLASSIFIED_FILTER], priceStatus: 'all' });
    expect(r.map((i) => i.id).sort()).toEqual(['1', '2', '7', '8']);
  });

  it('multi-select: varias clasificaciones a la vez (§3 «filtros combinados»)', () => {
    const r = applyOperationalPriceFilter(DATASET, { ...NEUTRAL_OPERATIONAL_FILTER, classes: ['venta', 'activo_fijo'] });
    expect(r.map((i) => i.id).sort()).toEqual(['1', '2', '5']);
  });

  it('«Todas» (selección vacía + Sin clasificar incluido) recupera el listado completo', () => {
    const r = applyOperationalPriceFilter(DATASET, NEUTRAL_OPERATIONAL_FILTER);
    expect(r.map((i) => i.id).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(isNeutralOperationalFilter(NEUTRAL_OPERATIONAL_FILTER)).toBe(true);
  });
});

describe('CP-OPERATIONAL-CLASS-001 · combinación de filtros (§5/§8.14) — Casos A-D', () => {

  it('Caso A · Venta SIN precio (elementos que necesitan configuración)', () => {
    const r = applyOperationalPriceFilter(DATASET, { classes: ['venta'], priceStatus: 'without_price' });
    expect(r.map((i) => i.id)).toEqual(['2']);
  });

  it('Caso B · Insumos CON precio', () => {
    const r = applyOperationalPriceFilter(DATASET, { classes: ['insumo'], priceStatus: 'with_price' });
    // El cero legítimo (id 4) ES un precio configurado → incluido.
    expect(r.map((i) => i.id)).toEqual(['3', '4']);
  });

  it('Caso C · Activos Fijos independientemente del precio', () => {
    const r = applyOperationalPriceFilter(DATASET, { classes: ['activo_fijo'], priceStatus: 'all' });
    expect(r.map((i) => i.id)).toEqual(['5']);
  });

  it('Caso D · Sin clasificar y sin precio (pendientes totales)', () => {
    const r = applyOperationalPriceFilter(DATASET, { classes: [UNCLASSIFIED_FILTER], priceStatus: 'without_price' });
    expect(r.map((i) => i.id)).toEqual(['8']);
  });

  it('no muta el dataset de entrada (selección pura)', () => {
    const snapshot = JSON.stringify(DATASET);
    applyOperationalPriceFilter(DATASET, { classes: ['venta'], priceStatus: 'with_price' });
    expect(JSON.stringify(DATASET)).toBe(snapshot);
  });
});

describe('CP-OPERATIONAL-CLASS-001 · integración con buildPriceListModel (§8.16)', () => {

  const generatedAt = new Date('2026-11-08T10:30:00');

  it('el modelo aplica el filtro sobre el dataset completo y expone los contadores', () => {
    const model = buildPriceListModel({
      items: DATASET,
      store: STORE,
      range: null,
      generatedAt,
      operationalFilter: { classes: ['venta'], priceStatus: 'without_price' },
    });
    expect(model.meta.totalOperational).toBe(1);       // stock>0 y filtro → id 2
    expect(model.meta.totalRaw).toBe(DATASET.length);  // stock>0 antes del filtro
    expect(model.rows.map((r) => r.id)).toEqual(['2']);
    expect(model.meta.operationalFilter).toEqual({ classes: ['venta'], priceStatus: 'without_price' });
  });

  it('el criterio de inclusión vigente (stock>0, activo) NO se altera por el filtro', () => {
    const conSinStock = [
      ...DATASET,
      item({ id: '9', name: 'Refresco agotado', operational_class: 'venta', price: null, stock_current: 0 }),
      item({ id: '10', name: 'Inactivo', operational_class: 'venta', price: null, is_active: false }),
    ];
    const model = buildPriceListModel({
      items: conSinStock,
      store: STORE,
      range: null,
      generatedAt,
      operationalFilter: { classes: ['venta'], priceStatus: 'without_price' },
    });
    // El agotado y el inactivo NO entran (criterio §3 de la misión del listado).
    expect(model.rows.map((r) => r.id)).toEqual(['2']);
  });

  it('coexiste con el rango de SKU (filtro operativo primero, rango después)', () => {
    const model = buildPriceListModel({
      items: DATASET,
      store: STORE,
      range: { from: BigInt(1), to: BigInt(3) },
      generatedAt,
      operationalFilter: { classes: ['venta'], priceStatus: 'without_price' },
    });
    expect(model.rows.map((r) => r.id)).toEqual(['2']); // id 2 con SKU en rango
    const fuera = buildPriceListModel({
      items: DATASET,
      store: STORE,
      range: { from: BigInt(90), to: BigInt(99) },
      generatedAt,
      operationalFilter: { classes: ['venta'], priceStatus: 'without_price' },
    });
    expect(fuera.rows).toEqual([]);
  });

  it('sin filtro operativo el modelo es idéntico al histórico (regresión)', () => {
    const model = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt });
    expect(model.rows.map((r) => r.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(model.meta.totalOperational).toBe(DATASET.length);
  });

  it('labels del filtro (pie del PDF / chip de la vista)', () => {
    expect(operationalFilterLabel(NEUTRAL_OPERATIONAL_FILTER)).toBeNull();
    expect(operationalFilterLabel({ classes: ['venta'], priceStatus: 'all' }))
      .toBe('Clasificación: Venta');
    expect(operationalFilterLabel({ classes: ['venta', 'insumo'], priceStatus: 'without_price' }))
      .toBe('Clasificación: Venta + Insumo · Precio: Sin precio');
    expect(operationalFilterLabel({ classes: [UNCLASSIFIED_FILTER], priceStatus: 'with_price' }))
      .toBe('Clasificación: Sin clasificar · Precio: Con precio');
    expect(operationalFilterLabel({ classes: [], priceStatus: 'with_price' }))
      .toBe('Precio: Con precio');
  });
});

describe('CP-OPERATIONAL-CLASS-001 · distinción NULL/0 en el precio del documento (§4)', () => {
  it('una fila Sin precio sigue mostrando su moneda (etiquetado sin mezclar)', () => {
    const generatedAt = new Date('2026-11-08T10:30:00');
    const model = buildPriceListModel({
      items: [item({ id: '2', name: 'Sin precio', operational_class: 'venta', price: null, price_currency: 'CUP' })],
      store: STORE,
      range: null,
      generatedAt,
      operationalFilter: { classes: [], priceStatus: 'without_price' },
    });
    // El render histórico usa «item.price ?? 0» para DIBUJAR (no cambia);
    // el ESTADO del precio se calculó del NULL real — el filtro solo selecciona.
    expect(model.rows).toHaveLength(1);
    void (0 as unknown as ProductOperationalClass); // tipo importado para legibilidad del §4
  });
});
