import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { BankTransaction, Product, MatchingRule } from '../../dexie';

// Mock Dexie simple
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
      put: vi.fn().mockResolvedValue({}),
      toArray: vi.fn().mockResolvedValue([]),
    },
    period_closures: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    },
    products: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      above: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      clear: vi.fn(),
      bulkPut: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
    },
    bank_statements: {
      clear: vi.fn(),
      add: vi.fn(),
    }
  }
}));

describe('MatchingEngine - R4 Auto-Supply', () => {
  const products: Product[] = [
    { cod: 'P1', descripcion: 'Prod 1', um: 'U', precio_cents: 1000, activo: true, stock_inicial_manual: 10, created_at: '' },
    { cod: 'P2', descripcion: 'Prod 2', um: 'U', precio_cents: 500, activo: true, stock_inicial_manual: 1, created_at: '' },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'EXACT_SUM', prioridad: 1, activo: true },
    { id: 'auto-supply', tipo: 'AUTO_SUPPLY', prioridad: 7, activo: true },
  ];

  it('should auto-supply to exhaust excess transfer (R4) prioritizing low stock (R1)', async () => {
    const engine = new MatchingEngine(products, rules);

    const tx: BankTransaction = {
      id: 'tx_excess',
      fecha: '2025-08-01',
      referencia_origen: 'TX_EXCESS',
      importe_cents: 1200,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      observaciones: 'P1',
      created_at: '',
      ingestion_hash: ''
    };

    const res = await engine.matchTransaction(tx);

    expect(res.appliedRules).toContain('AUTO_SUPPLY');

    const p2Line = res.lines.find(l => l.product_cod === 'P2');
    expect(p2Line).toBeDefined();
    // P2 cuesta 500. Se agota primero por stock bajo.
    expect(p2Line?.transfer_amount_cents).toBe(500);
    expect(p2Line?.cash_amount_cents).toBe(0);

    const p1Line = res.lines.find(l => l.product_cod === 'P1');
    expect(p1Line).toBeDefined();
    // Quedan 700 de transferencia (1200 - 500).
    // P1 cuesta 1000. Toma 700 transfer y 300 cash.
    expect(p1Line?.transfer_amount_cents).toBe(700);
    expect(p1Line?.cash_amount_cents).toBe(300);
  });

  it('should prioritize low stock in WILDCARDS (R1)', async () => {
    const wildcardProducts: Product[] = [
        { cod: 'W1', descripcion: 'Wild 1', um: 'U', precio_cents: 100, activo: true, stock_inicial_manual: 10, isWildcardCandidate: true, created_at: '' },
        { cod: 'W2', descripcion: 'Wild 2', um: 'U', precio_cents: 100, activo: true, stock_inicial_manual: 2, isWildcardCandidate: true, created_at: '' },
    ];
    const wildcardRules: MatchingRule[] = [
        { id: 'w', tipo: 'WILDCARDS', prioridad: 1, activo: true },
    ];

    const engine = new MatchingEngine(wildcardProducts, wildcardRules);
    const tx: BankTransaction = {
        id: 'tx_wild', fecha: '2025-08-01', referencia_origen: 'TX_WILD',
        importe_cents: 100, tipo: 'Cr', estado_conciliacion: 'PENDIENTE', created_at: '', ingestion_hash: ''
    };

    const res = await engine.matchTransaction(tx);
    // Debería elegir W2 porque tiene menos stock (2 vs 10)
    expect(res.lines[0].product_cod).toBe('W2');
  });
});
