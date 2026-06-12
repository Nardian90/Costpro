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
  es_paquete: false,
  contenido_paquete: 1,
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
    // The implementation counts the number of lines where product_cod matches.
    // Each line gives 4 points, max 40.
    const lines: ReconciliationLine[] = Array(10).fill({ product_cod: 'A', precio_cents: 100 } as any);

    // arithmeticScore: 100 % 10 == 0 -> 40
    // strategicScore: 100 is strategic -> 20
    // usageScore: 10 lines * 4 = 40
    // Total: 40 + 20 + 40 = 100
    expect(calculatePriceEffectiveness(product, lines)).toBe(100);
  });
});

describe('suggestAlternativePrice', () => {
  it('should suggest price from rounding if not multiple of 5', () => {
    const product = makeProduct({ precio_cents: 102 });
    const suggestion = suggestAlternativePrice(product);
    expect(suggestion.price).toBe(100);
  });
});

describe('checkWildcardCandidate', () => {
  it('should identify product with cheap round price as candidate', () => {
    const product = makeProduct({ precio_cents: 10 });
    expect(checkWildcardCandidate(product)).toBe(true);
  });
});

describe('calculateDynamicPriority', () => {
  it('should return base priority if minimal usage and some stock', () => {
    const product = makeProduct({ prioridad_algoritmo: 3 });
    expect(calculateDynamicPriority(product, { stock: 10, salesQty: 0, salesValue: 0 })).toBe(3);
  });

  it('should return low priority (5) if no stock', () => {
    const product = makeProduct({ prioridad_algoritmo: 3 });
    expect(calculateDynamicPriority(product, { stock: 0, salesQty: 0, salesValue: 0 })).toBe(5);
  });
});
