/**
 * Pruebas del núcleo de cálculo IPV — escenarios obligatorios A–L (MISIÓN §13)
 * más los hallazgos de auditoría (guarda legacy, PRE_LEDGER, UNMAPPED, precisión).
 *
 * Datos SINTÉTICOS en memoria: ninguna prueba toca datos comerciales reales.
 * El IPV es un reporte de solo lectura; las pruebas ejercitan computeIpv() pura.
 */

import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  computeLineTotalCup,
  totalsFromRows,
  IPV_COLUMN_BY_TYPE,
  type IpvComputeInput,
  type IpvMovementRow,
  type IpvSalesLineRow,
} from '@/lib/ipv-ventas/compute';

const FROM = '2026-10-10T00:00:00.000Z';
const TO = '2026-10-14T23:59:59.999Z';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';

function base(overrides: Partial<IpvComputeInput> = {}): IpvComputeInput {
  return {
    window: { fromISO: FROM, toISO: TO },
    movements: [],
    inventory: [],
    salesLines: [],
    devolutionLines: [],
    products: [{ id: P1, sku: '1', name: 'Producto Uno', unit_of_measure: 'un' }],
    ...overrides,
  };
}

const mov = (product_id: string, movement_type: string, quantity_change: number, iso: string): IpvMovementRow => ({
  product_id, movement_type, quantity_change, movement_date: iso,
});

const sale = (product_id: string, qty: number, price_cup: number, currency = 'CUP', price?: number): IpvSalesLineRow => ({
  product_id,
  quantity: qty,
  price_at_sale: price ?? price_cup,
  price_at_sale_cup: price_cup,
  price_currency: currency,
  exchange_rate: 1,
  sale_exchange_rate: 1,
});

function rowOf(result: ReturnType<typeof computeIpv>, pid: string) {
  return result.rows.find((r) => r.productId === pid);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('IPV — mapeo de tipos de movimiento (conciliación por construcción)', () => {
  it('mapea los 18 movement_type reales y ninguno queda sin columna', () => {
    const reales = [
      'sale', 'purchase', 'adjustment', 'initial', 'return', 'void', 'sale_void',
      'transfer_out', 'transfer_in', 'transfer', 'production_out', 'production_in',
      'sale_reverse', 'purchase_reverse', 'production_reverse', 'issue_slip_out',
      'issue_slip_reverse', 'devolution_reverse',
    ];
    for (const t of reales) expect(IPV_COLUMN_BY_TYPE[t], `tipo ${t}`).toBeDefined();
    expect(Object.keys(IPV_COLUMN_BY_TYPE)).toHaveLength(18);
  });
});

describe('Escenario A — Venta que agota la existencia', () => {
  it('Ei=5, vendidas=5 → Ef=0 y el producto APARECE (tuvo movimiento)', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 5, '2026-09-01T12:00:00Z'),
        mov(P1, 'sale', -5, '2026-10-12T15:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 0 }],
    }));
    const row = rowOf(r, P1);
    expect(row).toBeDefined();
    expect(row?.existenciaInicial).toBe(5);
    expect(row?.cantidadesVendidas).toBe(5);
    expect(row?.existenciaFinal).toBe(0);
  });
});

