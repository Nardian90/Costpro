/**
 * Clasificación de modalidad monetaria y vía de pago de ventas — misión 2026-11-06.
 * Espejo de /api/sales/summary: payment_transactions autoritativo + fallback legacy.
 */
import { describe, it, expect } from 'vitest';
import { classifySale, saleMatchesModalityFilter } from '@/lib/sales/sale-classification';

describe('classifySale — modalidad monetaria', () => {
  it('venta CUP pura (efectivo CUP)', () => {
    const r = classifySale({
      payment_method: 'cash', cash_amount: 1600, transfer_amount: 0, zelle_amount: 0,
      payment_transactions: [{ amount: 1600, currency: 'CUP', payment_method: 'cash' }],
    });
    expect(r.modality).toBe('cup');
    expect(r.isTransfer).toBe(false);
  });

  it('venta USD pura (zelle USD)', () => {
    const r = classifySale({
      payment_method: 'transfer', zelle_amount: 50,
      payment_transactions: [{ amount: 50, currency: 'USD', payment_method: 'transfer' }],
    });
    expect(r.modality).toBe('usd');
    expect(r.isTransfer).toBe(true);
  });

  it('venta MIXTA: CUP + USD en la misma venta (distribución real del pago)', () => {
    const r = classifySale({
      payment_transactions: [
        { amount: 1600, currency: 'CUP', payment_method: 'cash' },
        { amount: 20, currency: 'USD', payment_method: 'cash' },
      ],
    });
    expect(r.modality).toBe('mixta');
    expect(r.isTransfer).toBe(false);
  });

  it('venta CUP por transferencia → cup + isTransfer', () => {
    const r = classifySale({
      payment_transactions: [{ amount: 3000, currency: 'CUP', payment_method: 'transfer' }],
    });
    expect(r.modality).toBe('cup');
    expect(r.isTransfer).toBe(true);
  });

  it('mixta por transferencia (transferencia CUP + zelle USD) → mixta + isTransfer', () => {
    const r = classifySale({
      payment_transactions: [
        { amount: 2000, currency: 'CUP', payment_method: 'transfer' },
        { amount: 10, currency: 'USD', payment_method: 'zelle' },
      ],
    });
    expect(r.modality).toBe('mixta');
    expect(r.isTransfer).toBe(true);
  });

  it('pagos de 0.00 no cuentan como componente (evita mixto fantasma)', () => {
    const r = classifySale({
      payment_transactions: [
        { amount: 1600, currency: 'CUP', payment_method: 'cash' },
        { amount: 0, currency: 'USD', payment_method: 'cash' },
      ],
    });
    expect(r.modality).toBe('cup');
  });

  it('fallback legacy sin payment_transactions: cash CUP', () => {
    const r = classifySale({ payment_method: 'cash', cash_amount: 500, transfer_amount: 0, zelle_amount: 0 });
    expect(r.modality).toBe('cup');
    expect(r.isTransfer).toBe(false);
  });

  it('fallback legacy: zelle USD → usd + isTransfer', () => {
    const r = classifySale({ cash_amount: 0, transfer_amount: 0, zelle_amount: 30 });
    expect(r.modality).toBe('usd');
    expect(r.isTransfer).toBe(true);
  });

  it('fallback legacy mixto: efectivo CUP + zelle USD → mixta', () => {
    const r = classifySale({ cash_amount: 800, transfer_amount: 0, zelle_amount: 15 });
    expect(r.modality).toBe('mixta');
    expect(r.isTransfer).toBe(true);
  });

  it('venta sin señales de pago → other (excluida por filtros)', () => {
    expect(classifySale({ cash_amount: 0, transfer_amount: 0, zelle_amount: 0 }).modality).toBe('other');
    expect(classifySale(null).modality).toBe('other');
    expect(classifySale(undefined).isTransfer).toBe(false);
  });
});

describe('saleMatchesModalityFilter — combinación de criterios', () => {
  const cupCash = { payment_transactions: [{ amount: 100, currency: 'CUP', payment_method: 'cash' }] };
  const cupTransfer = { payment_transactions: [{ amount: 100, currency: 'CUP', payment_method: 'transfer' }] };
  const usdZelle = { payment_transactions: [{ amount: 10, currency: 'USD', payment_method: 'zelle' }] };
  const mixed = { payment_transactions: [
    { amount: 100, currency: 'CUP', payment_method: 'cash' },
    { amount: 5, currency: 'USD', payment_method: 'cash' },
  ] };

  it('sin selección pasa todo (consulta general)', () => {
    expect(saleMatchesModalityFilter(cupCash, [], false)).toBe(true);
    expect(saleMatchesModalityFilter(usdZelle, [], false)).toBe(true);
    expect(saleMatchesModalityFilter(null, [], true)).toBe(false); // transferOnly sí filtra
  });

  it('Venta CUP: incluye CUP efectivo y CUP transferencia, excluye USD puro y mixta', () => {
    expect(saleMatchesModalityFilter(cupCash, ['cup'], false)).toBe(true);
    expect(saleMatchesModalityFilter(cupTransfer, ['cup'], false)).toBe(true);
    expect(saleMatchesModalityFilter(usdZelle, ['cup'], false)).toBe(false);
    expect(saleMatchesModalityFilter(mixed, ['cup'], false)).toBe(false);
  });

  it('Venta USD: solo USD puro', () => {
    expect(saleMatchesModalityFilter(usdZelle, ['usd'], false)).toBe(true);
    expect(saleMatchesModalityFilter(cupCash, ['usd'], false)).toBe(false);
    expect(saleMatchesModalityFilter(mixed, ['usd'], false)).toBe(false);
  });

  it('Venta Mixta: solo combinaciones reales CUP+USD', () => {
    expect(saleMatchesModalityFilter(mixed, ['mixta'], false)).toBe(true);
    expect(saleMatchesModalityFilter(cupCash, ['mixta'], false)).toBe(false);
  });

  it('multi-selección de modalidades (conjunto OR)', () => {
    expect(saleMatchesModalityFilter(cupCash, ['cup', 'mixta'], false)).toBe(true);
    expect(saleMatchesModalityFilter(mixed, ['cup', 'mixta'], false)).toBe(true);
    expect(saleMatchesModalityFilter(usdZelle, ['cup', 'mixta'], false)).toBe(false);
  });

  it('Transferencia es ortogonal (AND): CUP + Transferencia → solo transferencias CUP', () => {
    expect(saleMatchesModalityFilter(cupTransfer, ['cup'], true)).toBe(true);
    expect(saleMatchesModalityFilter(cupCash, ['cup'], true)).toBe(false);
    expect(saleMatchesModalityFilter(usdZelle, ['cup'], true)).toBe(false);
  });

  it('solo Transferencia (sin modalidad): cualquier venta con vía bancaria', () => {
    expect(saleMatchesModalityFilter(usdZelle, [], true)).toBe(true);
    expect(saleMatchesModalityFilter(cupTransfer, [], true)).toBe(true);
    expect(saleMatchesModalityFilter(cupCash, [], true)).toBe(false);
  });
});
