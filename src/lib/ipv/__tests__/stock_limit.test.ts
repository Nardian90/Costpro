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

describe('STOCK_LIMIT Rule Invariants', () => {
  const products: Product[] = [
    {
        cod: 'PROD1',
        descripcion: 'PRODUCTO 1',
        um: 'U',
        precio_cents: 100,
        prioridad_algoritmo: 1,
        activo: true,
        stock_inicial_manual: 0,
        es_paquete: false,
        contenido_paquete: 0,
        id_grupo: 'G1', // Fixed: must have id_grupo
        created_at: ''
    },
    {
        cod: 'PARENT1',
        descripcion: 'CAJA PRODUCTO 1',
        um: 'U',
        precio_cents: 1000,
        prioridad_algoritmo: 1,
        activo: true,
        stock_inicial_manual: 0,
        es_paquete: true,
        id_grupo: 'G1',
        cod_hijo: 'PROD1',
        contenido_paquete: 10,
        created_at: ''
    }
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'STOCK_LIMIT', prioridad: 1, activo: true },
    { id: '2', tipo: 'HARD_REF', prioridad: 2, activo: true },
  ];

  it('should NOT match if stock is 0 and no decomposition possible', async () => {
    const engine = new MatchingEngine(products, rules);
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'PROD1',
      importe_cents: 100,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('PENDIENTE');
    expect(result.lines.length).toBe(0);
  });

  it('should match if decomposition is possible', async () => {
    const productsWithParentStock = [
        { ...products[0] },
        { ...products[1], stock_inicial_manual: 1 }
    ];
    const engine = new MatchingEngine(productsWithParentStock, rules);
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'PROD1',
      importe_cents: 100,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines.length).toBe(1);
    expect(result.movements.filter(m => m.tipo === 'DECOMPOSITION').length).toBe(1);
    expect(result.movements[0].tipo).toBe('DECOMPOSITION');
  });

  it('should NOT allow negative stock even if rule is active (bug reproduction)', async () => {
    // We force the engine to think there is stock, but then we mock getVirtualStock to fail?
    // No, let's use the "A Medida" discrepancy.
    const productsAMedida = [
        { ...products[0], um: 'Kg' }, // A Medida
        { ...products[1], stock_inicial_manual: 1 }
    ];

    const engine = new MatchingEngine(productsAMedida, rules);

    // getVirtualStock will say 10 (it doesn't check isProductAMedida)
    // matchTransaction will try to match 10 units.
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'PROD1',
      importe_cents: 1000, // 10 units of PROD1
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);

    // If it's BUGGY:
    // 1. matchTransaction sees getVirtualStock = 10. qty = 10.
    // 2. createLine(PROD1, 10) called.
    // 3. createLine calls attemptDecomposition(PROD1).
    // 4. attemptDecomposition returns false because isProductAMedida('Kg') is true.
    // 5. createLine sets stock to Math.max(0, 0 - 10) = 0.
    // 6. createLine returns line with qty=10.
    // 7. result.status = COMPLETO.

    // If it's FIXED:
    // It should either return PENDIENTE or PARCIAL with qty=0.

    expect(result.status).toBe('PENDIENTE');
  });
});
