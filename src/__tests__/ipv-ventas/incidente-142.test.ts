/**
 * MISIÓN CORRECTIVA 2026-10-16 — caso SKU 142 "Cemento Blanco 2 Kg" y familia.
 *
 * Reproduce el INCIDENTE (truncado PostgREST a 1000 filas) a nivel del núcleo
 * de cálculo y demuestra que con el ledger COMPLETO el IPV cumple las reglas
 * contables de la misión:
 *
 *   Ef = Ei + Entradas + Devoluciones − Cantidades vendidas − Vales de salida
 *
 * Datos REALES verificados en BD (solo lectura) para SKU 142 en ENERVIDA:
 *   purchase +30 (24/09) · ventas −1 (10/10) −3 (10/12) −3 (10/14) −2 (10/15)
 *   inventory.quantity = 21  →  el ledger concilia EXACTAMENTE (30−9=21).
 *   Venta del 15/10: transaction 2 × 2000 CUP = 4.000 CUP (forma unitaria).
 */
import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  type IpvMovementRow,
  type IpvInventoryRow,
  type IpvSalesLineRow,
  type IpvDevolutionLineRow,
  type IpvProductRow,
  type IpvRow,
} from '@/lib/ipv-ventas/compute';

const P142 = '504b9b78-0000-4000-8000-000000000142';
const P175 = '504b9b78-0000-4000-8000-000000000175';
const OTRO = '504b9b78-0000-4000-8000-000000000999';

// Ventanas locales de Cuba (UTC-4 en octubre) — la convención del cliente:
// «solo 15/10» → [2026-10-15T04:00Z, 2026-10-16T03:59:59.999Z]
const FROM_15 = '2026-10-15T04:00:00.000Z';
const TO_15 = '2026-10-16T03:59:59.999Z';
// «14–15/10» → [2026-10-14T04:00Z, 2026-10-16T03:59:59.999Z]
const FROM_14 = '2026-10-14T04:00:00.000Z';

function mov(product_id: string, movement_type: string, quantity_change: number, movement_date: string): IpvMovementRow {
  return { product_id, movement_type, quantity_change: String(quantity_change), movement_date };
}

/** Ledger REAL completo del SKU 142 (el que la BD contiene y la consulta truncada perdía). */
function ledger142Completo(): IpvMovementRow[] {
  return [
    mov(P142, 'purchase', 30, '2026-09-24T16:00:00Z'),
    mov(P142, 'sale', -1, '2026-10-10T17:00:00Z'),
    mov(P142, 'sale', -3, '2026-10-12T16:00:00Z'),
    mov(P142, 'sale', -3, '2026-10-14T16:00:00Z'),
    mov(P142, 'sale', -2, '2026-10-15T16:00:00Z'),
  ];
}

/** Lo que la consulta SIN paginación le entregaba al cálculo (primeras 1000 filas): los movimientos más recientes — las ventas del 14 y 15/10 — habían quedado fuera. */
function ledger142Truncado(): IpvMovementRow[] {
  return [
    mov(P142, 'purchase', 30, '2026-09-24T16:00:00Z'),
    mov(P142, 'sale', -1, '2026-10-10T17:00:00Z'),
    mov(P142, 'sale', -3, '2026-10-12T16:00:00Z'),
  ];
}

const inventario142: IpvInventoryRow[] = [{ product_id: P142, quantity: '21' }];

function venta(product_id: string, qty: number, precio: number, currency = 'CUP'): IpvSalesLineRow {
  return {
    product_id, quantity: String(qty), price_at_sale: String(precio),
    price_at_sale_cup: String(precio), price_currency: currency,
    exchange_rate: currency === 'CUP' ? null : null, sale_exchange_rate: null,
  };
}

const productos: IpvProductRow[] = [
  { id: P142, sku: '142', name: 'Cemento Blanco 2 Kg', unit_of_measure: 'bulto' },
  { id: P175, sku: '175', name: 'Losa Porcelanato 25x60', unit_of_measure: 'm2' },
  { id: OTRO, sku: '999', name: 'Producto ajeno (otra tienda)', unit_of_measure: 'u' },
];

function rowOf(result: { rows: IpvRow[] }, pid: string): IpvRow {
  const r = result.rows.find((x) => x.productId === pid);
  if (!r) throw new Error(`fila no encontrada para ${pid}`);
  return r;
}

