/**
 * exchange-market-indicators.test.ts — Indicadores de mercado por FECHA
 * (misión CP-FX-UX-REDESIGN-AND-SIMULATOR-CONSOLIDATION-002, FASE 4 N3 / 6.4-6.5).
 *
 * CONTRATO:
 *   - Las variaciones 1/7/30 días se calculan por FECHA CALENDARIO (con
 *     tolerancia de 2 días por fechas sin publicación) — NO por índice. El
 *     antiguo cálculo del tab «Variaciones» (valid[len-n]) con huecos podía
 *     comparar fechas separadas más de lo etiquetado.
 *   - La variación «diaria» exige ≤2 días naturales entre observaciones: dos
 *     puntos separados por más tiempo NO forman variación diaria (hueco
 *     honesto, igual que el gráfico del Histórico).
 *   - La ventana usada se declara (days24h/days7d/days30d).
 *   - Volatilidad = σ de cambios diarios SOLO entre fechas consecutivas
 *     (gap=1): corrige la «volatilidad 0» sobre series con cambios.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDateBasedVariations,
  volatilityPct,
  daysBetweenIso,
  type MarketPoint,
} from '@/lib/exchange-intelligence/market-indicators';

// Noviembre 2026 con la serie del caso del usuario (todos los días publicados).
const FULL: MarketPoint[] = [
  { date: '2026-11-20', value: 950 },
  { date: '2026-11-21', value: 955 },
  { date: '2026-11-22', value: 960 },
  { date: '2026-11-23', value: 970 },
  { date: '2026-11-24', value: 970 },
  { date: '2026-11-25', value: 975 },
  { date: '2026-11-26', value: 980 },
  { date: '2026-11-27', value: 980 },
  { date: '2026-11-28', value: 980 },
];

describe('variaciones por fecha calendario (no por índice)', () => {
  it('caso 28/11/2026: 1d = 0%, 7d = +3.2%, y las ventanas son las declaradas', () => {
    const v = computeDateBasedVariations(FULL);
    expect(v?.lastDate).toBe('2026-11-28');
    expect(v?.lastValue).toBe(980);
    // 24h: 980 vs 980 → 0% (día consecutivo, days=1)
    expect(v?.pct24h).toBeCloseTo(0, 6);
    expect(v?.days24h).toBe(1);
    // 7 días naturales antes del 28 = 21 → 980 vs 955
    expect(v?.pct7d).toBeCloseTo(((980 - 955) / 955) * 100, 6);
    expect(v?.days7d).toBe(7);
    // 30 días naturales antes cae fuera de la serie → tolerancia 2 días
    // (28 o 29 días) → tomaría el punto más antiguo disponible si cabe en la
    // tolerancia; con solo 9 días de serie, 30d queda null.
    expect(v?.pct30d).toBeNull();
  });

  it('con un hueco en la serie, «7 días» compara por FECHA, no por posición', () => {
    // Serie con hueco 21→25 (la observación objetivo del 21/11 NO existe;
    // por índice len-8 habría tomado 930 del 18/11 — 10 días reales).
    const withGap: MarketPoint[] = [
      { date: '2026-11-18', value: 930 },
      { date: '2026-11-19', value: 935 },
      { date: '2026-11-20', value: 950 },
      { date: '2026-11-26', value: 980 },
      { date: '2026-11-27', value: 980 },
      { date: '2026-11-28', value: 980 },
    ];
    const v = computeDateBasedVariations(withGap);
    // Convención «última publicada en o antes del objetivo (21/11)» → 20/11
    // (8 días naturales, dentro de la tolerancia de 2).
    expect(v?.days7d).toBe(8);
    expect(v?.pct7d).toBeCloseTo(((980 - 950) / 950) * 100, 6);
  });

  it('la fecha objetivo publicada SIEMPRE gana (exactitud por fecha)', () => {
    const withGap: MarketPoint[] = [
      { date: '2026-11-18', value: 930 },
      { date: '2026-11-19', value: 935 },
      { date: '2026-11-20', value: 950 },
      { date: '2026-11-21', value: 955 },
      { date: '2026-11-26', value: 980 },
      { date: '2026-11-27', value: 980 },
      { date: '2026-11-28', value: 980 },
    ];
    const v = computeDateBasedVariations(withGap);
    expect(v?.days7d).toBe(7);
    expect(v?.pct7d).toBeCloseTo(((980 - 955) / 955) * 100, 6);
  });

  it('variación «diaria» con hueco >2 días naturales = null (hueco honesto)', () => {
    const sparse: MarketPoint[] = [
      { date: '2026-11-13', value: 910 },
      { date: '2026-11-28', value: 980 },
    ];
    const v = computeDateBasedVariations(sparse);
    expect(v?.pct24h).toBeNull();
    expect(v?.days24h).toBeNull();
    expect(v?.pct7d).toBeNull();
    expect(v?.pct30d).toBeNull();
  });

  it('serie insuficiente → null (sin cifras inventadas)', () => {
    expect(computeDateBasedVariations([{ date: '2026-11-28', value: 980 }])).toBeNull();
    expect(computeDateBasedVariations([])).toBeNull();
  });
});

describe('volatilidad (solo días consecutivos)', () => {
  it('serie con cambios diarios → volatilidad > 0 (caso «volatilidad 0» de la auditoría)', () => {
    const v = volatilityPct(FULL);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it('serie plana → 0 (sin cambios reales)', () => {
    const flat: MarketPoint[] = [
      { date: '2026-11-26', value: 980 },
      { date: '2026-11-27', value: 980 },
      { date: '2026-11-28', value: 980 },
    ];
    expect(volatilityPct(flat)).toBe(0);
  });

  it('los huecos grandes no fabrican volatilidad diaria (gap≠1 se ignora)', () => {
    const gapped: MarketPoint[] = [
      { date: '2026-11-01', value: 900 },
      { date: '2026-11-27', value: 1100 }, // +22% en un «día» → NO cuenta
      { date: '2026-11-28', value: 1105 },
    ];
    const v = volatilityPct(gapped);
    // Solo el cambio 27→28 (consecutivo, +0.45%) participa.
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(Math.sqrt(((0.4532 - 0.4532) ** 2)), 1);
  });

  it('<3 puntos → null', () => {
    expect(volatilityPct([{ date: '2026-11-27', value: 980 }, { date: '2026-11-28', value: 980 }])).toBeNull();
  });
});

describe('daysBetweenIso', () => {
  it('diferencia en días naturales por UTC (sin desfases de zona)', () => {
    expect(daysBetweenIso('2026-11-28', '2026-11-21')).toBe(7);
    expect(daysBetweenIso('2026-11-28', '2026-11-28')).toBe(0);
    expect(daysBetweenIso('2026-11-01', '2026-11-28')).toBe(-27);
  });
});
