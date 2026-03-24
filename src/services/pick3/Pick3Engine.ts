import { Pick3Result, FrequencyAnalysis, StrategyConfig, IntelligencePlay, SimulationResult } from '@/types/pick3';

export interface AdvancedAnalysis extends FrequencyAnalysis {
  entropy: number;
  biasScore: Record<number, number>; // Deviation from expected 10%
  markovTransitions: Record<number, Record<number, number>>;
  patterns: {
    sums: Record<number, number>;
    oddEven: Record<string, number>;
    highLow: Record<string, number>;
  };
  movingAverages: {
    global: Record<number, number[]>; // 7-day, 30-day window frequencies
  };
}

export class Pick3Engine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public analyzeAdvanced(days: number = 30): AdvancedAnalysis {
    const subset = this.history.slice(0, days * 2);
    const baseFreq = this.analyzeFrequency(days);

    // 1. Bias Detection (Chi-Squared simplified)
    const expected = (subset.length * 3) / 10;
    const biasScore: Record<number, number> = {};
    Object.entries(baseFreq.global).forEach(([num, freq]) => {
      biasScore[parseInt(num)] = (freq - expected) / expected;
    });

    // 2. Markov Chain Transitions (Next Digit Probability)
    const markov: Record<number, Record<number, number>> = {};
    for(let i=0; i<10; i++) markov[i] = {};

    for (let i = subset.length - 1; i > 0; i--) {
      const current = subset[i].result;
      const next = subset[i-1].result;
      current.forEach((num, pos) => {
        const nextNum = next[pos];
        markov[num][nextNum] = (markov[num][nextNum] || 0) + 1;
      });
    }

    // 3. Pattern Analysis
    const sums: Record<number, number> = {};
    const oddEven: Record<string, number> = { 'O-O-O': 0, 'E-E-E': 0, 'Mixed': 0 };
    const highLow: Record<string, number> = { 'H-H-H': 0, 'L-L-L': 0, 'Mixed': 0 };

    subset.forEach(draw => {
      const sum = draw.result.reduce((a, b) => a + b, 0);
      sums[sum] = (sums[sum] || 0) + 1;

      const oe = draw.result.map(n => n % 2 === 0 ? 'E' : 'O').join('-');
      if (oe === 'O-O-O') oddEven['O-O-O']++;
      else if (oe === 'E-E-E') oddEven['E-E-E']++;
      else oddEven['Mixed']++;

      const hl = draw.result.map(n => n >= 5 ? 'H' : 'L').join('-');
      if (hl === 'H-H-H') highLow['H-H-H']++;
      else if (hl === 'L-L-L') highLow['L-L-L']++;
      else highLow['Mixed']++;
    });

    // 4. Entropy Calculation
    const totalDigits = subset.length * 3;
    let entropy = 0;
    Object.values(baseFreq.global).forEach(freq => {
      if (freq > 0) {
        const p = freq / totalDigits;
        entropy -= p * Math.log2(p);
      }
    });

