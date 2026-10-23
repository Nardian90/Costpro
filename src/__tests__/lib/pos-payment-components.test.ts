/**
 * MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24) — builder de componentes de pago.
 *
 * Prueba src/lib/pos/payment-components.ts: el desglose REAL por moneda que
 * viaja de Vender al RPC (p_payment_components) con importes ORIGINALES:
 *   · filas de pago por ítem (payments[]) agrupadas por (método, moneda);
 *   · fallback a campos legado para ítems sin filas;
 *   · regla de envío (requiresPaymentComponents): SOLO cuando hay componente
 *     USD de cash/transfer (los cobros que el pool canónico CUP no representa);
 *   · normalización: fusión de duplicados, descarte de filas en cero,
 *     redondeo 2 decimales, orden determinista.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPaymentComponents,
  requiresPaymentComponents,
  type PaymentSourceItem,
} from '@/lib/pos/payment-components';

const row = (method: 'cash' | 'transfer' | 'zelle', amount: number, currency: string) => ({
  method,
  amount,
  currency,
});

describe('buildPaymentComponents — desglose real por moneda', () => {
  it('1. Escenario A de la misión: efectivo 5 USD + 15 000 CUP → DOS componentes', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('cash', 5, 'USD'), row('cash', 15000, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(2);
    expect(comps).toContainEqual({ method: 'cash', currency: 'USD', amount: 5 });
    expect(comps).toContainEqual({ method: 'cash', currency: 'CUP', amount: 15000 });
    // Regla de envío: componente USD de cash/transfer presente ⇒ SÍ se envía
    expect(requiresPaymentComponents(comps)).toBe(true);
  });

  it('2. Fusión: dos filas cash USD (3 + 2) del mismo ítem → UN componente de 5 USD', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('cash', 3, 'USD'), row('cash', 2, 'USD')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toEqual([{ method: 'cash', currency: 'USD', amount: 5 }]);
  });

  it('3. Multi-ítem y multi-método: se consolidan por (método, moneda) en todos los ítems', () => {
    const items: PaymentSourceItem[] = [
      {
        payments: [
          row('cash', 5, 'USD'),
          row('cash', 5000, 'CUP'),
          row('transfer', 10000, 'CUP'),
        ],
      },
      {
        payments: [
          row('cash', 10000, 'CUP'),
          row('zelle', 8, 'USD'),
        ],
      },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toContainEqual({ method: 'cash', currency: 'USD', amount: 5 });
    expect(comps).toContainEqual({ method: 'cash', currency: 'CUP', amount: 15000 });
    expect(comps).toContainEqual({ method: 'transfer', currency: 'CUP', amount: 10000 });
    expect(comps).toContainEqual({ method: 'zelle', currency: 'USD', amount: 8 });
    expect(comps).toHaveLength(4);
  });

  it('4. Fallback legado: ítem sin payments[] usa cash_paid/cash_currency', () => {
    const items: PaymentSourceItem[] = [
      { cash_paid: 20000, cash_currency: 'CUP' },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toEqual([{ method: 'cash', currency: 'CUP', amount: 20000 }]);
    // CUP puro: NO requiere componentes (flujo previo)
    expect(requiresPaymentComponents(comps)).toBe(false);
  });

  it('5. Filas en cero o negativas se descartan (filas en edición)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('cash', 0, 'CUP'), row('cash', -3, 'USD'), row('cash', 15000, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toEqual([{ method: 'cash', currency: 'CUP', amount: 15000 }]);
  });

  it('6. Redondeo a 2 decimales y orden determinista', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('cash', 5.005, 'USD'), row('transfer', 1.111, 'USD'), row('cash', 100.254, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    // 5.005 → 5.01 (redondeo comercial); 1.111 → 1.11; 100.254 → 100.25
    expect(comps).toContainEqual({ method: 'cash', currency: 'CUP', amount: 100.25 });
    expect(comps).toContainEqual({ method: 'cash', currency: 'USD', amount: 5.01 });
    expect(comps).toContainEqual({ method: 'transfer', currency: 'USD', amount: 1.11 });
    // Orden: cash antes que transfer, CUP antes que USD
    expect(comps.map(c => `${c.method}|${c.currency}`)).toEqual(['cash|CUP', 'cash|USD', 'transfer|USD']);
  });

  it('7. Regla de envío: zelle USD puro NO dispara componentes (flujo previo intacto)', () => {
    const items: PaymentSourceItem[] = [{ payments: [row('zelle', 20, 'USD')] }];
    const comps = buildPaymentComponents(items);
    expect(comps).toEqual([{ method: 'zelle', currency: 'USD', amount: 20 }]);
    expect(requiresPaymentComponents(comps)).toBe(false);
  });

  it('8. Regla de envío: transfer USD sí dispara (junto al resto de componentes)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('transfer', 8, 'USD'), row('cash', 12000, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(requiresPaymentComponents(comps)).toBe(true);
  });

  it('9. Regla de envío: multi-método CUP puro NO dispara (el pool canónico lo representa)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [row('cash', 10000, 'CUP'), row('transfer', 5000, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(requiresPaymentComponents(comps)).toBe(false);
  });

  it('10. Carrito vacío → sin componentes', () => {
    expect(buildPaymentComponents([])).toEqual([]);
    expect(requiresPaymentComponents([])).toBe(false);
  });
});