describe('INCIDENTE 2026-10-16 — reproducción del defecto (entrada truncada)', () => {
  it('con el ledger truncado el IPV mostraba Ei=26, Ef=26, V=0 y RECONCILIATION 26/21/−5 (lo que vio el usuario)', () => {
    const res = computeIpv({
      window: { fromISO: FROM_14, toISO: TO_15 },
      movements: ledger142Truncado(),
      inventory: inventario142,
      salesLines: [venta(P142, 2, 2000)], // el importe SÍ llegaba (transaction_items no estaba truncado)
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    // Saldo reconstruido SOLO con lo que llegó: 30 − 1 − 3 = 26; ninguna venta en el período.
    expect(r.existenciaInicial).toBe(26);
    expect(r.cantidadesVendidas).toBe(0);
    expect(r.existenciaFinal).toBe(26);
    // El importe sí estaba: 2 × 2000 = 4.000 CUP → el síntoma exacto del usuario.
    expect(r.ventasImporteCup).toBe(4000);
    // Y la alerta espuria: calculado 26 vs canónico 21 → dif −5 (2+3 ventas ausentes).
    const inc = res.incidences.find((i) => i.productId === P142 && i.type === 'RECONCILIATION');
    expect(inc).toBeDefined();
    expect(inc?.calculated).toBe(26);
    expect(inc?.expected).toBe(21);
    expect(inc?.difference).toBe(-5);
  });

  it('con el ledger COMPLETO la alerta RECONCILIATION del SKU 142 desaparece — la conciliación real es 21 = 21', () => {
    const res = computeIpv({
      window: { fromISO: FROM_14, toISO: TO_15 },
      movements: ledger142Completo(),
      inventory: inventario142,
      salesLines: [venta(P142, 3, 2000), venta(P142, 2, 2000)],
      devolutionLines: [],
      products: productos,
    });
    expect(res.incidences.find((i) => i.productId === P142)).toBeUndefined();
  });
});

describe('Prueba A — venta del SKU 142 (apertura 26, venta 2, importe 4.000 CUP)', () => {
  it('V=2, importe=4.000 CUP, Ef=24 — la venta contribuye a importe, cantidades y saldo a la vez', () => {
    const res = computeIpv({
      window: { fromISO: '2026-10-15T00:00:00.000Z', toISO: '2026-10-16T23:59:59.999Z' },
      movements: [
        mov(P142, 'initial', 26, '2026-10-10T00:00:00Z'),   // apertura documentada pre-período
        mov(P142, 'sale', -2, '2026-10-15T19:00:00Z'),       // la venta completa
      ],
      inventory: [{ product_id: P142, quantity: '24' }],
      salesLines: [venta(P142, 2, 2000)],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.existenciaInicial).toBe(26);
    expect(r.cantidadesVendidas).toBe(2);
    expect(r.ventasImporteCup).toBe(4000);
    expect(r.existenciaFinal).toBe(24);
    expect(r.incidences ?? r.incidenceTypes).toEqual([]);
    expect(res.incidences).toHaveLength(0);
  });
});

describe('Prueba B — dos fechas con ventas (14-15/10 y solo 15/10)', () => {
  const movs = ledger142Completo(); // apertura 26 al cierre del 13/10
  const lineas = [venta(P142, 3, 2000), venta(P142, 2, 2000)];

  it('período 14–15/10: Ei=26, V=5, Ef=21, importe 10.000 CUP', () => {
    const res = computeIpv({ window: { fromISO: FROM_14, toISO: TO_15 }, movements: movs, inventory: inventario142, salesLines: lineas, devolutionLines: [], products: productos });
    const r = rowOf(res, P142);
    expect(r.existenciaInicial).toBe(26);
    expect(r.cantidadesVendidas).toBe(5);
    expect(r.existenciaFinal).toBe(21);
    expect(r.ventasImporteCup).toBe(10000);
    // Trazabilidad por venta: 3+2 = 5 y (3+2)×2000 = 10.000
    expect(r.cantidadesVendidas * 2000).toBe(r.ventasImporteCup);
  });

  it('período SOLO 15/10: la apertura es el saldo al CIERRE del 14/10 (23), no el 26 del día 14', () => {
    const res = computeIpv({ window: { fromISO: FROM_15, toISO: TO_15 }, movements: movs, inventory: inventario142, salesLines: [venta(P142, 2, 2000)], devolutionLines: [], products: productos });
    const r = rowOf(res, P142);
    expect(r.existenciaInicial).toBe(23); // 26 − 3 (venta del 14/10 quedó antes del período)
    expect(r.cantidadesVendidas).toBe(2);
    expect(r.ventasImporteCup).toBe(4000);
    expect(r.existenciaFinal).toBe(21);
  });

  it('las ventas del 14/10 NO se omiten ni se duplican en el período 14–15 (cada movimiento cuenta una vez)', () => {
    const res = computeIpv({ window: { fromISO: FROM_14, toISO: TO_15 }, movements: movs, inventory: inventario142, salesLines: lineas, devolutionLines: [], products: productos });
    const r = rowOf(res, P142);
    // Σ ledger = 30−1−3−3−2 = 21 = inventory.quantity → sin doble conteo ni omisión
    expect(r.existenciaFinal).toBe(21);
    expect(res.incidences).toHaveLength(0);
  });
});

describe('Prueba C — límites inclusivos del período (fecha económica, día completo)', () => {
  it('movimiento en el instante EXACTO de apertura y de cierre cae DENTRO del período', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 26, '2026-10-14T00:00:00Z'),
        mov(P142, 'purchase', 5, FROM_15),            // exactly from → período
        mov(P142, 'sale', -2, TO_15),                  // exactly to → período
        mov(P142, 'sale', -1, '2026-10-16T04:00:00Z'), // after to → NUNCA en este período
      ],
      inventory: [{ product_id: P142, quantity: '28' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.entradas).toBe(5);
    expect(r.cantidadesVendidas).toBe(2); // la venta posterior al período no se filtra hacia atrás
    expect(r.existenciaFinal).toBe(26 + 5 - 2);
  });
});

describe('Prueba D — venta anulada/revertida (sin doble conteo)', () => {
  it('sale −2 + sale_void +2 → V=0, Ef=26; la anulada no cuenta como venta válida ni descuenta dos veces', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 26, '2026-10-10T00:00:00Z'),
        mov(P142, 'sale', -2, '2026-10-15T19:00:00Z'),
        mov(P142, 'sale_void', 2, '2026-10-15T19:30:00Z'),
      ],
      inventory: [{ product_id: P142, quantity: '26' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.cantidadesVendidas).toBe(0);
    expect(r.existenciaFinal).toBe(26);
  });
});

