
import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { BankTransaction, Product, MatchingRule } from '../../dexie';

// Mock Dexie
vi.mock('../../dexie', () => ({
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
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    matching_logs: { add: vi.fn().mockResolvedValue({}) },
    }
  }
}));

describe('MatchingEngine', () => {
  const products: Product[] = [
    { cod: '1', descripcion: 'Cerveza', um: 'U', precio_cents: 260, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 0, created_at: '' },
    { cod: '1-C', descripcion: 'Cerveza Caja', um: 'Caja', precio_cents: 5760, prioridad_algoritmo: 1, activo: true, es_paquete: true, contenido_paquete: 24, stock_inicial_manual: 0, created_at: '' },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'HARD_REF', prioridad: 1, activo: true },
    { id: '2', tipo: 'EXACT_SUM', prioridad: 2, activo: true },
    { id: '3', tipo: 'TOLERANCE', prioridad: 3, activo: true, tolerancia_cents: 1 },
  ];

  const engine = new MatchingEngine(products, rules);

  it('should respect STOCK_LIMIT rule', async () => {
    const limitedRules: MatchingRule[] = [
      { id: 'stock', tipo: 'STOCK_LIMIT', prioridad: 1, activo: true },
      { id: 'exact', tipo: 'EXACT_SUM', prioridad: 2, activo: true }
    ];

    const productsWithNoStock: Product[] = [
        { cod: '1', descripcion: 'Cerveza', um: 'U', precio_cents: 260, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 1, created_at: '' },
    ];

    const engineLimited = new MatchingEngine(productsWithNoStock, limitedRules);

    const tx: BankTransaction = {
      id: 'tx_stock_1',
      fecha: '2025-08-01',
      referencia_corta: 'S1',
      referencia_origen: 'S1',
      observaciones: 'T1',
      importe_cents: 260,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    // First match should succeed (we have 1 in stock)
    const res1 = await engineLimited.matchTransaction(tx);
    expect(res1.status).toBe('COMPLETO');
    expect(res1.lines).toHaveLength(1);

    // Second match with SAME engine instance (stock should be depleted)
    const tx2 = { ...tx, id: 'tx_stock_2', referencia_origen: 'S2' };
    const res2 = await engineLimited.matchTransaction(tx2);
    expect(res2.status).toBe('PENDIENTE');
    expect(res2.lines).toHaveLength(0);
  });

  it('should match a simple product by HARD_REF', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'PAGO COD:1',
      importe_cents: 260,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].product_cod).toBe('1');
  });

  it('should find an exact combination by EXACT_SUM', async () => {
    const tx: BankTransaction = {
      id: 'tx2',
      fecha: '2025-08-01',
      referencia_corta: 'REF2',
      referencia_origen: 'REF2',
      observaciones: 'TRANSFERENCIA',
      importe_cents: 520, // 2 cervezas
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].cantidad).toBe(2);
  });

  it('should handle commissions automatically (Pass 0)', async () => {
    const tx: BankTransaction = {
      id: 'tx3',
      fecha: '2025-08-01',
      referencia_corta: 'REF3',
      referencia_origen: 'REF3',
      observaciones: 'COMISION BANCARIA',
      importe_cents: 100,
      tipo: 'Db',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(0);
  });

  it('should report progress during reconcileAll', async () => {
    const txs: BankTransaction[] = [
      {
        id: 'tx1',
        fecha: '2025-08-01',
        referencia_corta: 'REF1',
        referencia_origen: 'REF1',
        observaciones: 'PAGO COD:1',
        importe_cents: 260,
        tipo: 'Cr',
        estado_conciliacion: 'PENDIENTE',
        created_at: '',
        ingestion_hash: ''
      },
      {
        id: 'tx2',
        fecha: '2025-08-01',
        referencia_corta: 'REF2',
        referencia_origen: 'REF2',
        observaciones: 'TRANSFERENCIA',
        importe_cents: 520,
        tipo: 'Cr',
        estado_conciliacion: 'PENDIENTE',
        created_at: '',
        ingestion_hash: ''
      }
    ];

    const onProgress = vi.fn();
    await engine.reconcileAll(txs, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
  });
});
