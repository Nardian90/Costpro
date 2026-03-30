import { expect, test, describe } from "bun:test";
import { BacktestEngine } from "./backtest.engine";
import { MIAMI_PICK3_HISTORICAL } from "./seedData";
import { BettingConfig } from "@/types/pick3";

describe("BacktestEngine Validation", () => {
  const config: BettingConfig = {
    mode: 'LAST2',
    payout: 90,
    digits: 2,
    maxCombinations: 3,
    riskFactor: 1.0,
    stopLoss: -30,
    criticalDrawdown: -20
  };

  test("runValidation produces daily history and metrics", () => {
    // We need enough data for analysis (60 draws)
    // MIAMI_PICK3_HISTORICAL has 41 draws.
    // Let's duplicate it for the sake of the test to have > 60
    const longHistory = [...MIAMI_PICK3_HISTORICAL, ...MIAMI_PICK3_HISTORICAL];
    const engine = new BacktestEngine(longHistory);
    const result = engine.runValidation(config, 1000, 5);

    expect(result.dailyHistory.length).toBeGreaterThan(0);
    expect(result.equityCurve.length).toBeGreaterThan(1);
    expect(result.bestDrawTime).toBeDefined();
    expect(result.middayProfit).toBeDefined();
    expect(result.eveningProfit).toBeDefined();
  });
});
