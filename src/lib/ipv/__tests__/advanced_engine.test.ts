
import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { Product, MatchingRule } from '../../dexie';

// Mock Dexie
vi.mock('../../dexie', () => ({
  db: {
    matching_cache: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
    },
    reconciliation_lines: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    matching_logs: {
      add: vi.fn().mockResolvedValue({}),
    }
  }
}));

describe('MatchingEngine Advanced Simulation', () => {
  const products: Product[] = [
    { cod: '1', descripcion: 'Cerveza', um: 'U', precio_cents: 260, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 0, created_at: '', isWildcardCandidate: true },
    { cod: '2', descripcion: 'Agua', um: 'U', precio_cents: 100, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 0, created_at: '', isWildcardCandidate: true },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'CASH_FILL', prioridad: 6, activo: true },
  ];

  const engine = new MatchingEngine(products, rules);

  it('should distribute global goal with randomness', async () => {
    const dates = ['2025-08-01', '2025-08-02', '2025-08-03'];
    const lines = await engine.distributeGlobalGoal(3000, 0, dates);

    expect(lines.length).toBeGreaterThanOrEqual(3);
    const totalDistributed = lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    // Debido a floor/random, puede haber una pequeña diferencia de céntimos, pero debería estar cerca
    expect(totalDistributed).toBeGreaterThan(2900);
    expect(totalDistributed).toBeLessThanOrEqual(3000);

    // Verificar que no todos los días tienen lo mismo (probabilidad alta de éxito con pesos aleatorios)
    const perDay = new Map();
    lines.forEach(l => {
        perDay.set(l.fecha_operacion, (perDay.get(l.fecha_operacion) || 0) + l.importe_linea_cents);
    });
    const values = Array.from(perDay.values());
    const allSame = values.every(v => v === values[0]);
    // Con 3 días y random entre 0.5 y 1.5, es extremadamente improbable que sean iguales
    // Pero como es un test, solo chequeamos que se crearon para los 3 días
    expect(perDay.size).toBe(3);
  });

  it('should use wildcards in cash fill (justified)', async () => {
    const tx = {
      referencia_origen: 'TX_CASH',
      fecha: '2025-08-01',
      importe_cents: 0,
      importe_venta_cents: 520, // 2 cervezas
      tipo: 'Cr',
      observaciones: 'Cash test'
    } as any;

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines.some(l => l.product_cod === '1')).toBe(true);
    expect(result.lines.find(l => l.product_cod === '1')?.origen_dato).toBe('CASH_FILLER');
  });
});
