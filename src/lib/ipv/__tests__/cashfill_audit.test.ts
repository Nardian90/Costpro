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
    { cod: 'P1', descripcion: 'Producto 1', um: 'U', precio_cents: 1000, prioridad_algoritmo: 1, activo: true, stock_inicial_manual: 100, created_at: '' },
  ];

  const rules: MatchingRule[] = [
    { id: 'cash-fill', tipo: 'CASH_FILL', prioridad: 5, activo: true, meta: { daily_limit: 5000 } },
  ];

  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine(products, rules);
  });

  it('should block CASH_FILL if origin format is invalid (fail-fast)', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'INVALID',
      referencia_origen: 'INVALID_REF',
      observaciones: 'Test',
      importe_cents: 1500,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    await expect(engine.matchTransaction(tx)).rejects.toThrow(/Invalid transfer origin format/);
  });

  it('should allow CASH_FILL if origin format is valid', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'TRX-123',
      referencia_origen: 'TRX-123',
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
    expect(cashLine?.parent_transaction_id).toBe('TRX-123');
    expect(cashLine?.source_type).toBe('BANK_TRANSFER');
    expect(cashLine?.id).toBe('hash-TRX-123_EFECTIVO-1000-Transferencia');
  });

  it('should block if daily limit is exceeded', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'TRX-LIMIT',
      referencia_origen: 'TRX-LIMIT',
      observaciones: 'Test',
      importe_cents: 6000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    await expect(engine.matchTransaction(tx)).rejects.toThrow(/Daily limit exceeded/);
  });

  it('should be idempotent: same input produces same hash ID', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'TRX-IDEM',
      referencia_origen: 'TRX-IDEM',
      observaciones: 'Test',
      importe_cents: 500,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const res1 = await engine.matchTransaction(tx);
    const res2 = await engine.matchTransaction(tx);

    expect(res1.lines[0].id).toBe(res2.lines[0].id);
    expect(res1.lines[0].id).toBe('hash-TRX-IDEM_EFECTIVO-500-Transferencia');
  });
});
