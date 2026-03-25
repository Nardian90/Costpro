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

    // Weights configuration
    const w = {
      freq: 0.35,
      markov: 0.35,
      trend: 0.20,
      recency: 0.10
    };

    for (let i = 0; i < universe; i++) {
      const combination = config.mode === 'LAST2'
        ? [Math.floor(i / 10), i % 10]
        : [Math.floor(i / 100), Math.floor((i % 100) / 10), i % 10];

      const score = this.calculateScore(combination, config, w);

      scoredCombinations.push({
        combination,
        score,
        confidence: score, // Simplified for now, could be normalized
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

    // 1. Frequency Score (Historical)
    let freqScore = 0;
    if (is2D) {
      // Average frequency of the two digits
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

    // 2. Markov Score
    let markovScore = 0;
    const lastDraw = this.history[0]?.result || [0, 0, 0];
    if (is2D) {
      const last2D = (lastDraw[1] * 10) + lastDraw[2];
      const current2D = (combination[0] * 10) + combination[1];

      if (this.analysis.markovTransitions.full2D && this.analysis.markovTransitions.full2D[last2D]) {
        markovScore = (this.analysis.markovTransitions.full2D[last2D][current2D] || 0) / 5;
      } else {
        // Fallback to digit-level Markov
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
    gapScore = gapScore / (combination.length * 30); // Normalized by 30 days

    // 4. Recency Penalty
    let recencyPenalty = 0;
    const last3 = this.history.slice(0, 3);
    last3.forEach(draw => {
      const draw2D = (draw.result[1] * 10) + draw.result[2];
      const comb2D = (combination[0] * 10) + (combination[1] || 0);
      if (is2D && draw2D === comb2D) recencyPenalty += 0.5;
      // For 3D we could check exact match
      const draw3D = (draw.result[0] * 100) + (draw.result[1] * 10) + draw.result[2];
      const comb3D = (combination[0] * 100) + (combination[1] * 10) + combination[2];
      if (!is2D && draw3D === comb3D) recencyPenalty += 1.0;
    });

    score = (freqScore * w.freq) + (markovScore * w.markov) + (gapScore * w.trend) - (recencyPenalty * w.recency);

    return Math.min(Math.max(score * 100, 0), 100);
  }

  private generateJustification(combination: number[], score: number, config: BettingConfig): string {
    const reasons: string[] = [];
    if (score > 70) reasons.push("Fuerte Señal Predictiva");
    if (score > 85) reasons.push("Convergencia Cuántica");

    // Check specific drivers
    const is2D = config.mode === 'LAST2';
    const lastDraw = this.history[0]?.result || [0, 0, 0];
    const last2D = (lastDraw[1] * 10) + lastDraw[2];
    const current2D = (combination[0] * 10) + (combination[1] || 0);

    if (this.analysis.markovTransitions.full2D?.[last2D]?.[current2D]) {
      reasons.push("Alta Probabilidad Markov (2D)");
    }

    if (combination.every(n => this.analysis.hotNumbers.includes(n))) {
      reasons.push("Alineación con Números Calientes");
    }

    if (reasons.length === 0) return "Tendencia Probabilística Estándar";
    return reasons.join(" + ");
  }
}
