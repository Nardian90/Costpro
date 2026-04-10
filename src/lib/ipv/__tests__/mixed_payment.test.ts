import { describe, it, expect, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { Product, MatchingRule, BankTransaction } from '../../dexie';

// Mock Dexie
vi.mock('../../dexie', () => ({
  db: {
    matching_logs: { put: vi.fn().mockResolvedValue({}) }
  }
}));

describe('MatchingEngine Mixed Payment Support', () => {
  const products: Product[] = [
    { cod: 'P1', descripcion: 'Producto 350', um: 'U', precio_cents: 350, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 10, created_at: '', isWildcardCandidate: true },
    { cod: 'P2', descripcion: 'Producto 600', um: 'U', precio_cents: 600, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, stock_inicial_manual: 10, created_at: '', isWildcardCandidate: true },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'WILDCARDS', prioridad: 1, activo: true },
    { id: '2', tipo: 'CASH_FILL', prioridad: 2, activo: true },
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

    // Modelo Compuesto V30:
    // P1 * 2 = 700 transfer, 0 cash (Total 700)
    // Quedan 300 transfer.
    // P2 * 1 = 300 transfer, 300 cash (Total 600)
    // Total Venta = 700 + 600 = 1300.

    const totalVenta = result.lines.reduce((sum, l) => sum + l.total_amount_cents, 0);
    const totalTransfer = result.lines.reduce((sum, l) => sum + l.transfer_amount_cents, 0);
    const totalCash = result.lines.reduce((sum, l) => sum + l.cash_amount_cents, 0);

    expect(totalTransfer).toBe(1000);
    expect(totalVenta).toBe(totalTransfer + totalCash);
  });

  it('should still handle exact matches without cash', async () => {
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
    const totalTransfer = result.lines.reduce((sum, l) => sum + l.transfer_amount_cents, 0);
    const totalCash = result.lines.reduce((sum, l) => sum + l.cash_amount_cents, 0);

    expect(totalTransfer).toBe(1000);
    expect(totalCash).toBe(0);
  });
});
