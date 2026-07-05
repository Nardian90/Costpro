/**
 * stat.tests.test.ts — Unit tests for Sprint 1 statistical validation
 *
 * SPRINT-1-STATS (2026-07-05)
 *
 * Verifica que los 4 tests estadísticos se calculan correctamente:
 *   - Chi-cuadrado de uniformidad
 *   - Kolmogorov-Smirnov
 *   - Runs Test de Wald-Wolfowitz
 *   - Entropía de Shannon
 *
 * Y el drift detection (Page-Hinkley simplificado).
 */

import { describe, it, expect } from 'vitest';
import {
  chiSquareUniformityTest,
  kolmogorovSmirnovTest,
  runsTest,
  entropyTest,
  detectRegimeChange,
  runFullStatisticalTests,
  normalCDF,
  invNormalCDF,
} from '@/services/pick3/stat.tests';
import { Pick3Result } from '@/types/pick3';

// Helper para generar datos aleatorios uniformes usando mulberry32 (PRNG de alta calidad)
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateUniformHistory(n: number, seed: number = 42): Pick3Result[] {
  const result: Pick3Result[] = [];
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const d1 = Math.floor(rng() * 10);
    const d2 = Math.floor(rng() * 10);
    const d3 = Math.floor(rng() * 10);
    result.push({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      draw_time: i % 2 === 0 ? 'midday' : 'evening',
      result: [d1, d2, d3] as [number, number, number],
    });
  }
  return result;
}

// Helper para generar datos con sesgo (el dígito 0 aparece 3x más)
function generateBiasedHistory(n: number): Pick3Result[] {
  const result: Pick3Result[] = [];
  const rng = mulberry32(987);
  for (let i = 0; i < n; i++) {
    // Cada uno de los 3 dígitos tiene 30% chance de ser 0 (vs 10% normal)
    const d1 = rng() < 0.3 ? 0 : Math.floor(rng() * 10);
    const d2 = rng() < 0.3 ? 0 : Math.floor(rng() * 10);
    const d3 = rng() < 0.3 ? 0 : Math.floor(rng() * 10);
    result.push({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      draw_time: i % 2 === 0 ? 'midday' : 'evening',
      result: [d1, d2, d3] as [number, number, number],
    });
  }
  return result;
}

