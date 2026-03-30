import { Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig } from '@/types/pick3';
import { LotteryMath } from './lottery.math';

/**
 * PredictionEngine v8.0 - Statistical Filtering & Law of Thirds Implementation
 */
export class PredictionEngine {
  private history: Pick3Result[];
  private analysis: AdvancedAnalysis;

  constructor(history: Pick3Result[], analysis: AdvancedAnalysis) {
    this.history = history;
    this.analysis = analysis;
  }

  public generatePredictions(config: BettingConfig, count: number = 10): IntelligencePlay[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const scoredCombinations: IntelligencePlay[] = [];

    // Weights configuration for scoring
    const w = {
      freq: 0.30,
      markov: 0.30,
      trend: 0.20,
      recency: 0.10,
      patterns: 0.10
    };

    const lastResult = this.history[0]?.result || [0, 0, 0];
    const last3 = this.history.slice(0, 3).map(d => d.result);
    const dateSum = LotteryMath.calculateDateSum(new Date().toISOString());

    // 1. Law of Thirds Filter: Identify digits to EXCLUDE
    const excludedDigits = new Set(this.analysis.lawOfThirds?.repeating.slice(0, 2) || []); // Exclude top repeaters

    // 2. Strategic Buffers
    const rd123 = LotteryMath.rundown123(lastResult).map(r => r.join(''));
    const rd317 = LotteryMath.rundown317(lastResult).map(r => r.join(''));
    const ttt = LotteryMath.generateTicTacToe(last3).map(r => r.join(''));

    for (let i = 0; i < universe; i++) {
      const combination = config.mode === 'LAST2'
        ? [Math.floor(i / 10), i % 10]
        : [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];

      // FILTER: Exclude if it contains excluded digits (Law of Thirds Filter)
      if (combination.some(d => excludedDigits.has(d))) continue;

      // FILTER: Reduce universe to a subset by discarding low-probability patterns
      const oe = combination.map(n => n % 2 === 0 ? 'E' : 'O').join('-');
      const hl = combination.map(n => n >= 5 ? 'H' : 'L').join('-');

      const oeFreq = this.analysis.patterns.oddEven[oe] || 0;
      if (oeFreq > (this.history.length * 0.20)) continue;

      let score = this.calculateScore(combination, config, w);

      // Strategy Boosters
      let strategyBoost = 0;
      let appliedStrategy = "Análisis Estadístico";
      const combStr = combination.join('');

      if (ttt.includes(combStr)) {
        strategyBoost += 20;
        appliedStrategy = "Tic-Tac-Toe Grid";
      } else if (rd123.includes(combStr)) {
        strategyBoost += 15;
        appliedStrategy = "Rundown 123";
      } else if (rd317.includes(combStr)) {
        strategyBoost += 15;
        appliedStrategy = "Rundown 317";
      } else if (LotteryMath.calculateHitSum(combination) === dateSum) {
        strategyBoost += 10;
        appliedStrategy = "Suma de Fecha";
      }

      score = (score * 0.8) + (Math.min(strategyBoost, 100) * 0.2);

      scoredCombinations.push({
        combination,
        score,
        confidence: score,
        justification: this.generateJustification(combination, score, { rd123, rd317, ttt, dateSum, oe, hl }),
        strategyLabel: appliedStrategy
      });
    }

    // Return the top 'count' (max 10)
    return scoredCombinations
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(count, 10));
  }

  private calculateScore(combination: number[], config: BettingConfig, w: any): number {
    let score = 0;

    // 1. Frequency Score
    let freqScore = 0;
    combination.forEach((num, pos) => {
      const bias = this.analysis.biasScore[num] || 0;
      freqScore += (100 + bias) / 2;
    });
    freqScore /= combination.length;

    // 2. Markov Chain Score
    const lastDraw = this.history[0]?.result || [0, 0, 0];
    let markovScore = 0;
    combination.forEach((num, pos) => {
      const prevNum = lastDraw[pos];
      const transitions = this.analysis.markovTransitions.digits[prevNum] || {};
      const total = Object.values(transitions).reduce((a, b) => a + b, 0);
      markovScore += ((transitions[num] || 0) / (total || 1)) * 100;
    });
    markovScore /= combination.length;

    // 3. Gap Analysis Score
    let gapScore = 0;
    combination.forEach(num => {
      const gap = this.analysis.gaps[num] || 0;
      if (gap > 15) gapScore += 40;
      else if (gap < 3) gapScore += 60;
      else gapScore += 80;
    });
    gapScore /= combination.length;

    score = (freqScore * w.freq) + (markovScore * w.markov) + (gapScore * w.trend);

    return Math.min(Math.max(score, 0), 100);
  }

  private generateJustification(combination: number[], score: number, ctx: any): string {
    const reasons: string[] = [];
    if (ctx.rd123.includes(combination.join(''))) reasons.push("Rundown 123");
    if (ctx.ttt.includes(combination.join(''))) reasons.push("Tic-Tac-Toe Grid");
    if (score > 80) reasons.push("Alta Prob. Estadística");
    if (reasons.length === 0) reasons.push("Filtro Ley del Tercio");

    return reasons.join(" | ");
  }
}
