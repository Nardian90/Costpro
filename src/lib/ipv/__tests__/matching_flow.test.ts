import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { Product, MatchingRule, BankTransaction } from '../../dexie';

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
      bulkAdd: vi.fn().mockResolvedValue([]),
    },
    matching_logs: {
      add: vi.fn().mockResolvedValue({}),
    },
    product_movements: {
        bulkAdd: vi.fn().mockResolvedValue([]),
    },
    bank_statements: {
        update: vi.fn().mockResolvedValue(1),
    }
  }
}));

describe('IPV Matching Flow E2E Logic', () => {
  const products: Product[] = [
    { cod: 'P1', descripcion: 'Test Product', um: 'U', precio_cents: 1000, prioridad_algoritmo: 1, activo: true, stock_inicial_manual: 100, created_at: '', isWildcardCandidate: true },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'HARD_REF', prioridad: 1, activo: true },
    { id: '2', tipo: 'EXACT_SUM', prioridad: 2, activo: true },
  ];

  const transactions: BankTransaction[] = [
    { referencia_origen: 'TX1', fecha: '2025-01-01', importe_cents: 1000, tipo: 'Cr', observaciones: 'PAGO P1', ingestion_hash: 'h1' },
    { referencia_origen: 'TX2', fecha: '2025-01-01', importe_cents: 2000, tipo: 'Cr', observaciones: 'Sin info', ingestion_hash: 'h2' },
  ];

  it('should complete matching successfully for a valid batch', async () => {
    const engine = new MatchingEngine(products, rules);
    const onProgress = vi.fn();

    const results = await engine.reconcileAll(transactions, onProgress);

    expect(results.length).toBe(2);
    expect(onProgress).toHaveBeenCalledWith(100);

    // TX1 should be matched by Hard Ref or Exact Sum
    const res1 = results.find(r => r.transactionId === 'TX1');
    expect(res1?.status).toBe('COMPLETO');
    expect(res1?.lines.length).toBe(1);

    // TX2 should be matched by Exact Sum (2x P1)
    const res2 = results.find(r => r.transactionId === 'TX2');
    expect(res2?.status).toBe('COMPLETO');
    expect(res2?.lines.length).toBe(1);
    expect(res2?.lines[0].cantidad).toBe(2);
  });
});
