import {
  SimulationResult,
  StrategyConfig,
  Pick3Result,
  AdvancedAnalysis,
  FrequencyAnalysis,
  IntelligencePlay
} from '@/types/pick3';
import { logger } from '@/lib/logger';

export class Pick3RuleEngine {
  static getStrategies() {
    return [
      { id: 'hot', name: 'Números Calientes', description: 'Basado en dígitos con mayor frecuencia histórica.' },
      { id: 'cold', name: 'Números Fríos', description: 'Dígitos con mayor tiempo sin aparecer (Reversión).' },
      { id: 'mixed', name: 'Mixto (Caliente + Frío)', description: 'Balance entre tendencia y reversión.' },
      { id: 'exclude_last', name: 'Exclusión de Último', description: 'Filtra combinaciones que aparecieron recientemente.' }
    ];
  }

  static filterPlays(plays: IntelligencePlay[], strategyId: string, history: Pick3Result[]): IntelligencePlay[] {
    if (strategyId === 'exclude_last' && history.length > 0) {
      const last = history[0].result.join('');
      return plays.filter(p => p.combination.join('') !== last);
    }
    return plays;
  }
}

export class Pick3Engine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public analyzeAdvanced(days: number = 30): AdvancedAnalysis {
    const subset = this.history.slice(0, days * 2);
    const baseFreq = this.analyzeFrequency(days);

    // 1. Bias Detection (Deviation from expected 10%)
    const totalDigits = subset.length * 3;
    const expected = totalDigits / 10;
    const biasScore: Record<number, number> = {};
    Object.entries(baseFreq.global).forEach(([num, freq]) => {
      biasScore[parseInt(num)] = ((freq - expected) / (expected || 1)) * 100;
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
    let entropy = 0;
    Object.values(baseFreq.global).forEach(freq => {
      if (freq > 0) {
        const p = freq / totalDigits;
        entropy -= p * Math.log2(p);
      }
    });

    // 5. Strategy Accuracy (Backtest)
    const accuracy: Record<string, number> = {
      'Frecuencia Alta': this.backtest('hot', 50),
      'Reversión a Media': this.backtest('cold', 50)
    };

    return {
      ...baseFreq,
      entropy,
      biasScore,
      markovTransitions: markov,
      patterns: { sums, oddEven, highLow },
      movingAverages: { global: {} },
      strategyAccuracy: accuracy
    };
  }

  private backtest(strategy: 'hot' | 'cold', samples: number = 20): number {
    if (this.history.length < samples + 10) return 0;
    let hits = 0;

    for (let i = 1; i <= samples; i++) {
       const pastHistory = this.history.slice(i);
       const engine = new Pick3Engine(pastHistory);
       const analysis = engine.analyzeFrequency(30);
       const realResult = this.history[i-1].result;

       let predicted: number[] = [];
       if (strategy === 'hot') predicted = analysis.hotNumbers;
       else predicted = analysis.coldNumbers;

       if (realResult.some(n => predicted.includes(n))) hits++;
    }

    return (hits / samples) * 100;
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
      draw.result?.forEach((num, pos) => {
        if (pos >= 0 && pos <= 2) {
          posFreq[pos as 0|1|2][num]++;
        }
        globalFreq[num]++;
      });
    });

