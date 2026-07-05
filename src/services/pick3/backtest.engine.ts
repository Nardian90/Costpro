import { Pick3Result, BacktestResult, BettingConfig, IntelligencePlay, DrawTime } from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';
import { BankrollManager } from './bankroll.manager';
import {
  computeFullQuantReport,
  calculateStreaks,
  calculateDrawdown,
  calculateRiskAdjustedRatios,
  calculateProfitability,
  calculateCAGRWithCI,
  calculateKelly,
  calculateProbabilityOfRuin,
} from './quant.metrics';
import {
  runFullStatisticalTests,
  detectRegimeChange,
} from './stat.tests';

/**
 * Enhanced BacktestEngine for Strategy Validation
 *
 * SPRINT-1-QUANT + SPRINT-1-STATS (2026-07-05)
 *
 * Refactor completo:
 *   - Sharpe, Sortino, Calmar ahora se calculan correctamente (annualizados)
 *   - Profit Factor = Σ ganancias / Σ pérdidas absolutas (era incorrecto)
 *   - Recovery Factor = Net Profit / Max Drawdown Absoluto (era 0)
 *   - Win/Loss Streaks se calculan secuencialmente (eran 0)
 *   - ROI se complementa con CAGR + intervalo de confianza 95%
 *   - Se agregan: Volatility, Downside Deviation, Expectancy, Max DD Duration
 *   - Kelly Criterion con cap anti-ruin (25%)
 *   - Probability of Ruin (Gambler's Ruin)
 *   - Tests estadísticos: Chi-cuadrado, KS, Runs Test, Entropy
 *   - Drift detection (regime change)
 *   - Heurística de overfitting: ROI > 50% + Sharpe > 3 + muestra < 60 trades → sospechoso
 */
export interface ProjectionDay {
  date: string;
  draw_time: DrawTime;
  bets: { combination: number[], size: number, score: number, strategy?: string }[];
  result: number[];
  win: boolean;
  isStraight: boolean;
  isBox: boolean;
  profit: number;
  capital: number;
  winningStrategy?: string;
}

export interface ModelValidationResult extends BacktestResult {
  dailyHistory: ProjectionDay[];
  bestDrawTime: DrawTime;
  middayProfit: number;
  eveningProfit: number;
  finalCapital: number;
}

