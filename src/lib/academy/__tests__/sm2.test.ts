import { describe, it, expect } from 'vitest';
import { calculateSM2 } from '../sm2';

describe('SM-2 Algorithm', () => {
  it('should reset repetitions and interval on low quality score', () => {
    const result = calculateSM2(2, 2.5, 10, 5);
    expect(result.repetitions).toBe(0);
    expect(result.interval_days).toBe(1);
    expect(result.ease_factor).toBeLessThan(2.5);
  });

  it('should increase repetitions and interval on high quality score', () => {
    const result1 = calculateSM2(5, 2.5, 1, 0);
    expect(result1.repetitions).toBe(1);
    expect(result1.interval_days).toBe(1);

    const result2 = calculateSM2(5, result1.ease_factor, result1.interval_days, result1.repetitions);
    expect(result2.repetitions).toBe(2);
    expect(result2.interval_days).toBe(6);

    const result3 = calculateSM2(5, result2.ease_factor, result2.interval_days, result2.repetitions);
    expect(result3.repetitions).toBe(3);
    expect(result3.interval_days).toBeGreaterThan(6);
  });

  it('should never let ease factor go below 1.3', () => {
    let ef = 2.5;
    for (let i = 0; i < 20; i++) {
      const result = calculateSM2(0, ef, 1, 0);
      ef = result.ease_factor;
    }
    expect(ef).toBe(1.3);
  });
});
