import { describe, it, expect } from 'vitest';
import { calculateMRI, MRIDomain, HardStop } from '../mri-engine';

describe('MRI Engine', () => {
  const mockDomains: MRIDomain[] = [
    { id: 'test', name: 'Test', score: 9.0, weight: 1.0, observations: [] }
  ];

  it('should return ENTERPRISE_READY status for score >= 9.0', () => {
    const result = calculateMRI(mockDomains, []);
    expect(result.score).toBe(9.0);
    expect(result.status).toBe('ENTERPRISE_READY');
  });

  it('should return NO_GO if a critical hard stop fails', () => {
    const hardStops: HardStop[] = [
      { id: 'hs1', name: 'Critical', passed: false, critical: true }
    ];
    const result = calculateMRI(mockDomains, hardStops);
    expect(result.status).toBe('NO_GO');
  });
});
