import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

describe('Rounding precision', () => {
  it('Decimal.js preserves precision through multiply', () => {
    const a = new Decimal('0.1');
    const b = new Decimal(3);
    expect(a.times(b).toNumber()).toBeCloseTo(0.3, 15);
  });

  it('Decimal.js handles tax calculation correctly', () => {
    const margin = new Decimal('100');
    const tax = margin.div('0.9').times('0.1').toDecimalPlaces(2);
    expect(tax.toNumber()).toBeCloseTo(11.11, 1);
  });

  it('toDecimalPlaces rounds correctly', () => {
    expect(new Decimal('1.005').toDecimalPlaces(2).toNumber()).toBe(1.01);
    expect(new Decimal('1.004').toDecimalPlaces(2).toNumber()).toBe(1.0);
  });

  it('float arithmetic loses precision while Decimal preserves it', () => {
    // Classic float problem
    const floatResult = 0.1 + 0.2;
    expect(floatResult).not.toBe(0.3); // This PASSES (float is imprecise)

    const decimalResult = new Decimal('0.1').plus('0.2');
    expect(decimalResult.toNumber()).toBeCloseTo(0.3, 15);
  });
});
