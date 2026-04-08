import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchingEngine } from '../engine';
import { BankTransaction, Product, MatchingRule } from '../../dexie';

// Mock Dexie & Utils
vi.mock('../../dexie', async () => {
  const actual = await vi.importActual('../../dexie') as any;
  return {
    ...actual,
    db: {
      transaction: vi.fn((mode, tables, callback) => callback()),
      matching_logs: {
        add: vi.fn().mockResolvedValue("mock-id"),
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        reverse: vi.fn().mockReturnThis(),
        sortBy: vi.fn().mockResolvedValue([]),
      },
      matching_cache: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
      },
      reconciliation_lines: {
        add: vi.fn(),
        bulkPut: vi.fn(),
        update: vi.fn(),
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
      audit_logs: { add: vi.fn().mockResolvedValue({}) }
    }
  }
});

vi.mock('../../utils', () => ({
    generateHash: vi.fn().mockImplementation((s: string) => Promise.resolve(`hash-${s}`))
}));

describe('MatchingEngine - Cash Filler Audit', () => {
  const products: Product[] = [
    { cod: 'CERVEZA', descripcion: 'Producto 1', um: 'U', precio_cents: 1000, prioridad_algoritmo: 1, activo: true, stock_inicial_manual: 100, created_at: '' },
  ];

  const rules: MatchingRule[] = [
    { id: 'hard-ref', tipo: 'HARD_REF', prioridad: 1, activo: true },
    { id: 'cash-fill', tipo: 'CASH_FILL', prioridad: 5, activo: true, meta: { daily_limit: 5000000 } },
  ];

  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine(products, rules);
  });

  it('should allow CASH_FILL if origin format is valid (BANDEC style)', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'YR60000400646',
      referencia_origen: '98026A0440583',
      observaciones: 'Test',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    const cashLine = result.lines.find(l => l.origen_dato === 'CASH_FILLER');
    expect(cashLine).toBeDefined();
    expect(cashLine?.transaction_ref).toBe('98026A0440583');
    expect(cashLine?.product_cod).toBe('CASH');
  });

  it('should handle Mixed Payment with product context', async () => {
    // Product CERVEZA costs 1000. Transaction is 800.
    // HARD_REF will match CERVEZA because of observaciones, but remaining will be -200.
    const tx: BankTransaction = {
      id: 'tx_mixed',
      fecha: '2025-08-01',
      referencia_corta: 'MIX1',
      referencia_origen: '98026A0440584',
      observaciones: 'CERVEZA',
      importe_cents: 800,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(2);

    const mainLine = result.lines.find(l => l.origen_dato === 'AUTO_MATCH');
    const fillerLine = result.lines.find(l => l.origen_dato === 'CASH_FILLER');

    expect(mainLine?.product_cod).toBe('CERVEZA');
    expect(fillerLine?.product_cod).toBe('CERVEZA'); // Should take context from CERVEZA!
    expect(fillerLine?.clasificacion).toBe('Efectivo');
    expect(fillerLine?.importe_linea_cents).toBe(200);
    expect(fillerLine?.transaction_ref).toBe(tx.referencia_origen);
  });

  it('should block if daily limit is exceeded', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'LIMIT',
      referencia_origen: '98026A0440585',
      observaciones: 'Test',
      importe_cents: 6000000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    await expect(engine.matchTransaction(tx)).rejects.toThrow(/Daily limit exceeded/);
  });
});
