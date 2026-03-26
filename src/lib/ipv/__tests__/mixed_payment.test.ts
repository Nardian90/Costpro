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
    matching_logs: { add: vi.fn().mockResolvedValue({}) },
    },
    bank_statements: {
        get: vi.fn(),
        update: vi.fn(),
    }
  }
}));

describe('MatchingEngine Mixed Payment Support', () => {
  const products: Product[] = [
    { cod: 'P1', descripcion: 'Producto 350', um: 'U', precio_cents: 350, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 10, created_at: '', isWildcardCandidate: true },
    { cod: 'P2', descripcion: 'Producto 600', um: 'U', precio_cents: 600, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 10, created_at: '', isWildcardCandidate: true },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'CASH_FILL', prioridad: 6, activo: true },
  ];

  const engine = new MatchingEngine(products, rules);

  it('should support mixed payment (Transfer 1000, Products 1050)', async () => {
    const tx: BankTransaction = {
      referencia_origen: 'TX_MIXED',
      fecha: '2026-03-21',
      importe_cents: 1000,
      tipo: 'Cr',
      observaciones: 'Test mixed payment',
      estado_conciliacion: 'PENDIENTE',
      created_at: new Date().toISOString(),
      ingestion_hash: 'abc'
    } as any;

    const result = await engine.matchTransaction(tx);

    expect(result.status).toBe('COMPLETO');

    const totalVenta = result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    expect(totalVenta).toBe(1050);

    const transferLines = result.lines.filter(l => l.clasificacion === 'Transferencia');
    const cashLines = result.lines.filter(l => l.clasificacion === 'Efectivo');

    const totalTransfer = transferLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    const totalCash = cashLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);

    expect(totalTransfer).toBe(1000);
    expect(totalCash).toBe(50);

    // Check for traceability note in cash lines
    expect(cashLines.some(l => (l as any).observaciones?.includes('Pago mixto'))).toBe(true);
  });

  it('should still handle exact matches without cash line', async () => {
    const productsExact: Product[] = [
        { cod: 'P1', descripcion: 'Producto 500', um: 'U', precio_cents: 500, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 10, created_at: '', isWildcardCandidate: true },
    ];
    const engineExact = new MatchingEngine(productsExact, rules);

    const tx: BankTransaction = {
      referencia_origen: 'TX_EXACT',
      fecha: '2026-03-21',
      importe_cents: 1000,
      tipo: 'Cr',
      observaciones: 'Test exact',
      estado_conciliacion: 'PENDIENTE',
      created_at: new Date().toISOString(),
      ingestion_hash: 'def'
    } as any;

    const result = await engineExact.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    const totalVenta = result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0);
    expect(totalVenta).toBe(1000);
    expect(result.lines.every(l => l.clasificacion === 'Transferencia')).toBe(true);
  });
});
