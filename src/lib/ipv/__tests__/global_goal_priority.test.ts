import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';

describe('MatchingEngine - Global Goal Date Priority', () => {
  const products = [
    { cod: 'P1', descripcion: 'Prod 1', precio_cents: 100, activo: true, um: 'U' }
  ] as any;
  const rules = [] as any;

  it('should prioritize dates with lower volume', async () => {
    const engine = new MatchingEngine(products, rules);
    const dates = ['2023-01-01', '2023-01-02', '2023-01-03'];
    const dayVolumes = {
      '2023-01-01': 500, // high
      '2023-01-02': 100, // low
      '2023-01-03': 300  // medium
    };

    const targetTotal = 1000;
    const currentTotal = 0;

    const lines = await engine.distributeGlobalGoal(targetTotal, currentTotal, dates, { dayVolumes });

    // The first line should be on the date with the lowest volume (2023-01-02)
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].fecha_operacion).toBe('2023-01-02');

    // Check distribution: it should move to medium next if it can't fit all in one (though idealQty might spread it)
    // In our case, idealQty = max(1, floor(10 / (3/2))) = max(1, floor(6.6)) = 6.
    // So 6 items on 01-02, then it moves to 01-03.
    const dateCounts = lines.reduce((acc, l) => {
        acc[l.fecha_operacion] = (acc[l.fecha_operacion] || 0) + l.total_amount_cents;
        return acc;
    }, {} as Record<string, number>);

    console.log('Distribution:', dateCounts);

    // Ensure 01-02 got filled first or at least exists
    expect(dateCounts['2023-01-02']).toBeGreaterThan(0);
  });
});
