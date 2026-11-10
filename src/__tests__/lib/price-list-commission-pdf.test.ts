/**
 * price-list-commission-pdf.test.ts — CP-PRODUCT-COMMISSION-001 TAREA 2.
 *
 * La columna «Comisión» del Listado de precios:
 *  · modelo: las filas llevan commissionLabel SOLO cuando la columna está
 *    visible (oculta por defecto); el valor lo da el RESOLVER del motor real.
 *  · documento: con la columna visible el PDF añade el encabezado «Comisión»
 *    y las etiquetas; sin ella, el layout histórico queda EXACTO (sin la
 *    palabra en el encabezado) y las demás columnas conservan sus datos.
 *  · las demás columnas (SKU/Producto/Precio) no se alteran en ningún caso.
 */
import { describe, it, expect } from 'vitest';
import { buildPriceListModel, type PriceListSourceItem, type PriceListModel } from '@/lib/price-list/model';
import { renderPriceListPdf } from '@/lib/price-list/pdf';
import { resolveProductCommission } from '@/lib/price-list/commission-column';
import type { CommissionRule } from '@/lib/commission-engine';

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

const STORE = { id: 'st-1', name: 'Tienda Central' };
const fixedDate = new Date(2026, 10, 10, 9, 0);
const TODAY = '2026-11-10';

const RULES: CommissionRule[] = [
  {
    id: 'r-fixed', store_id: STORE.id, worker_id: null, type: 'product_specific',
    value_percent: null, fixed_value: null, salary_amount: null, base_calculation: 'total_sales',
    priority: 10, valid_from: '2026-01-01', valid_to: null,
    product_ids: ['1', '2'],
    product_commission_amount: null,
    product_commission_mode: 'per_sale',
    product_configs: {
      '1': { amount: 12.5, mode: 'per_sale' },
      '2': { amount: 0, mode: 'per_sale' },   // comisión CERO configurada
    },
  },
  {
    id: 'r-percent', store_id: STORE.id, worker_id: null, type: 'percentage_sales',
    value_percent: 5, fixed_value: null, salary_amount: null, base_calculation: 'total_sales',
    priority: 5, valid_from: '2026-01-01', valid_to: null, product_ids: [],
  },
] as unknown as CommissionRule[];

const RESOLVER = (item: PriceListSourceItem) =>
  resolveProductCommission(RULES, item.id, Number(item.price) || 0, TODAY).label;

const DATASET: PriceListSourceItem[] = [
  mkItem({ id: '1', name: 'Con comisión fija', price: 200 }),
  mkItem({ id: '2', name: 'Con comisión cero', price: 150 }),
  mkItem({ id: '3', name: 'Bajo porcentaje general', price: 100 }),
];

describe('TAREA 2 · modelo con columna «Comisión»', () => {

  it('por defecto la columna está OCULTA: las filas no llevan commissionLabel', () => {
    const model: PriceListModel = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt: fixedDate });
    expect(model.meta.showCommission).toBe(false);
    expect(model.rows.every((r) => r.commissionLabel === undefined)).toBe(true);
  });

  it('con la columna visible, cada fila lleva la etiqueta del motor real', () => {
    const model = buildPriceListModel({
      items: DATASET, store: STORE, range: null, generatedAt: fixedDate,
      showCommission: true, commissionResolver: RESOLVER,
    });
    expect(model.meta.showCommission).toBe(true);
    const byId = Object.fromEntries(model.rows.map((r) => [r.id, r.commissionLabel]));
    expect(byId['1']).toBe('12.50 CUP/venta');
    expect(byId['2']).toBe('0.00 CUP/venta');   // cero configurado ≠ sin regla
    expect(byId['3']).toBe('5.00%');            // porcentaje de tienda
  });

  it('sin resolver → «—» (sin resolución), jamás un valor inventado', () => {
    const model = buildPriceListModel({
      items: DATASET, store: STORE, range: null, generatedAt: fixedDate,
      showCommission: true,
    });
    expect(model.rows.every((r) => r.commissionLabel === '—')).toBe(true);
  });
});

describe('TAREA 2 · documento (PDF) con y sin columna', () => {

  it('columna visible: encabezado «Comisión» + etiquetas del motor + datos de las demás columnas intactos', async () => {
    const model = buildPriceListModel({
      items: DATASET, store: STORE, range: null, generatedAt: fixedDate,
      showCommission: true, commissionResolver: RESOLVER,
    });
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Comisión');
    expect(text).toContain('12.50 CUP/venta');
    expect(text).not.toContain('Según los filtros');
    // Las columnas existentes conservan sus datos:
    expect(text).toContain('Precio de venta');
    expect(text).toContain('Con comisión fija');
    expect(text).toContain('200');
    expect(text).toContain('CUP');
    expect(text).toContain('SKU');
  });

  it('columna oculta (por defecto): el documento NO menciona «Comisión» y conserva el layout histórico', async () => {
    const model: PriceListModel = buildPriceListModel({ items: DATASET, store: STORE, range: null, generatedAt: fixedDate });
    const doc = await renderPriceListPdf(model, { dataUrl: null, source: 'none' });
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(model.meta.showCommission).toBe(false);
    expect(text).not.toContain('Comisión');
    expect(text).toContain('Precio de venta');
    expect(text).toContain('Con comisión fija');
  });
});