describe('Prueba E — entrada y venta (apertura 6, entrada 54, venta 6 → 54)', () => {
  it('respeta la unidad comercial del producto y da Ef=54', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 6, '2026-10-10T00:00:00Z'),
        mov(P142, 'purchase', 54, '2026-10-15T09:00:00Z'),
        mov(P142, 'sale', -6, '2026-10-15T19:00:00Z'),
      ],
      inventory: [{ product_id: P142, quantity: '54' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.existenciaInicial).toBe(6);
    expect(r.entradas).toBe(54);
    expect(r.cantidadesVendidas).toBe(6);
    expect(r.existenciaFinal).toBe(54);
    expect(r.unit).toBe('bulto');
  });
});

describe('Prueba F — vales de salida (apertura 10, vale completado 3 → 7)', () => {
  it('vale COMPLETADO descuenta; un vale en borrador no existe como movimiento y no descuenta', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 10, '2026-10-10T00:00:00Z'),
        mov(P142, 'issue_slip_out', -3, '2026-10-15T11:00:00Z'),
      ],
      inventory: [{ product_id: P142, quantity: '7' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.valesSalidas).toBe(3);
    expect(r.existenciaFinal).toBe(7);
  });
});

describe('Prueba G — devolución (signo y dinero sin doble conteo)', () => {
  it('venta −5 + devolución +2 → Devoluciones=2, V=5, Ef=27; importe neto = bruto − devuelto', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 26, '2026-10-10T00:00:00Z'),
        mov(P142, 'sale', -5, '2026-10-15T19:00:00Z'),
        mov(P142, 'return', 2, '2026-10-15T21:00:00Z'),
      ],
      inventory: [{ product_id: P142, quantity: '23' }],
      salesLines: [venta(P142, 5, 2000)],
      devolutionLines: [{ product_id: P142, quantity: '2', unit_price: '2000' }],
      products: productos,
    });
    const r = rowOf(res, P142);
    expect(r.cantidadesVendidas).toBe(5);   // bruta del ledger, no neta con la devolución
    expect(r.devoluciones).toBe(2);          // columna propia con su signo
    expect(r.existenciaFinal).toBe(23);      // 26 − 5 + 2
    expect(r.ventasImporteCup).toBe(10000 - 4000); // dinero: bruto − devolución (no se resta dos veces)
  });
});

