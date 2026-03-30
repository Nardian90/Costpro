import { Pick3Result, AdvancedAnalysis, FrequencyAnalysis } from '@/types/pick3';

export class AnalysisEngine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  public analyze(days: number = 30): AdvancedAnalysis {
    const subset = this.history.slice(0, days * 2);
    const baseFreq = this.calculateFrequency(subset);

    const totalDigits = subset.length * 3;
    const expected = totalDigits / 10;
    const biasScore: Record<number, number> = {};
    Object.entries(baseFreq.global).forEach(([num, freq]) => {
      biasScore[parseInt(num)] = (((freq as number) - expected) / (expected || 1)) * 100;
    });

    // Markov Transitions
    const digitMarkov: Record<number, Record<number, number>> = {};
    for (let i = 0; i < 10; i++) {
      digitMarkov[i] = {};
      for (let j = 0; j < 10; j++) digitMarkov[i][j] = 1;
    }

    for (let i = 1; i < subset.length; i++) {
      const current = subset[i].result;
      const next = subset[i - 1].result;
      current.forEach((num, pos) => {
        const nextNum = next[pos];
        digitMarkov[num][nextNum]++;
      });
    }

    // Law of Thirds Analysis
    // In a cycle of 27-30 draws, 1/3 of numbers usually stay absent, 1/3 appear once, 1/3 repeat.
    const cycleSize = 30;
    const cycleSubset = this.history.slice(0, cycleSize);
    const digitCounts: Record<number, number> = {};
    for (let i = 0; i < 10; i++) digitCounts[i] = 0;

    cycleSubset.forEach(draw => {
      draw.result.forEach(n => digitCounts[n]++);
    });

    const lawOfThirds = {
      absent: [] as number[],
      appearingOnce: [] as number[],
      repeating: [] as number[]
    };

    Object.entries(digitCounts).forEach(([num, count]) => {
      const n = parseInt(num);
      if (count === 0) lawOfThirds.absent.push(n);
      else if (count === 1) lawOfThirds.appearingOnce.push(n);
      else lawOfThirds.repeating.push(n);
    });

    // Patterns
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

    return {
      ...baseFreq,
      entropy: this.calculateEntropy(baseFreq.global, totalDigits),
      biasScore,
      markovTransitions: {
        digits: digitMarkov
      },
      patterns: {
        sums,
        oddEven,
        highLow,
        lastDigitTransitions: {}
      },
      movingAverages: { global: {} },
      lawOfThirds
    };
  }

  private calculateEntropy(global: Record<number, number>, total: number): number {
    let entropy = 0;
    Object.values(global).forEach(freq => {
      if (freq > 0) {
        const p = freq / total;
        entropy -= p * Math.log2(p);
      }
    });
    return entropy;
  }

  private calculateFrequency(subset: Pick3Result[]): FrequencyAnalysis {
    const posFreq = {
      0: {} as Record<number, number>,
      1: {} as Record<number, number>,
      2: {} as Record<number, number>
    };
    const globalFreq: Record<number, number> = {};
    const gaps: Record<number, number> = {};

    for (let i = 0; i < 10; i++) {
      posFreq[0][i] = 0; posFreq[1][i] = 0; posFreq[2][i] = 0;
      globalFreq[i] = 0;
      gaps[i] = 0;
    }

    subset.forEach((draw) => {
      draw.result.forEach((num, pos) => {
        const p = pos as 0 | 1 | 2;
        posFreq[p][num] = (posFreq[p][num] || 0) + 1;
        globalFreq[num] = (globalFreq[num] || 0) + 1;
      });
    });

    const found = new Set();
    for (let i = 0; i < this.history.length; i++) {
      this.history[i].result.forEach(num => {
        if (!found.has(num)) {
          gaps[num] = Math.floor(i / 2);
          found.add(num);
        }
      });
      if (found.size === 10) break;
    }

    const sortedGlobal = Object.entries(globalFreq).sort((a, b) => (b[1] as number) - (a[1] as number));
    const hotNumbers = sortedGlobal.slice(0, 3).map(([num]) => parseInt(num));
    const coldNumbers = sortedGlobal.slice(-3).map(([num]) => parseInt(num));

    return { positional: posFreq, global: globalFreq, hotNumbers, coldNumbers, gaps };
  }
}
