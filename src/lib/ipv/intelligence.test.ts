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
    const lines: ReconciliationLine[] = [
      { product_cod: 'A', precio_cents: 100, usage_count: 10 } as any,
    ];
    // Score: usage (10 * 4 = 40) + rounding (100%10=0 -> 40) + strategic (100 is strategic -> 20) = 100
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
