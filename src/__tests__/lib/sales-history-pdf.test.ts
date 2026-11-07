import { describe, it, expect } from 'vitest';
import {
  buildSalesHistoryPdfModel,
  salesHistoryFileName,
  precioUnitarioCupDeLinea,
  type SalesHistoryPdfTransaction,
  type SalesHistoryPdfLine,
} from '@/lib/export/sales-history-pdf';

/**
 * MISIÓN 2026-11-07 — Historial de Ventas · exportación PDF
 * =========================================================
 * Pruebas del modelo puro: exporta TODAS las filas filtradas, totales
 * separados por moneda (CUP ≠ USD), período y nombre de archivo oficial.
 * El render byte-level se ejercita en la suite de componentes del historial.
 */

const mkTx = (overrides: Partial<SalesHistoryPdfTransaction> = {}): SalesHistoryPdfTransaction => ({
  id: 'aaaaaaaa-0000-4000-8000-00000000000' + (Math.floor(Math.random() * 9) + 1),
  created_at: '2026-11-05T16:00:00Z',
  status: 'completed',
  payment_method: 'cash',
  total_amount: 1000,
  zelle_amount: 0,
  sale_exchange_rate: 680,
  ...overrides,
});

const mkLine = (overrides: Partial<SalesHistoryPdfLine> = {}): SalesHistoryPdfLine => ({
  transaction_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  quantity: 2,
  price_at_sale: 4.5,
  price_currency: 'USD',
  price_at_sale_cup: 3060,
  exchange_rate: 680,
  products: { name: 'Cable Solar Negro 4mm', sku: '87' },
  ...overrides,
});

describe('sales-history-pdf — modelo', () => {
  it('incluye TODAS las filas filtradas (no solo la página visible)', () => {
    const txs = Array.from({ length: 137 }, (_, i) => mkTx({ id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    const model = buildSalesHistoryPdfModel({
      transactions: txs,
      store: { name: 'ENERVIDA-VITALLCONS' },
      dateFrom: '2026-11-01',
      dateTo: '2026-11-07',
    });
    expect(model.ventas).toHaveLength(137);
  });

  it('totales separados por moneda: CUP y USD jamás se suman juntos', () => {
    const model = buildSalesHistoryPdfModel({
      transactions: [
        mkTx({ id: 'aaaaaaaa-0000-4000-8000-000000000001', total_amount: 10000, zelle_amount: 0 }),
        // venta mixta: total CUP 20,400 con cobro Zelle de 30 USD (30×680)
        mkTx({ id: 'aaaaaaaa-0000-4000-8000-000000000002', total_amount: 20400, zelle_amount: 20400, sale_exchange_rate: 680 }),
      ],
      store: { name: 'Tienda QA' },
    });
    expect(model.totalesVentas.totalCup).toBe(30400); // Σ total_amount (CUP)
    expect(model.totalesVentas.cobrosUsd).toBeCloseTo(30, 6); // Σ USD de referencia aparte
  });

  it('líneas de producto: importe CUP con la regla canónica del sistema', () => {
    const model = buildSalesHistoryPdfModel({
      transactions: [mkTx({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })],
      lines: [
        mkLine(), // cup persistido: 2 × 3060 = 6,120 CUP
        mkLine({ transaction_id: 'aaaaaaaa-0000-4000-8000-000000000001', price_at_sale_cup: null, price_at_sale: 4.5, exchange_rate: 680 }), // fallback 4.5×680
      ],
      store: { name: 'Tienda QA' },
    });
    expect(model.lineas[0].importeCup).toBe(6120);
    expect(model.lineas[1].importeCup).toBeCloseTo(6120, 6);
    expect(model.totalLineasCup).toBeCloseTo(12240, 6);
    expect(model.lineas[0].moneda).toBe('USD'); // moneda nativa persistida
  });

  it('precio unitario CUP de línea: persistido manda, fallback precio × tasa', () => {
    expect(precioUnitarioCupDeLinea(mkLine({ price_at_sale_cup: 3060, price_at_sale: 4.5 }))).toBe(3060);
    expect(precioUnitarioCupDeLinea(mkLine({ price_at_sale_cup: 0, price_at_sale: 4.5, exchange_rate: 680 }))).toBe(3060);
    expect(precioUnitarioCupDeLinea(mkLine({ price_at_sale_cup: 0, price_at_sale: 100, exchange_rate: 0 }))).toBe(100); // tasa inválida → 1
  });

  it('nombre de archivo oficial con tienda y período saneados', () => {
    expect(salesHistoryFileName('ENERVIDA-VITALLCONS', '2026-11-01', '2026-11-07'))
      .toBe('Historial_Ventas_ENERVIDA-VITALLCONS_2026-11-01_2026-11-07.pdf');
    expect(salesHistoryFileName('Tienda "El Sol" S.A', '2026-11-01', ''))
      .toBe('Historial_Ventas_Tienda_El_Sol_S.A_2026-11-01_hoy.pdf');
  });

  it('estados y métodos mapeados al vocabulario de COSTPRO', () => {
    const model = buildSalesHistoryPdfModel({
      transactions: [
        mkTx({ status: 'completed', payment_method: 'mixed' }),
        mkTx({ status: 'voided', payment_method: 'zelle' }),
        mkTx({ status: 'pending', payment_method: 'wallet' }),
      ],
      store: { name: 'Tienda QA' },
    });
    expect(model.ventas.map(v => v.estado)).toEqual(['Completada', 'Anulada', 'Pendiente']);
    expect(model.ventas.map(v => v.metodo)).toEqual(['Mixto', 'USD/Zelle', 'Billetera']);
  });
});