describe('Escenario B — Entrada de inventario', () => {
  it('Ei=0, entradas=10 → Ef=10 y el producto aparece', () => {
    const r = computeIpv(base({
      movements: [mov(P1, 'purchase', 10, '2026-10-11T10:00:00Z')],
      inventory: [{ product_id: P1, quantity: 10 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(0);
    expect(row?.entradas).toBe(10);
    expect(row?.existenciaFinal).toBe(10);
  });
});

describe('Escenario C — Entrada y venta parcial (conciliación completa)', () => {
  it('Ei=0, EN=10, V=7, VS=2, DV=1 → Ef=2', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'purchase', 10, '2026-10-11T10:00:00Z'),
        mov(P1, 'sale', -7, '2026-10-12T15:00:00Z'),
        mov(P1, 'issue_slip_out', -2, '2026-10-13T11:00:00Z'),
        mov(P1, 'return', 1, '2026-10-13T17:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 2 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(0);
    expect(row?.entradas).toBe(10);
    expect(row?.cantidadesVendidas).toBe(7);
    expect(row?.valesSalidas).toBe(2);
    expect(row?.devoluciones).toBe(1);
    expect(row?.existenciaFinal).toBe(0 + 10 + 1 - 7 - 2);
  });

  it('variante con Ei=5 (carga inicial pre-período) → Ef=7 exacto', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 5, '2026-09-30T10:00:00Z'),
        mov(P1, 'purchase', 10, '2026-10-11T10:00:00Z'),
        mov(P1, 'sale', -7, '2026-10-12T15:00:00Z'),
        mov(P1, 'issue_slip_out', -2, '2026-10-13T11:00:00Z'),
        mov(P1, 'return', 1, '2026-10-13T17:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 7 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(5);
    expect(row?.existenciaFinal).toBe(7);
  });
});

describe('Escenario D — Producto irrelevante para el período', () => {
  it('Ei=0, sin movimientos, Ef=0, sin incidencias → NO aparece', () => {
    const r = computeIpv(base({
      products: [
        { id: P1, sku: '1', name: 'Relevante', unit_of_measure: 'un' },
        { id: P2, sku: '2', name: 'Irrelevante', unit_of_measure: 'un' },
      ],
      movements: [mov(P1, 'sale', -1, '2026-10-12T15:00:00Z')],
      inventory: [{ product_id: P1, quantity: 9 }, { product_id: P2, quantity: 0 }],
    }));
    expect(rowOf(r, P2)).toBeUndefined();
    expect(r.excludedCount).toBe(1);
  });

  it('producto con SOLO movimientos posteriores al período → NO aparece', () => {
    const r = computeIpv(base({
      products: [{ id: P2, sku: '2', name: 'Posterior', unit_of_measure: 'un' }],
      movements: [mov(P2, 'purchase', 10, '2026-10-20T10:00:00Z')],
      inventory: [{ product_id: P2, quantity: 10 }],
    }));
    expect(rowOf(r, P2)).toBeUndefined();
  });
});

describe('Escenario E — Devolución de una venta (sin doble conteo)', () => {
  it('venta 5 + devolución 2: cantidades del ledger, importe neto por devolution_items', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 5, '2026-09-01T12:00:00Z'),
        mov(P1, 'sale', -5, '2026-10-12T15:00:00Z'),
        mov(P1, 'return', 2, '2026-10-13T11:00:00Z'),
      ],
      salesLines: [sale(P1, 5, 1000)],
      devolutionLines: [{ product_id: P1, quantity: 2, unit_price: 1000 }],
      inventory: [{ product_id: P1, quantity: 2 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(5);
    expect(row?.cantidadesVendidas).toBe(5);   // del ledger
    expect(row?.devoluciones).toBe(2);         // del ledger — no duplica con devolution_items
    expect(row?.existenciaFinal).toBe(2);      // 5 − 5 + 2
    expect(row?.ventasImporteCup).toBe(3000);  // 5000 vendido − 2000 devuelto
  });
});

describe('Escenario F — Vale de salida anulado/reversado', () => {
  it('issue_slip_out −3 + issue_slip_reverse +3 → Vales salidas netos = 0', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'issue_slip_out', -3, '2026-10-12T10:00:00Z'),
        mov(P1, 'issue_slip_reverse', 3, '2026-10-13T10:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 0 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.valesSalidas).toBe(0);
    expect(row?.existenciaFinal).toBe(0);
  });

  it('vale ligado a orden de producción (production_out) también cuenta como vale', () => {
    const r = computeIpv(base({
      movements: [mov(P1, 'production_out', -4, '2026-10-12T10:00:00Z')],
      inventory: [{ product_id: P1, quantity: 0 }],
    }));
    expect(rowOf(r, P1)?.valesSalidas).toBe(4);
  });
});

describe('Escenario G — Período histórico', () => {
  it('Ei = saldo anterior al primer día; solo los movimientos del período entran en columnas', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 10, '2026-08-01T10:00:00Z'),
        mov(P1, 'purchase', 5, '2026-10-08T10:00:00Z'),   // antes del período → Ei
        mov(P1, 'sale', -3, '2026-10-10T12:00:00Z'),       // día 1 del período
        mov(P1, 'sale', -2, '2026-10-14T22:00:00Z'),       // último día (inclusivo)
        mov(P1, 'purchase', 7, '2026-10-15T10:00:00Z'),    // fuera → post
      ],
      inventory: [{ product_id: P1, quantity: 17 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(15); // 10 + 5
    expect(row?.cantidadesVendidas).toBe(5); // solo las 2 ventas del período
    expect(row?.entradas).toBe(0);           // la compra del 15 NO entra
    expect(row?.existenciaFinal).toBe(10);   // 15 − 5
  });
});

