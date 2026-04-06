import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MatchingEngine, getDefaultIPVRulesConfig } from '../lib/ipv/engine';
import { BankTransaction, Product } from '../lib/dexie';

// Mock generateHash
vi.mock('../utils', () => ({
  generateHash: vi.fn().mockResolvedValue('mocked-hash'),
}));

describe('MatchingEngine - CASH_FILLER', () => {
  const mockProducts: Product[] = [
    {
      cod: 'PROD1',
      descripcion: 'Producto 1',
      precio_cents: 800,
      activo: true,
      um: 'UD',
      prioridad_algoritmo: 1,
      stock_inicial_manual: 100,
      created_at: new Date().toISOString(),
    },
    {
      cod: 'PROD2',
      descripcion: 'Producto 2',
      precio_cents: 1500,
      activo: true,
      um: 'UD',
      prioridad_algoritmo: 1,
      stock_inicial_manual: 100,
      created_at: new Date().toISOString(),
    },
  ];

  const rules = getDefaultIPVRulesConfig();
  // Ensure cash-fill is active and has valor_minimo
  const cashFillRule = rules.find(r => r.tipo === 'CASH_FILL');
  if (cashFillRule) {
    cashFillRule.activo = true;
    cashFillRule.meta = { ...cashFillRule.meta, valor_minimo: 500 };
  }

  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine(mockProducts, rules);
  });

  test('CASH_FILLER should pick a product and leave residue as cash', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2024-01-01',
      referencia_origen: 'REF123',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: new Date().toISOString(),
      ingestion_hash: 'hash1',
    };

    const result = await engine.matchTransaction(tx, 0, 0);

    expect(result.status).toBe('COMPLETO');

    const prodLine = result.lines.find(l => l.product_cod === 'PROD1');
    const cashLine = result.lines.find(l => l.product_cod === 'CASH');

    expect(prodLine).toBeDefined();
    expect(prodLine?.importe_linea_cents).toBe(800);
    expect(prodLine?.transaction_ref).toBe('REF123');

    expect(cashLine).toBeDefined();
    expect(cashLine?.importe_linea_cents).toBe(200);
    expect(cashLine?.transaction_ref).toBe('Efectivo REF123');
    expect(cashLine?.clasificacion).toBe('Efectivo');
  });

  test('CASH_FILLER should only use cash if no product fits', async () => {
    const tx: BankTransaction = {
      id: 'tx2',
      fecha: '2024-01-01',
      referencia_origen: 'REF456',
      importe_cents: 400, // Less than valor_minimo (500)
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      created_at: new Date().toISOString(),
      ingestion_hash: 'hash2',
    };

    const result = await engine.matchTransaction(tx, 0, 0);

    expect(result.status).toBe('COMPLETO');
    const cashLines = result.lines.filter(l => l.product_cod === 'CASH');
    expect(cashLines.length).toBe(1);
    expect(cashLines[0].importe_linea_cents).toBe(400);
    expect(cashLines[0].transaction_ref).toBe('Efectivo REF456');
  });
});