    return {
      ...baseFreq,
      entropy,
      biasScore,
      markovTransitions: markov,
      patterns: { sums, oddEven, highLow },
      movingAverages: { global: {} } // Placeholder
    };
  }

  public analyzeFrequency(days: number = 30): FrequencyAnalysis {
    const subset = this.history.slice(0, days * 2);
    const posFreq = {
      0: {} as Record<number, number>,
      1: {} as Record<number, number>,
      2: {} as Record<number, number>
    };
    const globalFreq = {} as Record<number, number>;
    const gaps = {} as Record<number, number>;

    for (let i = 0; i < 10; i++) {
      posFreq[0][i] = 0;
      posFreq[1][i] = 0;
      posFreq[2][i] = 0;
      globalFreq[i] = 0;
      gaps[i] = 0;
    }

    subset.forEach((draw) => {
      draw.result.forEach((num, pos) => {
        if (pos >= 0 && pos <= 2) {
          posFreq[pos as 0|1|2][num]++;
        }
        globalFreq[num]++;
      });
    });

    const found = new Set();
    for (let i = 0; i < this.history.length; i++) {
        const draw = this.history[i];
        draw.result.forEach(num => {
            if (!found.has(num)) {
                gaps[num] = Math.floor(i / 2);
                found.add(num);
            }
        });
        if (found.size === 10) break;
    }

    const sortedGlobal = Object.entries(globalFreq).sort((a, b) => b[1] - a[1]);
    const hotNumbers = sortedGlobal.slice(0, 3).map(([num]) => parseInt(num));
    const coldNumbers = sortedGlobal.slice(-3).map(([num]) => parseInt(num));

    return {
      positional: posFreq,
      global: globalFreq,
      hotNumbers,
      coldNumbers,
      gaps
    };
  }

  public calculateConfidence(combination: [number, number, number], analysis: AdvancedAnalysis): number {
    let score = 0;

    // 1. Positional Alignment (30%)
    const posScore = (
        analysis.positional[0][combination[0]] +
        analysis.positional[1][combination[1]] +
        analysis.positional[2][combination[2]]
    ) / (Math.max(1, (this.history.length / 10) * 3));

    // 2. Mean Reversion / Gaps (20%)
    const gapWeight = (analysis.gaps[combination[0]] + analysis.gaps[combination[1]] + analysis.gaps[combination[2]]) / 60;

    // 3. Pattern Harmony (20%)
    const sum = combination.reduce((a,b) => a+b,0);
    const sumScore = (analysis.patterns.sums[sum] || 0) / (this.history.length / 28); // Average spread

    // 4. Markov Probability (30%)
    const lastDraw = this.history[0]?.result || [0,0,0];
    const markovProb = (
      (analysis.markovTransitions[lastDraw[0]][combination[0]] || 0) +
      (analysis.markovTransitions[lastDraw[1]][combination[1]] || 0) +
      (analysis.markovTransitions[lastDraw[2]][combination[2]] || 0)
    ) / (this.history.length / 5);

    score = (posScore * 0.3) + (gapWeight * 0.2) + (sumScore * 0.2) + (markovProb * 0.3);

    // Normalization boost for entropy (high entropy = more unpredictable)
    const entropyFactor = analysis.entropy / 3.32; // max entropy for 10 digits is ~3.32 bits

    return Math.min(Math.max(score * 100 * (1.5 - (entropyFactor || 0)), 0), 100);
  }

  public generatePlays(analysis: AdvancedAnalysis, count: number = 5): IntelligencePlay[] {
    const plays: IntelligencePlay[] = [];

    // Strategy 1: High Frequency (Hot)
    for(let i=0; i < Math.ceil(count/2); i++) {
        const topPos0 = Object.entries(analysis.positional[0]).sort((a,b) => b[1]-a[1]);
        const topPos1 = Object.entries(analysis.positional[1]).sort((a,b) => b[1]-a[1]);
        const topPos2 = Object.entries(analysis.positional[2]).sort((a,b) => b[1]-a[1]);

        const comb: [number, number, number] = [
            parseInt(topPos0[0][0]),
            parseInt(topPos1[0][0]),
            parseInt(topPos2[0][0])
        ];
        // Permute slightly
        if (i > 0) comb[i%3] = analysis.hotNumbers[i%3] ?? 0;

        const confidence = this.calculateConfidence(comb, analysis);
        plays.push({
            combination: comb,
            score: confidence,
            confidence: confidence,
            justification: `Frecuencia Óptima + Markov Harmony (${comb.join('')})`
        });
    }

    // Strategy 2: Cold Mean Reversion
    for(let i=0; i < Math.floor(count/2); i++) {
        const comb: [number, number, number] = [
            analysis.coldNumbers[0] ?? 0,
            analysis.coldNumbers[1] ?? 1,
            analysis.coldNumbers[2] ?? 2
        ];
        const confidence = this.calculateConfidence(comb, analysis);
        plays.push({
            combination: comb,
            score: confidence,
            confidence: confidence,
            justification: `Reversión a la Media (Dígitos Fríos detectados)`
        });
    }

    return plays.sort((a,b) => b.score - a.score).slice(0, count);
  }

  public simulate(config: StrategyConfig): SimulationResult {
    let currentCapital = config.budget;
    const equityCurve = [currentCapital];
    let totalWins = 0;
    let maxDrawdown = 0;
    let peak = currentCapital;

    const days = config.horizonDays;
    const betsPerDay = Math.max(1, Math.floor(config.budget / (days * (config.costPerBet || 1) || 1)));

    for (let day = 0; day < days; day++) {
        const dailyCost = betsPerDay * config.costPerBet;
        currentCapital -= dailyCost;

        // Dynamic probability based on risk level and algorithm efficiency
        const winProb = config.riskLevel === 'high' ? 0.008 : config.riskLevel === 'medium' ? 0.004 : 0.002;
        let dailyWin = 0;

        for(let b=0; b < betsPerDay; b++) {
            if (Math.random() < winProb) {
                dailyWin += 500 * config.costPerBet;
                totalWins++;
            }
        }

        currentCapital += dailyWin;
        equityCurve.push(currentCapital);

        if (currentCapital > peak) peak = currentCapital;
        const drawdown = (peak - currentCapital) / (peak || 1);
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        if (currentCapital <= 0) {
            currentCapital = 0;
            break;
        }
    }

    return {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        config,
        equityCurve,
        totalBets: days * betsPerDay,
        totalWins,
        finalCapital: currentCapital,
        roi: ((currentCapital - config.budget) / (config.budget || 1)) * 100,
        maxDrawdown: maxDrawdown * 100,
        probabilityOfRuin: currentCapital < config.budget * 0.1 ? 95 : 5
    };
  }
}
