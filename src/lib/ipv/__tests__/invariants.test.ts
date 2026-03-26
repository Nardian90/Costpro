import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchingEngine } from '../engine';
import { Product, MatchingRule, BankTransaction } from '../../dexie';

// Mock Dexie & Services
vi.mock('../../dexie', () => ({
  db: {
    matching_cache: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
    },
    reconciliation_lines: {
      where: vi.fn().mockReturnThis(),
      between: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      and: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    matching_logs: { add: vi.fn().mockResolvedValue({}) },
    },
    products: {
      toArray: vi.fn().mockResolvedValue([]),
    matching_logs: { add: vi.fn().mockResolvedValue({}) },
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null)
    },
    product_movements: {
      where: vi.fn().mockReturnThis(),
      between: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    matching_logs: { add: vi.fn().mockResolvedValue({}) },
      add: vi.fn().mockResolvedValue("mock-id")
    },
    intelligent_receipts: {
      put: vi.fn().mockResolvedValue("mock-id")
    },
    transaction: vi.fn((type, tables, callback) => callback())
  }
}));

vi.mock('../../services/matching-log-service', () => ({
  MatchingLogService: {
    logMatchingResult: vi.fn().mockResolvedValue("mock-log-id")
  }
}));

describe('IPV Invariants', () => {
  const products: Product[] = [
    {
        cod: 'PROD1',
        descripcion: 'Producto Test 100',
        um: 'U',
        precio_cents: 100,
        prioridad_algoritmo: 1,
        activo: true,
        es_paquete: false,
        contenido_paquete: 1,
        stock_inicial_manual: 10, id_grupo: 'GRP1',
        created_at: ''
    },
    {
        cod: 'BOX1',
        descripcion: 'Caja Test (10u)',
        um: 'Caja',
        precio_cents: 1200, // Expensive to avoid EXACT_SUM picking it over PROD1 combinations if possible
        prioridad_algoritmo: 2,
        activo: true,
        es_paquete: true,
        contenido_paquete: 10,
        cod_hijo: 'PROD1',
        id_grupo: 'GRP1',
        unit_factor: 10,
        unit_level: 'BOX',
        stock_inicial_manual: 1,
        created_at: ''
    }
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'STOCK_LIMIT', prioridad: 1, activo: true },
    { id: '2', tipo: 'HARD_REF', prioridad: 2, activo: true },
    { id: '3', tipo: 'EXACT_SUM', prioridad: 3, activo: true }
  ];

  it('Conservation of Value: should match exactly the target amount', async () => {
    const engine = new MatchingEngine(products, rules);
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-01-01',
      referencia_origen: 'REF1',
      observaciones: 'TEST',
      importe_cents: 500,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    const totalLinesValue = result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    expect(totalLinesValue).toBe(500);
  });

  it('Stock Integrity: should decompose if stock is insufficient via HARD_REF', async () => {
    const engine = new MatchingEngine(products, rules);
    const tx: BankTransaction = {
      id: 'tx2',
      fecha: '2025-01-01',
      referencia_origen: 'REF2',
      observaciones: 'PAGO Producto Test 100', // Forces HARD_REF to PROD1
      importe_cents: 1500, // 15 units of PROD1
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    const prod1Line = result.lines.find(l => l.product_cod === 'PROD1');
    expect(prod1Line?.cantidad).toBe(15);

    // Check movements
    expect(result.movements.length).toBeGreaterThan(0);
    const decomposition = result.movements.find(m => m.tipo === 'DECOMPOSITION');
    expect(decomposition).toBeDefined();
    expect(decomposition.producto_origen_cod).toBe('BOX1');
    expect(decomposition.producto_destino_cod).toBe('PROD1');
  });

  it('Cache Collision: should not reuse cache if catalog changes', async () => {
     const engine1 = new MatchingEngine(products, rules);
     const tx: BankTransaction = {
        id: 'tx1',
        fecha: '2025-01-01',
        referencia_origen: 'REF1',
        observaciones: 'TEST',
        importe_cents: 1000,
        tipo: 'Cr',
        estado_conciliacion: 'PENDIENTE',
        created_at: '',
        ingestion_hash: ''
      };

      await engine1.matchTransaction(tx);

      // Now products change: PROD1 price changes
      const modifiedProducts = products.map(p => p.cod === 'PROD1' ? { ...p, precio_cents: 200 } : p);
      const engine2 = new MatchingEngine(modifiedProducts, rules);

      const result = await engine2.matchTransaction(tx);
      // Invariant: total value must be 1000
      const totalValue = result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
      expect(totalValue).toBe(1000);

      // And prices must match the NEW catalog
      for(const line of result.lines) {
          const p = modifiedProducts.find(prod => prod.cod === line.product_cod);
          expect(line.precio_unitario_cents).toBe(p?.precio_cents);
      }
  });
});