describe('Escenario H — Ventas en monedas diferentes', () => {
  it('CUP y USD NO se suman entre sí: USD nativo queda en su columna informativa', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'sale', -2, '2026-10-12T15:00:00Z'),
        mov(P1, 'sale', -3, '2026-10-12T16:00:00Z'),
      ],
      salesLines: [
        sale(P1, 2, 500, 'CUP'),                                      // 1000 CUP
        sale(P1, 3, 15, 'USD', 15),                                   // 45 USD nativo
      ],
      inventory: [{ product_id: P1, quantity: 0 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.cantidadesVendidas).toBe(5);
    expect(row?.ventasImporteUsd).toBe(45);
  });

  it('la línea USD usa su price_at_sale_cup (tasa histórica) en la columna CUP', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 3, price_at_sale: 15, price_at_sale_cup: 6000,
      price_currency: 'USD', exchange_rate: 400, sale_exchange_rate: 400,
    };
    const r = computeIpv(base({ salesLines: [line] }));
    const row = rowOf(r, P1);
    expect(row?.ventasImporteCup).toBe(18000); // 6000×3 — tasa histórica, no la actual
    expect(row?.ventasImporteUsd).toBe(45);
  });
});

describe('Escenario I — Precisión decimal (sin redondeos indebidos)', () => {
  it('65.5, 65.25, 0.5, 1.75 y 10.125 se conservan', () => {
    const r = computeIpv(base({
      products: [{ id: P1, sku: '1', name: 'A granel', unit_of_measure: 'kg' }],
      movements: [
        mov(P1, 'purchase', 65.5, '2026-10-11T10:00:00Z'),
        mov(P1, 'purchase', 65.25, '2026-10-11T11:00:00Z'),
        mov(P1, 'sale', -0.5, '2026-10-12T10:00:00Z'),
        mov(P1, 'issue_slip_out', -1.75, '2026-10-12T11:00:00Z'),
        mov(P1, 'adjustment', -10.125, '2026-10-13T10:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 118.375 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.entradas).toBe(130.75);
    expect(row?.cantidadesVendidas).toBe(0.5);
    expect(row?.valesSalidas).toBe(1.75);
    expect(row?.ajustes).toBe(-10.125);
    expect(row?.existenciaFinal).toBe(118.375);
  });
});

describe('Escenario J — Cambio de tienda (sin contaminación)', () => {
  it('cada ejecución consume SOLO los datos de su tienda (la API filtra por store_id)', () => {
    const tiendaA = computeIpv(base({
      products: [{ id: P1, sku: '1', name: 'Solo A', unit_of_measure: 'un' }],
      movements: [mov(P1, 'sale', -2, '2026-10-12T15:00:00Z')],
      salesLines: [sale(P1, 2, 100)],
      inventory: [{ product_id: P1, quantity: 8 }],
    }));
    const tiendaB = computeIpv(base({
      products: [{ id: P2, sku: '2', name: 'Solo B', unit_of_measure: 'un' }],
      movements: [mov(P2, 'purchase', 4, '2026-10-12T15:00:00Z')],
      inventory: [{ product_id: P2, quantity: 4 }],
    }));
    expect(rowOf(tiendaA, P2)).toBeUndefined();
    expect(rowOf(tiendaB, P1)).toBeUndefined();
    expect(tiendaA.rows).toHaveLength(1);
    expect(tiendaB.rows).toHaveLength(1);
  });
});

describe('Escenario L — Diferencia de inventario (incidencia, no ajuste)', () => {
  it('ledger ≠ inventory.quantity → incidencia RECONCILIATION con calculated/expected/difference', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 5, '2026-09-01T10:00:00Z'),
        mov(P1, 'sale', -2, '2026-10-12T15:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 10 }], // canónico dice 10, ledger 3
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaFinal).toBe(3); // NO se ajusta al canónico
    expect(row?.incidenceTypes).toContain('RECONCILIATION');
    const inc = r.incidences.find((i) => i.type === 'RECONCILIATION');
    expect(inc?.calculated).toBe(3);
    expect(inc?.expected).toBe(10);
    expect(inc?.difference).toBe(7);
    expect(r.meta.historicalBalanceLimited).toBe(true);
  });

  it('PRE_LEDGER: stock actual sin movimientos → N/D + incidencia (nunca cero)', () => {
    const r = computeIpv(base({
      movements: [],
      inventory: [{ product_id: P1, quantity: 42 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBeNull();
    expect(row?.existenciaFinal).toBeNull();
    expect(row?.incidenceTypes).toContain('PRE_LEDGER');
    const inc = r.incidences.find((i) => i.type === 'PRE_LEDGER');
    expect(inc?.expected).toBe(42);
  });
});

describe('Guarda legacy price_at_sale_cup (bug V1: ya es precio×qty×tasa)', () => {
  it('forma LEGADO: cup = precio×qty×tasa → NO se multiplica otra vez por qty', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 2, price_at_sale: 9450, price_at_sale_cup: 6426000,
      price_currency: 'USD', exchange_rate: 340, sale_exchange_rate: 340,
    };
    const { total, anomaly } = computeLineTotalCup(line);
    expect(total).toBe(6426000); // no 12.852.000
    expect(anomaly).toBe(false);
  });

  it('forma UNITARIA (v2): cup = precio×tasa → total = cup×qty', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 2, price_at_sale: 300, price_at_sale_cup: 300,
      price_currency: 'CUP', exchange_rate: 1, sale_exchange_rate: 1,
    };
    const { total, anomaly } = computeLineTotalCup(line);
    expect(total).toBe(600);
    expect(anomaly).toBe(false);
  });

  it('forma ambigua → PRICE_ANOMALY en el producto (auditable, no silencio)', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 2, price_at_sale: 100, price_at_sale_cup: 555,
      price_currency: 'CUP', exchange_rate: 1, sale_exchange_rate: 1,
    };
    const r = computeIpv(base({ salesLines: [line] }));
    const row = rowOf(r, P1);
    expect(row?.incidenceTypes).toContain('PRICE_ANOMALY');
  });

  it('sin price_at_sale_cup → fallback price×tasa×qty', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 3, price_at_sale: 200, price_at_sale_cup: null,
      price_currency: 'CUP', exchange_rate: 1, sale_exchange_rate: 1,
    };
    expect(computeLineTotalCup(line).total).toBe(600);
  });
});

