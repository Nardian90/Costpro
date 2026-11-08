/**
 * cp-operational-classification-migration.test.ts — CP-OPERATIONAL-CLASS-001.
 *
 * Contrato estático de la migración 20261108150000 (patrón de los tests de
 * migraciones del repo: lectura del SQL + aserciones por regex):
 *  · Enum de exactamente 4 valores y columna nullable (NULL = Sin clasificar).
 *  · HISTÓRICO INTACTO: sin UPDATE/backfill masivo sobre products.
 *  · RPCs get_paginated_products_v2 y get_products_for_pos exponen la columna
 *    con la firma PRESERVADA (CREATE OR REPLACE, mismos parámetros).
 *  · RLS intacto: ninguna política se elimina, altera o desactiva.
 *  · Ninguna tabla financiera/inventario es tocada por escritura.
 *  · Hardening de permisos (REVOKE PUBLIC/anon) re-declarado.
 *  · Verificaciones de integridad presentes (DO block).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_FILE = '20261108150000_cp_operational_classification.sql';
const migrationPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE);
const sql = readFileSync(migrationPath, 'utf8');

// La migración debe ser la ÚLTIMA del directorio (orden lexicográfico).
const allMigrations = readdirSync(join(process.cwd(), 'supabase', 'migrations')).sort();
const companionIdx = allMigrations.indexOf(MIGRATION_FILE);
const revokeIdx = allMigrations.indexOf('20261106130000_production_migration_ledger.sql');
const secHardeningIdx = allMigrations.indexOf('20261020000002_sec_definer_hardening.sql');

describe('CP-OPERATIONAL-CLASS-001 · migración de clasificación operativa', () => {

  it('existe, con nombre canónico y posición posterior a las migraciones de hardening/ledger', () => {
    expect(companionIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(secHardeningIdx).toBeGreaterThan(-1);
    // Orden lexicográfico = orden de aplicación en el repo.
    expect(companionIdx).toBeGreaterThan(revokeIdx);
    expect(companionIdx).toBeGreaterThan(secHardeningIdx);
  });

  it('define el enum product_operational_class con EXACTAMENTE los 4 valores', () => {
    expect(sql).toMatch(/CREATE TYPE public\.product_operational_class AS ENUM\s*\(/);
    const m = sql.match(/CREATE TYPE public\.product_operational_class AS ENUM\s*\(([^)]*)\)/);
    expect(m).toBeTruthy();
    const values = m![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values).toEqual(['venta', 'insumo', 'activo_fijo', 'util_herramienta']);
  });

  it('añade la columna products.operational_class NULLABLE (NULL = Sin clasificar)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.products\s+ADD COLUMN IF NOT EXISTS operational_class public\.product_operational_class\s*;/);
    // La misma sentencia NO puede declarar NOT NULL ni DEFAULT (histórico intacto).
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS operational_class[^\n]*NOT NULL/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS operational_class[^\n]*DEFAULT/);
  });

  it('NO reclasifica el histórico: sin UPDATE/backfill sobre products.operational_class', () => {
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?products\s+SET\s+operational_class/i);
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?products[^\n]*operational_class\s*=/i);
    // No se eliminan ni sobrescriben clasificaciones: la columna es nueva.
    expect(sql).not.toMatch(/DROP COLUMN[^\n]*operational_class/i);
  });

  it('crea el índice parcial para el filtro (store_id, operational_class) WHERE NOT NULL', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS products_operational_class_store_idx\s+ON public\.products\s*\(store_id,\s*operational_class\)\s+WHERE operational_class IS NOT NULL\s*;/);
  });

  it('get_paginated_products_v2: CREATE OR REPLACE con firma intacta y columna expuesta', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.get_paginated_products_v2\(([\s\S]*?)\$function\$;/);
    expect(fn).toBeTruthy();
    const body = fn![0];
    // Firma preservada: los 9 parámetros originales con sus defaults.
    for (const p of [
      'p_limit integer DEFAULT 24', 'p_offset integer DEFAULT 0', 'p_store_id uuid DEFAULT NULL::uuid',
      'p_search_term text DEFAULT NULL::text', 'p_category text DEFAULT NULL::text',
      "p_sort_key text DEFAULT 'name'::text", "p_sort_dir text DEFAULT 'asc'::text",
      "p_stock_filter text DEFAULT 'all'::text", "p_active_filter text DEFAULT 'all'::text",
    ]) {
      expect(body).toContain(p);
    }
    // Columna nueva de retorno antes de total_count (posición estable).
    expect(body).toMatch(/is_service boolean,\s*\n\s*-- CP-OPERATIONAL-CLASS-001[^\n]*\n\s*operational_class public\.product_operational_class,\s*\n\s*total_count bigint/);
    // SELECT proyecta p.operational_class.
    expect(body).toMatch(/p\.operational_class AS operational_class/);
    // Ni DROP FUNCTION ni cambio de SECURITY DEFINER.
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it('get_products_for_pos: CREATE OR REPLACE con firma intacta y columna expuesta', () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.get_products_for_pos\(([\s\S]*?)\$function\$;/);
    expect(fn).toBeTruthy();
    const body = fn![0];
    for (const p of [
      'p_store_id uuid DEFAULT NULL::uuid', 'p_search_term text DEFAULT NULL::text',
      'p_category text DEFAULT NULL::text', 'p_limit integer DEFAULT 500', 'p_offset integer DEFAULT 0',
    ]) {
      expect(body).toContain(p);
    }
    // Última columna de retorno (después de is_service).
    expect(body).toMatch(/is_service boolean,\s*\n\s*-- CP-OPERATIONAL-CLASS-001[^\n]*\n\s*operational_class public\.product_operational_class\s*\n\)/);
    expect(body).toMatch(/p\.operational_class AS operational_class/);
    // Scoping por tienda + RLS intactos en el WHERE.
    expect(body).toContain('public.has_store_access(p.store_id)');
    expect(body).toContain('p.store_id = p_store_id');
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it('RLS intacto: no desactiva ni reescribe políticas de products', () => {
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('no escribe en tablas financieras ni de inventario (solo DDL de products + RPCs)', () => {
    // Ninguna escritura de datos fuera del DO block de verificación (SELECT).
    expect(sql).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\s+INTO?\s+/im);
    expect(sql).not.toMatch(/DELETE FROM/i);
    // El único UPDATE permitido conceptualmente (columna nueva) está prohibido:
    // ya cubierto arriba. Tablas sensiles ni mencionadas como objetivo.
    expect(sql).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+(public\.)?(transactions|cash_|inventory|stock_movements)/i);
  });

  it('hardening de permisos: REVOKE EXECUTE de PUBLIC y anon para ambos RPCs', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_paginated_products_v2 FROM PUBLIC, anon;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_products_for_pos FROM PUBLIC, anon;/);
  });

  it('incluye verificaciones de integridad (DO block) con conteo sin modificar datos', () => {
    expect(sql).toMatch(/DO\s*\$\$/);
    expect(sql).toMatch(/RAISE EXCEPTION 'CP-OPERATIONAL-CLASS: la columna products\.operational_class no fue creada'/);
    expect(sql).toMatch(/format_type\(a\.atttypid/);
    expect(sql).toMatch(/v_enum_values IS DISTINCT FROM 'venta,insumo,activo_fijo,util_herramienta'/);
    expect(sql).toMatch(/RAISE NOTICE 'CP-OPERATIONAL-CLASS OK: % fila\(s\) clasificada\(s\), % Sin clasificar \(histórico intacto, sin backfill\)'/);
  });

  it('documenta la naturaleza informativa (COMMENT ON COLUMN/TYPE)', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.products\.operational_class IS/);
    expect(sql).toMatch(/COMMENT ON TYPE public\.product_operational_class IS/);
  });
});
