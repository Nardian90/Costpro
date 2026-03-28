import { Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig } from '@/types/pick3';
import { LotteryMath } from './lottery.math';

export class PredictionEngine {
  private history: Pick3Result[];
  private analysis: AdvancedAnalysis;

  constructor(history: Pick3Result[], analysis: AdvancedAnalysis) {
    this.history = history;
    this.analysis = analysis;
  }

  public generatePredictions(config: BettingConfig, count: number = 5): IntelligencePlay[] {
    const universe = config.mode === 'LAST2' ? 100 : 1000;
    const scoredCombinations: IntelligencePlay[] = [];

    // Weights configuration - Enhanced with Strategy Patterns
    const w = {
      freq: 0.25,
      markov: 0.25,
      trend: 0.15,
      recency: 0.10,
      patterns: 0.25 // Lottodds & Strategy Patterns (Rundowns, Sums)
    };

    const lastResult = this.history[0]?.result || [0, 0, 0];
    const last3 = this.history.slice(0, 3).map(d => d.result);
    const dateSum = LotteryMath.calculateDateSum(new Date().toISOString());
    const hotNumbers = this.analysis.hotNumbers;
    const coldNumbers = this.analysis.coldNumbers;

    // Pre-calculate Rundowns from last draw
    const rd123 = LotteryMath.rundown123(lastResult).map(r => r.join(''));
    const rd317 = LotteryMath.rundown317(lastResult).map(r => r.join(''));
    const rdP1 = LotteryMath.rundownPlusOne(lastResult).map(r => r.join(''));

    // Pre-calculate Tic-Tac-Toe
    const ttt = LotteryMath.generateTicTacToe(last3).map(r => r.join(''));

    for (let i = 0; i < universe; i++) {
      const combination = config.mode === 'LAST2'
        ? [Math.floor(i / 10), i % 10]
        : [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];

      let score = this.calculateScore(combination, config, w);

      // Strategy Patterns Score Boost
      let strategyBoost = 0;
      const combStr = combination.join('');

      // 1. Rundowns match
      if (rd123.includes(combStr)) strategyBoost += 15;
      if (rd317.includes(combStr)) strategyBoost += 15;
      if (rdP1.includes(combStr)) strategyBoost += 10;

      // 2. Date Sum match (Lottery strategy)
      if (LotteryMath.calculateHitSum(combination) === dateSum) strategyBoost += 20;

      // 3. Mirror numbers match from last draw
      const mirrors = lastResult.map(n => LotteryMath.mirror(n));
      if (combination.every(n => mirrors.includes(n))) strategyBoost += 10;

      // 4. Tic-Tac-Toe match
      if (ttt.includes(combStr)) strategyBoost += 20;

      // 5. Lottodds Filters (Odd/Even & High/Low Patterns)
      const oe = combination.map(n => n % 2 === 0 ? 'E' : 'O').join('-');
      const hl = combination.map(n => n >= 5 ? 'H' : 'L').join('-');

      const oePatternFreq = this.analysis.patterns.oddEven[oe] || 0;
      const hlPatternFreq = this.analysis.patterns.highLow[hl] || 0;

      if (oePatternFreq < (this.history.length / 8)) strategyBoost += 10;
      if (hlPatternFreq < (this.history.length / 8)) strategyBoost += 10;

      score = score * (1 - w.patterns) + (Math.min(strategyBoost, 100) * w.patterns);

      scoredCombinations.push({
        combination,
        score,
        confidence: score,
        justification: this.generateJustification(combination, score, config, { rd123, rd317, rdP1, ttt, dateSum, mirrors, oe, hl })
      });
    }

    return scoredCombinations
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  private calculateScore(combination: number[], config: BettingConfig, w: any): number {
    let score = 0;
    const is2D = config.mode === 'LAST2';

    let freqScore = 0;
    if (is2D) {
      freqScore = (
        (this.analysis.positional[1][combination[0]] || 0) +
        (this.analysis.positional[2][combination[1]] || 0)
      ) / (this.history.length / 5);
    } else {
      freqScore = (
        (this.analysis.positional[0][combination[0]] || 0) +
        (this.analysis.positional[1][combination[1]] || 0) +
        (this.analysis.positional[2][combination[2]] || 0)
      ) / (this.history.length / 3.33);
    }

    let markovScore = 0;
    const lastDraw = this.history[0]?.result || [0, 0, 0];
    if (is2D) {
      const last2D = (lastDraw[1] * 10) + lastDraw[2];
      const current2D = (combination[0] * 10) + combination[1];

      if (this.analysis.markovTransitions.full2D && this.analysis.markovTransitions.full2D[last2D]) {
        markovScore = (this.analysis.markovTransitions.full2D[last2D][current2D] || 0) / 5;
      } else {
        markovScore = (
          (this.analysis.markovTransitions.digits[lastDraw[1]]?.[combination[0]] || 0) +
          (this.analysis.markovTransitions.digits[lastDraw[2]]?.[combination[1]] || 0)
        ) / 10;
      }
    } else {
       markovScore = (
          (this.analysis.markovTransitions.digits[lastDraw[0]]?.[combination[0]] || 0) +
          (this.analysis.markovTransitions.digits[lastDraw[1]]?.[combination[1]] || 0) +
          (this.analysis.markovTransitions.digits[lastDraw[2]]?.[combination[2]] || 0)
        ) / 15;
    }

    let gapScore = 0;
    combination.forEach(num => {
      gapScore += (this.analysis.gaps[num] || 0);
    });
    gapScore = gapScore / (combination.length * 45);

    let recencyPenalty = 0;
    const last10 = this.history.slice(0, 10);
    last10.forEach((draw, idx) => {
      const draw2D = (draw.result[1] * 10) + draw.result[2];
      const comb2D = (combination[0] * 10) + (combination[1] || 0);
      const draw3D = (draw.result[0] * 100) + (draw.result[1] * 10) + draw.result[2];
      const comb3D = (combination[0] * 100) + (combination[1] * 10) + (combination[2] || 0);

      const penaltyWeight = 1 / (idx + 1);

      if (is2D && draw2D === comb2D) recencyPenalty += penaltyWeight * 1.5;
      if (!is2D && draw3D === comb3D) recencyPenalty += penaltyWeight * 2.0;
    });

    score = (freqScore * w.freq) + (markovScore * w.markov) + (gapScore * w.trend) - (recencyPenalty * w.recency);

    return Math.min(Math.max(score * 100, 0), 100);
  }

  private generateJustification(combination: number[], score: number, config: BettingConfig, context: any): string {
    const reasons: string[] = [];
    const combStr = combination.join('');

    if (context.rd123.includes(combStr)) reasons.push("Rundown 1-2-3");
    if (context.rd317.includes(combStr)) reasons.push("Rundown 3-1-7");
    if (context.ttt.includes(combStr)) reasons.push("Tic-Tac-Toe Grid");
    if (LotteryMath.calculateHitSum(combination) === context.dateSum) reasons.push("Alineación Suma Fecha");
    if (combination.every(n => context.mirrors.includes(n))) reasons.push("Número Espejo (Mirror)");

    if (context.oe === 'O-O-O' || context.oe === 'E-E-E') reasons.push(`Patrón Lottodds ${context.oe}`);

    if (reasons.length === 0) {
      if (score > 60) reasons.push("Convergencia Técnica");
      else reasons.push("Micro-Ciclo Probabilístico");
    }

    return reasons.slice(0, 3).join(" | ");
  }
}