describe('Defensa del ledger', () => {
  it('tipo de movimiento no mapeado → ajustes + UNMAPPED_TYPE (nunca se descarta)', () => {
    const r = computeIpv(base({
      movements: [mov(P1, 'tipo_futuro', -3, '2026-10-12T10:00:00Z')],
      inventory: [{ product_id: P1, quantity: 0 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.ajustes).toBe(-3);
    expect(row?.existenciaFinal).toBe(-3);
    expect(row?.incidenceTypes).toContain('UNMAPPED_TYPE');
  });

  it('sale_reverse (reversión de venta) nete dentro de Cantidades vendidas', () => {
    const r = computeIpv(base({
      movements: [
        mov(P1, 'initial', 5, '2026-09-01T10:00:00Z'),
        mov(P1, 'sale', -5, '2026-10-12T15:00:00Z'),
        mov(P1, 'sale_reverse', 5, '2026-10-13T09:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 5 }],
    }));
    const row = rowOf(r, P1);
    expect(row?.existenciaInicial).toBe(5);
    expect(row?.cantidadesVendidas).toBe(0);
    expect(row?.existenciaFinal).toBe(5);
    expect(row?.incidenceTypes).toEqual([]);
  });

  it('conciliación de totales: Ef_total = Ei_total + EN + DV − V − VS + AJ + TR', () => {
    const r = computeIpv(base({
      products: [
        { id: P1, sku: '1', name: 'Uno', unit_of_measure: 'un' },
        { id: P2, sku: '2', name: 'Dos', unit_of_measure: 'un' },
        { id: P3, sku: '3', name: 'Tres', unit_of_measure: 'un' },
      ],
      movements: [
        mov(P1, 'initial', 18, '2026-09-01T10:00:00Z'),
        mov(P1, 'sale', -6, '2026-10-12T15:00:00Z'),
        mov(P2, 'purchase', 32, '2026-10-11T10:00:00Z'),
        mov(P2, 'issue_slip_out', -5, '2026-10-12T10:00:00Z'),
        mov(P3, 'initial', 1, '2026-09-02T10:00:00Z'),
        mov(P3, 'return', 2, '2026-10-13T10:00:00Z'),
        mov(P3, 'transfer_out', -1, '2026-10-13T11:00:00Z'),
      ],
      inventory: [{ product_id: P1, quantity: 12 }, { product_id: P2, quantity: 27 }, { product_id: P3, quantity: 2 }],
    }));
    const t = r.totals;
    const efEsperado = (t.existenciaInicial ?? 0) + t.entradas + t.devoluciones - t.cantidadesVendidas - t.valesSalidas + t.ajustes + t.transferencias;
    expect(t.existenciaFinal).toBeCloseTo(efEsperado, 6);
  });
});

describe('Regla de inclusión y totales filtrados (escenario K — misma ejecución)', () => {
  it('totalsFromRows sobre el subconjunto visible coincide con lo que exportarían PDF/Excel', () => {
    const r = computeIpv(base({
      products: [
        { id: P1, sku: '1', name: 'Uno', unit_of_measure: 'un' },
        { id: P2, sku: '2', name: 'Dos', unit_of_measure: 'un' },
      ],
      movements: [
        mov(P1, 'initial', 10, '2026-09-01T10:00:00Z'),
        mov(P1, 'sale', -2, '2026-10-12T15:00:00Z'),
        mov(P2, 'sale', -4, '2026-10-12T16:00:00Z'),
      ],
      salesLines: [sale(P1, 2, 100), sale(P2, 4, 50)],
      inventory: [{ product_id: P1, quantity: 8 }, { product_id: P2, quantity: 1 }],
    }));
    const soloUno = r.rows.filter((row) => row.sku === '1');
    const t = totalsFromRows(soloUno);
    expect(t.cantidadesVendidas).toBe(2);
    expect(t.ventasImporteCup).toBe(200);
    expect(t.existenciaInicial).toBe(10);
    expect(t.existenciaFinal).toBe(8); // 10 − 2
  });

  it('importe usa línea bruta cobrada (item_discount_value informativo — verificado en BD)', () => {
    // COSTPRO: transactions.total_amount = Σ líneas brutas; el IPV concilia con eso.
    const r = computeIpv(base({
      movements: [mov(P1, 'sale', -2, '2026-10-12T15:00:00Z')],
      salesLines: [sale(P1, 2, 19000)],
      inventory: [{ product_id: P1, quantity: 8 }],
    }));
    expect(rowOf(r, P1)?.ventasImporteCup).toBe(38000);
  });

  it('producto con importe vendido pero sin movimientos de ledger aparece (no se ocultan ingresos)', () => {
    const line: IpvSalesLineRow = {
      product_id: P1, quantity: 3, price_at_sale: 15, price_at_sale_cup: 6000,
      price_currency: 'USD', exchange_rate: 400, sale_exchange_rate: 400,
    };
    const r = computeIpv(base({ salesLines: [line] }));
    const row = rowOf(r, P1);
    expect(row).toBeDefined();
    expect(row?.existenciaInicial).toBeNull(); // N/D, no cero
    expect(row?.ventasImporteCup).toBe(18000);
  });
});
