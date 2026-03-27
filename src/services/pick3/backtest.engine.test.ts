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
    const engine = new BacktestEngine(MIAMI_PICK3_HISTORICAL);
    const result = engine.runValidation(config, 1000, 5);

    expect(result.dailyHistory.length).toBe(10); // 5 days * 2 draws
    expect(result.equityCurve.length).toBe(11); // Initial + 10 draws
    expect(result.bestDrawTime).toBeDefined();
    expect(result.middayProfit).toBeDefined();
    expect(result.eveningProfit).toBeDefined();
  });
});
