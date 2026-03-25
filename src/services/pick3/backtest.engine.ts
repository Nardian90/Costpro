import { Pick3Result, BacktestResult, BettingConfig, IntelligencePlay } from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';

export class BacktestEngine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  public run(config: BettingConfig, initialBankroll: number, days: number = 30): BacktestResult {
    const bankrollHistory: number[] = [initialBankroll];
    let currentBankroll = initialBankroll;
    let totalBets = 0;
    let totalWins = 0;
    let winStreak = 0;
    let maxWinStreak = 0;
    let lossStreak = 0;
    let maxLossStreak = 0;
    let maxDrawdown = 0;
    let peak = initialBankroll;
    const dailyReturns: number[] = [];

    // Skip initial data for analysis context (e.g. use first 60 days for analysis, test on the rest)
    const analysisWindow = 60;
    const testData = this.history.slice(analysisWindow, analysisWindow + (days * 2)); // 2 draws per day

    testData.forEach((draw, index) => {
      // 1. Get Analysis for the state *before* this draw
      const pastHistory = this.history.slice(0, analysisWindow + index);
      const analysisEngine = new AnalysisEngine(pastHistory);
      const analysis = analysisEngine.analyze(30);
      const predictionEngine = new PredictionEngine(pastHistory, analysis);

      const predictions = predictionEngine.generatePredictions(config, config.maxCombinations || 5);

      const betPerNumber = initialBankroll * (config.riskFactor / 100); // Fixed for backtest base
      const totalExposure = betPerNumber * predictions.length;

      currentBankroll -= totalExposure;
      let wonThisDraw = false;
      let winAmount = 0;

      const resultValue = config.mode === 'LAST2'
        ? (draw.result[1] * 10) + draw.result[2]
        : (draw.result[0] * 100) + (draw.result[1] * 10) + draw.result[2];

      predictions.forEach(p => {
        const pValue = config.mode === 'LAST2'
          ? (p.combination[0] * 10) + p.combination[1]
          : (p.combination[0] * 100) + (p.combination[1] * 10) + p.combination[2];

        if (pValue === resultValue) {
          wonThisDraw = true;
          winAmount += betPerNumber * config.payout;
        }
      });

      currentBankroll += winAmount;
      bankrollHistory.push(currentBankroll);
      totalBets += predictions.length;

      const dailyReturn = (winAmount - totalExposure) / (totalExposure || 1);
      dailyReturns.push(dailyReturn);

      if (wonThisDraw) {
        totalWins++;
        winStreak++;
        lossStreak = 0;
        if (winStreak > maxWinStreak) maxWinStreak = winStreak;
      } else {
        lossStreak++;
        winStreak = 0;
        if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
      }

      if (currentBankroll > peak) peak = currentBankroll;
      const dd = (peak - currentBankroll) / (peak || 1);
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    const netProfit = currentBankroll - initialBankroll;
    const roi = (netProfit / (initialBankroll || 1)) * 100;

    // Simplified Sharpe Ratio
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1);
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (dailyReturns.length || 1);
    const stdDev = Math.sqrt(variance) || 1;
    const sharpe = (avgReturn / stdDev) * Math.sqrt(365); // Annualized approx

    return {
      id: `BT-${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      periodDays: days,
      totalBets,
      totalWins,
      hitRate: (totalWins / (testData.length || 1)) * 100,
      roi,
      netProfit,
      maxDrawdown: maxDrawdown * 100,
      sharpeRatio: sharpe,
      equityCurve: bankrollHistory,
      winStreak: maxWinStreak,
      lossStreak: maxLossStreak
    };
  }
}