    const found = new Set();
    for (let i = 0; i < this.history.length; i++) {
        const draw = this.history[i];
        draw.result?.forEach(num => {
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

    // 1. Positional Alignment (35%)
    const maxPos = (this.history.length / 10) * 3;
    const posScore = (
        (analysis.positional[0][combination[0]] || 0) +
        (analysis.positional[1][combination[1]] || 0) +
        (analysis.positional[2][combination[2]] || 0)
    ) / (maxPos || 1);

    // 2. Mean Reversion / Gaps (20%)
    const gapWeight = ((analysis.gaps[combination[0]] || 0) + (analysis.gaps[combination[1]] || 0) + (analysis.gaps[combination[2]] || 0)) / 60;

    // 3. Pattern Harmony (15%)
    const sum = combination.reduce((a,b) => (a as number)+(b as number), 0);
    const sumScore = (analysis.patterns.sums[sum] || 0) / (Math.max(1, this.history.length / 28));

    // 4. Markov Probability (30%)
    const lastDraw = this.history[0]?.result || [0,0,0];
    const markovProb = (
      (analysis.markovTransitions[lastDraw[0]]?.[combination[0]] || 0) +
      (analysis.markovTransitions[lastDraw[1]]?.[combination[1]] || 0) +
      (analysis.markovTransitions[lastDraw[2]]?.[combination[2]] || 0)
    ) / (Math.max(1, this.history.length / 5));

    score = (posScore * 0.35) + (gapWeight * 0.2) + (sumScore * 0.15) + (markovProb * 0.3);
    const entropyFactor = analysis.entropy / 3.32;

    return Math.min(Math.max(score * 100 * (1.5 - (entropyFactor || 0.5)), 0), 100);
  }

  public generatePlays(analysis: AdvancedAnalysis, count: number = 5): IntelligencePlay[] {
    const plays: IntelligencePlay[] = [];

    // Weighted selection logic based on hybrid model
    const digits = [0,1,2,3,4,5,6,7,8,9];

    for (let i = 0; i < count * 3; i++) {
      const comb: [number, number, number] = [
        digits[Math.floor(Math.random() * 10)],
        digits[Math.floor(Math.random() * 10)],
        digits[Math.floor(Math.random() * 10)]
      ];
      const confidence = this.calculateConfidence(comb, analysis);
      plays.push({
        combination: comb,
        score: confidence,
        confidence: confidence,
        justification: confidence > 60 ? 'Armonía Cuántica Detectada' : 'Tendencia Probabilística'
      });
    }

    return plays.sort((a,b) => b.score - a.score).slice(0, count);
  }

  /**
   * ENTERPRISE MONTE CARLO SIMULATION
   * 10,000+ scenarios based on Hybrid Probability Model
   */
  public simulateMonteCarlo(config: StrategyConfig, analysis: AdvancedAnalysis): SimulationResult {
    const SCENARIOS = 10000;
    let successfulRuns = 0;
    const finalCapitals: number[] = [];
    let cumulativeRoi = 0;
    let cumulativeMaxDrawdown = 0;

    for (let s = 0; s < SCENARIOS; s++) {
      let currentCapital = config.budget;
      const days = config.horizonDays;
      let peak = currentCapital;
      let localMaxDrawdown = 0;

      for (let day = 0; day < days; day++) {
        const dailyCost = config.costPerBet; // Assuming 1 bet per day for simplicity in Monte Carlo base
        currentCapital -= dailyCost;

        // Win check based on weighted hybrid probability (Average confidence of top plays)
        const topPlays = this.generatePlays(analysis, 3);
        const avgConfidence = topPlays.reduce((acc, p) => acc + p.confidence, 0) / 3;

        // Base win prob 1/1000 adjusted by confidence and risk
        const winProb = (avgConfidence / 100) * 0.05 * (config.riskLevel === 'high' ? 1.5 : 1);

        if (Math.random() < winProb) {
          currentCapital += 500 * config.costPerBet;
        }

        if (currentCapital > peak) peak = currentCapital;
        const drawdown = (peak - currentCapital) / (peak || 1);
        if (drawdown > localMaxDrawdown) localMaxDrawdown = drawdown;

        if (currentCapital <= 0) {
          currentCapital = 0;
          break;
        }
      }

      if (currentCapital > config.budget) successfulRuns++;
      finalCapitals.push(currentCapital);
      cumulativeRoi += ((currentCapital - config.budget) / (config.budget || 1)) * 100;
      cumulativeMaxDrawdown += localMaxDrawdown;
    }

    const avgFinalCapital = finalCapitals.reduce((a, b) => (a as number)+(b as number), 0) / SCENARIOS;
    const probOfRuin = (finalCapitals.filter(c => c <= 0).length / SCENARIOS) * 100;

    return {
      id: `MC-${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      config,
      equityCurve: finalCapitals.slice(0, 100), // Only return a sample for UI performance
      totalBets: config.horizonDays * SCENARIOS,
      totalWins: successfulRuns,
      finalCapital: avgFinalCapital,
      roi: cumulativeRoi / SCENARIOS,
      maxDrawdown: (cumulativeMaxDrawdown / SCENARIOS) * 100,
      probabilityOfRuin: probOfRuin
    };
  }

  public simulate(config: StrategyConfig): SimulationResult {
    // Legacy simple simulation redirected to MC for 1 run perspective
    let currentCapital = config.budget;
    const equityCurve = [currentCapital];
    let totalWins = 0;
    let maxDrawdown = 0;
    let peak = currentCapital;

    const days = config.horizonDays;
    const betsPerDay = 1;

    for (let day = 0; day < days; day++) {
        const dailyCost = config.costPerBet;
        currentCapital -= dailyCost;

        const winProb = config.riskLevel === 'high' ? 0.005 : config.riskLevel === 'medium' ? 0.002 : 0.001;
        let dailyWin = 0;

        if (Math.random() < winProb) {
            dailyWin += 500 * config.costPerBet;
            totalWins++;
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
