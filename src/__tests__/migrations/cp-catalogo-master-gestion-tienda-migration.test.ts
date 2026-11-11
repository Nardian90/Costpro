/**
 * MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11) —
 * migración 20261111120000: guardas de integridad de SKU ante movimientos.
 *
 * Contrato estático verificado (brief §4 — criterio del propietario):
 *  · El SKU de un producto con movimientos históricos NO se modifica. La
 *    decisión se basa en la EXISTENCIA REAL de movimientos
 *    (transaction_items / stock_movements / receipt_items y la columna
 *    materializada has_movements), no en antigüedad ni estado de activación.
 *  · Punto único del maestro: fn_master_apply_identity_changes (lo comparten
 *    update_master_product y review_master_proposal — ninguna ruta esquiva
 *    la regla).
 *  · Filas locales sin maestro: trigger BEFORE UPDATE OF sku fail-closed
 *    (PostgREST directo incluido). Filas vinculadas: coerción del maestro.
 *  · Se conserva íntegro el comportamiento previo de la función (aplicación
 *    campo a campo, master_change_log, propagación de SKU/nombre/imagen).
 *  · Sin datos comerciales (precio/costo/existencias) en la escritura.
 *  · Idempotente + guard fail-closed post-migración.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261111120000_cp_catalogo_master_gestion_tienda.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261111120000 — guardas de SKU ante movimientos (gestión Catálogo Maestro)', () => {
  const s = read(MIGRATION);

  it('conserva el contrato de fn_master_apply_identity_changes (SECURITY DEFINER + search_path)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_master_apply_identity_changes\(\s*p_master_id uuid,\s*p_changes jsonb,\s*p_actor uuid,\s*p_origin_store_id uuid DEFAULT NULL,\s*p_proposal_id uuid DEFAULT NULL\s*\)/);
    expect(s).toMatch(/RETURNS jsonb/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public'/);
  });

  it('bloquea el cambio de SKU del maestro cuando una fila vinculada tiene movimientos (ERR_SKU_LOCKED_BY_MOVEMENTS)', () => {
    // La guardra SOLO se activa ante un cambio REAL de SKU (no ante re-envíos idénticos).
    expect(s).toMatch(/IF v_new_sku IS NOT NULL AND v_new_sku <> v_master\.sku THEN/);
    // Existencia REAL de movimientos: columna materializada + verificación directa.
    expect(s).toMatch(/COALESCE\(pr\.has_movements, false\)/);
    expect(s).toMatch(/EXISTS \(SELECT 1 FROM public\.transaction_items ti WHERE ti\.product_id = pr\.id\)/);
    expect(s).toMatch(/EXISTS \(SELECT 1 FROM public\.stock_movements sm WHERE sm\.product_id = pr\.id\)/);
    expect(s).toMatch(/EXISTS \(SELECT 1 FROM public\.receipt_items ri WHERE ri\.product_id = pr\.id\)/);
    expect(s).toMatch(/ERR_SKU_LOCKED_BY_MOVEMENTS/);
  });

  it('detecta colisión del SKU nuevo con filas locales no vinculadas de las tiendas afectadas (ERR_MASTER_SKU_CONFLICT)', () => {
    expect(s).toMatch(/ERR_MASTER_SKU_CONFLICT/);
    expect(s).toMatch(/pr2\.master_product_id IS NULL/);
    expect(s).toMatch(/pr2\.store_id IN \(SELECT store_id FROM public\.products WHERE master_product_id = p_master_id\)/);
  });

  it('conserva el comportamiento previo: auditoría por campo, propagación de SKU/nombre e imagen compartida', () => {
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
    expect(s).toMatch(/SET sku = m\.sku,\s*name = m\.name/);
    expect(s).toMatch(/SET image_url = m\.image_path/);
    // ACL del helper interno: solo service_role (paridad con 20261030120000).
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes[^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_master_apply_identity_changes[^)]*\) TO service_role/);
  });

  it('trigger de filas locales SIN maestro: BEFORE UPDATE OF sku, fail-closed ante movimientos', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_products_sku_movement_guard\(\)/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    // Filas vinculadas al maestro NO se tocan aquí (las gobierna la guardra del maestro).
    expect(s).toMatch(/IF NEW\.master_product_id IS NOT NULL THEN\s+RETURN NEW;\s+END IF;/);
    // Sin cambio real de SKU → coste cero.
    expect(s).toMatch(/IF NEW\.sku IS NOT DISTINCT FROM OLD\.sku THEN\s+RETURN NEW;\s+END IF;/);
    // Movimientos: columna materializada + verificación directa de las tres tablas.
    expect(s).toMatch(/COALESCE\(OLD\.has_movements, false\)/);
    expect(s).toMatch(/RAISE EXCEPTION 'ERR_SKU_LOCKED_BY_MOVEMENTS: el producto % tiene movimientos históricos; el SKU no puede modificarse', OLD\.sku/);
    expect(s).toMatch(/DROP TRIGGER IF EXISTS trg_products_sku_movement_guard ON public\.products;\s+CREATE TRIGGER trg_products_sku_movement_guard\s+BEFORE UPDATE OF sku ON public\.products\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_products_sku_movement_guard\(\);/);
  });

  it('jamás toca datos comerciales ni reconstruye documentos históricos', () => {
    const fnApply = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes'), s.indexOf('REVOKE EXECUTE ON FUNCTION public.fn_master_apply_identity_changes'));
    expect(fnApply).not.toMatch(/price|cost_price|stock_current/i);
    expect(s).not.toMatch(/DELETE FROM public\.(transaction_items|stock_movements|receipt_items)/);
    expect(s).not.toMatch(/UPDATE public\.(transaction_items|stock_movements|receipt_items)/);
  });

  it('idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS) y guard fail-closed post-migración', () => {
    expect(s).toMatch(/CP_MASTER_GESTION_GUARD\$/);
    expect(s).toMatch(/CP-MASTER-GESTION-GUARD: falta la guardra de SKU por movimientos en el maestro/);
    expect(s).toMatch(/CP-MASTER-GESTION-GUARD: falta la guardra de colisión de SKU con filas locales/);
    expect(s).toMatch(/CP-MASTER-GESTION-GUARD: la propagación de imagen compartida debe conservarse/);
    expect(s).toMatch(/CP-MASTER-GESTION-GUARD: el trigger trg_products_sku_movement_guard debe existir/);
    expect(s).toMatch(/CP-MASTER-GESTION-GUARD: la RPC no debe tocar datos comerciales/);
    expect(s).toMatch(/RAISE NOTICE 'CP-MASTER-GESTION-GUARD OK/);
  });
});
