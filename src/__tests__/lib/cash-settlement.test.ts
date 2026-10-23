/**
 * MISIÓN CAJA v2.24.0 (D6) — pruebas de la liquidación del cobro (vuelto
 * multimoneda). Espejo de las validaciones del RPC create_sale_v2 v2.24.0:
 * identidad canónica (recibido − vuelto) = cash_amount ±0.01 y vuelto en
 * moneda distinta a la recibida (misión §8).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCashSettlement,
  computeChangeDueCup,
  settlementErrorMessage,
} from '@/lib/pos/cash-settlement';

const RATE = 400; // 1 USD = 400 CUP (tasa POS hidratada)

describe('buildCashSettlement — escenario A: cambio en la misma moneda', () => {
  it('venta exacta sin dato de recibido → sin liquidación (flujo legacy intacto)', () => {
    const r = buildCashSettlement({
      receivedByCurrency: {},
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.settlement).toBeNull();
    expect(r.error).toBeUndefined();
  });

  it('paga más que el total en CUP → vuelto CUP neto que permanece en caja', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 5000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.error).toBeUndefined();
    expect(r.changeDueCup).toBe(1800);
    expect(r.settlement).toEqual({
      cash_received_cup: 5000,
      cash_received_usd: null,
      change_given_cup: 1800,
      change_given_usd: null,
      change_currency: 'CUP',
    });
  });

  it('pago insuficiente → ERR_UNDERPAID (sin liquidación; MISIÓN-FLEX documenta)', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 1000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.settlement).toBeNull();
    expect(r.error).toBe('ERR_UNDERPAID');
  });

  it('vuelto CUP mayor que el cambio debido → rechazado', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 5000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'CUP',
      changeAmountNative: 2000, // > 1800
    });
    expect(r.settlement).toBeNull();
    expect(r.error).toBe('ERR_CHANGE_EXCEEDS_DUE');
  });
});

describe('buildCashSettlement — escenario B: pago en una moneda y vuelto en otra (misión §8)', () => {
  it('paga 60.000 CUP con venta 3.200 → vuelto sugerido en USD al tasa POS (56.800/400 = 142)', () => {
    const due = computeChangeDueCup({ CUP: 60000 }, 3200, RATE);
    expect(due).toBe(56800);
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 60000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'USD',
    });
    expect(r.error).toBeUndefined();
    expect(r.settlement).toEqual({
      cash_received_cup: 60000,
      cash_received_usd: null,
      change_given_cup: null,
      change_given_usd: 142,
      change_currency: 'USD',
    });
    // Identidad canónica (lo que revalida el RPC):
    // (60.000 − 0) + (0 − 142) × 400 = 3.200 ✓
    const net = 60000 - 142 * RATE;
    expect(Math.abs(net - 3200)).toBeLessThanOrEqual(0.01);
  });

  it('vuelto USD editable mayor que el cambio debido (a tasa) → rechazado', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 60000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'USD',
      changeAmountNative: 143, // 143×400 = 57.200 > 56.800
    });
    expect(r.settlement).toBeNull();
    expect(r.error).toBe('ERR_CHANGE_EXCEEDS_DUE');
  });

  it('vuelto USD menor (cajero entrega menos) → válido: la venta conserva la identidad', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 60000 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'USD',
      changeAmountNative: 140, // 140×400 = 56.000 ≤ 56.800
    });
    expect(r.error).toBeUndefined();
    expect(r.settlement?.change_given_usd).toBe(140);
  });

  it('cobro en USD (recibido USD) con vuelto CUP', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { USD: 20 },
      cashAmountCup: 2000, // 20×400 − vuelto 6.000 = 2.000
      usdRate: RATE,
      changeCurrency: 'CUP',
      changeAmountNative: 6000,
    });
    expect(r.error).toBeUndefined();
    expect(r.settlement).toEqual({
      cash_received_cup: null,
      cash_received_usd: 20,
      change_given_cup: 6000,
      change_given_usd: null,
      change_currency: 'CUP',
    });
    const net = (20 * RATE) - 6000;
    expect(Math.abs(net - 2000)).toBeLessThanOrEqual(0.01);
  });

  it('sin tasa USD válida (≤1) y vuelto USD → ERR_RATE_INVALID (fail-closed como el RPC)', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 60000 },
      cashAmountCup: 3200,
      usdRate: 1,
      changeCurrency: 'USD',
    });
    expect(r.settlement).toBeNull();
    expect(r.error).toBe('ERR_RATE_INVALID');
  });
});

describe('buildCashSettlement — guardas estructurales', () => {
  it('importes negativos → ERR_RECEIVED_NEGATIVE', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: -100 },
      cashAmountCup: 100,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.error).toBe('ERR_RECEIVED_NEGATIVE');
  });

  it('venta sin componente cash → sin liquidación (NOT_APPLICABLE lo fija el RPC)', () => {
    const r = buildCashSettlement({
      receivedByCurrency: {},
      cashAmountCup: 0,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.settlement).toBeNull();
  });

  it('recibido sin vuelto (venta exacta con dato de recibido) → liquidación con change 0/null', () => {
    const r = buildCashSettlement({
      receivedByCurrency: { CUP: 3200 },
      cashAmountCup: 3200,
      usdRate: RATE,
      changeCurrency: 'CUP',
    });
    expect(r.error).toBeUndefined();
    expect(r.settlement).toEqual({
      cash_received_cup: 3200,
      cash_received_usd: null,
      change_given_cup: null,
      change_given_usd: null,
      change_currency: null,
    });
  });

  it('los errores tienen mensaje humano (misión §8: validación comprensible)', () => {
    for (const e of [
      'ERR_UNDERPAID',
      'ERR_CHANGE_EXCEEDS_DUE',
      'ERR_RATE_INVALID',
      'ERR_CHANGE_NEGATIVE',
      'ERR_RECEIVED_NEGATIVE',
    ] as const) {
      expect(settlementErrorMessage(e).length).toBeGreaterThan(10);
    }
  });
});
