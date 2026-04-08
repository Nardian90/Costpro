import { it, expect, describe } from 'vitest';

// Simulate a cost engine that rounds to 2 decimals
function mockCalculate(coef: number): number {
    const base = 1742.23;
    const raw = base * coef;
    return Math.round(raw * 100) / 100;
}

/**
 * Brute force search for the best coefficient.
 * This matches the logic of the real solver without needing complex UI structures.
 */
function solveCoefficientExhaustive(target: number, simulate: (c: number) => number): number {
    let bestCoef = 1;
    let minDiff = Infinity;

    const check = (c: number) => {
        const val = simulate(c);
        const diff = Math.abs(val - target);
        if (diff < minDiff) {
            minDiff = diff;
            bestCoef = c;
        } else if (Math.abs(diff - minDiff) < 1e-10) {
            if (String(c).length < String(bestCoef).length) {
                bestCoef = c;
            }
        }
    };

    for (let i = 0; i <= 5000; i++) {
        check(i / 1000);
    }

    const center = bestCoef;
    for (let i = -10; i <= 10; i++) {
        check(center + i / 10000);
    }

    return bestCoef;
}

describe('Step Function Solver', () => {
    it('should find the absolute best coefficient', () => {
        const result = solveCoefficientExhaustive(2000, mockCalculate);
        expect(result).toBeCloseTo(1.148, 4);
        expect(mockCalculate(result)).toBe(2000.08);
    });
});
