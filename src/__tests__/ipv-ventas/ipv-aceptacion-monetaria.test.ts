/**
 * PRUEBAS DE ACEPTACIÓN OBLIGATORIAS — imputación monetaria del IPV
 * (misión 2026-11-24, fase 6). Cada prueba reproduce un escenario del cuadro
 * de aceptación sobre computeIpv() REAL (el mismo camino que producción).
 *
 * El escenario «varias ventas del mismo producto en diferentes monedas»
 * replica el CASO REAL de ENERVIDA-VITALLCONS auditado en
 * docs/audits/AUDITORIA_IPV_IMPUTACION_MONETARIA_2026-11-24.md: los SKU 87/88
 * (Cable Solar Negro/Rojo 4mm) muestran CUP y USD SIMULTÁNEAMENTE porque hay
 * ventas legítimas en ambas monedas — la venta USD de los 67,50 (tx e2614f36,
 * 07/11/2026, 15 m + 15 m a 4,50 USD/m tasa 930, ledger cash|USD|135,00) NO
 * aporta CUP, y los importes CUP (20.250 + 8.100 y 29.295 + 20.250 + 8.100)
 * provienen de ventas cobradas en efectivo CUP. Coexistencia ≠ duplicación.
 *
 * Regla contable verificada: cada cobro se cuenta UNA sola vez y en SU moneda;
 * el equivalente contable de un cobro USD jamás entra como venta CUP.
 */
import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  totalsFromRows,
  type IpvComputeInput,
  type IpvMovementRow,
  type IpvSalesLineRow,
  type IpvSalePaymentRow,
  type IpvDevolutionMoneyRow,
} from '@/lib/ipv-ventas/compute';

const FROM = '2026-11-01T05:00:00.000Z'; // 01/11/2026 00:00 La Habana
const TO = '2026-11-30T04:59:59.999Z';   // 30/11/2026 23:59 La Habana

const NEGRO = '11111111-1111-4111-8111-111111111111'; // SKU 87 Cable Solar Negro 4mm
const ROJO = '22222222-2222-4222-8222-222222222222';  // SKU 88 Cable Solar Rojo 4mm
const OTRO = '33333333-3333-4333-8333-333333333333';

