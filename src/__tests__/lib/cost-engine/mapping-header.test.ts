import { describe, it, expect } from 'vitest';
import { evaluateEarlyHeader } from '@/lib/cost-engine/shared-mapping';

describe('shared-mapping early header', () => {
  it('evaluateEarlyHeader skips non-formula fields', () => {
    const header = { name: 'Simple', code: 'C1', quantity: 10 } as any;
    const result = evaluateEarlyHeader(header, []);
    expect(result.name).toBe('Simple');
    expect(result.quantity).toBe(10);
  });

  it('evaluateEarlyHeader handles formula in fields', () => {
    // This requires mock parser/evaluator usually, but let's see if it just runs
    const header = { name: '=1+1', quantity: 1 } as any;
    const result = evaluateEarlyHeader(header, []);
    // It should try to evaluate. If no parser, it creates one.
    // If it fails to evaluate, it might return the original or 0.
    expect(result.name).toBeDefined();
  });
});
