/**
 * CORRECCIÓN IPV — VENTAS USD SOLO CUANDO SE COBRÓ EN USD · MISIÓN 2026-11-11.
 *
 * Incidente real (ENERVIDA-VITALLCONS, IPV del 2026-11-10, SKU 88 "Cable Solar
 * Rojo 4mm"): la venta se cobró ÍNTEGRAMENTE en CUP (venta 0f984d6f…:
 * cash|CUP|29295, ítem cash_paid=29295 cash_currency='CUP') pero el IPV
 * mostraba 29.295,00 CUP **y** 31,50 USD — el equivalente del precio de
 * REFERENCIA en USD del catálogo (products.price=4.5, price_currency='USD')
 * calculado como price_at_sale × qty. Un precio de referencia NO es dinero
 * recibido.
 *
 * Regla corregida: la fuente de verdad de la moneda de cada importe es el
 * REGISTRO REAL de la venta y sus pagos (payment_transactions + desglose por
 * ítem + reconstrucción legada documentada — misma fuente única del Reporte
 * de Entrega, collection-currency.ts). La columna Ventas (CUP) NO cambia
 * (contable, tasa histórica de cada venta).
 *
 * ADENDUM ADNEGOCIO-REPORTING (2026-11-24): la regla se EXTIENDE a ambas
 * columnas — Ventas CUP = CUP efectivamente cobrado (perItem.cup de la misma
 * reconstrucción). El equivalente contable de un cobro en USD ya NO se presenta
 * como segunda venta en CUP (incidente SKU 117 "Inversor", 400 USD + su
 * conversión 382.000 CUP a tasa 955). Las expectativas de los escenarios con
 * cobro USD se actualizaron a la regla vigente; los casos de cobro CUP
 * conservan sus valores (cobrado == contable) y el fallback sin evidencia
 * (ventas históricas sin buckets de pago) mantiene la valoración contable.
 *
 * Escenarios de aceptación de la misión (§6):
 *   1. Venta íntegramente en CUP de un producto con precio de referencia USD en catálogo.
 *   2. Venta íntegramente en USD (Zelle y efectivo USD con componentes de pago).
 *   3. Venta con pagos combinados en CUP y USD.
 *   4. Venta de varios productos con diferentes monedas de cobro.
 *   5. Varias ventas del mismo producto cobradas en monedas distintas.
 *   6. Totales generales de ambas columnas y su correspondencia con los pagos reales.
 */
import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  totalsFromRows,
  type IpvComputeInput,
  type IpvMovementRow,
  type IpvSalesLineRow,
  type IpvSalePaymentRow,
} from '@/lib/ipv-ventas/compute';

const FROM = '2026-11-10T00:00:00.000Z';
const TO = '2026-11-10T23:59:59.999Z';
// SKU 88 real (Cable Solar Rojo 4mm, ENERVIDA-VITALLCONS) y dos productos de apoyo.
const P88 = '3c072e9a-1c0d-4adf-add5-b337485bc3e4';
const P22 = 'bac99491-f719-4547-8817-d488bec15579';
const P99 = '99999999-9999-4999-8999-999999999999';

const products: IpvComputeInput['products'] = [
  { id: P88, sku: '88', name: 'Cable Solar Rojo 4mm', unit_of_measure: 'un' },
  { id: P22, sku: '22', name: 'Conector MC4', unit_of_measure: 'un' },
  { id: P99, sku: '99', name: 'Producto CUP', unit_of_measure: 'un' },
];

function base(overrides: Partial<IpvComputeInput> = {}): IpvComputeInput {
  return {
    window: { fromISO: FROM, toISO: TO },
    movements: [],
    inventory: [],
    salesLines: [],
    devolutionLines: [],
    products,
    ...overrides,
  };
}

const mov = (product_id: string, movement_type: string, quantity_change: number, iso: string): IpvMovementRow => ({
  product_id, movement_type, quantity_change, movement_date: iso,
});

const rowOf = (r: ReturnType<typeof computeIpv>, pid: string) => r.rows.find((x) => x.productId === pid);

