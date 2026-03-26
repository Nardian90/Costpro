import { Pick3Result, BacktestResult, BettingConfig, IntelligencePlay } from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';
import { BankrollManager } from './bankroll.manager';

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
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;

    // Skip initial data for analysis context
    const analysisWindow = 60;
    const testData = this.history.slice(analysisWindow, analysisWindow + (days * 2));

    testData.forEach((draw, index) => {
      const pastHistory = this.history.slice(0, analysisWindow + index);
      const analysisEngine = new AnalysisEngine(pastHistory);
      const analysis = analysisEngine.analyze(30);
      const predictionEngine = new PredictionEngine(pastHistory, analysis);

      const predictions = predictionEngine.generatePredictions(config, config.maxCombinations || 5);

      let totalExposure = 0;
      const bets: { p: IntelligencePlay, size: number }[] = [];

      predictions.forEach(p => {
        // Use the new BankrollManager for adaptive bet sizing
        const betSize = BankrollManager.calculateBetSize(currentBankroll, config, p.confidence, totalWins / (totalBets || 1));
        bets.push({ p, size: betSize });
        totalExposure += betSize;
      });

      if (totalExposure > currentBankroll) {
          // Proportionally scale down if exposure > bankroll
          const scale = currentBankroll / totalExposure;
          bets.forEach(b => b.size = Math.floor(b.size * scale));
          totalExposure = currentBankroll;
      }

      currentBankroll -= totalExposure;
      let wonThisDraw = false;
      let winAmount = 0;

      const resultValue = config.mode === 'LAST2'
        ? (draw.result[1] * 10) + draw.result[2]
        : (draw.result[0] * 100) + (draw.result[1] * 10) + draw.result[2];

      bets.forEach(b => {
        const pValue = config.mode === 'LAST2'
          ? (b.p.combination[0] * 10) + b.p.combination[1]
          : (b.p.combination[0] * 100) + (b.p.combination[1] * 10) + b.p.combination[2];

        if (pValue === resultValue) {
          wonThisDraw = true;
          winAmount += b.size * config.payout;
        }
      });

      currentBankroll += winAmount;
      bankrollHistory.push(currentBankroll);
      totalBets += predictions.length;

      const netResult = winAmount - totalExposure;
      if (netResult > 0) totalGrossProfit += netResult;
      else totalGrossLoss += Math.abs(netResult);

      const dailyReturn = netResult / (totalExposure || 1);
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

    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1);
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (dailyReturns.length || 1);
    const stdDev = Math.sqrt(variance) || 1;
    const sharpe = (avgReturn / stdDev) * Math.sqrt(365);

    const downsideReturns = dailyReturns.filter(r => r < 0);
    const downsideVariance = downsideReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / (dailyReturns.length || 1);
    const downsideStdDev = Math.sqrt(downsideVariance) || 0.0001;
    const sortino = (avgReturn / downsideStdDev) * Math.sqrt(365);

    const profitFactor = totalGrossLoss === 0 ? totalGrossProfit : totalGrossProfit / totalGrossLoss;
    const annualizedReturn = (roi / 100) * (365 / days);
    const calmar = annualizedReturn / (maxDrawdown || 0.01);
    const absoluteMaxDrawdown = peak * maxDrawdown;
    const recoveryFactor = absoluteMaxDrawdown === 0 ? profitFactor : netProfit / absoluteMaxDrawdown;

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
      sortinoRatio: sortino,
      calmarRatio: calmar,
      profitFactor: profitFactor,
      recoveryFactor: recoveryFactor,
      equityCurve: bankrollHistory,
      winStreak: maxWinStreak,
      lossStreak: maxLossStreak
    };
  }
}
