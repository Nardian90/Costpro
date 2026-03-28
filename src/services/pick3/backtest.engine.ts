import { Pick3Result, BacktestResult, BettingConfig, IntelligencePlay, DrawTime } from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';
import { BankrollManager } from './bankroll.manager';

export interface ProjectionDay {
  date: string;
  draw_time: DrawTime;
  bets: { combination: number[], size: number, score: number }[];
  result: number[];
  win: boolean;
  profit: number;
  capital: number;
}

export interface ModelValidationResult extends BacktestResult {
  dailyHistory: ProjectionDay[];
  bestDrawTime: DrawTime;
  middayProfit: number;
  eveningProfit: number;
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
    let currentBankroll = initialBankroll;
    let totalBets = 0;
    let totalWins = 0;
    let peak = initialBankroll;
    let maxDrawdown = 0;

    const dailyHistory: ProjectionDay[] = [];
    let middayProfit = 0;
    let eveningProfit = 0;

    const testData = this.history.slice(-(days * 2));
    const baseHistory = this.history.slice(0, -(days * 2));

    testData.forEach((draw, index) => {
      const currentWindow = [...baseHistory, ...testData.slice(0, index)];
      const analysisEngine = new AnalysisEngine(currentWindow);
      const analysis = analysisEngine.analyze(60);
      const predictionEngine = new PredictionEngine(currentWindow, analysis);

      const predictions = predictionEngine.generatePredictions(config, 3);

      let totalExposure = 0;
      const bets = predictions.map(p => {
        const size = BankrollManager.calculateBetSize(currentBankroll, config, p.score);
        totalExposure += size;
        return { combination: p.combination, size, score: p.score };
      });

      if (totalExposure > currentBankroll) {
        const scale = currentBankroll / totalExposure;
        bets.forEach(b => b.size = Math.max(1, Math.floor(b.size * scale)));
        totalExposure = bets.reduce((acc, b) => acc + b.size, 0);
      }

      currentBankroll -= totalExposure;

      const drawValue = config.mode === 'LAST2'
        ? draw.result[1] * 10 + draw.result[2]
        : draw.result[0] * 100 + draw.result[1] * 10 + draw.result[2];

      let winAmount = 0;
      let won = false;

      bets.forEach(b => {
        const betValue = config.mode === 'LAST2'
          ? b.combination[0] * 10 + b.combination[1]
          : b.combination[0] * 100 + b.combination[1] * 10 + b.combination[2];

        if (betValue === drawValue) {
          winAmount += b.size * config.payout;
          won = true;
        }
      });

      const profit = winAmount - totalExposure;
      currentBankroll += winAmount;

      if (draw.draw_time === 'midday') middayProfit += profit;
      else eveningProfit += profit;

      if (won) totalWins++;
      totalBets += bets.length;

      bankrollHistory.push(currentBankroll);
      if (currentBankroll > peak) peak = currentBankroll;
      const dd = (peak - currentBankroll) / (peak || 1);
      if (dd > maxDrawdown) maxDrawdown = dd;

      dailyHistory.push({
        date: draw.date,
        draw_time: draw.draw_time,
        bets,
        result: draw.result,
        win: won,
        profit,
        capital: currentBankroll
      });
    });

    const netProfit = currentBankroll - initialBankroll;
    const bestDrawTime = middayProfit >= eveningProfit ? 'midday' : 'evening';

    // Casting to satisfy the compiler if it doesn't see BacktestResult fields correctly
    return {
      id: `VAL-${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      periodDays: days,
      totalBets,
      totalWins,
      hitRate: (totalWins / (testData.length || 1)) * 100,
      roi: (netProfit / (initialBankroll || 1)) * 100,
      netProfit,
      maxDrawdown: maxDrawdown * 100,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      profitFactor: 0,
      recoveryFactor: 0,
      equityCurve: bankrollHistory,
      winStreak: 0,
      lossStreak: 0,
      dailyHistory,
      bestDrawTime,
      middayProfit,
      eveningProfit
    } as ModelValidationResult;
  }
}
