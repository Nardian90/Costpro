/**
 * product-analysis-margin.test.ts — Margen bruto vs recargo sobre costo
 * (misión CP-FX-UX-REDESIGN-AND-SIMULATOR-CONSOLIDATION-002, FASE 3.2/6.7).
 *
 * CASO DE LA MISIÓN: costo actual 980 CUP, precio fijado 1,216 CUP.
 *   - 236/980  = 24.08% → RECARGO realizado sobre el costo.
 *   - 236/1216 = 19.41% → MARGEN BRUTO realizado sobre el precio de venta.
 * La vista histórica etiquetaba «margen» lo que matemáticamente era recargo.
 * Ahora la convención es EXPLÍCITA (marginMode), el default conserva el
 * comportamiento histórico (ningún indicador cambia de significado en
 * silencio) y ambas cifras se calculan siempre.
 */
import { describe, it, expect } from 'vitest';
import {
  computeProductAnalysis,
  priceFromCost,
  recargoToMargen,
  margenToRecargo,
  type ProductAnalysisInput,
} from '@/lib/exchange-intelligence/product-analysis';

const base: ProductAnalysisInput = {
  costUsd: 1,
  purchaseRate: 936,
  currentRate: 980,
  forecastRate: null,
  forecastDays: 7,
  marginPct: 30,
  unitsPerMonth: 100,
};

describe('priceFromCost — convenciones explícitas', () => {
  it('recargo: precio = costo × (1 + x/100)', () => {
    expect(priceFromCost(980, 30, 'recargo')).toBeCloseTo(1274, 6);
    expect(priceFromCost(100, 0, 'recargo')).toBe(100);
  });

  it('margen bruto: precio = costo / (1 − x/100)', () => {
    // 30% de margen bruto → el costo es el 70% del precio.
    expect(priceFromCost(980, 30, 'margen')).toBeCloseTo(1400, 6);
    expect(priceFromCost(100, 50, 'margen')).toBe(200);
  });

  it('margen ≥ 100% es imposible → null (sin precios infinitos)', () => {
    expect(priceFromCost(980, 100, 'margen')).toBeNull();
    expect(priceFromCost(980, 150, 'margen')).toBeNull();
  });

  it('entradas inválidas → null', () => {
    expect(priceFromCost(NaN, 30, 'recargo')).toBeNull();
    expect(priceFromCost(100, NaN, 'recargo')).toBeNull();
    expect(priceFromCost(-5, 30, 'recargo')).toBeNull();
    expect(priceFromCost(100, -10, 'recargo')).toBeNull();
  });
});

describe('conversiones recargo ↔ margen', () => {
  it('recargo 30% ≡ margen bruto 23.08%', () => {
    expect(recargoToMargen(30)).toBeCloseTo(30 / 130 * 100, 6);
  });
  it('margen 30% ≡ recargo 42.86%', () => {
    expect(margenToRecargo(30)).toBeCloseTo(30 / 70 * 100, 6);
  });
  it('la conversión es biyectiva', () => {
    expect(margenToRecargo(recargoToMargen(40)!)).toBeCloseTo(40, 4);
  });
});

describe('computeProductAnalysis — el caso exacto de la misión (980 / 1216)', () => {
  const input: ProductAnalysisInput = {
    ...base,
    // Precio fijado 1,216 = compra a tasa 936 con recargo 30% (1 USD).
    purchaseRate: 936,
    currentRate: 980,
    marginPct: 30,
    marginMode: 'recargo',
  };
  const r = computeProductAnalysis(input);

  it('precio fijado con recargo 30% sobre 936 = 1,216.8', () => {
    expect(r.salePriceSetCup).toBeCloseTo(1216.8, 6);
  });

  it('recargo realizado = 236.8/980 = 24.16% (sobre COSTO de reposición)', () => {
    expect(r.realMarginPct).toBeCloseTo(((1216.8 - 980) / 980) * 100, 4);
  });

  it('margen bruto realizado = 236.8/1216.8 = 19.46% (sobre PRECIO de venta)', () => {
    expect(r.realMarginOnSalePct).toBeCloseTo(((1216.8 - 980) / 1216.8) * 100, 4);
  });

  it('ambas convenciones conviven y se declaran (marginMode)', () => {
    expect(r.marginMode).toBe('recargo');
    const m = computeProductAnalysis({ ...input, marginMode: 'margen' });
    expect(m.marginMode).toBe('margen');
    // Con margen 30% el precio fijado sería mayor: 936/0.7 = 1337.14
    expect(m.salePriceSetCup).toBeCloseTo(1337.142857, 4);
  });
});

describe('computeProductAnalysis — el default conserva el comportamiento histórico', () => {
  it('sin marginMode el resultado es IDÉNTICO a la fórmula original costo×(1+x)', () => {
    const r = computeProductAnalysis(base);
    // Fórmula histórica verbatim: costo compra × 1.30
    expect(r.salePriceSetCup).toBeCloseTo(936 * 1.3, 6);
    expect(r.recommendedPriceNowCup).toBeCloseTo(980 * 1.3, 6);
    expect(r.realMarginPct).toBeCloseTo(((936 * 1.3 - 980) / 980) * 100, 6);
  });

  it('isLosing y pérdida mensual solo cuando vende por debajo de la reposición', () => {
    const losing = computeProductAnalysis({ ...base, currentRate: 1500 });
    expect(losing.isLosing).toBe(true);
    expect(losing.monthlyLossCup).toBeCloseTo((1216.8 - 1500) * -1 * 100, 6);
    const ok = computeProductAnalysis(base);
    expect(ok.isLosing).toBe(false);
    expect(ok.monthlyLossCup).toBe(0);
  });
});
