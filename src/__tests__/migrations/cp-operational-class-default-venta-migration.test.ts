/**
 * cp-operational-class-default-venta-migration.test.ts — CP-PRODUCT-COMMISSION-001 TAREA 1.
 *
 * Contrato estático de la migración 20261110090000:
 *  · Backfill AUTORIZADO ÚNICAMENTE para products.operational_class IS NULL → 'venta'.
 *  · DEFAULT 'venta' + NOT NULL en la columna (integridad en la base).
 *  · RPCs del ciclo de vida con DEFAULT 'venta' en p_operational_class,
 *    SIN cambiar firma/retorno (CREATE OR REPLACE legal: solo el default).
 *  · Enum y valores intactos; sin CASCADE; sin tocar datos financieros.
 *  · Verificación PostgreSQL REAL: scripts/e2e/verify-product-commission-pg.mjs
 *    (evidencia: audit-evidence/CP-PRODUCT-COMMISSION-001/).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_FILE = '20261110090000_cp_operational_class_default_venta.sql';
const migrationPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE);
const sql = readFileSync(migrationPath, 'utf8');

describe('CP-PRODUCT-COMMISSION-001 · migración de clasificación obligatoria (DEFAULT venta)', () => {

  it('existe como ARCHIVO NUEVO (la migración histórica 20261108150000 NO se reescribe)', () => {
    // Archivo distinto del histórico (§7: no reescribir migraciones desplegadas).
    expect(existsSync(migrationPath)).toBe(true);
    expect(MIGRATION_FILE).not.toBe('20261108150000_cp_operational_classification.sql');
  });

  it('§1.3 · backfill EXCLUSIVO: UPDATE ... WHERE operational_class IS NULL → venta (sin WHERE con valor literal)', () => {
    const updates = sql.match(/UPDATE\s+(public\.)?products[\s\S]*?;/gi) ?? [];
    // Dos UPDATE legítimos: (1) backfill masivo de NULL → venta; (2) el
    // already_active correctivo de activate_master_product (fila concreta).
    const backfill = updates.find((u) => /WHERE\s+operational_class\s+IS\s+NULL/i.test(u));
    expect(backfill).toBeTruthy();
    expect(backfill).toMatch(/SET\s+operational_class\s*=\s*'venta'/i);
    expect(backfill).not.toMatch(/price|cost|inventory/i);
    for (const u of updates) {
      if (u !== backfill) expect(u).toMatch(/WHERE\s+id\s*=\s*v_existing/i);
    }
  });

  it('§1.3.5-§1.3.6 · no modifica datos financieros; el catálogo maestro jamás se ACTUALIZA ni borra', () => {
    expect(sql).not.toMatch(/(INSERT INTO|UPDATE)\s+(public\.)?(transactions|transaction_items|inventory|stock_movements|cash_|commission_payments)/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    // El INSERT en master_products es la función legítima e histórica de
    // create_master_product (20261028112100); lo que está PROHIBIDO es
    // modificar/borrar el catálogo compartido:
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?master_products/i);
  });

  it('§1.4 · DEFAULT venta + NOT NULL en la columna', () => {
    expect(sql).toMatch(/ALTER TABLE public\.products\s+ALTER COLUMN operational_class SET DEFAULT 'venta';/);
    expect(sql).toMatch(/ALTER TABLE public\.products\s+ALTER COLUMN operational_class SET NOT NULL;/);
    // Enum y valores existentes intactos (sin CREATE TYPE ni ALTER TYPE).
    expect(sql).not.toMatch(/CREATE TYPE|ALTER TYPE/);
  });

  it('§1.2/§1.4 · RPCs del ciclo de vida con DEFAULT venta sin cambiar firma ni retorno', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_master_product\(/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.activate_master_product\(/);
    // El default del parámetro cambia; el resto de la firma y el retorno NO:
    expect(sql).toMatch(/p_operational_class public\.product_operational_class DEFAULT 'venta'/);
    expect(sql).not.toMatch(/RETURNS\s+(?!jsonb)/);
    // Identidad intacta: mismos parámetros de entrada de la v2 (20261108150000).
    expect(sql).toMatch(/p_local jsonb DEFAULT '\{\}'::jsonb/);
    // Permisos re-confirmados por contrato.
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_master_product\(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public\.product_operational_class\) TO authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.activate_master_product\(uuid, uuid, uuid, public\.product_operational_class\) TO authenticated, service_role;/);
  });

  it('§7 · sin CASCADE y con verificación final de integridad (solo lectura)', () => {
    expect(sql).not.toMatch(/CASCADE\s*;/);
    expect(sql).not.toMatch(/, CASCADE\s*\)/);
    expect(sql).toMatch(/operational_class sigue nullable/);
    expect(sql).toMatch(/quedan % productos sin clasificación/);
    expect(sql).toMatch(/DEFAULT venta ausente en RPCs/);
    expect(sql).toMatch(/RAISE NOTICE 'CP-PRODUCT-COMMISSION-001 OK/);
    expect(sql).toMatch(/GET DIAGNOSTICS v_backfilled = ROW_COUNT/); // conteo para la evidencia
  });

  it('existe la evidencia de la verificación en PostgreSQL REAL (12 checks)', () => {
    const evidence = join(process.cwd(), 'audit-evidence', 'CP-PRODUCT-COMMISSION-001', 'verificacion-postgresql-real.log');
    expect(existsSync(evidence)).toBe(true);
    const log = readFileSync(evidence, 'utf8');
    expect(log).toContain('TODAS las verificaciones PostgreSQL pasaron');
  });
});
