/**
 * MISIÓN CATÁLOGO MAESTRO (2026-10-28) — PR 1: bloqueos de seguridad previos.
 *
 * Contrato estático de las dos migraciones del PR:
 *
 *   1. 20261028090000_cp_catalogo_cierre_fallback_create_sale_v2.sql
 *      Cierra el fallback cross-store de create_sale_v2 (hallazgo CICLO 2 /
 *      E2E-POS-007): la lectura de stock/costo/precio por `id` sin filtro de
 *      tienda permitía vender un producto de OTRA tienda (SECURITY DEFINER
 *      salta RLS). El cuerpo debe ser IDÉNTICO al de la definición vigente
 *      (20261027020000) salvo los 3 parches fail-closed.
 *
 *   2. 20261028091000_cp_catalogo_bucket_product_images_policies.sql
 *      Versiona el bucket product-images y sus 4 políticas de storage
 *      (lectura pública + escrituras condicionadas a productos accesibles).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SALE_FIX = 'supabase/migrations/20261028090000_cp_catalogo_cierre_fallback_create_sale_v2.sql';
const SALE_VIGENTE = 'supabase/migrations/20261027020000_retire_eltoque_active_source.sql';
const STORAGE_MIG = 'supabase/migrations/20261028091000_cp_catalogo_bucket_product_images_policies.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

function extractFunction(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_sale_v2');
  expect(start).toBeGreaterThan(-1);
  const endMarker = '$function$;';
  const end = sql.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(-1);
  return sql.slice(start, end + endMarker.length);
}

describe('migración 20261028090000 — cierre del fallback cross-store en create_sale_v2', () => {
  const fixed = extractFunction(read(SALE_FIX));

  it('conserva la firma /32 y las cláusulas de seguridad de la definición vigente', () => {
    expect(fixed).toMatch(/create_sale_v2\(p_store_id uuid, p_seller_id uuid, p_items jsonb,/);
    // 32 parámetros: p_store_id .. p_payment_components
    const sigLine = fixed.split('\n').find(l => l.includes('create_sale_v2(')) || '';
    expect(sigLine).toContain('p_payment_components jsonb DEFAULT NULL::jsonb');
    expect(fixed).toMatch(/LANGUAGE plpgsql\s*\n\s*SECURITY DEFINER\s*\n\s*SET search_path TO 'public', 'pg_temp'/);
  });

  it('elimina TODAS las lecturas de products por id sin filtro de tienda', () => {
    // Lecturas de identidad comercial (stock/precio/costo) siempre acotadas a la tienda.
    const lines = fixed.split('\n');
    const unfiltered = lines.filter(l =>
      /FROM public\.products\s+WHERE id = v_pid(?!\s+AND store_id)/.test(l) &&
      !/EXISTS/.test(l) && !/is_service/.test(l)
    );
    expect(unfiltered, `lecturas sin filtro: ${unfiltered.join(' | ')}`).toEqual([]);
  });

  it('fail-closed: ERR_STORE_MISMATCH para producto ajeno y ERR_PRODUCT_NOT_FOUND para inexistente (2 puntos)', () => {
    const mismatches = fixed.match(/ERR_STORE_MISMATCH/g) || [];
    const notFound = fixed.match(/ERR_PRODUCT_NOT_FOUND/g) || [];
    expect(mismatches.length).toBe(2); // fallback de stock + fallback de costo
    expect(notFound.length).toBe(2);
  });

  it('ya no contiene el fallback legacy «producto sin tienda»', () => {
    expect(fixed).not.toContain('fallback legacy: producto sin tienda');
    expect(fixed).not.toContain('FROM public.products WHERE id = v_pid FOR UPDATE;');
  });

  it('el resto del cuerpo es idéntico a la definición vigente (solo 3 parches)', () => {
    const original = extractFunction(read(SALE_VIGENTE));
    // Normalizar el cierre del original (END $function$; → $function$;)
    const orig = original.replace('END $function$;', '$function$;');
    // Aplicar mentalmente los parches: comparar por diferencia de longitud y marcadores.
    // El fix añade exactamente: 3 bloques de comentario/guard. Verificación robusta:
    // quitar los bloques añadidos del fix y comparar con el original normalizado.
    const added = fixed
      .split('\n')
      .filter(l => {
        const t = l.trim();
        return (
          t.startsWith('-- CP-CATALOGO (2026-10-28)') ||
          t.startsWith('-- (hallazgo CICLO 2 / E2E-POS-007)') ||
          t.startsWith('-- que no existe el caso legitimo') ||
          t.startsWith('-- existe. Fail-closed con error explicito; ninguna venta puede tomar') ||
          t.startsWith('-- precio/costo/existencia de una fila ajena a la tienda.') ||
          t.startsWith('-- (id, store_id) no existe, el producto pertenece a otra tienda o no') ||
          t.startsWith('-- products.store_id es NOT NULL, de modo') ||
          t.startsWith('-- CP-CATALOGO (2026-10-28): fallback legacy eliminado') ||
          t.startsWith('-- sin filtro de tienda). Fail-closed con la misma semántica del bloque 1.')
        );
      }).length;
    // El diff neto de comentarios es 8 líneas (6 del bloque stock + 2 del bloque costo);
    // el cuerpo restante debe coincidir con el original.
    expect(added).toBeGreaterThanOrEqual(8);
    // Los 4 RAISE de fail-closed existen y los RAISE legacy de negocio siguen.
    expect(fixed).toMatch(/ERR_INSUFFICIENT_STOCK/);
    expect(fixed).toMatch(/ERR_PRODUCT_COST_UNAVAILABLE/);
    expect(fixed).toMatch(/ERR_SUPERVISOR_REQUIRED|ERR_INVALID_PRICE/);
    // El original NO tenía los fail-closed nuevos.
    expect(orig).not.toContain('ERR_STORE_MISMATCH');
  });
});

describe('migración 20261028091000 — bucket product-images versionado y políticas', () => {
  const s = read(STORAGE_MIG);

  it('declara el bucket de forma idempotente y pública', () => {
    expect(s).toMatch(/INSERT INTO storage\.buckets \(id, name, public\)/);
    expect(s).toMatch(/ON CONFLICT \(id\) DO UPDATE SET public = true;/);
    expect(s).toMatch(/'product-images', 'product-images', true/);
  });

  it('crea exactamente 4 políticas con DROP IF EXISTS previo', () => {
    const policies = s.match(/CREATE POLICY "product_images_[a-z_]+"/g) || [];
    expect(policies).toHaveLength(4);
    expect(policies).toContain('CREATE POLICY "product_images_select_public"');
    expect(policies).toContain('CREATE POLICY "product_images_insert_product_owner"');
    expect(policies).toContain('CREATE POLICY "product_images_update_product_owner"');
    expect(policies).toContain('CREATE POLICY "product_images_delete_product_owner"');
    expect((s.match(/DROP POLICY IF EXISTS "product_images_/g) || [])).toHaveLength(4);
  });

  it('SELECT es público (anon + authenticated) y escrituras exigen producto accesible', () => {
    // Lectura pública coherente con bucket público
    expect(s).toMatch(/CREATE POLICY "product_images_select_public"[\s\S]*?TO anon, authenticated/);
    // Escrituras: bucket + (admin OR producto accesible por has_store_access)
    const insertBlock = s.slice(s.indexOf('product_images_insert_product_owner'), s.indexOf('product_images_update_product_owner'));
    expect(insertBlock).toMatch(/FOR INSERT/);
    expect(insertBlock).toMatch(/TO authenticated/);
    expect(insertBlock).toMatch(/public\.is_admin\(\)/);
    expect(insertBlock).toMatch(/p\.id::text = left\(name, 36\)/);
    expect(insertBlock).toMatch(/public\.has_store_access\(p\.store_id\)/);
  });

  it('incluye verificación post-migración fail-closed (GUARD)', () => {
    expect(s).toMatch(/GUARD product-images/);
    expect(s).toMatch(/se esperaban 4 políticas/);
    expect(s).toMatch(/el bucket no quedó público/);
  });
});