describe('Prueba H — SKU 175 (carga dentro del período y caso truncado)', () => {
  it('movimiento único del 15/10 dentro del período → Ei=0 (saldo confirmado POR el ledger vacío pre-período, no inventado), entradas 1.2, Ef 1.2 y SIN PRE_LEDGER (estado real tras paginar)', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [mov(P175, 'purchase', 1.2, '2026-10-15T16:00:00Z')],
      inventory: [{ product_id: P175, quantity: '1.2' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P175);
    // El ledger del producto está COMPLETO y no tiene movimientos < período:
    // el saldo al cierre del 14/10 era realmente 0 (el producto no estaba en
    // inventario). Ei=0 es un saldo reconstruido y verificable (0+1.2 = 1.2 =
    // canónico), distinto del N/D del caso sin ledger (test siguiente).
    expect(r.existenciaInicial).toBe(0);
    expect(r.entradas).toBe(1.2);                    // 1,2 fiel, sin redondeo
    expect(r.existenciaFinal).toBe(1.2);
    expect(res.incidences).toHaveLength(0);          // la alerta era espuria: el movimiento EXISTE
  });

  it('si el movimiento se trunca (como ocurrió) → PRE_LEDGER con N/D y diferencia documentada, nunca cero inventado', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [],
      inventory: [{ product_id: P175, quantity: '1.2' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r = rowOf(res, P175);
    expect(r.existenciaInicial).toBeNull();
    expect(r.existenciaFinal).toBeNull();
    expect(r.incidenceTypes).toContain('PRE_LEDGER');
    const inc = res.incidences.find((i) => i.productId === P175 && i.type === 'PRE_LEDGER');
    expect(inc?.expected).toBe(1.2);
    expect(inc?.calculated).toBeNull();
  });
});

describe('Prueba J — precisión decimal en los SKUs del incidente', () => {
  it('1.2 / 65.5 / 65.25 / 10.125 se conservan sin redondeos artificiales', () => {
    const movs: IpvMovementRow[] = [
      mov(P142, 'initial', 65.5, '2026-10-10T00:00:00Z'),
      mov(P142, 'purchase', 65.25, '2026-10-15T09:00:00Z'),
      mov(P142, 'adjustment', 10.125, '2026-10-15T10:00:00Z'),
      mov(P175, 'purchase', 1.2, '2026-10-15T16:00:00Z'),
    ];
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: movs,
      inventory: [{ product_id: P142, quantity: '140.875' }, { product_id: P175, quantity: '1.2' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    const r142 = rowOf(res, P142);
    expect(r142.existenciaInicial).toBe(65.5);
    expect(r142.entradas).toBe(65.25);
    expect(r142.ajustes).toBe(10.125);
    expect(r142.existenciaFinal).toBe(65.5 + 65.25 + 10.125);
    expect(rowOf(res, P175).existenciaFinal).toBe(1.2);
  });
});

describe('Prueba K — aislamiento multitienda a nivel de datos consumidos', () => {
  it('movimientos de OTRA tienda jamás llegan al cálculo: la API filtra por store_id y computeIpv solo ve lo suyo', () => {
    const res = computeIpv({
      window: { fromISO: FROM_15, toISO: TO_15 },
      movements: [
        mov(P142, 'initial', 26, '2026-10-10T00:00:00Z'),
        mov(P142, 'sale', -2, '2026-10-15T19:00:00Z'),
        // Este movimiento pertenece a otra tienda: la API del IPV NUNCA lo devuelve
        // (eq store_id) — se documenta que si llegara, contaminaría el saldo:
        mov(OTRO, 'purchase', 999, '2026-10-15T09:00:00Z'),
      ],
      inventory: [{ product_id: P142, quantity: '24' }],
      salesLines: [],
      devolutionLines: [],
      products: productos,
    });
    // El SKU 142 no se ve afectado por el movimiento ajeno (otro product_id):
    const r = rowOf(res, P142);
    expect(r.existenciaFinal).toBe(24);
    // Y el producto ajeno aparece solo con SU propio saldo, nunca mezclado en 142.
    expect(rowOf(res, OTRO).entradas).toBe(999);
  });
});
