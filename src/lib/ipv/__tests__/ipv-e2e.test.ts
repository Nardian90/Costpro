import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/dexie';
import { MatchingEngine } from '../engine';

describe('IPV E2E: 150 Transactions Matching', () => {
  beforeEach(async () => {
    // Dexie with fake-indexeddb/auto should work
    if (!db.isOpen()) {
        await db.open();
    }
    // Clear tables
    await Promise.all([
        db.products.clear(),
        db.bank_statements.clear(),
        db.matching_rules.clear(),
        db.reconciliation_lines.clear(),
        db.product_movements.clear()
    ]);
  });

  it('should match 150 transactions with correct rule integration', async () => {
    // 1. Seed 10 products
    const products = Array.from({ length: 10 }, (_, i) => ({
      cod: `PROD-${i+1}`,
      descripcion: `Producto ${i+1}`,
      um: 'UD',
      precio_cents: (i+1) * 1000, // 1000, 2000, ..., 10000
      stock_inicial_manual: 1000,
      activo: true,
      id_grupo: null,
      cod_hijo: null,
      contenido_paquete: 1,
      isWildcardCandidate: false
    }));
    await db.products.bulkAdd(products as any);

    // 2. Seed 150 transactions
    const transactions = Array.from({ length: 150 }, (_, i) => ({
      fecha: new Date().toISOString().split('T')[0],
      referencia_corta: `TX-${i+1}`,
      referencia_origen: `TX-${i+1}`,
      tipo: 'Cr',
      importe_cents: ((i % 10) + 1) * 1000, // Cycling through prices 1000..10000
      estado_conciliacion: 'PENDIENTE',
      observaciones: '',
      ingestion_hash: `h-${i+1}`
    }));
    await db.bank_statements.bulkAdd(transactions as any);

    // 3. Setup default rules
    const defaultRules = [
      { id: 'r1', tipo: 'HARD_REF', prioridad: 1, activo: true },
      { id: 'r2', tipo: 'EXACT_SUM', prioridad: 2, activo: true, meta: { depth: 1200, timeout_ms: 200000 } },
      { id: 'r3', tipo: 'TOLERANCE', prioridad: 3, activo: true, meta: { tolerance_cents: 100 } }
    ];
    await db.matching_rules.bulkAdd(defaultRules as any);

    // 4. Create engine and run matching
    const engine = new MatchingEngine(products as any, defaultRules as any);
    const results = await engine.reconcileAll(transactions as any);

    // 5. Verify results
    expect(results).toHaveLength(150);
    // In this controlled scenario, all should match exactly via HARD_REF
    expect(results.filter(r => r.status === 'COMPLETO')).toHaveLength(150);
    expect(results.every(r => r.lines.length > 0)).toBe(true);

    // 6. Simulate the persistence logic from IPVView
    await db.transaction('rw', db.reconciliation_lines, db.product_movements, async () => {
        const linesToAdd = results.flatMap(r => r.lines);
        const movementsToAdd = results.flatMap(r => r.movements);
        await db.reconciliation_lines.bulkAdd(linesToAdd);
        await db.product_movements.bulkAdd(movementsToAdd);
    });

    // 7. Verify persistence in DB
    const savedLinesCount = await db.reconciliation_lines.count();
    expect(savedLinesCount).toBeGreaterThanOrEqual(150);

    const savedMovementsCount = await db.product_movements.count();
    expect(savedMovementsCount).toBeGreaterThanOrEqual(150);

    console.log('✅ E2E Test Passed: 150 transactions matched and persisted successfully');
  });
});
