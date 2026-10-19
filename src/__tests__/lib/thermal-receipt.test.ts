/**
 * MISIÓN IMPRESIÓN TÉRMICA (2026-10-20) — Tests de la lib pura thermal-receipt.
 *
 * Cobertura:
 *  - Configuración de ancho de rollo (default 58 mm, sanitización, persistencia
 *    en localStorage, presets 58/80).
 *  - CSS de impresión: @page al ancho configurado, ocultación de la interfaz,
 *    comprobante visible en blanco/negro.
 *  - aggregateItemPayments: filas payments[] + legacy, por método y moneda,
 *    orden estable, importes ≤ 0 ignorados, redondeo a 2 decimales.
 *  - buildReceiptDataFromLastSale: mapeo de sku/variante/moneda, importes CUP
 *    canónicos, etiqueta de descuento, vuelto/efectivo recibido.
 *  - buildReceiptDataFromTransaction: precios CUP canónicos, Zelle USD vs
 *    equivalente CUP (tasa no persistida), marca de reimpresión/anulada.
 *  - paymentMethodLabel + formatReceiptDateTime (es-CU).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom provee window/localStorage; se limpia entre tests.
import {
  THERMAL_WIDTH_PRESETS,
  DEFAULT_THERMAL_WIDTH_MM,
  getThermalWidthMm,
  setThermalWidthMm,
  sanitizeThermalWidthMm,
  buildThermalPrintCss,
  aggregateItemPayments,
  buildReceiptDataFromLastSale,
  buildReceiptDataFromTransaction,
  paymentMethodLabel,
  formatReceiptDateTime,
} from '@/lib/pos/thermal-receipt';

describe('MISIÓN IMPRESIÓN TÉRMICA — configuración de ancho de rollo', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('default honesto: 58 mm cuando no hay configuración guardada', () => {
    expect(DEFAULT_THERMAL_WIDTH_MM).toBe(58);
    expect(getThermalWidthMm()).toBe(58);
  });

  it('presets disponibles: 58 y 80 mm (el ancho del equipo NO se presupone verificado)', () => {
    expect([...THERMAL_WIDTH_PRESETS]).toEqual([58, 80]);
  });

  it('persiste y recupera un ancho válido (80 mm)', () => {
    const saved = setThermalWidthMm(80);
    expect(saved).toBe(80);
    expect(getThermalWidthMm()).toBe(80);
  });

  it('rechaza anchos absurdos fuera del rango 40–120 mm (sanitización)', () => {
    expect(sanitizeThermalWidthMm(0)).toBeNull();
    expect(sanitizeThermalWidthMm(-5)).toBeNull();
    expect(sanitizeThermalWidthMm(39)).toBeNull();
    expect(sanitizeThermalWidthMm(121)).toBeNull();
    expect(sanitizeThermalWidthMm(NaN)).toBeNull();
    expect(sanitizeThermalWidthMm(72)).toBe(72);
    // setThermalWidthMm con valor inválido → conserva el default
    expect(setThermalWidthMm(500)).toBe(58);
    expect(getThermalWidthMm()).toBe(58);
  });

  it('localStorage corrupto/ilegible → default 58 sin lanzar', () => {
    window.localStorage.setItem('costpro_thermal_receipt_width_mm', 'no-es-numero');
    expect(getThermalWidthMm()).toBe(58);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });
    expect(getThermalWidthMm()).toBe(58);
    spy.mockRestore();
  });
});

describe('MISIÓN IMPRESIÓN TÉRMICA — CSS de impresión (@page + ocultación de interfaz)', () => {
  it('@page lleva el ancho del rollo configurado con margen y alto auto (sin paginar)', () => {
    const css = buildThermalPrintCss(58);
    expect(css).toContain('@page { size: 58mm auto; margin: 2mm; }');
  });

  it('respeta el ancho configurado (80 mm) y márgenes personalizados', () => {
    const css = buildThermalPrintCss(80, 3);
    expect(css).toContain('@page { size: 80mm auto; margin: 3mm; }');
  });

  it('oculta TODA la interfaz salvo el comprobante (#thermal-receipt-root visible)', () => {
    const css = buildThermalPrintCss(58);
    expect(css).toContain('body * { visibility: hidden !important; }');
    expect(css).toContain('#thermal-receipt-root, #thermal-receipt-root * { visibility: visible !important; }');
    expect(css).toContain('position: absolute !important');
  });

  it('fuerza fondo blanco y cuerpo sin márgenes (compatibilidad monocromática)', () => {
    const css = buildThermalPrintCss(58);
    expect(css).toContain('background: #ffffff !important');
    expect(css).toContain('color: #000000 !important');
  });

  it('ancho inválido en el CSS → cae al default 58 (fail-safe)', () => {
    const css = buildThermalPrintCss(999);
    expect(css).toContain('@page { size: 58mm auto');
  });
});

describe('MISIÓN IMPRESIÓN TÉRMICA — aggregateItemPayments (suma de filas reales)', () => {
  it('agrega payments[] por método y moneda (cash CUP + zelle USD)', () => {
    const rows = aggregateItemPayments([
      {
        payments: [
          { method: 'cash', amount: 16000, currency: 'CUP' },
          { method: 'zelle', amount: 40, currency: 'USD' },
        ],
      },
      {
        payments: [
          { method: 'cash', amount: 4000, currency: 'CUP' },
        ],
      },
    ]);
    expect(rows).toEqual([
      { method: 'cash', amount: 20000, currency: 'CUP' },
      { method: 'zelle', amount: 40, currency: 'USD' },
    ]);
  });

  it('usa los campos legacy cuando el ítem no tiene payments[] (compatibilidad)', () => {
    const rows = aggregateItemPayments([
      {
        cash_paid: 31500,
        cash_currency: 'CUP',
        transfer_paid: 2400,
        transfer_currency: 'CUP',
        zelle_paid: 0,
        zelle_currency: 'USD',
      },
    ]);
    expect(rows).toEqual([
      { method: 'cash', amount: 31500, currency: 'CUP' },
      { method: 'transfer', amount: 2400, currency: 'CUP' },
    ]);
  });

  it('ignora importes ≤ 0 y separa por moneda dentro del mismo método', () => {
    const rows = aggregateItemPayments([
      {
        payments: [
          { method: 'cash', amount: 0, currency: 'CUP' },
          { method: 'cash', amount: 20, currency: 'USD' },
          { method: 'cash', amount: 1000, currency: 'CUP' },
        ],
      },
    ]);
    expect(rows).toEqual([
      { method: 'cash', amount: 1000, currency: 'CUP' },
      { method: 'cash', amount: 20, currency: 'USD' },
    ]);
  });

  it('orden estable: efectivo → transferencia → zelle (independiente del input)', () => {
    const rows = aggregateItemPayments([
      {
        payments: [
          { method: 'zelle', amount: 10, currency: 'USD' },
          { method: 'transfer', amount: 500, currency: 'CUP' },
          { method: 'cash', amount: 100, currency: 'CUP' },
        ],
      },
    ]);
    expect(rows.map((r) => r.method)).toEqual(['cash', 'transfer', 'zelle']);
  });

  it('redondea a 2 decimales al sumar (sin drift de coma flotante)', () => {
    const rows = aggregateItemPayments([
      { payments: [{ method: 'cash', amount: 0.1, currency: 'CUP' }] },
      { payments: [{ method: 'cash', amount: 0.2, currency: 'CUP' }] },
    ]);
    expect(rows[0].amount).toBe(0.3);
  });
});

describe('MISIÓN IMPRESIÓN TÉRMICA — buildReceiptDataFromLastSale (venta confirmada)', () => {
  const baseSale = {
    id: '8ab7becf-1111-2222-3333-444455556666',
    date: '2026-10-20T18:45:00.000Z',
    items: [
      {
        product: { name: 'Brecker 63 AMP Corriente alterna', sku: '128' },
        variantName: null,
        quantity: 1,
        price: 20000,
        subtotal: 20000,
        currency: 'CUP',
      },
      {
        product: { name: 'Tunder Grande', sku: '456' },
        variantName: 'Unidad',
        quantity: 2,
        price: 20,
        subtotal: 40,
        currency: 'USD',
      },
    ],
    subtotal: 20040,
    subtotalCup: 35600,
    discountAmount: 0,
    taxAmount: 0,
    total: 35600,
    discount: null,
    paymentMethod: 'mixed',
    payments: [
      { method: 'cash', amount: 31600, currency: 'CUP' },
      { method: 'zelle', amount: 40, currency: 'USD' },
    ],
    cashReceived: 32000,
    change: 400,
    customerName: 'Cliente Prueba',
  };

  it('mapea código, variante y moneda por línea; importes CUP canónicos', () => {
    const data = buildReceiptDataFromLastSale(baseSale, { storeName: 'EnerVida', sellerName: 'Operador' });
    expect(data.items[0]).toEqual({
      code: '128',
      name: 'Brecker 63 AMP Corriente alterna',
      quantity: 1,
      unitPrice: 20000,
      currency: 'CUP',
      lineTotal: 20000,
    });
    expect(data.items[1].name).toBe('Tunder Grande (Unidad)');
    expect(data.items[1].currency).toBe('USD');
    // Subtotal del recibo = CUP canónico (coherente con Total CUP), no la suma mixta
    expect(data.subtotal).toBe(35600);
    expect(data.total).toBe(35600);
  });

  it('conserva pagos, vuelto y efectivo recibido tal cual (cero recálculo)', () => {
    const data = buildReceiptDataFromLastSale(baseSale);
    expect(data.payments).toEqual(baseSale.payments);
    expect(data.change).toBe(400);
    expect(data.cashReceived).toBe(32000);
    expect(data.paymentMethod).toBe('mixed');
  });

  it('etiqueta de descuento: porcentaje y fijo; null cuando no hay', () => {
    const pct = buildReceiptDataFromLastSale({
      ...baseSale,
      discount: { type: 'percentage', value: 10 },
      discountAmount: 3560,
    });
    expect(pct.discountLabel).toBe('10 %');
    const fixed = buildReceiptDataFromLastSale({
      ...baseSale,
      discount: { type: 'fixed', value: 500 },
      discountAmount: 500,
    });
    expect(fixed.discountLabel).toBe('fijo');
    expect(buildReceiptDataFromLastSale(baseSale).discountLabel).toBeNull();
  });

  it('fallback honesto: sin subtotalCup usa el subtotal del LastSale', () => {
    const data = buildReceiptDataFromLastSale({ ...baseSale, subtotalCup: undefined });
    expect(data.subtotal).toBe(20040);
  });
});

describe('MISIÓN IMPRESIÓN TÉRMICA — buildReceiptDataFromTransaction (reimpresión)', () => {
  const txn = {
    id: 'd7c8ef72-aaaa-bbbb-cccc-ddddeeeeffff',
    invoice_number: 'F-0001',
    created_at: '2026-10-16T15:30:00.000Z',
    subtotal: 31600,
    discount_value: 0,
    tax_amount: 0,
    total_amount: 31600,
    payment_method: 'zelle',
    status: 'completed',
    customer_name: null,
  };
  const items = [
    {
      quantity: 2,
      price_at_sale: 15800,
      price_at_sale_cup: 15800,
      products: { name: 'Brecker 63 AMP', sku: '128' },
    },
  ];

  it('precios SIEMPRE en CUP canónico + marca de reimpresión + factura', () => {
    const data = buildReceiptDataFromTransaction(
      txn,
      items,
      { cashPaid: 0, transferPaid: 0, zellePaidUSD: 40, zellePaidCUP: 31600 },
    );
    expect(data.isReprint).toBe(true);
    expect(data.invoiceNumber).toBe('F-0001');
    expect(data.items[0]).toEqual({
      code: '128',
      name: 'Brecker 63 AMP',
      quantity: 2,
      unitPrice: 15800,
      currency: 'CUP',
      lineTotal: 31600,
    });
    // Zelle con tasa conocida → USD original
    expect(data.payments).toEqual([{ method: 'zelle', amount: 40, currency: 'USD' }]);
  });

  it('Zelle SIN tasa persistida → equivalente CUP etiquetado (nunca USD inventado)', () => {
    const data = buildReceiptDataFromTransaction(
      txn,
      items,
      { cashPaid: 16000, transferPaid: 2400, zellePaidUSD: null, zellePaidCUP: 13200 },
    );
    expect(data.payments).toEqual([
      { method: 'cash', amount: 16000, currency: 'CUP' },
      { method: 'transfer', amount: 2400, currency: 'CUP' },
      { method: 'zelle', amount: 13200, currency: 'CUP' },
    ]);
  });

  it('venta anulada conserva su estado para la marca visual del recibo', () => {
    const data = buildReceiptDataFromTransaction(
      { ...txn, status: 'voided' },
      items,
      { cashPaid: 31600, transferPaid: 0, zellePaidUSD: null },
    );
    expect(data.status).toBe('voided');
  });
});

describe('MISIÓN IMPRESIÓN TÉRMICA — etiquetas y formato', () => {
  it('paymentMethodLabel usa la convención de la app', () => {
    expect(paymentMethodLabel('cash')).toBe('EFECTIVO');
    expect(paymentMethodLabel('transfer')).toBe('TRANSFERENCIA');
    expect(paymentMethodLabel('zelle')).toBe('ZELLE (USD)');
    expect(paymentMethodLabel('mixed')).toBe('MIXTO');
    expect(paymentMethodLabel('')).toBe('OTRO');
    expect(paymentMethodLabel(null)).toBe('OTRO');
  });

  it('formatReceiptDateTime produce fecha corta es-CU y degrada con ISO inválido', () => {
    const out = formatReceiptDateTime('2026-10-20T18:45:00.000Z');
    // es-CU short: día/mes/año (2 o 4 dígitos según ICU) + hora con p. m./a. m.
    expect(out).toMatch(/20\/10\/(26|2026)/);
    expect(out).toMatch(/p\.?\s?m\.?/i);
    expect(formatReceiptDateTime('fecha-invalida')).toBe('fecha-invalida');
  });
});
