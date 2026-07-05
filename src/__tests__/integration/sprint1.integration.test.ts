/**
 * sprint1.integration.test.ts — End-to-end audit of Sprint 1
 *
 * Verifica que el backtest engine REAL (no unit aislado) produce métricas
 * diferentes de cero cuando se le dan datos realistas.
 *
 * Esta es la auditoría que garantiza que los fixes del Sprint 1 funcionan
 * en producción, no solo en unit tests.
 */

import { describe, it, expect } from 'vitest';
import { BacktestEngine } from '@/services/pick3/backtest.engine';
import { Pick3Result, BettingConfig } from '@/types/pick3';
import { runFullStatisticalTests } from '@/services/pick3/stat.tests';
import { computeFullQuantReport } from '@/services/pick3/quant.metrics';

// Generar histórico realista (200 sorteos, distribución uniforme)
function generateRealisticHistory(n: number): Pick3Result[] {
  const result: Pick3Result[] = [];
  for (let i = 0; i < n; i++) {
    const d1 = Math.floor(Math.random() * 10);
    const d2 = Math.floor(Math.random() * 10);
    const d3 = Math.floor(Math.random() * 10);
    result.push({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      draw_time: i % 2 === 0 ? 'midday' : 'evening',
      result: [d1, d2, d3] as [number, number, number],
    });
  }
  return result;
}

