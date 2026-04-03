import { solveCoefficient } from './solver';

// Simulate a cost engine that rounds to 2 decimals
function mockCalculate(coef: number): number {
    const base = 1742.23;
    const raw = base * coef;
    return Math.round(raw * 100) / 100;
}

// Target 2000.
// coef 1.1479 -> 1999.91
// coef 1.148 -> 2000.08
// coef 1.1481 -> 2000.25

// We want 1.148 because 2000.08 is closer to 2000 than 1999.91.
// Binary search might give 1.14795 which rounds to 1.148 if we are lucky,
// or it might stay at 1.1479 if it thinks it's "close enough".

// My new solver should find the absolute best.