const products: IpvComputeInput['products'] = [
  { id: NEGRO, sku: '87', name: 'Cable Solar Negro 4mm', unit_of_measure: 'metro' },
  { id: ROJO, sku: '88', name: 'Cable Solar Rojo 4mm', unit_of_measure: 'metro' },
  { id: OTRO, sku: '117', name: 'Inversor', unit_of_measure: 'un' },
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

// ── Trazas EXACTAS del caso real (verificadas read-only en producción) ──

// 02/11 17:00 tx 262d68f7: 5 m Negro + 5 m Rojo @4,50 tasa 900 — efectivo CUP
// 40.500,00 (20.250 por cable). Filas de pago por ítem: cash_paid 20.250 CUP.
const linea2NovNegro: IpvSalesLineRow = {
  transaction_id: '262d68f7-0000-4000-8000-000000000001',
  product_id: NEGRO, quantity: '5', price_at_sale: '4.50', price_at_sale_cup: '4050',
  price_currency: 'CUP', currency: 'CUP', exchange_rate: '900',
  cash_paid: '20250', cash_currency: 'CUP', transfer_paid: '0', transfer_currency: 'CUP',
  zelle_paid: '0', zelle_currency: 'USD',
  cash_amount: '40500.0000', transfer_amount: '0', zelle_amount: '0',
  sale_currency: 'CUP', sale_exchange_rate: '1.0000',
};
const linea2NovRojo: IpvSalesLineRow = { ...linea2NovNegro, product_id: ROJO };

// 07/11 18:29 tx e2614f36: 15 m Negro + 15 m Rojo @4,50 USD/m tasa 930 —
// cobrado EXCLUSIVAMENTE en efectivo USD 135,00 (67,50 por ítem).
// Ledger: UNA fila cash|USD|135,00@930. Pools canónicos: cash_amount 125.550 CUP.
const linea7NovNegro: IpvSalesLineRow = {
  transaction_id: 'e2614f36-0000-4000-8000-000000000002',
  product_id: NEGRO, quantity: '15', price_at_sale: '4.50', price_at_sale_cup: '4185',
  price_currency: 'CUP', currency: 'USD', exchange_rate: '930',
  cash_paid: '67.5', cash_currency: 'USD', transfer_paid: '0', transfer_currency: 'CUP',
  zelle_paid: '0', zelle_currency: 'USD',
  cash_amount: '125550.0000', transfer_amount: '0', zelle_amount: '0',
  sale_currency: 'USD', sale_exchange_rate: '930.0000',
};
const linea7NovRojo: IpvSalesLineRow = { ...linea7NovNegro, product_id: ROJO };
const pagos7Nov: IpvSalePaymentRow[] = [
  { transaction_id: linea7NovNegro.transaction_id as string, payment_method: 'cash', currency: 'USD', amount: '135', exchange_rate: '930' },
];

// 10/11 18:19 tx 0f984d6f: 7 m Rojo — efectivo CUP 29.295,00 (venta de un solo producto).
const linea10NovRojo: IpvSalesLineRow = {
  transaction_id: '0f984d6f-0000-4000-8000-000000000003',
  product_id: ROJO, quantity: '7', price_at_sale: '4.50', price_at_sale_cup: '4185',
  price_currency: 'CUP', currency: 'CUP', exchange_rate: '930',
  cash_paid: '29295', cash_currency: 'CUP', transfer_paid: '0', transfer_currency: 'CUP',
  zelle_paid: '0', zelle_currency: 'USD',
  cash_amount: '29295.0000', transfer_amount: '0', zelle_amount: '0',
  sale_currency: 'CUP', sale_exchange_rate: '1.0000',
};

// 17/11 19:46 tx abab9e20: 2 m Negro + 2 m Rojo @4,50 tasa 900 — efectivo CUP 16.200,00.
const linea17NovNegro: IpvSalesLineRow = {
  ...linea2NovNegro,
  transaction_id: 'abab9e20-0000-4000-8000-000000000004',
  quantity: '2', cash_paid: '8100', cash_amount: '16200.0000',
};
const linea17NovRojo: IpvSalesLineRow = { ...linea17NovNegro, product_id: ROJO };

describe('FASE 6 · venta cobrada exclusivamente en USD → SOLO columna USD', () => {
  it('los USD 67,50 de cada cable (tx e2614f36) no aportan CUP: el equivalente contable (62.775) no es venta CUP', () => {
    const r = computeIpv(base({
      movements: [
        mov(NEGRO, 'sale', -15, '2026-11-07T23:29:00Z'),
        mov(ROJO, 'sale', -15, '2026-11-07T23:29:00Z'),
      ],
      salesLines: [linea7NovNegro, linea7NovRojo],
      salesPayments: pagos7Nov,
    }));
    expect(rowOf(r, NEGRO)).toMatchObject({ ventasImporteUsd: 67.5, ventasImporteCup: 0 });
    expect(rowOf(r, ROJO)).toMatchObject({ ventasImporteUsd: 67.5, ventasImporteCup: 0 });
    expect(r.totals.ventasImporteCup).toBe(0);
    expect(r.totals.ventasImporteUsd).toBe(135);
  });
});

describe('FASE 6 · venta cobrada exclusivamente en CUP → SOLO columna CUP', () => {
  it('los 29.295 CUP del Rojo (tx 0f984d6f) no generan USD aunque el precio nativo sea 4,50 × 930', () => {
    const r = computeIpv(base({
      movements: [mov(ROJO, 'sale', -7, '2026-11-10T23:19:00Z')],
      salesLines: [linea10NovRojo],
      salesPayments: [
        { transaction_id: linea10NovRojo.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '29295', exchange_rate: '1' },
      ],
    }));
    expect(rowOf(r, ROJO)).toMatchObject({ ventasImporteCup: 29295, ventasImporteUsd: 0 });
  });
});

describe('FASE 6 · venta con cobro MIXTO → cada importe en SU moneda', () => {
  it('escoba (CUP transferencia) + lejía (CUP efectivo) + barilla (USD efectivo): reparto por ítem sin duplicar', () => {
    // Patrón real tx 025f7b6b (19/11): buckets cash/USD/40 + transfer/CUP/1800 + cash/CUP/800.
    const items: IpvSalesLineRow[] = [
      { transaction_id: 'tx-mixta', product_id: OTRO, quantity: '1', price_at_sale: '40', price_at_sale_cup: '37200', price_currency: 'CUP', currency: 'USD', exchange_rate: '930', cash_paid: '40', cash_currency: 'USD', cash_amount: '40000.0000', sale_currency: 'USD', sale_exchange_rate: '930.0000' },
      { transaction_id: 'tx-mixta', product_id: NEGRO, quantity: '1', price_at_sale: '1800', price_at_sale_cup: '1800', price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', transfer_paid: '1800', transfer_currency: 'CUP', cash_amount: '40000.0000', transfer_amount: '1800.0000', sale_currency: 'CUP', sale_exchange_rate: '1.0000' },
      { transaction_id: 'tx-mixta', product_id: ROJO, quantity: '1', price_at_sale: '800', price_at_sale_cup: '800', price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', cash_paid: '800', cash_currency: 'CUP', cash_amount: '40000.0000', transfer_amount: '1800.0000', sale_currency: 'CUP', sale_exchange_rate: '1.0000' },
    ];
    const r = computeIpv(base({
      salesLines: items,
      salesPayments: [
        { transaction_id: 'tx-mixta', payment_method: 'cash', currency: 'USD', amount: '40', exchange_rate: '930' },
        { transaction_id: 'tx-mixta', payment_method: 'transfer', currency: 'CUP', amount: '1800', exchange_rate: '1' },
        { transaction_id: 'tx-mixta', payment_method: 'cash', currency: 'CUP', amount: '800', exchange_rate: '1' },
      ],
    }));
    expect(rowOf(r, OTRO)).toMatchObject({ ventasImporteUsd: 40, ventasImporteCup: 0 });
    expect(rowOf(r, NEGRO)).toMatchObject({ ventasImporteCup: 1800, ventasImporteUsd: 0 });
    expect(rowOf(r, ROJO)).toMatchObject({ ventasImporteCup: 800, ventasImporteUsd: 0 });
    // Totales por moneda: independientes; el lado USD (equivalente 37.200 CUP) no entra en CUP.
    expect(r.totals.ventasImporteUsd).toBe(40);
    expect(r.totals.ventasImporteCup).toBe(2600);
  });
});

describe('FASE 6 · varias ventas del mismo producto en diferentes monedas → se agregan SIN duplicación (caso real SKU 87/88)', () => {
  it('reproduce el IPV observado: Negro CUP 28.350 + USD 67,50 · Rojo CUP 57.645 + USD 67,50 — coexistencia legítima', () => {
    const r = computeIpv(base({
      movements: [
        mov(NEGRO, 'sale', -22, '2026-11-17T23:46:00Z'),
        mov(ROJO, 'sale', -29, '2026-11-17T23:46:00Z'),
      ],
      salesLines: [
        linea2NovNegro, linea2NovRojo,
        linea7NovNegro, linea7NovRojo,
        linea10NovRojo,
        linea17NovNegro, linea17NovRojo,
      ],
      salesPayments: [
        ...pagos7Nov,
        { transaction_id: linea2NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '40500', exchange_rate: '1' },
        { transaction_id: linea10NovRojo.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '29295', exchange_rate: '1' },
        { transaction_id: linea17NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '16200', exchange_rate: '1' },
      ],
    }));
    // EXACTAMENTE lo observado por el propietario — y auditado como CORRECTO:
    expect(rowOf(r, NEGRO)).toMatchObject({ ventasImporteCup: 28350, ventasImporteUsd: 67.5 });
    expect(rowOf(r, ROJO)).toMatchObject({ ventasImporteCup: 57645, ventasImporteUsd: 67.5 });
    // La venta USD aporta CUP = 0: cada cobro está en UNA sola columna.
    expect(r.totals.ventasImporteCup).toBe(28350 + 57645);
    expect(r.totals.ventasImporteUsd).toBe(135);
  });
});

describe('FASE 6 · venta con TRANSFERENCIA → se respeta la moneda REAL del cobro', () => {
  it('transferencia USD cuenta como USD (no como CUP por el método); transferencia CUP como CUP', () => {
    const lines: IpvSalesLineRow[] = [
      { transaction_id: 'tx-trf-usd', product_id: OTRO, quantity: '1', price_at_sale: '50', price_at_sale_cup: '46500', price_currency: 'CUP', currency: 'USD', exchange_rate: '930', transfer_paid: '50', transfer_currency: 'USD', transfer_amount: '46500.0000', sale_currency: 'USD', sale_exchange_rate: '930.0000' },
      { transaction_id: 'tx-trf-cup', product_id: NEGRO, quantity: '1', price_at_sale: '1000', price_at_sale_cup: '1000', price_currency: 'CUP', currency: 'CUP', exchange_rate: '1', transfer_paid: '1000', transfer_currency: 'CUP', transfer_amount: '1000.0000', sale_currency: 'CUP', sale_exchange_rate: '1.0000' },
    ];
    const r = computeIpv(base({
      salesLines: lines,
      salesPayments: [
        { transaction_id: 'tx-trf-usd', payment_method: 'transfer', currency: 'USD', amount: '50', exchange_rate: '930' },
        { transaction_id: 'tx-trf-cup', payment_method: 'transfer', currency: 'CUP', amount: '1000', exchange_rate: '1' },
      ],
    }));
    expect(rowOf(r, OTRO)).toMatchObject({ ventasImporteUsd: 50, ventasImporteCup: 0 });
    expect(rowOf(r, NEGRO)).toMatchObject({ ventasImporteCup: 1000, ventasImporteUsd: 0 });
  });
});

describe('FASE 6 · devolución / reverso → tratamiento por la moneda REAL del reembolso', () => {
  it('reembolso USD resta SOLO de Ventas USD y jamás se convierte para restar de CUP', () => {
    const devMoney: IpvDevolutionMoneyRow[] = [
      { ref_id: 'dev-1', transaction_id: 'e2614f36-0000-4000-8000-000000000002', direction: 'refund', currency: 'USD', amount: '67.5', amount_cup: '62775' },
    ];
    const r = computeIpv(base({
      movements: [
        mov(NEGRO, 'sale', -15, '2026-11-07T23:29:00Z'),
        mov(NEGRO, 'return', 15, '2026-11-20T15:00:00Z'),
      ],
      salesLines: [linea7NovNegro, linea7NovRojo],
      salesPayments: pagos7Nov,
      devolutionLines: [{ product_id: NEGRO, quantity: '15', unit_price: '4185', devolution_id: 'dev-1' }],
      devolutionMoney: devMoney,
    }));
    // CUP de Rojo intacto; USD de Negro neto 0; CUP de Negro sigue 0 (nunca se convierte).
    expect(rowOf(r, NEGRO)).toMatchObject({ ventasImporteUsd: 0, ventasImporteCup: 0 });
    expect(rowOf(r, ROJO)).toMatchObject({ ventasImporteUsd: 67.5, ventasImporteCup: 0 });
  });
});

describe('FASE 6 · período con operaciones de distintas monedas → totales por moneda INDEPENDIENTES', () => {
  it('el total CUP no incluye equivalentes de USD y viceversa; totalsFromRows (pantalla/PDF/Excel) coincide', () => {
    const r = computeIpv(base({
      salesLines: [
        linea2NovNegro, linea2NovRojo, linea7NovNegro, linea7NovRojo, linea10NovRojo, linea17NovNegro, linea17NovRojo,
      ],
      salesPayments: [
        ...pagos7Nov,
        { transaction_id: linea2NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '40500', exchange_rate: '1' },
        { transaction_id: linea10NovRojo.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '29295', exchange_rate: '1' },
        { transaction_id: linea17NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '16200', exchange_rate: '1' },
      ],
    }));
    const t = totalsFromRows(r.rows);
    expect(t.ventasImporteCup).toBe(r.totals.ventasImporteCup);
    expect(t.ventasImporteUsd).toBe(r.totals.ventasImporteUsd);
    expect(t.ventasImporteCup).toBe(85995); // 936.085 del período real MENOS ventas de otros productos: aquí solo cables
    expect(t.ventasImporteUsd).toBe(135);
  });

  it('conciliación con el ledger de cobros: bruto por moneda = suma de filas del ledger del período', () => {
    // Ledger del período: 40.500 + 29.295 + 16.200 CUP y 135 USD — cada fila una vez.
    const r = computeIpv(base({
      salesLines: [
        linea2NovNegro, linea2NovRojo, linea7NovNegro, linea7NovRojo, linea10NovRojo, linea17NovNegro, linea17NovRojo,
      ],
      salesPayments: [
        ...pagos7Nov,
        { transaction_id: linea2NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '40500', exchange_rate: '1' },
        { transaction_id: linea10NovRojo.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '29295', exchange_rate: '1' },
        { transaction_id: linea17NovNegro.transaction_id as string, payment_method: 'cash', currency: 'CUP', amount: '16200', exchange_rate: '1' },
      ],
    }));
    expect(r.totals.ventasImporteCup).toBe(40500 + 29295 + 16200); // 85.995 CUP cobrados: 40.500 (tx 02-11, ambos cables) + 29.295 (tx 10-11) + 16.200 (tx 17-11, ambos cables)
    expect(r.totals.ventasImporteUsd).toBe(135);
  });
});

describe('FASE 6 · valoración sin evidencia de cobro → incidencia, NO columna, NO dinero cobrado', () => {
  it('una venta sin pools/ítems/ledger mantiene la fila, señala SALE_WITHOUT_PAYMENT_EVIDENCE y no suma a CUP/USD', () => {
    const r = computeIpv(base({
      salesLines: [{
        transaction_id: 't-legado', product_id: OTRO, quantity: '2',
        price_at_sale: '500', price_at_sale_cup: '500', price_currency: 'CUP',
        currency: 'CUP', exchange_rate: '1', sale_currency: 'CUP', sale_exchange_rate: '1',
      }],
    }));
    const row = rowOf(r, OTRO)!;
    expect(row).toBeTruthy();                          // la fila SE mantiene (no se oculta ingreso)
    expect(row.ventasImporteCup).toBe(0);              // no se presenta como cobrado
    expect(row.ventasImporteUsd).toBe(0);
    expect(r.totals.ventasImporteCup).toBe(0);
    expect(r.totals.ventasImporteUsd).toBe(0);
    expect(r.incidences.some((i) => i.type === 'SALE_WITHOUT_PAYMENT_EVIDENCE')).toBe(true);
    expect(r.incidences.find((i) => i.type === 'SALE_WITHOUT_PAYMENT_EVIDENCE')?.detail).toContain('1000,00');
  });
});
