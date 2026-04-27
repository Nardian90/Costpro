
import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { BankTransaction, Product, MatchingRule } from '../../dexie';

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

describe('Reproduction of reported issue', () => {
  const products: Product[] = [
    {
        cod: 'SKU027',
        descripcion: 'FRUTY SABORES',
        um: 'U',
        precio_cents: 30.00,
        prioridad_algoritmo: 1,
        activo: true,
        es_paquete: false,
        contenido_paquete: 1,
        stock_inicial_manual: 126,
        isWildcardCandidate: true,
        created_at: ''
    },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'STOCK_LIMIT', prioridad: 1, activo: true, meta: { allow_negative: false } },
    { id: '4', tipo: 'WILDCARDS', prioridad: 4, activo: true },
    { id: '2', tipo: 'TOLERANCE', prioridad: 6, activo: true, meta: { tolerance_cents: 20 } },
    { id: '3', tipo: 'EXACT_SUM', prioridad: 3, activo: false },
  ];

  it('should match $1400 with SKU027 ($30) given 20 tolerance', async () => {
    const engine = new MatchingEngine(products, rules);
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'TRANSFERENCIA',
      importe_cents: 1410.00,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    console.log('Logs:', result.logs);
    expect(result.status).toBe('COMPLETO');
  });

  it('should match $1400 with 46 units if stock is exactly 46', async () => {
    const products46 = [
        { ...products[0], stock_inicial_manual: 46 }
    ];
    const engine = new MatchingEngine(products46, rules);
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'TRANSFERENCIA',
      importe_cents: 1400.00,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    console.log('Logs (Stock 46):', result.logs);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines[0].cantidad).toBe(46);
  });
});