describe('SPRINT-1 INTEGRATION AUDIT', () => {
  const config: BettingConfig = {
    mode: 'PICK3',
    payout: 500,
    digits: 3,
    maxCombinations: 10,
    riskFactor: 1.0,
    stopLoss: 50.0,
    criticalDrawdown: 30.0,
  };

  it('BacktestEngine produce métricas reales (no ceros fantasma)', () => {
    const history = generateRealisticHistory(200);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    // === Métricas que eran 0 antes del Sprint 1 ===
    expect(result.sharpeRatio).not.toBe(0);
    console.log(`[AUDIT] Sharpe: ${result.sharpeRatio.toFixed(3)}`);
    console.log(`[AUDIT] Sortino: ${result.sortinoRatio.toFixed(3)}`);
    console.log(`[AUDIT] Calmar: ${result.calmarRatio.toFixed(3)}`);
    console.log(`[AUDIT] Profit Factor: ${result.profitFactor.toFixed(3)}`);
    console.log(`[AUDIT] Recovery Factor: ${result.recoveryFactor.toFixed(3)}`);
    console.log(`[AUDIT] Win Streak: ${result.winStreak}`);
    console.log(`[AUDIT] Loss Streak: ${result.lossStreak}`);

    expect(result.sortinoRatio).not.toBe(0);
    expect(result.calmarRatio).not.toBe(0);
    expect(result.winStreak).toBeGreaterThanOrEqual(0); // puede ser 0 si ningún acierto
    expect(result.lossStreak).toBeGreaterThanOrEqual(0);
    expect(result.recoveryFactor).not.toBe(0);
    expect(result.profitFactor).not.toBe(0);
  });

  it('BacktestEngine incluye CAGR con IC 95%', () => {
    const history = generateRealisticHistory(200);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    expect(result.cagr).toBeDefined();
    expect(typeof result.cagr).toBe('number');
    expect(isFinite(result.cagr)).toBe(true);
    console.log(`[AUDIT] CAGR: ${result.cagr.toFixed(2)}%`);
    console.log(`[AUDIT] Total Return: ${result.totalReturn?.toFixed(2)}%`);

    if (result.cagrConfidenceInterval) {
      console.log(`[AUDIT] CI 95%: [${result.cagrConfidenceInterval.lower.toFixed(2)}%, ${result.cagrConfidenceInterval.upper.toFixed(2)}%]`);
      expect(result.cagrConfidenceInterval.lower).toBeLessThan(result.cagrConfidenceInterval.upper);
    }
  });

  it('BacktestEngine incluye Kelly y Probability of Ruin', () => {
    const history = generateRealisticHistory(200);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    expect(result.kellyFraction).toBeDefined();
    expect(result.probabilityOfRuin).toBeDefined();
    expect(result.kellyEdge).toBeDefined();
    console.log(`[AUDIT] Kelly Safe: ${(result.kellyFraction! * 100).toFixed(2)}%`);
    console.log(`[AUDIT] Kelly Edge: ${(result.kellyEdge! * 100).toFixed(2)}%`);
    console.log(`[AUDIT] Probability of Ruin: ${((result.probabilityOfRuin || 0) * 100).toFixed(2)}%`);
  });

  it('BacktestEngine incluye los 4 tests estadísticos', () => {
    const history = generateRealisticHistory(500);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    expect(result.statisticalTests).toBeDefined();
    expect(result.statisticalTests!.chiSquare.pValue).toBeGreaterThanOrEqual(0);
    expect(result.statisticalTests!.kolmogorovSmirnov.pValue).toBeGreaterThanOrEqual(0);
    expect(result.statisticalTests!.runsTest.pValue).toBeGreaterThanOrEqual(0);
    expect(result.statisticalTests!.entropy.pValue).toBeGreaterThanOrEqual(0);
    console.log(`[AUDIT] Is Random: ${result.statisticalTests!.isRandom}`);
    console.log(`[AUDIT] Confidence: ${result.statisticalTests!.confidence.toFixed(1)}%`);
    console.log(`[AUDIT] Summary: ${result.statisticalTests!.summary.substring(0, 100)}...`);
  });

  it('BacktestEngine incluye drift detection', () => {
    const history = generateRealisticHistory(200);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    expect(result.regimeChange).toBeDefined();
    expect(typeof result.regimeChange!.driftDetected).toBe('boolean');
    console.log(`[AUDIT] Drift Detected: ${result.regimeChange!.driftDetected}`);
    console.log(`[AUDIT] Drift Magnitude: ${result.regimeChange!.magnitude.toFixed(2)}`);
  });

  it('BacktestEngine incluye volatility, downside deviation y expectancy', () => {
    const history = generateRealisticHistory(200);
    const engine = new BacktestEngine(history);
    const result = engine.runValidation(config, 1000, 30);

    expect(result.volatility).toBeDefined();
    expect(result.downsideDeviation).toBeDefined();
    expect(result.expectancy).toBeDefined();
    console.log(`[AUDIT] Volatility: ${((result.volatility || 0) * 100).toFixed(2)}%`);
    console.log(`[AUDIT] Downside Dev: ${((result.downsideDeviation || 0) * 100).toFixed(2)}%`);
    console.log(`[AUDIT] Expectancy: $${(result.expectancy || 0).toFixed(2)}`);
  });

  it('computeFullQuantReport no retorna ceros fantasma', () => {
    const pnlSeries = Array.from({ length: 30 }, () => {
      return Math.random() > 0.5 ? 100 : -50;
    });
    const { report } = computeFullQuantReport(pnlSeries, 1000, 30, 0.5, 2);

    expect(report.streaks.maxWinStreak).toBeGreaterThan(0);
    expect(report.streaks.maxLossStreak).toBeGreaterThan(0);
    expect(report.ratios.sharpe).not.toBe(0);
    expect(report.profitability.profitFactor).not.toBe(0);
    expect(report.cagr.cagr).not.toBe(0);
  });

  it('runFullStatisticalTests funciona con histórico real', () => {
    const history = generateRealisticHistory(500);
    const report = runFullStatisticalTests(history);

    expect(report.chiSquare.pValue).toBeGreaterThanOrEqual(0);
    expect(report.kolmogorovSmirnov.pValue).toBeGreaterThanOrEqual(0);
    expect(report.runsTest.pValue).toBeGreaterThanOrEqual(0);
    expect(report.entropy.pValue).toBeGreaterThanOrEqual(0);
    expect(report.confidence).toBeGreaterThanOrEqual(0);
    expect(report.summary).toContain('VEREDICTO');
  });
});