describe('SPRINT-1-STATS: stat.tests', () => {
  // =========================================================================
  // NORMAL CDF / INVERSE
  // =========================================================================
  describe('normalCDF', () => {
    it('retorna 0.5 para x=0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 5);
    });
    it('retorna 0.8413 para x=1 (Z=1)', () => {
      expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
    });
    it('retorna 0.0228 para x=-2 (Z=-2)', () => {
      expect(normalCDF(-2)).toBeCloseTo(0.0228, 3);
    });
    it('es simétrica: CDF(-x) = 1 - CDF(x)', () => {
      expect(normalCDF(-1.5)).toBeCloseTo(1 - normalCDF(1.5), 4);
    });
  });

  describe('invNormalCDF', () => {
    it('retorna 0 para p=0.5', () => {
      expect(invNormalCDF(0.5)).toBeCloseTo(0, 3);
    });
    it('retorna 1.96 para p=0.975', () => {
      expect(invNormalCDF(0.975)).toBeCloseTo(1.96, 2);
    });
    it('es inversa de normalCDF', () => {
      const p = 0.7;
      const x = invNormalCDF(p);
      expect(normalCDF(x)).toBeCloseTo(p, 3);
    });
  });

  // =========================================================================
  // CHI-CUADRADO
  // =========================================================================
  describe('chiSquareUniformityTest', () => {
    it('NO rechaza H0 para datos uniformes', () => {
      const history = generateUniformHistory(500, 12345);
      const result = chiSquareUniformityTest(history, 'global');
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('SÍ rechaza H0 para datos sesgados', () => {
      const history = generateBiasedHistory(500);
      const result = chiSquareUniformityTest(history, 'global');
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('retorna interpretación human-readable', () => {
      const history = generateUniformHistory(100);
      const result = chiSquareUniformityTest(history, 'global');
      expect(result.interpretation).toContain('χ²');
      expect(result.interpretation.length).toBeGreaterThan(20);
    });

    it('funciona por posición específica', () => {
      const history = generateUniformHistory(200);
      const result = chiSquareUniformityTest(history, 0);
      expect(result.name).toContain('posición 0');
    });

    it('maneja historial vacío', () => {
      const result = chiSquareUniformityTest([], 'global');
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });
  });

  // =========================================================================
  // KOLMOGOROV-SMIRNOV
  // =========================================================================
  describe('kolmogorovSmirnovTest', () => {
    it('NO rechaza H0 para datos uniformes', () => {
      const history = generateUniformHistory(500, 98765);
      const result = kolmogorovSmirnovTest(history, 'global');
      expect(result.isSignificant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('SÍ rechaza H0 para datos sesgados', () => {
      const history = generateBiasedHistory(500);
      const result = kolmogorovSmirnovTest(history, 'global');
      expect(result.isSignificant).toBe(true);
    });

    it('statistic D está en [0, 1]', () => {
      const history = generateUniformHistory(100);
      const result = kolmogorovSmirnovTest(history, 'global');
      expect(result.statistic).toBeGreaterThanOrEqual(0);
      expect(result.statistic).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // RUNS TEST
  // =========================================================================
  describe('runsTest', () => {
    it('NO rechaza H0 para datos aleatorios', () => {
      const history = generateUniformHistory(200, 54321);
      const result = runsTest(history);
      expect(result.isSignificant).toBe(false);
    });

    it('requiere al menos 20 sorteos', () => {
      const history = generateUniformHistory(15);
      const result = runsTest(history);
      expect(result.interpretation).toContain('20');
    });

    it('detecta autocorrelación extrema (todos pares)', () => {
      const history: Pick3Result[] = Array.from({ length: 50 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
        draw_time: 'midday' as const,
        result: [2, 4, 6] as [number, number, number], // suma siempre par
      }));
      const result = runsTest(history);
      expect(result.isSignificant).toBe(true);
    });
  });

  // =========================================================================
  // ENTROPY
  // =========================================================================
  describe('entropyTest', () => {
    it('NO rechaza H0 para datos uniformes', () => {
      const history = generateUniformHistory(2000, 11111);
      const result = entropyTest(history);
      expect(result.isSignificant).toBe(false);
      // Con 2000 muestras, entropía debe estar cerca de log2(10) = 3.32
      expect(result.statistic).toBeGreaterThan(3.0);
    });

    it('SÍ rechaza H0 para datos muy sesgados', () => {
      const history: Pick3Result[] = Array.from({ length: 500 }, (_, i) => ({
        date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
        draw_time: 'midday' as const,
        result: [0, 0, 0] as [number, number, number],
      }));
      const result = entropyTest(history);
      expect(result.isSignificant).toBe(true);
      // Entropía muy baja
      expect(result.statistic).toBeLessThan(0.5);
    });

    it('entropía máxima teórica es log2(10) ≈ 3.3219', () => {
      const history = generateUniformHistory(5000, 999);
      const result = entropyTest(history);
      expect(result.statistic).toBeLessThanOrEqual(Math.log2(10) + 0.001);
      // Con 5000 muestras, entropía debe estar dentro de 0.2 del máximo
      expect(result.statistic).toBeGreaterThan(Math.log2(10) - 0.2);
    });
  });

  // =========================================================================
  // DRIFT DETECTION
  // =========================================================================
  describe('detectRegimeChange', () => {
    it('NO detecta drift en datos uniformes', () => {
      const history = generateUniformHistory(200, 555);
      const result = detectRegimeChange(history);
      expect(result.driftDetected).toBe(false);
    });

    it('detecta drift cuando hay cambio de régimen', () => {
      // Primera mitad: uniforme
      const part1 = generateUniformHistory(60, 111);
      // Segunda mitad: siempre 0 (régimen diferente)
      const part2: Pick3Result[] = Array.from({ length: 60 }, (_, i) => ({
        date: new Date(2024, 2, i + 1).toISOString().slice(0, 10),
        draw_time: 'midday' as const,
        result: [0, 0, 0] as [number, number, number],
      }));
      const result = detectRegimeChange([...part1, ...part2], 30, 50);
      expect(result.driftDetected).toBe(true);
      expect(result.driftPoint).toBeGreaterThan(0);
    });

    it('retorna descripción human-readable', () => {
      const history = generateUniformHistory(100);
      const result = detectRegimeChange(history);
      expect(result.description.length).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // FULL REPORT
  // =========================================================================
  describe('runFullStatisticalTests', () => {
    it('genera reporte con los 4 tests', () => {
      const history = generateUniformHistory(300);
      const result = runFullStatisticalTests(history);
      expect(result.chiSquare).toBeDefined();
      expect(result.kolmogorovSmirnov).toBeDefined();
      expect(result.runsTest).toBeDefined();
      expect(result.entropy).toBeDefined();
    });

    it('marca como random cuando todos los tests pasan', () => {
      const history = generateUniformHistory(1000, 4242);
      const result = runFullStatisticalTests(history);
      expect(result.isRandom).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('marca como NO random cuando algún test falla', () => {
      const history = generateBiasedHistory(500);
      const result = runFullStatisticalTests(history);
      expect(result.isRandom).toBe(false);
    });

    it('incluye summary interpretable', () => {
      const history = generateUniformHistory(500);
      const result = runFullStatisticalTests(history);
      expect(result.summary).toContain('VEREDICTO');
      expect(result.summary.length).toBeGreaterThan(50);
    });
  });
});