export class BacktestEngine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  public run(config: BettingConfig, initialBankroll: number, days: number = 30): BacktestResult {
    const result = this.runValidation(config, initialBankroll, days);
    return result as BacktestResult;
  }

  public runValidation(config: BettingConfig, initialBankroll: number, days: number = 30): ModelValidationResult {
    const bankrollHistory: number[] = [initialBankroll];
    const pnlSeries: number[] = [];
    let currentBankroll = initialBankroll;
    let totalBets = 0;
    let totalWins = 0;

    const dailyHistory: ProjectionDay[] = [];
    let middayProfit = 0;
    let eveningProfit = 0;

    const testData = this.history.slice(-(days * 2));
    const baseHistory = this.history.slice(0, -(days * 2));

    testData.forEach((draw, index) => {
      const windowHistory = [...baseHistory, ...testData.slice(0, index)];
      if (windowHistory.length < 30) return;

      const analysisEngine = new AnalysisEngine(windowHistory);
      const analysis = analysisEngine.analyze(60);
      const predictionEngine = new PredictionEngine(windowHistory, analysis);

      const predictions = predictionEngine.generatePredictions(config, 3);

      let dailyExposure = 0;
      const bets = predictions.map(p => {
        const size = BankrollManager.calculateBetSize(currentBankroll, config, p.score);
        dailyExposure += size;
        return { combination: p.combination, size, score: p.score, strategy: p.strategyLabel };
      });

      if (dailyExposure > currentBankroll && currentBankroll > 0) {
        const scale = currentBankroll / dailyExposure;
        bets.forEach(b => b.size = Math.max(1, Math.floor(b.size * scale)));
        dailyExposure = bets.reduce((acc, b) => acc + b.size, 0);
      }

      currentBankroll -= dailyExposure;

      const drawValue = config.mode === 'LAST2'
        ? draw.result.slice(1)
        : draw.result;

      const drawStr = drawValue.join('');
      const drawSorted = [...drawValue].sort().join('');

      let winAmount = 0;
      let won = false;
      let isStraight = false;
      let isBox = false;
      let winningStrategy = "";

      bets.forEach(b => {
        const betStr = b.combination.join('');
        const betSorted = [...b.combination].sort().join('');

        if (betStr === drawStr) {
          winAmount += b.size * config.payout;
          won = true;
          isStraight = true;
          winningStrategy = b.strategy || "";
        }
        else if (betSorted === drawSorted) {
          winAmount += b.size * (config.payout / 6);
          won = true;
          isBox = true;
          winningStrategy = b.strategy || "";
        }
      });

      const dailyProfit = winAmount - dailyExposure;
      currentBankroll += winAmount;
      pnlSeries.push(dailyProfit);

      if (draw.draw_time === 'midday') middayProfit += dailyProfit;
      else eveningProfit += dailyProfit;

      if (won) totalWins++;
      totalBets += bets.length;

      bankrollHistory.push(currentBankroll);

      dailyHistory.push({
        date: draw.date,
        draw_time: draw.draw_time,
        bets,
        result: draw.result,
        win: won,
        isStraight,
        isBox,
        profit: dailyProfit,
        capital: currentBankroll,
        winningStrategy
      });
    });

    const netProfit = currentBankroll - initialBankroll;
    const bestDrawTime = middayProfit >= eveningProfit ? 'midday' : 'evening';

    // ====== SPRINT-1-QUANT: Cálculos cuantitativos correctos ======
    const trades = pnlSeries.map((pnl, i) => ({
      pnl,
      equity: bankrollHistory[i + 1] || initialBankroll,
    }));

    const streaks = calculateStreaks(trades);
    const drawdown = calculateDrawdown(bankrollHistory);
    const ratios = calculateRiskAdjustedRatios(
      trades,
      bankrollHistory,
      0, // risk-free rate = 0 (lotería)
      initialBankroll,
      days,
    );
    const profitability = calculateProfitability(trades, bankrollHistory, initialBankroll);
    const cagr = calculateCAGRWithCI(initialBankroll, currentBankroll, days, trades);

    // Estimación de winProbability para Kelly y PoR
    // Win rate por apuesta (no por día): si hoy apostamos 3 combinaciones y acertamos 1, winProb = 1/3.
    // A nivel global usamos hitRate como proxy conservador.
    const winProbForKelly = totalBets > 0 ? totalWins / totalBets : 0;
    const kelly = calculateKelly(initialBankroll, winProbForKelly, config.payout);
    const por = calculateProbabilityOfRuin(winProbForKelly, initialBankroll, config.payout);

    // ====== SPRINT-1-STATS: Tests estadísticos ======
    const statsTests = runFullStatisticalTests(this.history);
    const regimeChange = detectRegimeChange(this.history, 30, 50);

    // ====== Heurística de overfitting ======
    // ROI > 50% + Sharpe > 3 + muestra < 60 trades → MUY sospechoso
    // ROI > 100% en cualquier caso → revisar
    const isOverfitting =
      (result_roi() > 100 && trades.length < 60) ||
      (ratios.sharpe > 3 && profitability.profitFactor > 3 && trades.length < 100);

    function result_roi() {
      return (netProfit / (initialBankroll || 1)) * 100;
    }

    return {
      id: `SIM-${Date.now()}`,
      timestamp: Date.now(),
      periodDays: days,
      totalBets,
      totalWins,
      hitRate: (totalWins / (testData.length || 1)) * 100,
      roi: result_roi(),
      netProfit,
      maxDrawdown: drawdown.maxDrawdownPct,
      finalCapital: currentBankroll,
      equityCurve: bankrollHistory,
      dailyHistory,
      bestDrawTime,
      middayProfit,
      eveningProfit,
      // === SPRINT-1-QUANT: Métricas correctas ===
      sharpeRatio: ratios.sharpe,
      sortinoRatio: ratios.sortino,
      calmarRatio: ratios.calmar,
      profitFactor: isFinite(profitability.profitFactor) ? profitability.profitFactor : 999,
      recoveryFactor: profitability.recoveryFactor,
      winStreak: streaks.maxWinStreak,
      lossStreak: streaks.maxLossStreak,
      // Nuevas métricas
      cagr: cagr.cagr,
      cagrConfidenceInterval: cagr.ci95,
      totalReturn: cagr.totalReturn,
      volatility: ratios.volatility,
      downsideDeviation: ratios.downsideDeviation,
      grossProfit: profitability.grossProfit,
      grossLoss: profitability.grossLoss,
      expectancy: profitability.expectancy,
      maxDrawdownDuration: drawdown.maxDrawdownDuration,
      probabilityOfRuin: por,
      kellyFraction: kelly.safeKelly,
      kellyEdge: kelly.edge,
      isOverfitting,
      // === SPRINT-1-STATS: Tests estadísticos ===
      statisticalTests: {
        chiSquare: {
          statistic: statsTests.chiSquare.statistic,
          pValue: statsTests.chiSquare.pValue,
          isSignificant: statsTests.chiSquare.isSignificant,
          interpretation: statsTests.chiSquare.interpretation,
        },
        kolmogorovSmirnov: {
          statistic: statsTests.kolmogorovSmirnov.statistic,
          pValue: statsTests.kolmogorovSmirnov.pValue,
          isSignificant: statsTests.kolmogorovSmirnov.isSignificant,
          interpretation: statsTests.kolmogorovSmirnov.interpretation,
        },
        runsTest: {
          statistic: statsTests.runsTest.statistic,
          pValue: statsTests.runsTest.pValue,
          isSignificant: statsTests.runsTest.isSignificant,
          interpretation: statsTests.runsTest.interpretation,
        },
        entropy: {
          statistic: statsTests.entropy.statistic,
          pValue: statsTests.entropy.pValue,
          isSignificant: statsTests.entropy.isSignificant,
          interpretation: statsTests.entropy.interpretation,
        },
        isRandom: statsTests.isRandom,
        confidence: statsTests.confidence,
        summary: statsTests.summary,
      },
      regimeChange: {
        driftDetected: regimeChange.driftDetected,
        driftPoint: regimeChange.driftPoint,
        magnitude: regimeChange.magnitude,
        description: regimeChange.description,
      },
    } as ModelValidationResult;
  }
}
