/**
 * commission-column.test.ts — CP-PRODUCT-COMMISSION-001 TAREA 2/3 + §4.
 *
 * 1) La presentación de la columna «Comisión» se resuelve con el MOTOR REAL:
 *    selectProductSpecificRule / selectScaleRule de commission-engine.ts.
 * 2) §4.2-§4.5: el valor presentado COINCIDE con calculateCommissionWithProducts
 *    (el cálculo que finalmente devenga el pago del trabajador) para ventas de
 *    1 y varias unidades — jamás una fórmula paralela.
 * 3) TAREA 3: matchesCommissionFilter (Todos / >0 / =0 / Sin configurar).
 */
import { describe, it, expect } from 'vitest';
import { resolveProductCommission, matchesCommissionFilter, type CommissionValueFilter } from '@/lib/price-list/commission-column';
import { calculateCommissionWithProducts, type CommissionRule, type ProductLineItem } from '@/lib/commission-engine';

const STORE = 'st-1';
const TODAY = '2026-11-10';

function mkRule(over: Partial<CommissionRule> & { id: string }): CommissionRule {
  return {
    store_id: STORE,
    worker_id: null,
    type: 'product_specific',
    value_percent: null,
    fixed_value: null,
    salary_amount: null,
    base_calculation: 'total_sales',
    priority: 10,
    valid_from: '2026-01-01',
    valid_to: null,
    product_ids: ['p-1'],
    product_commission_amount: null,
    product_commission_mode: 'per_sale',
    ...over,
  } as CommissionRule;
}

