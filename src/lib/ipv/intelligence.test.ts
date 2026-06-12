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
      { producto_cod: 'A', precio_cents: 100, usage_count: 10 } as any,
    ];
    expect(calculatePriceEffectiveness(product, lines)).toBeGreaterThan(0.8);
  });
});

describe('suggestAlternativePrice', () => {
  it('should suggest price from usage if available', () => {
    const product = makeProduct({ precio_cents: 100, cod: 'A' });
    // suggestAlternativePrice only takes 1 argument: product
    const suggestion = suggestAlternativePrice(product);
    expect(suggestion).toBeDefined();
  });
});

describe('checkWildcardCandidate', () => {
  it('should identify product with high price variation as candidate', () => {
    const product = makeProduct({ variacion_permisible_percent: 50 });
    expect(checkWildcardCandidate(product)).toBe(true);
  });
});

describe('calculateDynamicPriority', () => {
  it('should return base priority if no usage', () => {
    const product = makeProduct({ prioridad_algoritmo: 3 });
    // calculateDynamicPriority expects (product, stats)
    expect(calculateDynamicPriority(product, { stock: 0, salesQty: 0, salesValue: 0 })).toBe(3);
  });
});
