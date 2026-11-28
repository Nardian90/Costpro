/**
 * exchange-forecast.test.ts — Motor compartido de proyección
 * (misión CP-FX-UX-REDESIGN-AND-SIMULATOR-CONSOLIDATION-002, FASE 3.2/6.8).
 *
 * CONTRATO:
 *   - Determinismo: mismas entradas + opciones → mismo resultado en TODOS los
 *     consumidores (la contradicción 843 vs 989 CUP/USD venía de dos motores
 *     con datasets/ventanas distintos sin declarar).
 *   - Ventana declarada: solo los últimos windowPoints puntos con valor
 *     entrenan; la salida declara from/to/samples.
 *   - Solo observaciones: isReconstructed=true (estimadas/arrastres) NO
 *     entrenan por defecto (y se contabilizan como excluidas).
 *   - Mínimo de muestras y umbral R²: sin evidencia → reliable=false y
 *     projected=null (el UI muestra «—», jamás una cifra sin fundamento).
 *   - Proyección absurda (≤0) no se comunica.
 */
import { describe, it, expect } from 'vitest';
import {
  forecastRate,
  forecastAllModels,
  bestForecastModel,
  type ForecastInputPoint,
} from '@/lib/exchange-intelligence/forecast';

// Serie ascendente determinista: 900, 905, ..., 995 (20 puntos, nov 2026).
const RISING: ForecastInputPoint[] = Array.from({ length: 20 }, (_, i) => ({
  date: `2026-11-${String(9 + i).padStart(2, '0')}`,
  value: 900 + i * 5,
}));

describe('forecast — determinismo y coherencia entre consumidores (843 vs 989)', () => {
  it('mismas entradas → resultado idéntico (linear)', () => {
    const a = forecastRate(RISING, { model: 'linear', windowPoints: 30, daysAhead: 7 });
    const b = forecastRate([...RISING].reverse().map(p => p).sort((x, y) => x.date.localeCompare(y.date)), {
      model: 'linear',
      windowPoints: 30,
      daysAhead: 7,
    });
    expect(a).toEqual(b);
  });

  it('producto y escenarios con la MISMA ventana producen la MISMA proyección (regla de la misión)', () => {
    const producto = forecastRate(RISING, { model: 'linear', daysAhead: 7, windowPoints: 30 });
    const escenarios = forecastAllModels(RISING, { daysAhead: 7, windowPoints: 30 });
    expect(producto?.projected).toBe(escenarios.linear?.projected);
  });

  it('ventanas DISTINTAS producen resultados DISTINTOS y declarados (transparencia)', () => {
    const w10 = forecastRate(RISING, { model: 'linear', windowPoints: 10, daysAhead: 7 });
    const w20 = forecastRate(RISING, { model: 'linear', windowPoints: 20, daysAhead: 7 });
    expect(w10?.window.samples).toBe(10);
    expect(w20?.window.samples).toBe(20);
    // Con pendiente no perfectamente lineal las proyecciones pueden diferir;
    // en esta serie lineal perfecta coinciden pero las ventanas quedan declaradas.
    expect(w10?.window.from).toBe(RISING[10].date);
    expect(w20?.window.from).toBe(RISING[0].date);
  });
});

describe('forecast — ventana y exclusión de reconstrucciones', () => {
  it('la ventana corta sobre los últimos N puntos con valor', () => {
    const r = forecastRate(RISING, { windowPoints: 5, daysAhead: 1 });
    expect(r?.window.samples).toBe(5);
    expect(r?.window.from).toBe('2026-11-24');
    expect(r?.window.to).toBe('2026-11-28');
  });

  it('las reconstrucciones NO entrenan por defecto (y se cuentan como excluidas)', () => {
    const mixed: ForecastInputPoint[] = [
      ...RISING.slice(0, 12),
      { date: '2026-11-21', value: 9999, isReconstructed: true }, // estimación absurda
      ...RISING.slice(12),
    ];
    const r = forecastRate(mixed, { windowPoints: 30, daysAhead: 1, minSamples: 5 });
    expect(r?.window.excludedReconstructed).toBe(1);
    // Si la estimación entrara al ajuste, la proyección se dispararía.
    expect(r?.projected).not.toBeGreaterThan((RISING[19].value ?? 0) + 500);
  });

  it('includeReconstructed:true las incorpora explícitamente (opt-in del consumidor)', () => {
    const mixed: ForecastInputPoint[] = [
      ...RISING.slice(0, 10),
      { date: '2026-11-19', value: 5000, isReconstructed: true },
      ...RISING.slice(10),
    ];
    const withRec = forecastRate(mixed, { windowPoints: 30, includeReconstructed: true, daysAhead: 1 });
    expect(withRec?.window.excludedReconstructed).toBe(0);
    expect(withRec?.window.samples).toBe(mixed.filter(p => p.value != null).length);
  });
});

describe('forecast — evidencia insuficiente (sin cifras sin fundamento)', () => {
  it('<5 muestras → reliable=false, projected=null, confidence=insuficiente', () => {
    const r = forecastRate(RISING.slice(0, 4), { daysAhead: 7 });
    expect(r?.reliable).toBe(false);
    expect(r?.projected).toBeNull();
    expect(r?.confidence).toBe('insuficiente');
  });

  it('R² bajo (ruido) → reliable=false con umbral por defecto 0.4', () => {
    const noisy: ForecastInputPoint[] = [
      { date: '2026-11-01', value: 900 },
      { date: '2026-11-02', value: 1100 },
      { date: '2026-11-03', value: 850 },
      { date: '2026-11-04', value: 1200 },
      { date: '2026-11-05', value: 800 },
      { date: '2026-11-06', value: 1300 },
      { date: '2026-11-07', value: 750 },
    ];
    const r = forecastRate(noisy, { daysAhead: 7 });
    expect(r?.r2).toBeLessThan(0.4);
    expect(r?.reliable).toBe(false);
    expect(r?.projected).toBeNull();
  });

  it('R² alto en serie lineal → confiable con confianza alta', () => {
    const r = forecastRate(RISING, { daysAhead: 7 });
    expect(r?.reliable).toBe(true);
    expect(r?.confidence).toBe('alta');
    expect(r?.r2).toBeGreaterThan(0.99);
    // Serie perfectamente lineal (+5/día): proyección = último + 7×5.
    expect(r?.projected).toBeCloseTo(995 + 35, 6);
  });

  it('proyección absurda (poly2 ≤ 0) no se comunica', () => {
    const falling: ForecastInputPoint[] = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-10-${String(10 + i).padStart(2, '0')}`,
      value: 1000 - i * 90, // cae hasta negativo
    }));
    const r = forecastRate(falling, { model: 'poly2', daysAhead: 7 });
    expect(r?.reliable).toBe(false);
    expect(r?.projected ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('forecast — comparación de modelos (misma ventana)', () => {
  it('los 4 modelos comparten from/to/samples (ventana común declarada en la UI)', () => {
    const all = forecastAllModels(RISING, { daysAhead: 7, windowPoints: 30 });
    const { from, to, samples } = all.linear!.window;
    for (const id of ['poly2', 'sma7', 'sma30'] as const) {
      expect(all[id]?.window.from).toBe(from);
      expect(all[id]?.window.to).toBe(to);
      expect(all[id]?.window.samples).toBe(samples);
    }
  });

  it('bestForecastModel elige el mayor R² (serie lineal → linear)', () => {
    const all = forecastAllModels(RISING, { daysAhead: 7 });
    expect(bestForecastModel(all)).toBe('linear');
  });
});
