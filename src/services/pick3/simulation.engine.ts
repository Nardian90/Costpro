import { SimulationResult, StrategyConfig, BettingConfig, BacktestResult } from '@/types/pick3';

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
    // but we can simulate the "replay blocks" by sampling from the backtest daily returns
    const dailyReturns = backtest.equityCurve.map((val, i, arr) => i === 0 ? 0 : (val - arr[i-1]) / (arr[i-1] || 1));

    for (let s = 0; s < SCENARIOS; s++) {
      let currentCapital = config.budget;
      let peak = currentCapital;
      let scenarioMaxDrawdown = 0;
      let isRuined = false;
      let inDrawdown = false;
      let drawdownStartDay = 0;

      for (let day = 0; day < config.horizonDays; day++) {
        // Stochastic Replay: sample a random "day" from historical performance
        const randomIndex = Math.floor(Math.random() * dailyReturns.length);
        const dailyReturnFactor = dailyReturns[randomIndex];

        // Adjust capital based on historical return scaled by current risk factor
        // This effectively simulates the streaks present in the backtest
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

        if (currentCapital <= config.budget * 0.1) { // 90% loss as ruin
          isRuined = true;
          currentCapital = 0;
          break;
        }

        // Apply Stop-Loss
        if (((currentCapital - config.budget) / config.budget) * 100 <= bConfig.stopLoss) {
          break; // Stop for this scenario
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
      id: `MC-${Math.random().toString(36).substring(7)}`,
      timestamp: Date.now(),
      config,
      equityCurve: finalCapitals.slice(0, 100), // Sample for visualization
      totalBets: config.horizonDays * SCENARIOS,
      totalWins: Math.floor(SCENARIOS * hitRate * config.horizonDays),
      finalCapital: avgFinalCapital,
      roi: cumulativeRoi / SCENARIOS,
      maxDrawdown: (maxDrawdownTotal / SCENARIOS) * 100,
      probabilityOfRuin: probOfRuin,
      expectedRecoveryTime: recoverySuccessCount > 0 ? totalRecoveryTime / recoverySuccessCount : undefined
    };
  }
}
