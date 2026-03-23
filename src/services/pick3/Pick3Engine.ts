import { Pick3Result, FrequencyAnalysis, StrategyConfig, IntelligencePlay, SimulationResult } from '@/types/pick3';

export class Pick3Engine {
  private history: Pick3Result[];

  constructor(history: Pick3Result[]) {
    this.history = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
        if (pos === 0 || pos === 1 || pos === 2) {
          posFreq[pos][num]++;
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

  public calculateConfidence(combination: [number, number, number], analysis: FrequencyAnalysis): number {
    let score = 0;
    const posScore = (
        analysis.positional[0][combination[0]] +
        analysis.positional[1][combination[1]] +
        analysis.positional[2][combination[2]]
    ) / (Math.max(1, this.history.length / 10));

    const gapScore = (analysis.gaps[combination[0]] + analysis.gaps[combination[1]] + analysis.gaps[combination[2]]) / 30;
    const unique = new Set(combination).size;
    const entropyScore = unique === 3 ? 1 : unique === 2 ? 0.6 : 0.2;

    score = (posScore * 0.4) + (gapScore * 0.3) + (entropyScore * 0.3);
    return Math.min(Math.max(score * 100, 0), 100);
  }

  public generatePlays(analysis: FrequencyAnalysis, count: number = 5): IntelligencePlay[] {
    const plays: IntelligencePlay[] = [];
    const topPos = [
        Object.entries(analysis.positional[0]).sort((a,b) => b[1]-a[1]).slice(0,3),
        Object.entries(analysis.positional[1]).sort((a,b) => b[1]-a[1]).slice(0,3),
        Object.entries(analysis.positional[2]).sort((a,b) => b[1]-a[1]).slice(0,3)
    ];

    for(let i=0; i<count; i++) {
        const comb: [number, number, number] = [
            parseInt(topPos[0][i % 3][0]),
            parseInt(topPos[1][(i+1) % 3][0]),
            parseInt(topPos[2][(i+2) % 3][0])
        ];
        const confidence = this.calculateConfidence(comb, analysis);
        plays.push({
            combination: comb,
            score: confidence,
            confidence: confidence,
            justification: `Alta frecuencia posicional en los últimos 30 días (${comb.join('')})`
        });
    }

    return plays.sort((a,b) => b.score - a.score);
  }

  public simulate(config: StrategyConfig): SimulationResult {
    let currentCapital = config.budget;
    const equityCurve = [currentCapital];
    let totalWins = 0;
    let maxDrawdown = 0;
    let peak = currentCapital;

    const days = config.horizonDays;
    const betsPerDay = Math.floor(currentCapital / (days * config.costPerBet)) || 1;

    for (let day = 0; day < days; day++) {
        const dailyCost = betsPerDay * config.costPerBet;
        currentCapital -= dailyCost;
        const winProb = config.riskLevel === 'high' ? 0.005 : config.riskLevel === 'medium' ? 0.002 : 0.001;
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
        probabilityOfRuin: currentCapital <= 0 ? 100 : 5
    };
  }
}
