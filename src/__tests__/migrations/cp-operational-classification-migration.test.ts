/**
 * cp-operational-classification-migration.test.ts — CP-OPERATIONAL-CLASS-001/002.
 *
 * Contrato estático de la migración 20261108150000 (remediada, misión
 * CP-OPERATIONAL-CLASS-002):
 *  · Enum de 4 valores; columna nullable (NULL = Sin clasificar); HISTÓRICO
 *    INTACTO (sin UPDATE/backfill).
 *  · RPCs get_paginated_products_v2 y get_products_for_pos: PostgreSQL no
 *    permite cambiar el tipo de retorno con CREATE OR REPLACE → patrón del
 *    repo: DROP (firma exacta, SIN CASCADE) + CREATE, con verificación previa
 *    de dependencias, OWNER explícito y GRANT authenticated/service_role.
 *  · Catálogo maestro ÍNTEGRO: la v2 recreada conserva la rama v_connected,
 *    source, master_product_id y la unión con locales sin vínculo.
 *  · Ciclo de vida del maestro: DROP de la firma antigua (evita sobrecargas
 *    vivas: CREATE OR REPLACE con parámetros nuevos NO reemplaza) + firma
 *    nueva con p_operational_class transaccional.
 *  · RLS intacto; sin escrituras en tablas financieras.
 *  · Verificación PostgreSQL REAL: scripts/e2e/verify-operational-classification-pg.mjs
 *    (evidencia: audit-evidence/CP-OPERATIONAL-CLASS-002/).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_FILE = '20261108150000_cp_operational_classification.sql';
const migrationPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE);
const sql = readFileSync(migrationPath, 'utf8');

const allMigrations = readdirSyncSorted();

function readdirSyncSorted(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('node:fs') as typeof import('node:fs')).readdirSync(join(process.cwd(), 'supabase', 'migrations')).sort();
}

describe('CP-OPERATIONAL-CLASS-001/002 · migración de clasificación operativa (remediada)', () => {

  it('existe y es posterior a las migraciones de visibilidad maestro y ciclo de vida', () => {
    const idx = allMigrations.indexOf(MIGRATION_FILE);
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(allMigrations.indexOf('20261101130000_cp_catalogo_visibilidad_maestro.sql'));
    expect(idx).toBeGreaterThan(allMigrations.indexOf('20261028112100_cp_catalogo_rpcs_ciclo_vida.sql'));
  });

  it('define el enum product_operational_class con EXACTAMENTE los 4 valores', () => {
    const m = sql.match(/CREATE TYPE public\.product_operational_class AS ENUM\s*\(([^)]*)\)/);
    expect(m).toBeTruthy();
    const values = m![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values).toEqual(['venta', 'insumo', 'activo_fijo', 'util_herramienta']);
  });

  it('añade la columna products.operational_class NULLABLE (NULL = Sin clasificar)', () => {
    expect(sql).toMatch(/ALTER TABLE public\.products\s+ADD COLUMN IF NOT EXISTS operational_class public\.product_operational_class\s*;/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS operational_class[^\n]*NOT NULL/);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS operational_class[^\n]*DEFAULT/);
  });

  it('NO reclasifica el histórico: sin backfill con literales ni UPDATE masivo sin filtro', () => {
    // Prohibido: backfill con valor literal.
    expect(sql).not.toMatch(/UPDATE\s+(public\.)?products\s+SET\s+operational_class\s*=\s*'/i);
    // El ÚNICO UPDATE a products permitido es el already_active correctivo de
    // activate_master_product (fila concreta del usuario, WHERE id = v_existing).
    const updates = sql.match(/UPDATE\s+(public\.)?products\s+SET\s+operational_class[^;]*;/gi) ?? [];
    for (const u of updates) {
      expect(u).toMatch(/WHERE\s+id\s*=\s*v_existing/i);
    }
    expect(sql).not.toMatch(/DROP COLUMN[^\n]*operational_class/i);
  });

  it('crea el índice parcial (store_id, operational_class) WHERE NOT NULL', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS products_operational_class_store_idx\s+ON public\.products\s*\(store_id,\s*operational_class\)\s+WHERE operational_class IS NOT NULL\s*;/);
  });

  it('P0 · verifica dependencias ANTES del DROP y jamás usa CASCADE', () => {
    expect(sql).toMatch(/Análisis de dependencias ANTES del DROP/);
    expect(sql).toMatch(/RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: existen % objeto\(s\) SQL dependiente\(s\) de las RPC/);
    // Prohibido por la misión §12: ninguna sentencia termina en CASCADE
    // (los únicos «CASCADE» del archivo son comentarios «SIN CASCADE»).
    expect(sql).not.toMatch(/CASCADE\s*;/);
    expect(sql).not.toMatch(/,\s*CASCADE\s*\)/);
  });

  it('P0 · get_paginated_products_v2: DROP (firma exacta, sin CASCADE) + CREATE con catálogo maestro ÍNTEGRO', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_paginated_products_v2\(integer, integer, uuid, text, text, text, text, text, text\);/);
    const fn = sql.match(/\nCREATE FUNCTION public\.get_paginated_products_v2\(([\s\S]*?)\$function\$;/);
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
    // Catálogo maestro ÍNTEGRO (20261101130000): rama conectada + identidad.
    expect(body).toContain('IF v_connected THEN');
    expect(body).toContain("CASE WHEN p.id IS NULL THEN 'master' ELSE 'local' END");
    expect(body).toContain('m.id AS master_product_id');
    expect(body).toContain('FROM public.master_products m');
    expect(body).toContain('LEFT JOIN public.products p');
    expect(body).toContain('AND p.master_product_id IS NULL'); // locales sin vínculo conservados
    expect(body).toContain("total_count bigint,\n  -- MISIÓN 002: identidad de la fila para el frontend\n  source text,\n  master_product_id uuid,");
    // Nuevo campo AL FINAL del retorno y proyectado en las 3 ramas.
    expect(body).toMatch(/master_product_id uuid,\s*\n\s*-- CP-OPERATIONAL-CLASS-002[^\n]*\n\s*-- [^\n]*\n\s*-- [^\n]*\n\s*operational_class public\.product_operational_class\n\)/);
    expect(body).toContain('p.operational_class AS operational_class');
    expect(body).toContain('b.operational_class');
    // Guardas de autorización intactas.
    expect(body).toContain('public.has_store_access(p.store_id)');
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it('P0 · get_products_for_pos: DROP (sin CASCADE) + CREATE con imagen master-first y columna al final', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_products_for_pos\(uuid, text, text, integer, integer\);/);
    const fn = sql.match(/\nCREATE FUNCTION public\.get_products_for_pos\(([\s\S]*?)\$function\$;/);
    expect(fn).toBeTruthy();
    const body = fn![0];
    for (const p of [
      'p_store_id uuid DEFAULT NULL::uuid', 'p_search_term text DEFAULT NULL::text',
      'p_category text DEFAULT NULL::text', 'p_limit integer DEFAULT 500', 'p_offset integer DEFAULT 0',
    ]) {
      expect(body).toContain(p);
    }
    // Imagen master-first y scoping intactos.
    expect(body).toContain('NULLIF((SELECT mm.image_path FROM public.master_products mm WHERE mm.id = p.master_product_id)');
    expect(body).toContain('public.has_store_access(p.store_id)');
    expect(body).toMatch(/is_service boolean,\s*\n\s*-- CP-OPERATIONAL-CLASS-002[^\n]*\n\s*-- [^\n]*\n\s*operational_class public\.product_operational_class\n\)/);
    expect(body).toContain('p.operational_class AS operational_class');
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it('restaura OWNER y permisos explícitos tras el DROP+CREATE (hardening del repo)', () => {
    expect(sql).toMatch(/ALTER FUNCTION public\.get_paginated_products_v2\(integer, integer, uuid, text, text, text, text, text, text\) OWNER TO postgres;/);
    expect(sql).toMatch(/ALTER FUNCTION public\.get_products_for_pos\(uuid, text, text, integer, integer\) OWNER TO postgres;/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.get_paginated_products_v2\(integer, integer, uuid, text, text, text, text, text, text\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_paginated_products_v2\(integer, integer, uuid, text, text, text, text, text, text\) TO authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_products_for_pos\(uuid, text, text, integer, integer\) TO authenticated, service_role;/);
  });

  it('P0 §6 · ciclo de vida del maestro: DROP de la firma ANTIGUA (sin sobrecargas vivas) + p_operational_class transaccional', () => {
    // CREATE OR REPLACE con parámetros nuevos NO reemplaza: crea sobrecarga.
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_master_product\(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid\);/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.activate_master_product\(uuid, uuid, uuid\);/);
    // Idempotencia total: también dropea las firmas nuevas (corrida interrumpida).
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_master_product\(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public\.product_operational_class\);/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.activate_master_product\(uuid, uuid, uuid, public\.product_operational_class\);/);
    // Firmas nuevas con el parámetro transaccional.
    expect(sql).toMatch(/p_operational_class public\.product_operational_class DEFAULT NULL/);
    // El INSERT de la fila local persiste la clasificación en la MISMA transacción.
    expect(sql).toMatch(/stock_current, is_active, is_complete, category, supplier, operational_class\)/);
    expect(sql).toMatch(/stock_current, is_active, is_complete, operational_class\)/);
    // already_active correctivo (idempotente).
    expect(sql).toMatch(/SET operational_class = p_operational_class/);
    // Permisos de las firmas nuevas.
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_master_product\(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public\.product_operational_class\) TO authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.activate_master_product\(uuid, uuid, uuid, public\.product_operational_class\) TO authenticated, service_role;/);
    // Sin CREATE OR REPLACE residual para las RPCs tocadas (evita sobrecargas).
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(get_paginated_products_v2|get_products_for_pos|create_master_product|activate_master_product)/);
  });

  it('RLS intacto: no desactiva ni reescribe políticas de products', () => {
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('no escribe en tablas financieras ni de inventario (solo DDL + fixtures fuera de la migración)', () => {
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/(INSERT INTO|UPDATE)\s+(public\.)?(transactions|cash_|inventory|stock_movements)/i);
  });

  it('incluye verificaciones de integridad (DO block) con conteo y firma de las RPCs', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: la columna products\.operational_class no fue creada'/);
    expect(sql).toMatch(/v_enum_values IS DISTINCT FROM 'venta,insumo,activo_fijo,util_herramienta'/);
    expect(sql).toMatch(/position\('operational_class' IN pg_get_function_result\(p\.oid\)\)/);
    expect(sql).toMatch(/RAISE NOTICE 'CP-OPERATIONAL-CLASS-002 OK/);
  });

  it('existe la evidencia de la verificación en PostgreSQL REAL (34 checks)', () => {
    const evidence = join(process.cwd(), 'audit-evidence', 'CP-OPERATIONAL-CLASS-002', 'verificacion-postgresql-real.log');
    expect(existsSync(evidence)).toBe(true);
    const log = readFileSync(evidence, 'utf8');
    expect(log).toContain('TODAS las verificaciones PostgreSQL pasaron');
  });
});