// ── Línea EXACTA (verificada read-only en producción) de la venta del incidente ──
const lineaEnervida: IpvSalesLineRow = {
  transaction_id: '0f984d6f-aeff-435e-9fc5-9d8e50257f3f',
  product_id: P88,
  quantity: '7.0000',
  price_at_sale: '4.50',        // precio NATIVO USD (referencia del catálogo)
  price_at_sale_cup: '4185.00', // canónico: 4.50 × 930 (tasa de la operación)
  price_currency: 'CUP',        // moneda de la VENTA (estampada por create_sale_v2)
  currency: 'USD',             // moneda del PRECIO del ítem (catálogo) — NO es el cobro
  exchange_rate: '930',
  sale_exchange_rate: '1.0000',
  cash_paid: '29295',           // ← cobro REAL por ítem: 29.295 CUP
  cash_currency: 'CUP',
  cash_amount: '29295.00',      // pool canónico de la venta
  sale_currency: 'CUP',
};

const pagoEnervida: IpvSalePaymentRow = {
  transaction_id: '0f984d6f-aeff-435e-9fc5-9d8e50257f3f',
  payment_method: 'cash',
  currency: 'CUP',
  amount: '29295.00',
  exchange_rate: '1.0',
};

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 1: venta íntegramente en CUP con precio de referencia USD', () => {
  it('SKU 88 (caso real ENERVIDA 2026-11-10): 29.295,00 CUP y 0,00 USD — sin los 31,50 USD ficticios', () => {
    const r = computeIpv(base({
      movements: [mov(P88, 'initial', 10, '2026-11-01T10:00:00Z'), mov(P88, 'sale', -7, '2026-11-10T18:19:32Z')],
      inventory: [{ product_id: P88, quantity: '3' }],
      salesLines: [lineaEnervida],
      salesPayments: [pagoEnervida],
    }));
    const row = rowOf(r, P88);
    expect(row).toBeTruthy();
    expect(row!.cantidadesVendidas).toBe(7);
    expect(row!.ventasImporteCup).toBe(29295); // 4185 × 7 — contable SIN CAMBIO
    expect(row!.ventasImporteUsd).toBe(0);     // COBRO 100 % CUP → columna USD vacía (formato «—» en pantalla)
    // Totales: el total de Ventas USD TAMBIÉN excluye los 31,50 USD ficticios
    expect(r.totals.ventasImporteCup).toBe(29295);
    expect(r.totals.ventasImporteUsd).toBe(0);
    // Coherencia pantalla/PDF/Excel: los totales visibles derivan de las MISMAS filas
    expect(totalsFromRows(r.rows)).toEqual(r.totals);
  });

  it('sin filas de pago en USD en el día → columna USD total en 0 aunque TODOS los precios sean USD-referencia', () => {
    const r = computeIpv(base({
      salesLines: [
        { ...lineaEnervida, transaction_id: 't1', cash_paid: '100', cash_currency: 'CUP', cash_amount: '100' },
        { ...lineaEnervida, product_id: P22, transaction_id: 't2', cash_paid: '50', cash_currency: 'CUP', cash_amount: '50' },
      ],
      salesPayments: [
        { transaction_id: 't1', payment_method: 'cash', currency: 'CUP', amount: '100', exchange_rate: '1' },
        { transaction_id: 't2', payment_method: 'cash', currency: 'CUP', amount: '50', exchange_rate: '1' },
      ],
    }));
    expect(r.totals.ventasImporteUsd).toBe(0); // 0 filas de pago USD → 0 ingreso USD
  });
});

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 2: venta íntegramente en USD', () => {
  it('Zelle USD: 7 USD cobrados a tasa 800 → USD 7 y SIN duplicado en CUP', () => {
    const line: IpvSalesLineRow = {
      transaction_id: 'tx-zelle-usd', product_id: P22, quantity: '1',
      price_at_sale: '7.00', price_at_sale_cup: '5600.00',
      price_currency: 'USD', currency: 'USD', exchange_rate: '800', sale_exchange_rate: '800',
      zelle_amount: '5600.00', sale_currency: 'USD',
    };
    const payments: IpvSalePaymentRow[] = [
      { transaction_id: 'tx-zelle-usd', payment_method: 'zelle', currency: 'USD', amount: '7', exchange_rate: '800' },
    ];
    const r = computeIpv(base({ salesLines: [line], salesPayments: payments }));
    const row = rowOf(r, P22);
    expect(row!.ventasImporteCup).toBe(0);     // ADNEGOCIO 2026-11-24: cobro 100 % USD → SIN equivalente CUP (—)
    expect(row!.ventasImporteUsd).toBe(7);     // USD nativos realmente recibidos
  });

  it('Efectivo USD con componentes (ledger autoritativo): 20 USD a tasa 930 → CUP 18.600 y USD 20', () => {
    const line: IpvSalesLineRow = {
      transaction_id: 'tx-cash-usd', product_id: P88, quantity: '2',
      price_at_sale: '10.00', price_at_sale_cup: '9300.00',
      price_currency: 'CUP', currency: 'USD', exchange_rate: '930', sale_exchange_rate: '930',
      cash_amount: '18600.00', sale_currency: 'CUP',
    };
    const payments: IpvSalePaymentRow[] = [
      { transaction_id: 'tx-cash-usd', payment_method: 'cash', currency: 'USD', amount: '20', exchange_rate: '930' },
    ];
    const r = computeIpv(base({ salesLines: [line], salesPayments: payments }));
    const row = rowOf(r, P88);
    expect(row!.ventasImporteCup).toBe(0);     // ADNEGOCIO 2026-11-24: cobro 100 % USD (18.600 es valoración, no cobro CUP)
    expect(row!.ventasImporteUsd).toBe(20);
  });
});

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 3: pagos combinados CUP + USD', () => {
  it('venta de 18.600 CUP cobrada 9.300 CUP (efectivo) + 10 USD (Zelle a 930): CUP 18.600, USD 10', () => {
    const line: IpvSalesLineRow = {
      transaction_id: 'tx-mixta', product_id: P88, quantity: '2',
      price_at_sale: '10.00', price_at_sale_cup: '9300.00',
      price_currency: 'CUP', currency: 'USD', exchange_rate: '930', sale_exchange_rate: '930',
      cash_paid: '9300', cash_currency: 'CUP',
      cash_amount: '9300.00', zelle_amount: '9300.00', sale_currency: 'CUP',
    };
    const payments: IpvSalePaymentRow[] = [
      { transaction_id: 'tx-mixta', payment_method: 'cash', currency: 'CUP', amount: '9300', exchange_rate: '1' },
      { transaction_id: 'tx-mixta', payment_method: 'zelle', currency: 'USD', amount: '10', exchange_rate: '930' },
    ];
    const r = computeIpv(base({ salesLines: [line], salesPayments: payments }));
    const row = rowOf(r, P88);
    // Cada columna refleja ÚNICAMENTE su moneda real: 9.300 CUP cobrados + 10 USD cobrados.
    expect(row!.ventasImporteCup).toBe(9300); // CUP realmente recibido (el equivalente del zelle NO se duplica)
    expect(row!.ventasImporteUsd).toBe(10);    // solo el USD realmente recibido
  });
});

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 4: varios productos, monedas de cobro distintas', () => {
  it('venta mixta (cash CUP a producto CUP + cash USD con componentes): filas explícitas respetadas; el USD del ledger va al producto sin fila (CP-FIX 2026-11-20)', () => {
    // P99 (CUP): 2 × 500 = 1.000 CUP de línea. P88 (USD-ref): 7 × 4.185 = 29.295 CUP de línea.
    // Cobro con componentes: cash|CUP|1000 + cash|USD|31.5@930 → Σ amount_cup = 30.295 = total.
    const lines: IpvSalesLineRow[] = [
      {
        transaction_id: 'tx-multi', product_id: P99, quantity: '2',
        price_at_sale: '500', price_at_sale_cup: '500',
        price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '930',
        cash_paid: '1000', cash_currency: 'CUP',
      },
      {
        transaction_id: 'tx-multi', product_id: P88, quantity: '7',
        price_at_sale: '4.50', price_at_sale_cup: '4185.00',
        price_currency: 'CUP', currency: 'USD', exchange_rate: '930', sale_exchange_rate: '930',
      },
    ];
    const payments: IpvSalePaymentRow[] = [
      { transaction_id: 'tx-multi', payment_method: 'cash', currency: 'CUP', amount: '1000', exchange_rate: '1' },
      { transaction_id: 'tx-multi', payment_method: 'cash', currency: 'USD', amount: '31.5', exchange_rate: '930' },
    ];
    const r = computeIpv(base({ salesLines: lines, salesPayments: payments }));
    const p99 = rowOf(r, P99);
    const p88 = rowOf(r, P88);
    // ADNEGOCIO 2026-11-24: P88 solo recibió USD 31.5 (ledger) — sin fila CUP,
    // su columna CUP es el cobro real (0), no la valoración 29.295.
    expect(p99!.ventasImporteCup).toBe(1000);
    expect(p88!.ventasImporteCup).toBe(0);
    // CP-FIX 2026-11-20 (Nivel 1 — atribución por artículo): la fila explícita
    // de P99 (cash_paid 1.000 CUP) cubre EXACTO el bucket cash|CUP del ledger,
    // y el residual del bucket cash|USD (31.5, sin fila explícita de nadie) se
    // prorratea SOLO entre los ítems sin fila de cash → P88 único → 31.5 USD.
    // P99 (producto CUP pagado en CUP) ya NO recibe USD artificiales (antes
    // 31.5 × 1000/30295 ≈ 1,04 USD por prorrateo proporcional de la venta).
    expect(p88!.ventasImporteUsd).toBeCloseTo(31.5, 2);
    expect(p99!.ventasImporteUsd).toBeCloseTo(0, 2);
    // La SUMA de lo atribuido coincide con el USD realmente cobrado (±redondeo).
    expect(p88!.ventasImporteUsd + p99!.ventasImporteUsd).toBeCloseTo(31.5, 2);
    expect(r.totals.ventasImporteUsd).toBeCloseTo(31.5, 2);
  });

  it('ventas separadas por producto con monedas de cobro distintas: cada producto en su moneda exacta', () => {
    const lines: IpvSalesLineRow[] = [
      {
        transaction_id: 'tx-cup-only', product_id: P99, quantity: '2',
        price_at_sale: '500', price_at_sale_cup: '500',
        price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '1',
        cash_paid: '1000', cash_currency: 'CUP', cash_amount: '1000', sale_currency: 'CUP',
      },
      {
        transaction_id: 'tx-usd-only', product_id: P22, quantity: '1',
        price_at_sale: '7.00', price_at_sale_cup: '5600.00',
        price_currency: 'USD', currency: 'USD', exchange_rate: '800', sale_exchange_rate: '800',
        zelle_amount: '5600.00', sale_currency: 'USD',
      },
    ];
    const payments: IpvSalePaymentRow[] = [
      { transaction_id: 'tx-cup-only', payment_method: 'cash', currency: 'CUP', amount: '1000', exchange_rate: '1' },
      { transaction_id: 'tx-usd-only', payment_method: 'zelle', currency: 'USD', amount: '7', exchange_rate: '800' },
    ];
    const r = computeIpv(base({ salesLines: lines, salesPayments: payments }));
    expect(rowOf(r, P99)!.ventasImporteUsd).toBe(0);
    expect(rowOf(r, P99)!.ventasImporteCup).toBe(1000);
    expect(rowOf(r, P22)!.ventasImporteUsd).toBe(7);
    expect(rowOf(r, P22)!.ventasImporteCup).toBe(0); // cobro 100 % USD → sin duplicado CUP
  });
});

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 5: mismo producto cobrado en monedas distintas', () => {
  it('SKU 88 vendido dos veces: 1ª cobrada en CUP (0 USD), 2ª en USD por Zelle (31,5 USD) → USD solo de la 2ª', () => {
    const lines: IpvSalesLineRow[] = [
      lineaEnervida, // venta CUP 100 % (incidente real)
      {
        transaction_id: 'tx-zelle-88', product_id: P88, quantity: '7',
        price_at_sale: '4.50', price_at_sale_cup: '4185.00',
        price_currency: 'USD', currency: 'USD', exchange_rate: '930', sale_exchange_rate: '930',
        zelle_amount: '29295.00', sale_currency: 'USD',
      },
    ];
    const payments: IpvSalePaymentRow[] = [
      pagoEnervida,
      { transaction_id: 'tx-zelle-88', payment_method: 'zelle', currency: 'USD', amount: '31.5', exchange_rate: '930' },
    ];
    const r = computeIpv(base({
      movements: [
        mov(P88, 'initial', 20, '2026-11-01T10:00:00Z'),
        mov(P88, 'sale', -7, '2026-11-10T18:19:32Z'),
        mov(P88, 'sale', -7, '2026-11-10T20:00:00Z'),
      ],
      salesLines: lines,
      salesPayments: payments,
    }));
    const row = rowOf(r, P88);
    expect(row!.cantidadesVendidas).toBe(14);            // inventario: ambas ventas
    expect(row!.ventasImporteCup).toBe(29295);           // SOLO la venta cobrada en CUP (la USD va a su moneda)
    expect(row!.ventasImporteUsd).toBe(31.5);             // SOLO la venta cobrada en USD
  });
});

