import { describe, it, expect } from 'vitest';
import { calculateMRI, HardStop } from '../mri-engine';

describe('MRI Engine v8.0', () => {
  it('should return ENTERPRISE_READY status for score >= 9.0', () => {
    // 10*0.4 + 10*0.3 + 10*0.2 + 10*0.1 = 4 + 3 + 2 + 1 = 10
    const result = calculateMRI(10, 10, 10, 10, []);
    expect(result.score).toBe(10.0);
    expect(result.status).toBe('ENTERPRISE_READY');
  });

  it('should calculate weighted score correctly', () => {
    // 9*0.4 + 8*0.3 + 7*0.2 + 9*0.1 = 3.6 + 2.4 + 1.4 + 0.9 = 8.3
    const result = calculateMRI(9, 8, 7, 9, []);
    expect(result.score).toBe(8.3);
    expect(result.status).toBe('BETA');
  });

  it('should return PRODUCTION_READY for score >= 8.5', () => {
    const result = calculateMRI(9, 8.5, 8.5, 8.5, []);
    // 9*0.4 + 8.5*0.3 + 8.5*0.2 + 8.5*0.1 = 3.6 + 2.55 + 1.7 + 0.85 = 8.7
    expect(result.score).toBe(8.7);
    expect(result.status).toBe('PRODUCTION_READY');
  });
});
