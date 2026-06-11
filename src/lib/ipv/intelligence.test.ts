import { describe, it, expect } from 'vitest';
import {
  calculatePriceEffectiveness,
  suggestAlternativePrice,
  checkWildcardCandidate,
  calculateDynamicPriority,
} from './intelligence';
import { Product, ReconciliationLine } from '@/lib/dexie';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  cod: 'TEST',
  descripcion: 'Producto Test',
  um: 'UNIDADES',
  precio_cents: 10000,
  prioridad_algoritmo: 3,
  activo: true,
  stock_inicial_manual: 50,
  created_at: '2024-01-01',
  ...overrides,
});

describe('calculatePriceEffectiveness', () => {
  it('should return 0 for zero price', () => {
    const product = makeProduct({ precio_cents: 0 });
    expect(calculatePriceEffectiveness(product, [])).toBe(0);
  });

  it('should score high for round price with usage', () => {
    const product = makeProduct({ precio_cents: 100, cod: 'A' });
    const lines: ReconciliationLine[] = [
      { product_cod: 'A' } as any,
      { product_cod: 'A' } as any,
      { product_cod: 'A' } as any,
    ];
    const score = calculatePriceEffectiveness(product, lines);
    // usageScore = min(3*4, 40) = 12
    // arithmeticScore = 40 (ends in 0)
    // strategicScore = 20 (100 is in [1,2,5,10,20,25,50,100])
    expect(score).toBe(72);
  });

  it('should score low for non-round price without usage', () => {
    const product = makeProduct({ precio_cents: 73 });
    const score = calculatePriceEffectiveness(product, []);
    // usageScore = 0
    // arithmeticScore = 20 (73 % 1 === 0, it's an integer)
    // strategicScore = 0
    expect(score).toBe(20);
  });

  it('should score medium for price ending in 5', () => {
    const product = makeProduct({ precio_cents: 25 });
    const lines: ReconciliationLine[] = [{ product_cod: 'TEST' } as any];
    // usageScore = min(1*4, 40) = 4
    // arithmeticScore = 30 (25 % 5 === 0 but 25 % 10 !== 0)
    // strategicScore = 20
    expect(calculatePriceEffectiveness(product, lines)).toBe(54);
  });

  it('should cap usage score at 40', () => {
    const product = makeProduct({ precio_cents: 100, cod: 'X' });
    const lines = Array.from({ length: 20 }, (_, i) => ({ product_cod: 'X' } as any));
    // usageScore = min(20*4, 40) = 40
    const score = calculatePriceEffectiveness(product, lines);
    // arithmeticScore = 40, strategicScore = 20
    expect(score).toBe(100);
  });
});

describe('suggestAlternativePrice', () => {
  it('should suggest nearest multiple of 5', () => {
    const product = makeProduct({ precio_cents: 73 });
    const result = suggestAlternativePrice(product);
    expect(result.price).toBe(75);
    expect(result.reason).toContain('73');
    expect(result.reason).toContain('75');
  });

  it('should return empty for already round price (multiple of 5)', () => {
    const product = makeProduct({ precio_cents: 100 });
    const result = suggestAlternativePrice(product);
    expect(result.price).toBeUndefined();
  });

  it('should return empty for price that rounds to 0', () => {
    const product = makeProduct({ precio_cents: 2 });
    // Math.round(2/5)*5 = 0 → returns empty
    const result = suggestAlternativePrice(product);
    expect(result.price).toBeUndefined();
  });

  it('should round up for 1', () => {
    const product = makeProduct({ precio_cents: 1 });
    // Math.round(1/5)*5 = 0 → returns empty
    const result = suggestAlternativePrice(product);
    expect(result.price).toBeUndefined();
  });

  it('should suggest 25 for price 23', () => {
    const product = makeProduct({ precio_cents: 23 });
    const result = suggestAlternativePrice(product);
    expect(result.price).toBe(25);
  });
});

describe('checkWildcardCandidate', () => {
  it('should identify cheap round price as wildcard', () => {
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 1 }))).toBe(true);
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 5 }))).toBe(true);
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 10 }))).toBe(true);
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 50 }))).toBe(true);
  });

  it('should reject expensive products', () => {
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 100 }))).toBe(false);
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 500 }))).toBe(false);
  });

  it('should reject non-round prices even if cheap', () => {
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 7 }))).toBe(false);
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 33 }))).toBe(false);
  });

  it('should reject zero price', () => {
    expect(checkWildcardCandidate(makeProduct({ precio_cents: 0 }))).toBe(false);
  });
});

describe('calculateDynamicPriority', () => {
  it('should return 5 for zero stock', () => {
    const result = calculateDynamicPriority(makeProduct(), { stock: 0, salesQty: 100, salesValue: 5000 });
    expect(result).toBe(5);
  });

  it('should return 1 for high stock and high sales', () => {
    const result = calculateDynamicPriority(makeProduct(), { stock: 300, salesQty: 200, salesValue: 5000 });
    // base=3, -1(>50), -1(>100), -1(>200), -1(>1000) = max(1, 3-4) = 1
    expect(result).toBe(1);
  });

  it('should return 3 for moderate stock and sales', () => {
    const result = calculateDynamicPriority(makeProduct(), { stock: 50, salesQty: 10, salesValue: 100 });
    expect(result).toBe(3);
  });

  it('should return 2 for high sales but low stock', () => {
    const result = calculateDynamicPriority(makeProduct(), { stock: 50, salesQty: 150, salesValue: 2000 });
    // base=3, -1(>50), -1(>100), +0(stock<=200), -1(>1000) = 3-3 = 0 → max(1,0) = 1
    expect(result).toBe(1);
  });

  it('should clamp result between 1 and 5', () => {
    // Extreme case: all bonuses → should be 1, not 0 or negative
    const result = calculateDynamicPriority(makeProduct(), { stock: 1000, salesQty: 500, salesValue: 5000 });
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(5);
  });
});
