import { Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig } from '@/types/pick3';

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

    // Weights configuration - Optimized for Pick3 / Last2
    const w = {
      freq: 0.30,
      markov: 0.35,
      trend: 0.20,
      recency: 0.15
    };

    for (let i = 0; i < universe; i++) {
      const combination = config.mode === 'LAST2'
        ? [Math.floor(i / 10), i % 10]
        : [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];

      const score = this.calculateScore(combination, config, w);

      scoredCombinations.push({
        combination,
        score,
        confidence: score, // Normalized score
        justification: this.generateJustification(combination, score, config)
      });
    }

    return scoredCombinations
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  private calculateScore(combination: number[], config: BettingConfig, w: any): number {
    let score = 0;
    const is2D = config.mode === 'LAST2';

    // 1. Frequency Score (Historical Positional)
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

    // 2. Markov Score (Transition Probability)
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

    // 3. Tendency (Mean Reversion / Gaps)
    let gapScore = 0;
    combination.forEach(num => {
      gapScore += (this.analysis.gaps[num] || 0);
    });
    gapScore = gapScore / (combination.length * 45); // Adjusted normalization

    // 4. Recency Penalty (Filter out recent repeats)
    let recencyPenalty = 0;
    const last10 = this.history.slice(0, 10);
    last10.forEach((draw, idx) => {
      const draw2D = (draw.result[1] * 10) + draw.result[2];
      const comb2D = (combination[0] * 10) + (combination[1] || 0);
      const draw3D = (draw.result[0] * 100) + (draw.result[1] * 10) + draw.result[2];
      const comb3D = (combination[0] * 100) + (combination[1] * 10) + (combination[2] || 0);

      const penaltyWeight = 1 / (idx + 1); // Older draws have less penalty

      if (is2D && draw2D === comb2D) recencyPenalty += penaltyWeight * 1.5;
      if (!is2D && draw3D === comb3D) recencyPenalty += penaltyWeight * 2.0;
    });

    // Final Weighted Score
    score = (freqScore * w.freq) + (markovScore * w.markov) + (gapScore * w.trend) - (recencyPenalty * w.recency);

    return Math.min(Math.max(score * 100, 0), 100);
  }

  private generateJustification(combination: number[], score: number, config: BettingConfig): string {
    const reasons: string[] = [];
    const is2D = config.mode === 'LAST2';

    // Core technical signals
    if (score > 80) reasons.push("Convergencia Cuántica (Score > 80)");
    else if (score > 60) reasons.push("Señal Técnica Fuerte");

    // Markov Signal
    const lastDraw = this.history[0]?.result || [0, 0, 0];
    const last2D = (lastDraw[1] * 10) + lastDraw[2];
    const current2D = (combination[0] * 10) + (combination[1] || 0);
    if (this.analysis.markovTransitions.full2D?.[last2D]?.[current2D]) {
      reasons.push("Markov 2D High Prob");
    }

    // Gap Signal
    const avgGap = combination.reduce((acc, n) => acc + (this.analysis.gaps[n] || 0), 0) / combination.length;
    if (avgGap > 25) {
      reasons.push("Reversión por Rezago (${avgGap.toFixed(0)} draws)");
    }

    // Frequency Alignment
    if (combination.every(n => this.analysis.hotNumbers.includes(n))) {
      reasons.push("Trend Following (Hot)");
    }

    if (reasons.length === 0) return "Probabilidad Base Basada en Micro-Ciclos";
    return reasons.join(" | ");
  }
}
