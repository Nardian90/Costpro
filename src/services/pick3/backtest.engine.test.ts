import { describe, it, expect } from 'vitest';
import { BacktestEngine } from './backtest.engine';
import { Pick3Result, BettingConfig } from '@/types/pick3';

describe('BacktestEngine', () => {
  const mockHistory: Pick3Result[] = Array.from({ length: 100 }, (_, i) => ({
    date: new Date(2023, 0, i + 1).toISOString(),
    draw_time: i % 2 === 0 ? 'midday' : 'evening',
    result: [1, 2, 3] as [number, number, number]
  }));

  const mockConfig: BettingConfig = {
    mode: 'PICK3',
    payout: 500,
    digits: 3,
    maxCombinations: 3,
    riskFactor: 1.0,
    stopLoss: 50,
    criticalDrawdown: 30
  };

  it('should run validation and return winning strategies', () => {
    const engine = new BacktestEngine(mockHistory);
    const result = engine.runValidation(mockConfig, 1000, 10);

    expect(result).toBeDefined();
    expect(result.dailyHistory.length).toBeGreaterThan(0);

    // Check if winningStrategy is tracked when there is a win
    const winningDraw = result.dailyHistory.find(d => d.win);
    if (winningDraw) {
      expect(winningDraw.winningStrategy).toBeDefined();
    }
  });
});