describe('CORRECCIÓN IPV 2026-11-11 — Escenario 6: totales y correspondencia con los pagos reales', () => {
  it('Σ Ventas USD == Σ importes USD de las filas de pago del período; Σ Ventas CUP == CUP realmente cobrado', () => {
    // 3 ventas: CUP pura (29.295 CUP) + Zelle USD (7 USD) + mixta (9.300 CUP + 10 USD).
    const lines: IpvSalesLineRow[] = [
      lineaEnervida,
      {
        transaction_id: 'tx-z', product_id: P22, quantity: '1',
        price_at_sale: '7.00', price_at_sale_cup: '5600.00',
        price_currency: 'USD', currency: 'USD', exchange_rate: '800', sale_exchange_rate: '800',
        zelle_amount: '5600.00', sale_currency: 'USD',
      },
      {
        transaction_id: 'tx-m', product_id: P99, quantity: '2',
        price_at_sale: '9300.00', price_at_sale_cup: '9300.00',
        price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '930',
        cash_paid: '9300', cash_currency: 'CUP',
        cash_amount: '9300.00', zelle_amount: '9300.00', sale_currency: 'CUP',
      },
    ];
    const payments: IpvSalePaymentRow[] = [
      pagoEnervida,
      { transaction_id: 'tx-z', payment_method: 'zelle', currency: 'USD', amount: '7', exchange_rate: '800' },
      { transaction_id: 'tx-m', payment_method: 'cash', currency: 'CUP', amount: '9300', exchange_rate: '1' },
      { transaction_id: 'tx-m', payment_method: 'zelle', currency: 'USD', amount: '10', exchange_rate: '930' },
    ];
    const r = computeIpv(base({ salesLines: lines, salesPayments: payments }));

    // Σ USD realmente cobrados en el período según el registro de pagos:
    const usdReal = payments.filter((p) => p.currency === 'USD').reduce((s, p) => s + Number(p.amount), 0);
    expect(usdReal).toBe(17); // 7 + 10
    expect(r.totals.ventasImporteUsd).toBeCloseTo(usdReal, 6); // correspondencia exacta

    // CUP realmente cobrado: 29.295 (venta CUP) + 0 (venta USD) + 9.300 (mixta) = 38.595
    expect(r.totals.ventasImporteCup).toBe(38595);

    // El total USD visible (pantalla/PDF/Excel) es EXACTAMENTE el mismo objeto de totales.
    expect(totalsFromRows(r.rows).ventasImporteUsd).toBeCloseTo(usdReal, 6);
    expect(totalsFromRows(r.rows).ventasImporteCup).toBe(38595);
  });

  it('regresión de la causa raíz: sin payment_transactions la reconstrucción usa el desglose por ítem (no el precio del catálogo)', () => {
    // La misma venta del incidente SIN ledger de pagos: el desglose por ítem
    // (cash_paid=29.295 CUP) sigue siendo la verdad → USD 0.
    const r = computeIpv(base({ salesLines: [lineaEnervida] }));
    const row = rowOf(r, P88);
    expect(row!.ventasImporteCup).toBe(29295);
    expect(row!.ventasImporteUsd).toBe(0);
  });
});
