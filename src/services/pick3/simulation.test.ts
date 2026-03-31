import { describe, it, expect } from 'bun:test';
import { SimulationEngine } from './simulation.engine';
import { Pick3Result, BettingConfig } from '@/types/pick3';

describe('SimulationEngine v9', () => {
  const mockHistory: Pick3Result[] = [
    { date: '2024-05-01', draw_time: 'midday', result: [1, 2, 3], sync_method: 'pdf' },
    { date: '2024-05-01', draw_time: 'evening', result: [4, 5, 6], sync_method: 'pdf' },
    { date: '2024-04-30', draw_time: 'midday', result: [7, 8, 9], sync_method: 'pdf' },
    { date: '2024-04-30', draw_time: 'evening', result: [0, 1, 2], sync_method: 'pdf' },
  ];

  const config: BettingConfig = {
    mode: 'PICK3',
    digits: 3,
    payout: 500,
    maxCombinations: 3,
    riskFactor: 1,
    stopLoss: -30,
    criticalDrawdown: -20
  };

  it('should generate 3 simulated picks', () => {
    const picks = SimulationEngine.simulateTopPicks(mockHistory, config, 100);
    expect(picks).toHaveLength(3);
    picks.forEach(p => {
      expect(p.combination).toHaveLength(3);
      expect(p.simFreq).toBeDefined();
    });
  });

  it('should respect LAST2 mode', () => {
    const last2Config: BettingConfig = { ...config, mode: 'LAST2', digits: 2 };
    const picks = SimulationEngine.simulateTopPicks(mockHistory, last2Config, 100);
    expect(picks[0].combination).toHaveLength(2);
  });
});
