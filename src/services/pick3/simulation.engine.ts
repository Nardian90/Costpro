import crypto from 'crypto';
import { SimulationResult, StrategyConfig, BettingConfig, BacktestResult, Pick3Result } from '@/types/pick3';
import { PredictionEngine } from './prediction.engine';
import { AnalysisEngine } from './analysis.engine';

export class SimulationEngine {
  public static runMonteCarlo(
    config: StrategyConfig,
    backtest: BacktestResult,
    iterations: number = 10000
  ): SimulationResult {
    const SCENARIOS = iterations;
    const finalCapitals: number[] = [];
    const ruinCounts: number[] = [];
    let cumulativeRoi = 0;
    let maxDrawdownTotal = 0;
    let totalRecoveryTime = 0;
    let recoverySuccessCount = 0;

    const bConfig = config.bettingConfig || {
      mode: 'LAST2',
      payout: 90,
      digits: 2,
      maxCombinations: 5,
      riskFactor: 1,
      stopLoss: -30,
      criticalDrawdown: -20
    };

    // Empirical hit rate from backtest
    const hitRate = backtest.hitRate / 100;
    // Streak distribution could be more complex, here we simplify to hit probability per draw
    const dailyReturns = backtest.equityCurve.map((val, i, arr) => i === 0 ? 0 : (val - arr[i-1]) / (arr[i-1] || 1));

    for (let s = 0; s < SCENARIOS; s++) {
      let currentCapital = config.budget;
      let peak = currentCapital;
      let scenarioMaxDrawdown = 0;
      let isRuined = false;
      let inDrawdown = false;
      let drawdownStartDay = 0;

      for (let day = 0; day < config.horizonDays; day++) {
        const randomIndex = Math.floor(Math.random() * dailyReturns.length);
        const dailyReturnFactor = dailyReturns[randomIndex];

        currentCapital *= (1 + dailyReturnFactor);

        if (currentCapital > peak) {
          if (inDrawdown) {
            totalRecoveryTime += (day - drawdownStartDay);
            recoverySuccessCount++;
            inDrawdown = false;
          }
          peak = currentCapital;
        } else if (!inDrawdown) {
          inDrawdown = true;
          drawdownStartDay = day;
        }

        const dd = (peak - currentCapital) / (peak || 1);
        if (dd > scenarioMaxDrawdown) scenarioMaxDrawdown = dd;

        if (currentCapital <= config.budget * 0.1) {
          isRuined = true;
          currentCapital = 0;
          break;
        }

        if (((currentCapital - config.budget) / config.budget) * 100 <= bConfig.stopLoss) {
          break;
        }
      }

      finalCapitals.push(currentCapital);
      if (isRuined) ruinCounts.push(1);
      cumulativeRoi += ((currentCapital - config.budget) / (config.budget || 1)) * 100;
      maxDrawdownTotal += scenarioMaxDrawdown;
    }

    const avgFinalCapital = finalCapitals.reduce((a, b) => a + b, 0) / SCENARIOS;
    const probOfRuin = (ruinCounts.length / SCENARIOS) * 100;

    return {
      id: `MC-${crypto.randomUUID().split("-")[0]}`,
      timestamp: Date.now(),
      config,
      equityCurve: finalCapitals.slice(0, 100),
      totalBets: config.horizonDays * SCENARIOS,
      totalWins: Math.floor(SCENARIOS * hitRate * config.horizonDays),
      finalCapital: avgFinalCapital,
      roi: cumulativeRoi / SCENARIOS,
      maxDrawdown: (maxDrawdownTotal / SCENARIOS) * 100,
      probabilityOfRuin: probOfRuin,
      expectedRecoveryTime: recoverySuccessCount > 0 ? totalRecoveryTime / recoverySuccessCount : undefined
    };
  }

  /**
   * Dual Prediction Simulation: Runs 10k internal simulations to find top 3 candidates.
   */
  public static simulateTopPicks(
    history: Pick3Result[],
    config: BettingConfig,
    iterations: number = 10000
  ): any[] {
    const analysisEngine = new AnalysisEngine(history);
    const analysis = analysisEngine.analyze(60);
    const predictionEngine = new PredictionEngine(history, analysis);

    // 1. Get initial pool of candidates from all models
    const pool = predictionEngine.generatePredictions(config, 20);
    const freqMap = new Map<string, number>();

    // 2. Stochastic weighting based on historical performance (Backtest)
    // We simulate which of these candidates would hit today based on their internal scores
    for (let i = 0; i < iterations; i++) {
        // Sample 3 candidates from the pool using their confidence as weight
        const winners = this.sampleWeighted(pool, 3);
        winners.forEach(w => {
            const key = w.combination.join('');
            freqMap.set(key, (freqMap.get(key) || 0) + 1);
        });
    }

    // 3. Extract top 3 by frequency in simulation
    return Array.from(freqMap.entries())
        .map(([key, count]) => {
            const original = pool.find(p => p.combination.join('') === key);
            return {
                ...original,
                simFreq: count,
                simProb: (count / iterations) * 100
            };
        })
        .sort((a, b) => b.simFreq - a.simFreq)
        .slice(0, 3);
  }

  private static sampleWeighted(pool: any[], count: number): any[] {
    const results: any[] = [];
    const tempPool = [...pool];

    for (let i = 0; i < count; i++) {
        const totalConfidence = tempPool.reduce((sum, p) => sum + p.confidence, 0);
        let random = Math.random() * totalConfidence;

        for (let j = 0; j < tempPool.length; j++) {
            random -= tempPool[j].confidence;
            if (random <= 0) {
                results.push(tempPool[j]);
                tempPool.splice(j, 1);
                break;
            }
        }
        if (tempPool.length === 0) break;
    }
    return results;
  }
}
