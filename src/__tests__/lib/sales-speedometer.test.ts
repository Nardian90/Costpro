/**
 * ADNEGOCIO-UI 2026-11-23 — Lógica del velocímetro ejecutivo (misión §4):
 * escala dinámica SIN TRUNCAR, marca del 100 %, sin base de comparación y
 * variación sin división entre cero.
 */
import { describe, it, expect } from 'vitest';
import { speedometerScale, needleFraction, variationPct } from '@/lib/sales-dashboard/speedometer';

describe('speedometerScale', () => {
  it('mínimo 150 %: un índice modesto no encoge el arco', () => {
    const s = speedometerScale(60);
    expect(s.cap).toBe(150);
    expect(s.tick100).toBeCloseTo(100 / 150);
    expect(s.ticks).toContain(0);
    expect(s.ticks).toContain(100);
    expect(s.ticks).toContain(150);
  });

  it('se adapta automáticamente por encima del 100 % (múltiplos de 25) sin truncar', () => {
    expect(speedometerScale(125).cap).toBe(150);
    expect(speedometerScale(160).cap).toBe(175);
    expect(speedometerScale(210).cap).toBe(225);
    // Sin techo: un crecimiento de 500 % agranda el arco a 500 — la aguja nunca se recorta
    expect(speedometerScale(500).cap).toBe(500);
    const s = speedometerScale(372);
    expect(s.cap).toBe(375);
    expect(s.ticks[s.ticks.length - 1]).toBe(375);
    expect(s.ticks).toContain(100); // la referencia del 100 % siempre visible
  });

  it('arco legible: nunca demasiadas marcas numéricas', () => {
    const s = speedometerScale(500);
    expect(s.ticks.filter((v) => v <= s.cap).length).toBeLessThanOrEqual(9);
  });

  it('sin base de comparación (null / NaN) → escala neutra de 150 sin porcentaje', () => {
    const s = speedometerScale(null);
    expect(s.cap).toBe(150);
    expect(s.overflows).toBe(false);
    expect(speedometerScale(Number.NaN).cap).toBe(150);
  });
});

describe('needleFraction', () => {
  it('mapea el índice al arco acotado al tope', () => {
    expect(needleFraction(75, 150)).toBeCloseTo(0.5);
    expect(needleFraction(100, 150)).toBeCloseTo(100 / 150);
    expect(needleFraction(500, 500)).toBe(1);
    expect(needleFraction(-20, 150)).toBe(0); // sin índices negativos en el arco
    expect(needleFraction(null, 150)).toBeNull();
  });
});

describe('variationPct', () => {
  it('variación porcentual con una cifra decimal', () => {
    expect(variationPct(1080000, 1000000)).toBe(8);
    expect(variationPct(900000, 1000000)).toBe(-10);
    expect(variationPct(1000000, 1000000)).toBe(0);
  });

  it('sin base válida (anterior 0 / no finito) → null, nunca división entre cero', () => {
    expect(variationPct(500000, 0)).toBeNull();
    expect(variationPct(500000, Number.NaN)).toBeNull();
  });
});
