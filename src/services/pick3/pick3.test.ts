import { expect, test, describe } from "bun:test";
import { Pick3Engine } from "./Pick3Engine";
import { Pick3Result } from "@/types/pick3";

const mockHistory: Pick3Result[] = [
  { date: '2025-01-01', draw_time: 'midday', result: [1, 2, 3] },
  { date: '2025-01-01', draw_time: 'evening', result: [4, 5, 6] },
  { date: '2025-01-02', draw_time: 'midday', result: [7, 8, 9] },
  { date: '2025-01-02', draw_time: 'evening', result: [0, 1, 2] },
];

describe("Pick3Engine", () => {
  test("should analyze frequency correctly", () => {
    const engine = new Pick3Engine(mockHistory);
    const analysis = engine.analyzeFrequency(30);
    expect(analysis.global[1]).toBe(2);
    expect(analysis.global[9]).toBe(1);
  });

  test("should generate plays with high confidence", () => {
    const engine = new Pick3Engine(mockHistory);
    const analysis = engine.analyzeAdvanced(30);
    const plays = engine.generatePlays(analysis, 3);
    expect(plays.length).toBe(3);
    expect(plays[0].confidence).toBeGreaterThan(0);
  });

  test("should run Monte Carlo simulation", () => {
    const engine = new Pick3Engine(mockHistory);
    const analysis = engine.analyzeAdvanced(30);
    const config = { budget: 100, horizonDays: 10, riskLevel: 'medium' as any, costPerBet: 1 };
    const result = engine.simulateMonteCarlo(config, analysis);
    expect(result.finalCapital).toBeDefined();
    expect(result.probabilityOfRuin).toBeGreaterThanOrEqual(0);
  });
});
