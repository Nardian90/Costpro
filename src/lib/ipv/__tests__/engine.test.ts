
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
    }
  }
}));

describe('MatchingEngine', () => {
  const products: Product[] = [
    { cod: '1', descripcion: 'Cerveza', um: 'U', precio_cents: 26000, prioridad_algoritmo: 1, activo: true, es_paquete: false, contenido_paquete: 1, created_at: '' },
    { cod: '1-C', descripcion: 'Cerveza Caja', um: 'Caja', precio_cents: 576000, prioridad_algoritmo: 1, activo: true, es_paquete: true, contenido_paquete: 24, created_at: '' },
  ];

  const rules: MatchingRule[] = [
    { id: '1', tipo: 'HARD_REF', prioridad: 1, activo: true },
    { id: '2', tipo: 'EXACT_SUM', prioridad: 2, activo: true },
    { id: '3', tipo: 'TOLERANCE', prioridad: 3, activo: true, tolerancia_cents: 100 },
  ];

  const engine = new MatchingEngine(products, rules);

  it('should match a simple product by HARD_REF', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'REF1',
      observaciones: 'PAGO COD:1',
      importe_cents: 26000,
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
      importe_cents: 52000, // 2 cervezas
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
      importe_cents: 10000,
      tipo: 'Db',
      estado_conciliacion: 'PENDIENTE',
      created_at: '',
      ingestion_hash: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(0);
  });
});
