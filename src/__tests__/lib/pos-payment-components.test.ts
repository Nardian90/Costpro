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
    expect(comps).toContainEqual({ method: 'external_transfer', currency: 'USD', amount: 8 });
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
    // CP-FIN-004: fila HEREDADA 'zelle' → se normaliza al canónico external_transfer
    const items: PaymentSourceItem[] = [{ payments: [row('zelle', 20, 'USD')] }];
    const comps = buildPaymentComponents(items);
    expect(comps).toEqual([{ method: 'external_transfer', currency: 'USD', amount: 20 }]);
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

describe('CP-LOG-UNIFICATION-001 §5.1 — referencia de transferencia por pago', () => {
  const rowRef = (
    method: 'cash' | 'transfer' | 'external_transfer' | 'zelle',
    amount: number,
    currency: string,
    reference?: string | null,
  ) => ({ method, amount, currency, ...(reference !== undefined ? { reference } : {}) });

  it('11. DOS transferencias CUP con referencias distintas → DOS componentes (referencia POR pago, nunca global)', () => {
    const items: PaymentSourceItem[] = [
      {
        payments: [
          rowRef('transfer', 3000, 'CUP', 'TRANSF-0001'),
          rowRef('transfer', 2000, 'CUP', 'TRANSF-0002'),
        ],
      },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(2);
    expect(comps).toContainEqual({ method: 'transfer', currency: 'CUP', amount: 3000, reference: 'TRANSF-0001' });
    expect(comps).toContainEqual({ method: 'transfer', currency: 'CUP', amount: 2000, reference: 'TRANSF-0002' });
  });

  it('12. Transferencias SIN referencia siguen AGREGÁNDOSE (comportamiento histórico intacto)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('transfer', 3000, 'CUP'), rowRef('transfer', 2000, 'CUP')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toEqual({ method: 'transfer', currency: 'CUP', amount: 5000 });
  });

  it('13. Misma referencia en dos filas → UN componente con importe fusionado (misma operación bancaria)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('transfer', 1500, 'CUP', 'TRANSF-0099'), rowRef('transfer', 500, 'CUP', 'TRANSF-0099')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toEqual({ method: 'transfer', currency: 'CUP', amount: 2000, reference: 'TRANSF-0099' });
  });

  it('14. La referencia de una fila EFECTIVO se ignora (solo aplica a transferencias)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('cash', 500, 'CUP', 'NO-DEBE-VIAJAR')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(1);
    expect(comps[0]).not.toHaveProperty('reference');
  });

  it('15. Regla de envío EXTENDIDA: transferencia CUP con referencia → SÍ se envía (el pool legacy perdería la referencia)', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('transfer', 5000, 'CUP', 'TRANSF-777')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(requiresPaymentComponents(comps)).toBe(true);
  });

  it('16. external_transfer (Transf. Exterior) con referencia → componente con SU referencia', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('external_transfer', 20, 'USD', 'ZELLE-REF-1')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toEqual({ method: 'external_transfer', currency: 'USD', amount: 20, reference: 'ZELLE-REF-1' });
  });

  it('17. Referencia heredada zelle normalizada: viaja al componente external_transfer', () => {
    const items: PaymentSourceItem[] = [
      { payments: [rowRef('zelle', 10, 'USD', 'OLD-REF')] },
    ];
    const comps = buildPaymentComponents(items);
    expect(comps).toHaveLength(1);
    expect(comps[0].method).toBe('external_transfer');
    expect(comps[0].reference).toBe('OLD-REF');
  });

  it('18. Referencia con espacios → trim; vacía → sin referencia (agregación normal)', () => {
    const a = buildPaymentComponents([{ payments: [rowRef('transfer', 100, 'CUP', '  TRIM-1  ')] }]);
    expect(a[0].reference).toBe('TRIM-1');
    const b = buildPaymentComponents([{ payments: [rowRef('transfer', 100, 'CUP', '   ')] }]);
    expect(b[0]).not.toHaveProperty('reference');
  });
});
