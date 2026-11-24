/**
 * ADNEGOCIO-REPORTING (2026-11-24) — IPV: monedas REALES cobradas y conciliación
 * con el Reporte de Entrega.
 *
 * Incidente real (ENERVIDA-VITALLCONS, 2026-11-21, SKU 117 "Inversor"):
 * venta cobrada 100 % en USD (transacción fbdaf826-…, ledger cash|USD|400@955,
 * ítem cash_paid=400 cash_currency='USD', tasa 955 de la operación) mostraba
 * 400,00 USD **y** 382.000,00 CUP — la conversión contable (400 × 955) entraba
 * como una SEGUNDA venta en la columna CUP. Total CUP inflado: 466.750 en vez
 * de 84.750. El Reporte de Entrega reconoce SOLO los 400 USD.
 *
 * Regla (§2/§3 del encargo): AMBAS columnas del IPV = dinero REALMENTE COBRADO,
 * de la misma reconstrucción única del Reporte de Entrega
 * (collection-currency.ts · reconstructTxCollections):
 *   · Ventas CUP = CUP recibido (por método documental).
 *   · Ventas USD = USD recibidos.
 * Una misma operación NUNCA incrementa dos totales comerciales; el equivalente
 * contable de un cobro en USD permanece en los asientos (fin_entries), no en el
 * IPV. Totales independientes por moneda — jamás se suman CUP+USD.
 *
 * Escenarios obligatorios §8 (1–12) + período §5 + conciliación §4/§6.
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
import { ipvEndDateOnStartChange } from '@/lib/ipv-ventas/period';

const FROM = '2026-11-21T00:00:00.000Z';
const TO = '2026-11-21T23:59:59.999Z';

const P117 = '680c132e-b328-4390-926e-18b1368f6444'; // Inversor (SKU 117, traza real)
const P_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const P_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const P_C = 'cccccccc-3333-4333-8333-333333333333';

const products: IpvComputeInput['products'] = [
  { id: P117, sku: '117', name: 'Inversor', unit_of_measure: 'un' },
  { id: P_A, sku: '21', name: 'Producto A (CUP)', unit_of_measure: 'un' },
  { id: P_B, sku: '34', name: 'Producto B (USD)', unit_of_measure: 'un' },
  { id: P_C, sku: '55', name: 'Producto C', unit_of_measure: 'un' },
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

// ── Traza EXACTA del Inversor (verificada read-only en producción 2026-11-24) ──
// transaction fbdaf826-ffa5-4c62-8b5f-28bb0564c200 · 21/11/2026 19:17:18Z
// item d7edaff6-e623-4285-9c9c-0a70050ef98a · ledger cash|USD|400@955
const lineaInversor: IpvSalesLineRow = {
  transaction_id: 'fbdaf826-ffa5-4c62-8b5f-28bb0564c200',
  product_id: P117,
  quantity: '1.0000',
  price_at_sale: '400.00',        // precio nativo USD de la operación
  price_at_sale_cup: '382000.00', // valoración contable: 400 × tasa 955
  price_currency: 'CUP',
  currency: 'USD',                // moneda ORIGINAL de la línea
  exchange_rate: '955',           // tasa de la operación persistida (no se recalcula)
  cash_paid: '400',               // ← cobro REAL del ítem: 400 USD
  cash_currency: 'USD',
  cash_amount: '382000.0000',     // pool canónico de la venta (CUP)
  sale_currency: 'CUP',
  sale_exchange_rate: '1.0000',
};
const pagoInversor: IpvSalePaymentRow = {
  transaction_id: 'fbdaf826-ffa5-4c62-8b5f-28bb0564c200',
  payment_method: 'cash',
  currency: 'USD',
  amount: '400',
  exchange_rate: '955',
};

describe('ADNEGOCIO-REPORTING · §1 trazabilidad del Inversor (SKU 117, 21/11/2026)', () => {
  it('los 400 USD son el cobro real y los 382.000 CUP SOLO su conversión contable — sin duplicación', () => {
    const r = computeIpv(base({
      movements: [
        mov(P117, 'initial', 1, '2026-11-01T10:00:00Z'),
        mov(P117, 'sale', -1, '2026-11-21T19:17:18Z'),
      ],
      inventory: [{ product_id: P117, quantity: '0' }],
      salesLines: [lineaInversor],
      salesPayments: [pagoInversor],
    }));
    const row = rowOf(r, P117);
    expect(row).toBeTruthy();
    expect(row!.cantidadesVendidas).toBe(1);
    // La venta se cobró 100 % en USD → Ventas CUP = 0 (guion en pantalla) y los
    // 382.000 CUP (valoración contable) NO se presentan como segunda venta.
    expect(row!.ventasImporteUsd).toBe(400);
    expect(row!.ventasImporteCup).toBe(0);
  });

  it('§3 totales del caso: 84.750 CUP realmente cobrados + 400 USD — no 466.750 CUP', () => {
    // Reproducción completa del encargo: las demás ventas del día son CUP reales
    // (84.750) y el Inversor es la única venta USD.
    const lineasA: IpvSalesLineRow[] = [
      { ...lineaInversor },
      {
        transaction_id: 'tx-a1', product_id: P_A, quantity: '2',
        price_at_sale: '42375', price_at_sale_cup: '42375', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '1',
        cash_paid: '84750', cash_currency: 'CUP', cash_amount: '84750.00', sale_currency: 'CUP',
      },
    ];
    const r = computeIpv(base({
      salesLines: lineasA,
      salesPayments: [
        pagoInversor,
        { transaction_id: 'tx-a1', payment_method: 'cash', currency: 'CUP', amount: '84750', exchange_rate: '1' },
      ],
    }));
    expect(rowOf(r, P117)!.ventasImporteCup).toBe(0);
    expect(rowOf(r, P117)!.ventasImporteUsd).toBe(400);
    expect(rowOf(r, P_A)!.ventasImporteCup).toBe(84750);
    // Totales INDEPENDIENTES por moneda: CUP 84.750 (no 466.750) · USD 400.
    expect(r.totals.ventasImporteCup).toBe(84750);
    expect(r.totals.ventasImporteUsd).toBe(400);
    expect(totalsFromRows(r.rows)).toEqual(r.totals);
    // §3 prohibición: los totales por moneda nunca se combinan (columnas separadas).
    expect(r.totals.ventasImporteCup + r.totals.ventasImporteUsd).toBe(84750 + 400);
  });

  it('§4 conciliación con el Reporte de Entrega: misma fuente, misma clasificación (ledger autoritativo cash USD)', () => {
    // El ledger cash|USD|400@955 hace autoritativa la reconstrucción
    // (ledgerIsAuthoritative) — idéntico criterio del Reporte de Entrega.
    const r = computeIpv(base({ salesLines: [lineaInversor], salesPayments: [pagoInversor] }));
    expect(rowOf(r, P117)!.ventasImporteUsd).toBe(400); // lo que reconoce el Reporte
    expect(rowOf(r, P117)!.ventasImporteCup).toBe(0);   // sin cobro CUP documentado
  });
});

describe('ADNEGOCIO-REPORTING · §8 escenarios obligatorios de moneda', () => {
  it('1 · venta íntegramente en CUP: importe en CUP, USD vacío (—)', () => {
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-cup', product_id: P_A, quantity: '3',
        price_at_sale: '500', price_at_sale_cup: '500', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', cash_paid: '1500', cash_currency: 'CUP',
        cash_amount: '1500.00', sale_currency: 'CUP',
        sale_exchange_rate: '1',
      }],
      salesPayments: [{ transaction_id: 't-cup', payment_method: 'cash', currency: 'CUP', amount: '1500', exchange_rate: '1' }],
    }));
    expect(rowOf(r, P_A)!.ventasImporteCup).toBe(1500);
    expect(rowOf(r, P_A)!.ventasImporteUsd).toBe(0);
  });

  it('2 · venta íntegramente en USD (zelle): importe en USD, CUP vacío (—) — sin el equivalente en CUP', () => {
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-usd', product_id: P_B, quantity: '1',
        price_at_sale: '90', price_at_sale_cup: '81000', price_currency: 'USD',
        currency: 'USD', exchange_rate: '900', sale_exchange_rate: '900',
        zelle_amount: '81000.00', sale_currency: 'USD',
      }],
      salesPayments: [{ transaction_id: 't-usd', payment_method: 'zelle', currency: 'USD', amount: '90', exchange_rate: '900' }],
    }));
    expect(rowOf(r, P_B)!.ventasImporteUsd).toBe(90);
    expect(rowOf(r, P_B)!.ventasImporteCup).toBe(0); // antes mostraba 81.000 CUP duplicados
  });

  it('3 · venta en USD con valoración contable equivalente en CUP: solo 400 USD — nunca 400 + 382.000', () => {
    const r = computeIpv(base({ salesLines: [lineaInversor], salesPayments: [pagoInversor] }));
    expect(rowOf(r, P117)!.ventasImporteUsd).toBe(400);
    expect(rowOf(r, P117)!.ventasImporteCup).toBe(0);
  });

  it('4 · pagos parciales CUP + USD: cada columna su parte real de la MISMA venta', () => {
    // Venta de 20.000 CUP equivalentes: 8.000 CUP en efectivo + 12,63 USD zelle @950.
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-mix', product_id: P_C, quantity: '1',
        price_at_sale: '20000', price_at_sale_cup: '20000', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '950',
        cash_paid: '8000', cash_currency: 'CUP',
        cash_amount: '8000.00', zelle_amount: '12000.00', sale_currency: 'CUP',
      }],
      salesPayments: [
        { transaction_id: 't-mix', payment_method: 'cash', currency: 'CUP', amount: '8000', exchange_rate: '1' },
        { transaction_id: 't-mix', payment_method: 'zelle', currency: 'USD', amount: '12.63', exchange_rate: '950' },
      ],
    }));
    expect(rowOf(r, P_C)!.ventasImporteCup).toBe(8000);   // CUP realmente recibido
    expect(rowOf(r, P_C)!.ventasImporteUsd).toBeCloseTo(12.63, 2); // USD realmente recibido
    // La suma en CUP-canónico ≈ el total de la venta (conciliación), pero las
    // columnas NO se combinan ni duplican.
    expect(r.totals.ventasImporteCup).toBe(8000);
    expect(r.totals.ventasImporteUsd).toBeCloseTo(12.63, 2);
  });

  it('5 · venta denominada CUP cobrada mediante moneda distinta (riel USD zelle): se informa en la moneda COBRADA', () => {
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-den-cup', product_id: P_A, quantity: '1',
        price_at_sale: '10000', price_at_sale_cup: '10000', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', sale_exchange_rate: '910',
        zelle_amount: '10000.00', sale_currency: 'CUP',
      }],
      salesPayments: [{ transaction_id: 't-den-cup', payment_method: 'zelle', currency: 'USD', amount: '10.99', exchange_rate: '910' }],
    }));
    // El cobro real fue USD (riel zelle del Reporte de Entrega): CUP vacío.
    expect(rowOf(r, P_A)!.ventasImporteCup).toBe(0);
    expect(rowOf(r, P_A)!.ventasImporteUsd).toBeCloseTo(10.99, 2);
  });

  it('6 · varias ventas del mismo producto en monedas distintas: suma separada por moneda', () => {
    const r = computeIpv(base({
      movements: [
        mov(P_C, 'initial', 10, '2026-11-01T10:00:00Z'),
        mov(P_C, 'sale', -1, '2026-11-21T12:00:00Z'),
        mov(P_C, 'sale', -2, '2026-11-21T13:00:00Z'),
      ],
      salesLines: [
        { ...lineaInversor, transaction_id: 't1-inversor', product_id: P_C, quantity: '1', price_at_sale: '400.00', price_at_sale_cup: '382000.00', exchange_rate: '955' },
        {
          transaction_id: 't2-cup', product_id: P_C, quantity: '2',
          price_at_sale: '950', price_at_sale_cup: '950', price_currency: 'CUP',
          currency: 'CUP', exchange_rate: '1', cash_paid: '1900', cash_currency: 'CUP',
          cash_amount: '1900.00', sale_currency: 'CUP',
          sale_exchange_rate: '1',
        },
      ],
      salesPayments: [
        pagoInversor,
        { transaction_id: 't2-cup', payment_method: 'cash', currency: 'CUP', amount: '1900', exchange_rate: '1' },
      ],
    }));
    const row = rowOf(r, P_C)!;
    expect(row.cantidadesVendidas).toBe(3);
    expect(row.ventasImporteUsd).toBe(400);
    expect(row.ventasImporteCup).toBe(1900);
    expect(r.totals.ventasImporteUsd).toBe(400);
    expect(r.totals.ventasImporteCup).toBe(1900);
  });

  it('7 · devoluciones: se restan por producto sin alterar las columnas de moneda cobrada', () => {
    // Venta CUP 1.500 cobrada + devolución completada de 1 unidad (500 CUP).
    const r = computeIpv(base({
      movements: [
        mov(P_A, 'initial', 10, '2026-11-01T10:00:00Z'),
        mov(P_A, 'sale', -3, '2026-11-21T12:00:00Z'),
        mov(P_A, 'return', 1, '2026-11-21T16:00:00Z'),
      ],
      salesLines: [{
        transaction_id: 't-dev', product_id: P_A, quantity: '3',
        price_at_sale: '500', price_at_sale_cup: '500', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', cash_paid: '1500', cash_currency: 'CUP',
        cash_amount: '1500.00', sale_currency: 'CUP',
        sale_exchange_rate: '1',
      }],
      devolutionLines: [{ product_id: P_A, quantity: '1', unit_price: '500' }],
      salesPayments: [{ transaction_id: 't-dev', payment_method: 'cash', currency: 'CUP', amount: '1500', exchange_rate: '1' }],
    }));
    const row = rowOf(r, P_A)!;
    expect(row.cantidadesVendidas).toBe(3);
    expect(row.devoluciones).toBe(1);
    // Ecuación §6: Ei 10 − 3 + 1 = 8.
    expect(row.existenciaInicial).toBe(10);
    expect(row.existenciaFinal).toBe(8);
    // Dinero: 1.500 cobrado − 500 devuelto = 1.000 en la moneda de la operación.
    expect(row.ventasImporteCup).toBe(1000);
    expect(row.ventasImporteUsd).toBe(0);
  });

  it('8 · documentos anulados: solo ventas "completed" llegan al cálculo (fuente de la ruta)', () => {
    // La ruta consulta transaction_items con transactions.status='completed'
    // (eq en la query) — una venta anulada NUNCA alcanza computeIpv. Aquí se
    // fija el contrato: solo las líneas provistas por la fuente válida cuentan.
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-ok', product_id: P_A, quantity: '1',
        price_at_sale: '500', price_at_sale_cup: '500', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', cash_paid: '500', cash_currency: 'CUP',
        cash_amount: '500.00', sale_currency: 'CUP',
        sale_exchange_rate: '1',
      }],
      salesPayments: [{ transaction_id: 't-ok', payment_method: 'cash', currency: 'CUP', amount: '500', exchange_rate: '1' }],
    }));
    expect(rowOf(r, P_A)!.ventasImporteCup).toBe(500);
    expect(r.meta.salesLinesAnalyzed).toBe(1);
  });

  it('9+10 · §5 período: el día 21 no se contamina con el 23 y viceversa (ventanas separadas)', () => {
    const venta21 = { ...lineaInversor };
    const venta23: IpvSalesLineRow = {
      transaction_id: 'tx-23', product_id: P_A, quantity: '1',
      price_at_sale: '1000', price_at_sale_cup: '1000', price_currency: 'CUP',
      currency: 'CUP', exchange_rate: '1', cash_paid: '1000', cash_currency: 'CUP',
      cash_amount: '1000.00', sale_currency: 'CUP',
      sale_exchange_rate: '1',
    };
    // La ventana del período la aplica la RUTA (transactions.completed_at gte/lte
    // con la ventana de negocio America/Havana): para el informe del 21 la fuente
    // entrega SOLO las ventas del 21 — la del 23 no puede contaminarlo.
    const r21 = computeIpv(base({
      window: { fromISO: '2026-11-21T00:00:00.000Z', toISO: '2026-11-21T23:59:59.999Z' },
      salesLines: [venta21],
      salesPayments: [pagoInversor],
    }));
    expect(rowOf(r21, P117)!.ventasImporteUsd).toBe(400);
    expect(r21.totals.ventasImporteCup).toBe(0); // el 23 (CUP 1.000) NO contamina al 21

    const r23 = computeIpv(base({
      window: { fromISO: '2026-11-23T00:00:00.000Z', toISO: '2026-11-23T23:59:59.999Z' },
      salesLines: [venta23],
      salesPayments: [{ transaction_id: 'tx-23', payment_method: 'cash', currency: 'CUP', amount: '1000', exchange_rate: '1' }],
    }));
    expect(r23.totals.ventasImporteCup).toBe(1000);
    expect(r23.totals.ventasImporteUsd).toBe(0);
  });

  it('11 · producto con vales de salida sin ventas: aparece, VS > 0 y monedas vacías (—)', () => {
    const r = computeIpv(base({
      movements: [
        mov(P_A, 'initial', 10, '2026-11-01T10:00:00Z'),
        mov(P_A, 'issue_slip_out', -2, '2026-11-21T12:00:00Z'),
      ],
      salesLines: [],
    }));
    const row = rowOf(r, P_A)!;
    expect(row.valesSalidas).toBe(2);
    expect(row.cantidadesVendidas).toBe(0);
    expect(row.ventasImporteCup).toBe(0);
    expect(row.ventasImporteUsd).toBe(0);
    // §6 ecuación: Ei 10 − VS 2 = Ef 8.
    expect(row.existenciaInicial).toBe(10);
    expect(row.existenciaFinal).toBe(8);
  });

  it('12 · producto con movimientos de inventario y ventas cero: se conserva (no se elimina del informe)', () => {
    const r = computeIpv(base({
      movements: [
        mov(P_A, 'initial', 5, '2026-11-01T10:00:00Z'),
        mov(P_A, 'adjustment', 3, '2026-11-21T12:00:00Z'),
      ],
      inventory: [{ product_id: P_A, quantity: '8' }],
      salesLines: [],
    }));
    const row = rowOf(r, P_A)!;
    expect(row).toBeTruthy();
    expect(row.ajustes).toBe(3);
    expect(row.ventasImporteCup).toBe(0);
    expect(row.ventasImporteUsd).toBe(0);
    expect(row.existenciaFinal).toBe(8);
  });
});

describe('ADNEGOCIO-REPORTING · §5 selección del período (helper puro de la vista)', () => {
  it('selección de un día: la fecha final sigue a la inicial mientras no se toque explícitamente', () => {
    // Flujo del incidente: usuario en el día 23 cambia SOLO la fecha inicial a 21.
    expect(ipvEndDateOnStartChange('2026-11-21', '2026-11-23', false)).toBe('2026-11-21');
    expect(ipvEndDateOnStartChange('2026-11-21', '2026-11-21', false)).toBe('2026-11-21');
  });

  it('intervalo elegido explícitamente: se respeta EXACTAMENTE la fecha final elegida', () => {
    expect(ipvEndDateOnStartChange('2026-11-21', '2026-11-25', true)).toBe('2026-11-25');
  });

  it('cambio de inicio que dejaría el intervalo invertido: se sujeta al inicio (sin fechas inventadas)', () => {
    expect(ipvEndDateOnStartChange('2026-11-26', '2026-11-20', true)).toBe('2026-11-26');
  });

  it('sin fecha inicial: no se altera nada', () => {
    expect(ipvEndDateOnStartChange('', '2026-11-25', false)).toBe('2026-11-25');
  });
});

describe('ADNEGOCIO-REPORTING · fallback sin evidencia de pago (ventas históricas)', () => {
  it('venta sin pools, sin filas por ítem y sin ledger: valoración contable en CUP (no se oculta el ingreso)', () => {
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-legado', product_id: P_A, quantity: '2',
        price_at_sale: '500', price_at_sale_cup: '500', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', sale_currency: 'CUP',
        sale_exchange_rate: '1',
        // sin cash_paid, sin pools, sin payments → reconstrucción sin buckets
      }],
    }));
    expect(rowOf(r, P_A)!.ventasImporteCup).toBe(1000);
    expect(rowOf(r, P_A)!.ventasImporteUsd).toBe(0);
  });
});
