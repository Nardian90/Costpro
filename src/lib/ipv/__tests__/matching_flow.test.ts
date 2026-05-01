import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { db } from '@/lib/dexie';
import { MatchingEngine } from '../engine';

// Set up fake-indexeddb globally for Dexie
if (typeof global !== 'undefined') {
  (global as any).indexedDB = indexedDB;
  (global as any).IDBKeyRange = IDBKeyRange;
}

describe('Integrated IPV Matching Flow', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
        await db.open();
    }
    await db.products.clear();
    await db.bank_statements.clear();
    await db.reconciliation_lines.clear();
    await db.matching_logs.clear();
    await db.matching_rules.clear();
  });

  it('should perform a full matching flow: seed -> match -> verify DB', async () => {
    // 1. Seed Products
    await db.products.put({
      cod: 'CERV-001',
      descripcion: 'Cerveza Cristal',
      um: 'U',
      precio_cents: 250,
      prioridad_algoritmo: 1,
      activo: true,
      es_paquete: false,
      contenido_paquete: 0,
      stock_inicial_manual: 100,
      created_at: new Date().toISOString(),
      isWildcardCandidate: true
    });

    // 2. Seed Bank Transaction
    await db.bank_statements.add({
      referencia_origen: 'TX-INT-001',
      fecha: '2025-01-01',
      importe_cents: 500, // Should match 2 beers
      tipo: 'Cr',
      observaciones: 'Consumo 2 CERV-001',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H-INT-1',
      created_at: new Date().toISOString()
    } as any);

    // 3. Seed Rules
    const rules = [
      { id: 'R1', tipo: 'HARD_REF', prioridad: 1, activo: true },
      { id: 'R2', tipo: 'EXACT_SUM', prioridad: 2, activo: true }
    ] as any;
    await db.matching_rules.bulkPut(rules);

    // 4. Run Matching Engine
    const products = await db.products.toArray();
    const engine = new MatchingEngine(products, rules);

    // We'll use reconcileAll to simulate the batch process
    const transactions = await db.bank_statements.toArray();
    const results = await engine.reconcileAll(transactions);

    // 5. Verify Results in memory
    expect(results.length).toBe(1);
    expect(results[0].status).toBe('COMPLETO');
    expect(results[0].appliedRules).toContain('HARD_REF');

    // 6. Simulate the DB update logic that normally happens in IPVView.tsx
    for (const res of results) {
        if (res.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(res.lines);
        }
        await db.bank_statements.update(res.transactionId, {
            estado_conciliacion: res.status === 'OVERPAYMENT' ? 'COMPLETO' : res.status as 'PENDIENTE' | 'PARCIAL' | 'COMPLETO' | 'NO_PROCESAR',
            applied_rules: res.appliedRules
        });
    }

    // 7. Verify Final DB State
    const updatedTx = await db.bank_statements.get('TX-INT-001');
    expect(updatedTx?.estado_conciliacion).toBe('COMPLETO');

    const lines = await db.reconciliation_lines.where('transaction_ref').equals('TX-INT-001').toArray();
    expect(lines.length).toBe(1);
    expect(lines[0].product_cod).toBe('CERV-001');
    expect(lines[0].cantidad).toBe(2);
    expect(lines[0].total_amount_cents).toBe(500);

    const logs = await db.matching_logs.toArray();
    expect(logs.length).toBe(1);
    expect(logs[0].transaction_ref).toBe('TX-INT-001');
    expect(logs[0].resultado_estado).toBe('COMPLETO');

    console.log('Integrated flow success: Seeded, Matched, and Verified DB persistence.');
  });
});
