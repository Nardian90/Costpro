import { describe, it, expect } from 'vitest';
import {
  validateReceiptItemTasa,
  validateReceiptItemsTasa,
  TASA_CAMBIO_MINIMA_NO_CUP,
  MONEDA_BASE,
} from '@/lib/receipt-items-validation';

describe('F-21: validateReceiptItemTasa', () => {
  it('acepta moneda CUP con cualquier tasa (incluido 1.0)', () => {
    expect(validateReceiptItemTasa('CUP', 1.0)).toEqual({ valid: true });
    expect(validateReceiptItemTasa('CUP', 0)).toEqual({ valid: true });
    expect(validateReceiptItemTasa('CUP', undefined)).toEqual({ valid: true });
    expect(validateReceiptItemTasa('CUP', null)).toEqual({ valid: true });
  });

  it('acepta moneda undefined/null (default CUP)', () => {
    expect(validateReceiptItemTasa(undefined, undefined)).toEqual({ valid: true });
    expect(validateReceiptItemTasa(null, null)).toEqual({ valid: true });
  });

  it('acepta moneda no-CUP con tasa > 1.5', () => {
    expect(validateReceiptItemTasa('USD', 320).valid).toBe(true);
    expect(validateReceiptItemTasa('EUR', 350).valid).toBe(true);
    expect(validateReceiptItemTasa('MLC', 280).valid).toBe(true);
    expect(validateReceiptItemTasa('usd', 500).valid).toBe(true); // case-insensitive
  });

  it('rechaza moneda no-CUP con tasa = 1.0 (caso del bug F-21)', () => {
    const r = validateReceiptItemTasa('USD', 1.0);
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Tasa de cambio inválida');
    expect(r.details).toContain('USD');
    expect(r.details).toContain('1');
  });

  it('rechaza moneda no-CUP con tasa <= 1.5', () => {
    expect(validateReceiptItemTasa('USD', 1.5).valid).toBe(false);
    expect(validateReceiptItemTasa('USD', 1.4).valid).toBe(false);
    expect(validateReceiptItemTasa('EUR', 0).valid).toBe(false);
  });

  it('rechaza moneda no-CUP con tasa undefined/null/NaN', () => {
    expect(validateReceiptItemTasa('USD', undefined).valid).toBe(false);
    expect(validateReceiptItemTasa('USD', null).valid).toBe(false);
    expect(validateReceiptItemTasa('USD', Number.NaN).valid).toBe(false);
  });

  it('expone el umbral y la moneda base como constantes', () => {
    expect(TASA_CAMBIO_MINIMA_NO_CUP).toBe(1.5);
    expect(MONEDA_BASE).toBe('CUP');
  });
});

describe('F-21: validateReceiptItemsTasa (array)', () => {
  it('retorna valid=true para array vacío', () => {
    expect(validateReceiptItemsTasa([])).toEqual({ valid: true });
  });

  it('retorna valid=true si todos los items son válidos', () => {
    const items = [
      { moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 },
      { moneda_recepcion: 'USD', tasa_cambio_recepcion: 320 },
      { moneda_recepcion: 'EUR', tasa_cambio_recepcion: 350 },
    ];
    expect(validateReceiptItemsTasa(items)).toEqual({ valid: true });
  });

  it('retorna valid=false y details con índice del item si alguno falla', () => {
    const items = [
      { moneda_recepcion: 'CUP', tasa_cambio_recepcion: 1.0 },
      { moneda_recepcion: 'USD', tasa_cambio_recepcion: 1.0 }, // bug F-21
      { moneda_recepcion: 'EUR', tasa_cambio_recepcion: 350 },
    ];
    const r = validateReceiptItemsTasa(items);
    expect(r.valid).toBe(false);
    expect(r.details).toContain('Item #2');
    expect(r.details).toContain('USD');
  });

  it('fail-fast: retorna el primer error encontrado', () => {
    const items = [
      { moneda_recepcion: 'USD', tasa_cambio_recepcion: 1.0 },
      { moneda_recepcion: 'EUR', tasa_cambio_recepcion: 1.0 },
    ];
    const r = validateReceiptItemsTasa(items);
    expect(r.valid).toBe(false);
    expect(r.details).toContain('Item #1');
  });

  it('acepta items sin moneda_recepcion ni tasa_cambio_recepcion (defaults CUP)', () => {
    const items = [
      { product_id: 'p1', quantity: 1, unit_cost: 10 },
      { product_id: 'p2', quantity: 2, unit_cost: 20, moneda_recepcion: 'CUP' },
    ];
    expect(validateReceiptItemsTasa(items)).toEqual({ valid: true });
  });
});
