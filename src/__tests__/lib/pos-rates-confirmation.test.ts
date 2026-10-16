/**
 * MISIÓN-TASAS (2026-10-17) — Tests de la confirmación diaria de tasas.
 * Cobertura de la matriz C.16–C.24 de la misión (nivel lógica pura):
 * primera vez del día, no repetición, día siguiente, tasa cambiada,
 * aislamiento por tienda y formato de clave.
 */
import { describe, it, expect } from 'vitest';
import {
  ratesConfirmationKey,
  evaluateRatesConfirmation,
  buildRatesConfirmationRecord,
  type RatesConfirmationRecord,
} from '@/lib/pos/rates-confirmation';

const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';
const STORE2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DAY = '2026-10-17';
const DAY2 = '2026-10-18';

function record(overrides: Partial<RatesConfirmationRecord> = {}): RatesConfirmationRecord {
  return {
    confirmedAt: '2026-10-17T09:00:00.000Z',
    businessDay: DAY,
    storeId: STORE,
    rates: { USD: 320, EUR: 350 },
    ...overrides,
  };
}

describe('ratesConfirmationKey', () => {
  it('compone tienda + día de negocio (caducidad diaria estructural)', () => {
    expect(ratesConfirmationKey(STORE, DAY)).toBe(`rates-confirmation:${STORE}:${DAY}`);
    // Día distinto → clave distinta → no hay confirmación previa
    expect(ratesConfirmationKey(STORE, DAY2)).not.toBe(ratesConfirmationKey(STORE, DAY));
    // Tienda distinta → clave distinta (aislamiento)
    expect(ratesConfirmationKey(STORE2, DAY)).not.toBe(ratesConfirmationKey(STORE, DAY));
  });
});

describe('evaluateRatesConfirmation', () => {
  it('C.16 sin confirmación previa → not_confirmed (aparece el diálogo)', () => {
    expect(evaluateRatesConfirmation(null, { USD: 320 }, { businessDay: DAY, storeId: STORE }))
      .toEqual({ needed: true, reason: 'not_confirmed' });
  });

  it('C.18 confirmación del día con las mismas tasas → NO vuelve a preguntar', () => {
    expect(evaluateRatesConfirmation(record(), { USD: 320, EUR: 350 }, { businessDay: DAY, storeId: STORE }))
      .toEqual({ needed: false, reason: null });
  });

  it('C.19 día operativo siguiente → nueva confirmación (registro de otro día no vale)', () => {
    expect(
      evaluateRatesConfirmation(record({ businessDay: DAY2 }), { USD: 320, EUR: 350 }, { businessDay: DAY, storeId: STORE }).reason,
    ).toBe('not_confirmed');
  });

  it('C.20 tienda distinta → la confirmación se evalúa de forma independiente', () => {
    expect(
      evaluateRatesConfirmation(record({ storeId: STORE2 }), { USD: 320 }, { businessDay: DAY, storeId: STORE }).reason,
    ).toBe('not_confirmed');
  });

  it('C.21 tasas modificadas después de confirmar → rates_changed (no se oculta el cambio)', () => {
    expect(evaluateRatesConfirmation(record(), { USD: 340, EUR: 350 }, { businessDay: DAY, storeId: STORE }))
      .toEqual({ needed: true, reason: 'rates_changed' });
    // Moneda añadida después de la confirmación también cuenta como cambio
    expect(
      evaluateRatesConfirmation(record(), { USD: 320, EUR: 350, MLC: 120 }, { businessDay: DAY, storeId: STORE }).reason,
    ).toBe('rates_changed');
    // Moneda eliminada también
    expect(
      evaluateRatesConfirmation(record(), { USD: 320 }, { businessDay: DAY, storeId: STORE }).reason,
    ).toBe('rates_changed');
  });

  it('tolerancia de comparación: diferencias de redondeo < 0.0001 no repiten el diálogo', () => {
    expect(
      evaluateRatesConfirmation(record(), { USD: 320.00009, EUR: 350 }, { businessDay: DAY, storeId: STORE }).needed,
    ).toBe(false);
  });
});

describe('buildRatesConfirmationRecord', () => {
  it('C.17 crea el registro canónico con copia de las tasas confirmadas', () => {
    const now = new Date('2026-10-17T12:30:00.000Z');
    const rates = { USD: 320 };
    const rec = buildRatesConfirmationRecord(STORE, DAY, rates, now);
    expect(rec).toEqual({
      confirmedAt: '2026-10-17T12:30:00.000Z',
      businessDay: DAY,
      storeId: STORE,
      rates: { USD: 320 },
    });
    // Copia (no referencia): mutar el origen no corrompe el registro
    rates.USD = 999;
    expect(rec.rates.USD).toBe(320);
  });
});
