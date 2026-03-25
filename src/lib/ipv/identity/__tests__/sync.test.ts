import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/dexie';
import { syncCatalogFromTransactions } from '../registry';
import 'fake-indexeddb/auto';

describe('syncCatalogFromTransactions', () => {
  beforeEach(async () => {
    await db.customers.clear();
    await db.bank_statements.clear();
  });

  it('should import new customers from transactions', async () => {
    // 1. Setup bank transactions with identity data
    await db.bank_statements.add({
      referencia_origen: 'TX1',
      carnet: '90010100001',
      nombre_cliente: 'Juan Perez',
      telefono_cliente: '5551234',
      tarjeta_cliente: '1234567890123456',
      fecha: '2023-01-01',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H1',
      created_at: new Date().toISOString(),
      observaciones: 'Test'
    } as any);

    // 2. Run sync
    const importedCount = await syncCatalogFromTransactions();

    // 3. Verify
    expect(importedCount).toBe(1);
    const customer = await db.customers.get('90010100001');
    expect(customer).toBeDefined();
    expect(customer?.nombre).toBe('JUAN PEREZ');
    expect(customer?.phone).toBe('5551234');
    expect(customer?.source).toBe('AUTOMATICO');
  });

  it('should enrich existing customers with missing data', async () => {
    // 1. Setup existing customer without phone
    await db.customers.add({
      ci: '90010100001',
      nombre: 'JUAN PEREZ',
      normalized_name: 'JUAN PEREZ',
      raw_names: ['Juan Perez'],
      status: 'PARCIAL',
      source: 'MANUAL',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Setup transaction with phone
    await db.bank_statements.add({
      referencia_origen: 'TX1',
      carnet: '90010100001',
      nombre_cliente: 'Juan Perez',
      telefono_cliente: '5559999',
      fecha: '2023-01-01',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H1',
      created_at: new Date().toISOString(),
      observaciones: 'Test'
    } as any);

    // 3. Run sync
    const importedCount = await syncCatalogFromTransactions();

    // 4. Verify
    expect(importedCount).toBe(0); // Already exists
    const customer = await db.customers.get('90010100001');
    expect(customer?.phone).toBe('5559999'); // Enriched
  });
});
