import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { db } from '../../dexie';

// Mocking Dexie isn't straightforward, but we can test the Engine logic with data
describe('MatchingEngine PRO - Price Coherence (R1)', () => {
  const products = [
    {
      cod: 'PROD-A',
      descripcion: 'Producto A',
      precio_cents: 100,
      activo: true,
      variacion_permisible_percent: 10, // 90 to 110
      um: 'U',
      stock_inicial_manual: 100
    }
  ];

  const rules = [
    { id: '1', tipo: 'PRICE_FLEX', prioridad: 1, activo: true }
  ];

  it('should adjust price to achieve match and keep it consistent for the same day', async () => {
    const engine = new MatchingEngine(products as any, rules as any);

    // TX1: 105 cents (requires price adjustment to 105)
    const tx1 = {
        referencia_origen: 'REF1',
        fecha: '2026-03-12',
        importe_venta_cents: 105,
        tipo: 'Cr',
        observaciones: ''
    };

    const res1 = await engine.matchTransaction(tx1 as any);
    expect(res1.status).toBe('COMPLETO');
    expect(res1.lines[0].precio_unitario_cents).toBe(105);

    // TX2: 210 cents (should use the ALREADY adjusted price of 105, qty 2)
    const tx2 = {
        referencia_origen: 'REF2',
        fecha: '2026-03-12',
        importe_venta_cents: 210,
        tipo: 'Cr',
        observaciones: ''
    };

    const res2 = await engine.matchTransaction(tx2 as any);
    expect(res2.status).toBe('COMPLETO');
    expect(res2.lines[0].precio_unitario_cents).toBe(105);
    expect(res2.lines[0].cantidad).toBe(2);
  });

  it('should allow different prices on different days', async () => {
    const engine = new MatchingEngine(products as any, rules as any);

    // Day 1
    const tx1 = { referencia_origen: 'REF1', fecha: '2026-03-12', importe_venta_cents: 105, tipo: 'Cr' };
    await engine.matchTransaction(tx1 as any);

    // Day 2: 95 cents
    const tx2 = { referencia_origen: 'REF2', fecha: '2026-03-13', importe_venta_cents: 95, tipo: 'Cr' };
    const res2 = await engine.matchTransaction(tx2 as any);

    expect(res2.status).toBe('COMPLETO');
    expect(res2.lines[0].precio_unitario_cents).toBe(95);
  });
});