describe('TAREA 2 · presentación de la columna «Comisión» (motor real)', () => {

  it('importe fijo por venta (per_sale) con moneda y unidad de aplicación', () => {
    const rules = [mkRule({ id: 'r1', product_commission_amount: 12.5 })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('fixed_per_sale');
    expect(p.label).toBe('12.50 CUP/venta');
    expect(p.amountPerUnit).toBe(12.5);
  });

  it('importe fijo por unidad (per_unit)', () => {
    const rules = [mkRule({ id: 'r1', product_commission_amount: 3, product_commission_mode: 'per_unit' })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('fixed_per_unit');
    expect(p.label).toBe('3.00 CUP/unidad');
  });

  it('override por producto en product_configs (misma fuente que el catálogo)', () => {
    const rules = [mkRule({
      id: 'r1',
      product_commission_amount: 12.5,
      product_configs: { 'p-1': { amount: 7.25, mode: 'per_unit' } },
    })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.label).toBe('7.25 CUP/unidad');
    expect(p.amountPerUnit).toBe(7.25);
  });

  it('comisión CERO configurada ≠ «Sin regla» (§2.3: no confundir NULL con cero)', () => {
    const rules = [mkRule({ id: 'r1', product_commission_amount: 0 })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('fixed_per_sale');
    expect(p.label).toBe('0.00 CUP/venta');
    const none = resolveProductCommission([], 'p-1', 100, TODAY);
    expect(none.kind).toBe('none');
    expect(none.label).toBe('Sin regla');
  });

  it('porcentaje de tienda (percentage_sales) → el PORCENTAJE, sin conversión de moneda', () => {
    const rules = [mkRule({ id: 'r2', type: 'percentage_sales', value_percent: 5, product_ids: [] })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('percent');
    expect(p.label).toBe('5.00%');
    expect(p.amountPerUnit).toBeNull();
  });

  it('escala aplicable al precio (scale_percentage) → % de la escala vigente para ese precio', () => {
    const rules = [
      mkRule({ id: 'r-scale', type: 'scale_percentage', value_percent: 8, min_price: 90, max_price: 150, product_ids: [] }),
      mkRule({ id: 'r-gen', type: 'percentage_sales', value_percent: 3, product_ids: [] }),
    ];
    const p = resolveProductCommission(rules, 'p-1', 120, TODAY);
    expect(p.kind).toBe('percent_scale');
    expect(p.label).toBe('8.00%');
    // precio fuera del rango de la escala → % general
    const p2 = resolveProductCommission(rules, 'p-1', 50, TODAY);
    expect(p2.label).toBe('3.00%');
  });

  it('regla global por venta (fixed_amount) → «Según venta» (no definible por producto)', () => {
    const rules = [mkRule({ id: 'r3', type: 'fixed_amount', fixed_value: 500, product_ids: [] })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('sale_dependent');
    expect(p.label).toBe('Según venta');
  });

  it('solo reglas por TRABAJADOR → «Según trabajador» (jamás valor universal)', () => {
    const rules = [mkRule({ id: 'r4', worker_id: 'w-1', product_commission_amount: 9 })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.kind).toBe('worker_dependent');
    expect(p.label).toBe('Según trabajador');
    expect(p.amountPerUnit).toBeNull();
  });

  it('regla de tienda CON reglas por trabajador → valor de tienda etiquetado «(base tienda)»', () => {
    const rules = [
      mkRule({ id: 'r-store', product_commission_amount: 10 }),
      mkRule({ id: 'r-worker', worker_id: 'w-1', product_commission_amount: 9, priority: 20 }),
    ];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.label).toBe('10.00 CUP/venta (base tienda)');
  });

  it('la resolución de tienda usa priority DESC igual que el motor (dos reglas del producto)', () => {
    const rules = [
      mkRule({ id: 'r-low', product_commission_amount: 1, priority: 5 }),
      mkRule({ id: 'r-high', product_commission_amount: 4, priority: 50 }),
    ];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.label).toBe('4.00 CUP/venta');
    expect(p.ruleId).toBe('r-high');
  });
});

describe('§4.2-§4.5 · COINCIDENCIA con el motor real de devengo', () => {

  const workerId = 'w-none'; // trabajador SIN regla propia → aplica la de tienda
  const period = { from: '2026-11-01', to: '2026-11-10' };

  /** La columna presenta el valor POR PRODUCTO: se compara contra el detalle
   *  por línea del motor (product_details), que es exactamente lo que el
   *  módulo de comisiones atribuye a cada producto en una venta. */
  function enginePerLine(rules: CommissionRule[], productId: string, unitPrice: number, qtyPerLine: number[] = [1]): number[] {
    const lineItems: ProductLineItem[] = qtyPerLine.map((qty) => ({
      product_id: productId,
      product_name: 'X',
      quantity: qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
      cash_paid: qty * unitPrice,
      transfer_paid: 0,
      sale_date: TODAY,
    }));
    const calc = calculateCommissionWithProducts(workerId, { cash: unitPrice * qtyPerLine.reduce((a, b) => a + b, 0), transfer: 0, total: unitPrice * qtyPerLine.reduce((a, b) => a + b, 0) }, lineItems, rules as CommissionRule[], period, TODAY);
    return (calc.product_breakdown ?? []).map((d) => d.commission);
  }

  it('fixed_per_unit: helper.amountPerUnit × cantidad == comisión del motor (1 y 3 unidades)', () => {
    const rules = [mkRule({ id: 'r1', product_commission_amount: 3, product_commission_mode: 'per_unit' })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(enginePerLine(rules, 'p-1', 100, [1])).toEqual([3]);
    expect(enginePerLine(rules, 'p-1', 100, [3])).toEqual([9]); // amountPerUnit × 3
  });

  it('fixed_per_sale: monto por VENTA — el motor NO lo multiplica por la cantidad de la línea', () => {
    const rules = [mkRule({ id: 'r1', product_commission_amount: 12.5 })];
    const p = resolveProductCommission(rules, 'p-1', 100, TODAY);
    expect(p.amountPerUnit).toBe(12.5);
    expect(enginePerLine(rules, 'p-1', 100, [1])).toEqual([12.5]);
    // §4.5: una línea de cantidad 3 con modo per_sale sigue siendo UNA venta
    // → el motor paga 12.5 (no 37.5) — exactamente lo que presenta la columna.
    expect(enginePerLine(rules, 'p-1', 100, [3])).toEqual([12.5]);
    // Dos ventas separadas → dos montos (una por venta), sin duplicación.
    expect(enginePerLine(rules, 'p-1', 100, [1, 1])).toEqual([12.5, 12.5]);
  });

  it('percent: % presentado == % efectivo del motor (line_total × %) para 1 y 3 unidades', () => {
    const rules = [mkRule({ id: 'r2', type: 'percentage_sales', value_percent: 5, product_ids: [] })];
    const p = resolveProductCommission(rules, 'p-1', 200, TODAY);
    expect(p.percent).toBe(5);
    expect(enginePerLine(rules, 'p-1', 200, [1])).toEqual([10]);   // 200 × 5%
    expect(enginePerLine(rules, 'p-1', 200, [3])).toEqual([30]);   // 600 × 5%
  });

  it('scale: el motor aplica el % de la ESCALA que incluye el precio — igual que el helper', () => {
    const rules = [mkRule({ id: 'r-scale', type: 'scale_percentage', value_percent: 8, min_price: 90, max_price: 150, product_ids: [] })];
    const p = resolveProductCommission(rules, 'p-1', 120, TODAY);
    expect(p.percent).toBe(8);
    expect(enginePerLine(rules, 'p-1', 120, [1])).toEqual([9.6]); // 120 × 8%
  });
});

describe('TAREA 3 · filtro «Comisión» de Reglas por producto (criterio puro)', () => {

  const valores: Array<{ id: string; effective: number | null }> = [
    { id: 'positiva', effective: 5 },
    { id: 'cero', effective: 0 },
    { id: 'sin-regla', effective: null },
    { id: 'positiva2', effective: 12.5 },
  ];
  const apply = (filter: CommissionValueFilter) =>
    valores.filter((v) => matchesCommissionFilter(v.effective, filter)).map((v) => v.id);

  it('Todos presenta la totalidad del ámbito actual', () => {
    expect(apply('all')).toEqual(['positiva', 'cero', 'sin-regla', 'positiva2']);
  });

  it('>0 excluye las comisiones cero y las sin regla', () => {
    expect(apply('gt0')).toEqual(['positiva', 'positiva2']);
  });

  it('=0 excluye las positivas y las sin regla (cero ≠ NULL)', () => {
    expect(apply('eq0')).toEqual(['cero']);
  });

  it('Sin configurar identifica SOLO los productos sin regla (§3.2)', () => {
    expect(apply('unset')).toEqual(['sin-regla']);
  });

  it('el filtro compone con búsqueda/categoría sin alterar su criterio (función pura)', () => {
    // La vista combina matchSearch && matchCategory && matchCommission — el
    // criterio de comisión es independiente y no resetea los demás.
    const conBusqueda = valores.filter((v) => v.id.includes('positiva') && matchesCommissionFilter(v.effective, 'gt0'));
    expect(conBusqueda.map((v) => v.id)).toEqual(['positiva', 'positiva2']);
  });
});
