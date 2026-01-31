import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchingEngine } from '../engine';
import { type BankTransaction, type Product, type MatchingRule } from '../../dexie';
import crypto from 'node:crypto';

// Mock Dexie DB
vi.mock('../../dexie', async () => {
  const actual = await vi.importActual('../../dexie');
  return {
    ...actual as any,
    db: {
      matching_cache: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(null),
      },
      reconciliation_lines: {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        and: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
      daily_aggregates: {
        put: vi.fn().mockResolvedValue(null),
      }
    }
  };
});

// Polyfill crypto for Node environment in tests
if (typeof window === 'undefined' && !global.crypto) {
  // @ts-ignore
  global.crypto = crypto.webcrypto;
}

describe('MatchingEngine', () => {
  const mockProducts: Product[] = [
    {
      cod: 'CERV-001',
      descripcion: 'Cerveza Windmil',
      um: 'U',
      es_paquete: false,
      contenido_paquete: 1,
      precio_cents: 26000, // $260.00
      prioridad_algoritmo: 1,
      activo: true,
      created_at: '',
    },
    {
        cod: 'CERV-002',
        descripcion: 'Cerveza 8,6',
        um: 'U',
        es_paquete: false,
        contenido_paquete: 1,
        precio_cents: 50000, // $500.00
        prioridad_algoritmo: 2,
        activo: true,
        created_at: '',
      }
  ];

  const mockRules: MatchingRule[] = [
    { id: '1', tipo: 'HARD_REF', prioridad: 1, activo: true },
    { id: '2', tipo: 'EXACT_SUM', prioridad: 2, activo: true },
    { id: '3', tipo: 'TOLERANCE', prioridad: 3, activo: true, tolerancia_cents: 1000 },
    { id: '4', tipo: 'CASH_FILL', prioridad: 4, activo: true }
  ];

  let engine: MatchingEngine;

  beforeEach(() => {
    engine = new MatchingEngine(mockProducts, mockRules);
  });

  it('debería realizar un match exacto (PASS 2)', async () => {
    const tx: BankTransaction = {
      id: 'tx1',
      fecha: '2025-08-01',
      referencia_corta: 'REF1',
      referencia_origen: 'ORIG1',
      observaciones: 'Pago varios',
      importe_cents: 52000, // 2 * 26000
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'hash1',
      created_at: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].product_cod).toBe('CERV-001');
    expect(result.lines[0].cantidad).toBe(2);
  });

  it('debería usar HARD_REF si el código está en observaciones (PASS 1)', async () => {
    const tx: BankTransaction = {
      id: 'tx2',
      fecha: '2025-08-01',
      referencia_corta: 'REF2',
      referencia_origen: 'ORIG2',
      observaciones: 'Compra CERV-002',
      importe_cents: 50000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'hash2',
      created_at: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines[0].product_cod).toBe('CERV-002');
    expect(result.logs.some(l => l.includes('PASS 1'))).toBe(true);
  });

  it('debería aplicar tolerancia si la diferencia es pequeña (PASS 3)', async () => {
    const tx: BankTransaction = {
      id: 'tx3',
      fecha: '2025-08-01',
      referencia_corta: 'REF3',
      referencia_origen: 'ORIG3',
      observaciones: 'Pago con descuadre',
      importe_cents: 25500, // Falta 500 para una cerveza de 26000
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'hash3',
      created_at: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines[0].cuadre_cents).toBe(-500);
    expect(result.logs.some(l => l.includes('PASS 3'))).toBe(true);
  });

  it('debería usar CASH_FILL si no hay match (PASS 4)', async () => {
    const tx: BankTransaction = {
      id: 'tx4',
      fecha: '2025-08-01',
      referencia_corta: 'REF4',
      referencia_origen: 'ORIG4',
      observaciones: 'Monto aleatorio',
      importe_cents: 12345,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'hash4',
      created_at: ''
    };

    const result = await engine.matchTransaction(tx);
    expect(result.status).toBe('COMPLETO');
    expect(result.lines[0].product_cod).toBe('CASH');
    expect(result.lines[0].origen_dato).toBe('CASH_FILLER');
    expect(result.logs.some(l => l.includes('PASS 4'))).toBe(true);
  });

  it('debería respetar el límite diario de CASH_FILL', async () => {
    // Configurar regla con límite de $100.00 (10000 cts)
    const rulesWithLimit: MatchingRule[] = [
      { id: '4', tipo: 'CASH_FILL', prioridad: 4, activo: true, meta: { dailyLimitCents: 10000 } }
    ];
    const engineWithLimit = new MatchingEngine(mockProducts, rulesWithLimit);

    // Mockear que ya se usaron $90.00 hoy
    const { db } = await import('../../dexie');
    (db.reconciliation_lines.toArray as any).mockResolvedValueOnce([
        { importe_linea_cents: 9000, origen_dato: 'CASH_FILLER' }
    ]);

    const tx: BankTransaction = {
      id: 'tx5',
      fecha: '2025-08-01',
      referencia_corta: 'REF5',
      referencia_origen: 'ORIG5',
      observaciones: 'Excede límite',
      importe_cents: 2000, // $20.00 -> total sería $110.00 > $100.00
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'hash5',
      created_at: ''
    };

    const result = await engineWithLimit.matchTransaction(tx);
    expect(result.status).toBe('PENDIENTE'); // No pudo completar nada
    expect(result.logs.some(l => l.includes('Límite diario excedido'))).toBe(true);
  });
});
