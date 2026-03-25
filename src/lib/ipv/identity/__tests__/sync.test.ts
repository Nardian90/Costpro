import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { db } from '@/lib/dexie';
import { syncCatalogFromTransactions } from '../registry';

// Set up fake-indexeddb globally for Dexie
if (typeof global !== 'undefined') {
  (global as any).indexedDB = indexedDB;
  (global as any).IDBKeyRange = IDBKeyRange;
}

describe('syncCatalogFromTransactions', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
        await db.open();
    }
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
    expect(customer?.status).toBe('COMPLETO');
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

  it('should import customer with only name (artificial CI)', async () => {
    // 1. Setup transaction with only name
    await db.bank_statements.add({
      referencia_origen: 'TX_NAME_ONLY_1234',
      nombre_cliente: 'Raquel Arbelo Rodriguez',
      fecha: '2023-01-01',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H2',
      created_at: new Date().toISOString(),
      observaciones: 'Test'
    } as any);

    // 2. Run sync
    const importedCount = await syncCatalogFromTransactions();

    // 3. Verify
    expect(importedCount).toBe(1);
    const customers = await db.customers.toArray();
    const customer = customers.find(c => c.nombre === 'RAQUEL ARBELO RODRIGUEZ');
    expect(customer).toBeDefined();
    expect(customer?.ci).toMatch(/^_GEN_RAQ_1234$/);
    expect(customer?.status).toBe('PARCIAL');
  });

  it('should import customer with only CI', async () => {
    // 1. Setup transaction with only CI
    await db.bank_statements.add({
      referencia_origen: 'TX_CI_ONLY_5678',
      carnet: '99010100001',
      fecha: '2023-01-01',
      importe_cents: 1000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H3',
      created_at: new Date().toISOString(),
      observaciones: 'Test'
    } as any);

    // 2. Run sync
    const importedCount = await syncCatalogFromTransactions();

    // 3. Verify
    expect(importedCount).toBe(1);
    const customer = await db.customers.get('99010100001');
    expect(customer).toBeDefined();
    expect(customer?.nombre).toBe('DESCONOCIDO');
    expect(customer?.status).toBe('PARCIAL');
  });

  it('should update existing customer when real CI is found for artificial one', async () => {
    // 1. Setup existing customer with artificial CI
    await db.customers.add({
      ci: '_GEN_RAQ_1234',
      nombre: 'RAQUEL ARBELO RODRIGUEZ',
      normalized_name: 'RAQUEL ARBELO RODRIGUEZ',
      raw_names: ['Raquel Arbelo Rodriguez'],
      status: 'PARCIAL',
      source: 'AUTOMATICO',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // 2. Setup transaction with real CI and same name
    await db.bank_statements.add({
      referencia_origen: 'TX_REAL_CI_5678',
      carnet: '90010100002',
      nombre_cliente: 'Raquel Arbelo Rodriguez',
      fecha: '2023-01-02',
      importe_cents: 2000,
      tipo: 'Cr',
      estado_conciliacion: 'PENDIENTE',
      ingestion_hash: 'H4',
      created_at: new Date().toISOString(),
      observaciones: 'Test'
    } as any);

    // 3. Run sync
    const importedCount = await syncCatalogFromTransactions();

    // 4. Verify
    expect(importedCount).toBe(1); // New customer entry for real CI
    const customer = await db.customers.get('90010100002');
    expect(customer).toBeDefined();
    expect(customer?.status).toBe('COMPLETO');
  });
});
