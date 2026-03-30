import { Pick3Result, BacktestResult, BettingConfig, IntelligencePlay, DrawTime } from '@/types/pick3';
import { AnalysisEngine } from './analysis.engine';
import { PredictionEngine } from './prediction.engine';
import { BankrollManager } from './bankroll.manager';

/**
 * Enhanced BacktestEngine for Strategy Validation
 */
export interface ProjectionDay {
  date: string;
  draw_time: DrawTime;
  bets: { combination: number[], size: number, score: number }[];
  result: number[];
  win: boolean;
  isStraight: boolean;
  isBox: boolean;
  profit: number;
  capital: number;
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

    // Sliding window: For each draw in the last 'days', use history prior to it
    // Note: Pick 3 has 2 draws per day. 30 days = 60 draws.
    const testData = this.history.slice(-(days * 2));
    const baseHistory = this.history.slice(0, -(days * 2));

    testData.forEach((draw, index) => {
      const windowHistory = [...baseHistory, ...testData.slice(0, index)];
      // Ensure we have enough data for a valid analysis
      if (windowHistory.length < 30) return;

      const analysisEngine = new AnalysisEngine(windowHistory);
      const analysis = analysisEngine.analyze(60);
      const predictionEngine = new PredictionEngine(windowHistory, analysis);

      // CRITICAL: Top 3 recommended plays as per requirement
      const predictions = predictionEngine.generatePredictions(config, 3);

      let dailyExposure = 0;
      const bets = predictions.map(p => {
        // Use Kelly Fraccional logic from BankrollManager
        const size = BankrollManager.calculateBetSize(currentBankroll, config, p.score);
        dailyExposure += size;
        return { combination: p.combination, size, score: p.score };
      });

      // Constraint: Stay within budget
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

      bets.forEach(b => {
        const betStr = b.combination.join('');
        const betSorted = [...b.combination].sort().join('');

        // 1. Straight Match (Exact)
        if (betStr === drawStr) {
          winAmount += b.size * config.payout;
          won = true;
          isStraight = true;
        }
        // 2. Box Match (Any order) - Assume 1/6 payout for Box if not defined
        else if (betSorted === drawSorted) {
          winAmount += b.size * (config.payout / 6);
          won = true;
          isBox = true;
        }
      });

      const dailyProfit = winAmount - dailyExposure;
      currentBankroll += winAmount;

      if (draw.draw_time === 'midday') middayProfit += dailyProfit;
      else eveningProfit += dailyProfit;

      if (won) totalWins++;
      totalBets += bets.length;

      bankrollHistory.push(currentBankroll);
      if (currentBankroll > peak) peak = currentBankroll;
      const dd = peak > 0 ? (peak - currentBankroll) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;

      dailyHistory.push({
        date: draw.date,
        draw_time: draw.draw_time,
        bets,
        result: draw.result,
        win: won,
        isStraight,
        isBox,
        profit: dailyProfit,
        capital: currentBankroll
      });
    });

    const netProfit = currentBankroll - initialBankroll;
    const bestDrawTime = middayProfit >= eveningProfit ? 'midday' : 'evening';

    return {
      id: `SIM-${Date.now()}`,
      timestamp: Date.now(),
      periodDays: days,
      totalBets,
      totalWins,
      hitRate: (totalWins / (testData.length || 1)) * 100,
      roi: (netProfit / (initialBankroll || 1)) * 100,
      netProfit,
      maxDrawdown: maxDrawdown * 100,
      finalCapital: currentBankroll,
      equityCurve: bankrollHistory,
      dailyHistory,
      bestDrawTime,
      middayProfit,
      eveningProfit,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      profitFactor: totalBets > 0 ? (totalWins * config.payout) / totalBets : 0,
      recoveryFactor: 0,
      winStreak: 0,
      lossStreak: 0
    } as ModelValidationResult;
  }
}
