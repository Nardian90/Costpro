/**
 * MISIÓN VENTA MULTIMONEDA CON VUELTO EN CUP — 23/10/2026 (IPV).
 *
 * Caso EXACTO de la misión en la tienda aislada Enervida-E2E:
 *   · Venta 0caf222e del SKU 22 "Conector MC4": 1 × 7 USD (price_at_sale
 *     nativo 7, transaction_items.currency='USD', cash_currency='USD'),
 *     canónico price_at_sale_cup = 5.600 a la tasa 800 (store_exchange_rates,
 *     fuente server-side trazable en change_rate_source).
 *   · Recibido 10 USD físicos, vuelto 2.400 CUP físicos — la liquidación del
 *     cobro vive en `transactions` (cash_received_usd / change_given_cup /
 *     change_exchange_rate) y NO es ingreso por ventas.
 *
 * Contrato verificado del IPV:
 *   · ventasImporteCup = 5.600 (canónico, tasa de la operación) — el vuelto
 *     no es ingreso y el billete de 10 USD no infla el ingreso.
 *   · ventasImporteUsd = 7 — columna informativa de MONEDA DE ORIGEN, ahora
 *     clasificada por transaction_items.currency (create_sale_v2 estampa
 *     price_currency = moneda de la VENTA = 'CUP' sin zelle, lo que dejaba
 *     vacía la columna USD).
 *   · Fallback histórico: filas V1 sin currency conservan price_currency.
 */
import { describe, it, expect } from 'vitest';
import {
  computeIpv,
  type IpvMovementRow,
  type IpvInventoryRow,
  type IpvSalesLineRow,
  type IpvProductRow,
} from '@/lib/ipv-ventas/compute';

const P22 = 'bac99491-f719-4547-8817-d488bec15579'; // Conector MC4 (Enervida E2E)
const FROM = '2026-10-23T04:00:00.000Z';
const TO = '2026-10-24T03:59:59.999Z';

function mov(product_id: string, movement_type: string, quantity_change: number, movement_date: string): IpvMovementRow {
  return { product_id, movement_type, quantity_change: String(quantity_change), movement_date };
}

/** Línea EXACTA que create_sale_v2 persistió para la venta de la misión (verificada en BD). */
function lineaMision(overrides: Partial<IpvSalesLineRow> = {}): IpvSalesLineRow {
  return {
    product_id: P22,
    quantity: '1.0000',
    price_at_sale: '7.00',          // precio NATIVO cobrado (7 USD)
    price_at_sale_cup: '5600.00',   // canónico: 7 × 800 (tasa de la operación)
    price_currency: 'CUP',          // ← lo que el RPC estampa (p_sale_currency)
    currency: 'USD',                // ← moneda NATIVA del ítem (columna currency)
    exchange_rate: '800',
    sale_exchange_rate: '1.0000',
    ...overrides,
  };
}

const products: IpvProductRow[] = [{ id: P22, sku: '22', name: 'Conector MC4', unit_of_measure: 'unidad' }];
const inventory: IpvInventoryRow[] = [{ product_id: P22, quantity: '9' }];
const ledger: IpvMovementRow[] = [
  mov(P22, 'purchase', 10, '2026-10-23T20:18:00Z'), // siembra inicial E2E
  mov(P22, 'sale', -1, '2026-10-23T20:23:00Z'),     // venta de la misión
];

describe('IPV — MISIÓN MULTIMONEDA 23/10/2026 (SKU 22, 7 USD, vuelto 2.400 CUP)', () => {
  it('ingreso canónico 5.600 CUP; el vuelto y el billete NO son ingreso; importe de origen 7 USD', () => {
    const res = computeIpv({
      window: { fromISO: FROM, toISO: TO },
      movements: ledger,
      inventory,
      salesLines: [lineaMision()],
      devolutionLines: [],
      products,
    });

    const row = res.rows.find((r) => r.productId === P22);
    expect(row).toBeTruthy();
    // Contabilidad: el ingreso es 5.600 CUP a la tasa de la operación
    expect(row!.ventasImporteCup).toBe(5600);
    // NO es 8.000 (billete recibido) ni 8.000−2.400 mal calculado: la venta es 7 USD
    expect(row!.cantidadesVendidas).toBe(1);
    // Moneda de ORIGEN visible: 7 USD (columna informativa VENTAS USD)
    expect(row!.ventasImporteUsd).toBe(7);
    // Ledger: 0 + 10 entradas − 1 venta = 9
    expect(row!.existenciaInicial).toBe(0);
    expect(row!.entradas).toBe(10);
    expect(row!.existenciaFinal).toBe(9);
    // Sin incidencias de precio: 5600 = 7 × 800 (forma unitaria exacta)
    expect(res.totals.ventasImporteCup).toBe(5600);
  });

  it('fallback histórico: filas V1 sin currency conservan price_currency', () => {
    const res = computeIpv({
      window: { fromISO: FROM, toISO: TO },
      movements: ledger,
      inventory,
      salesLines: [
        lineaMision({ currency: undefined, price_currency: 'USD' }) as IpvSalesLineRow,
      ],
      devolutionLines: [],
      products,
    });
    const row = res.rows.find((r) => r.productId === P22);
    expect(row!.ventasImporteUsd).toBe(7);   // clasificado por price_currency (fallback)
    expect(row!.ventasImporteCup).toBe(5600);
  });

  it('ítem CUP nativo no contamina la columna USD', () => {
    const res = computeIpv({
      window: { fromISO: FROM, toISO: TO },
      movements: ledger,
      inventory,
      salesLines: [
        lineaMision({ price_at_sale: '5600', price_at_sale_cup: '5600', currency: 'CUP', exchange_rate: null }),
      ],
      devolutionLines: [],
      products,
    });
    const row = res.rows.find((r) => r.productId === P22);
    expect(row!.ventasImporteCup).toBe(5600);
    expect(row!.ventasImporteUsd).toBe(0);   // cobro CUP nativo: sin importe USD
  });
});
