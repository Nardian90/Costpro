/**
 * CORRECCIÓN FUNCIONAL — CATÁLOGO MAESTRO DE LA ORGANIZACIÓN (2026-11-12) —
 * migración 20261112120000: SKU compartido e INMUTABLE tras la creación +
 * políticas de storage para la imagen compartida (master-…).
 *
 * Contrato estático verificado (brief §2, tabla de identidad compartida):
 *  · SKU: inmutable después de la creación en TODO el backend — cualquier
 *    objeto de cambios con la clave 'sku' se rechaza con ERR_SKU_IMMUTABLE
 *    en el punto único de escritura (fn_master_apply_identity_changes, que
 *    comparten update_master_product y las propuestas aprobadas por
 *    review_master_proposal) y también al ENCOLAR propuestas
 *    (propose_master_change). 'sku' desaparece de los campos editables.
 *  · Nombre: compartido y EDITABLE (se añade a la identidad editable; la
 *    propagación SKU/nombre a las filas locales vinculadas se conserva).
 *  · Imagen: compartida y editable (propagación intacta) + políticas de
 *    storage product-images que admiten objetos master-<id>-… para miembros
 *    de tiendas conectadas (corrige el defecto latente de 20261111120000:
 *    MasterIdentityEditModal subía con ese prefijo y la política lo rechazaba
 *    para usuarios no administradores).
 *  · Filas locales SIN maestro: trigger trg_products_sku_immutable_guard
 *    (reemplaza al de movimientos): CUALQUIER cambio real de products.sku →
 *    ERR_SKU_IMMUTABLE (fail-closed; cubre PostgREST directo). Filas
 *    vinculadas: coerción del maestro (identity guard), como antes.
 *  · Sin datos comerciales por tienda en la escritura; unicidades intactas.
 *  · Idempotente + guard fail-closed post-migración.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261112120000_cp_catalogo_sku_inmutable.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261112120000 — SKU inmutable + identidad completa del Catálogo Maestro', () => {
  const s = read(MIGRATION);

  it('conserva el contrato de fn_master_apply_identity_changes (SECURITY DEFINER + search_path)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_master_apply_identity_changes\(\s*p_master_id uuid,\s*p_changes jsonb,\s*p_actor uuid,\s*p_origin_store_id uuid DEFAULT NULL,\s*p_proposal_id uuid DEFAULT NULL\s*\)/);
    expect(s).toMatch(/RETURNS jsonb/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public'/);
  });

  it('SKU inmutable en el punto único de escritura: cualquier clave sku → ERR_SKU_IMMUTABLE (antes de la validación de campos)', () => {
    // Guardra explícita sobre la EXISTENCIA de la clave (incluye no-cambios y null).
    expect(s).toMatch(/IF p_changes \? 'sku' THEN/);
    expect(s).toMatch(/ERR_SKU_IMMUTABLE: el SKU del producto \(%\) es compartido e inmutable; no puede modificarse después de su creación/);
    // 'sku' YA NO es identidad compartida editable (fuera del conjunto permitido).
    expect(s).toMatch(/v_allowed text\[\] := ARRAY\['name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'\]/);
    // La lógica muerta de cambio de SKU del maestro desaparece del CUERPO de
    // fn_master_apply (el DO final la verifica igualmente contra la BD).
    const fnBody = s.slice(
      s.indexOf('CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes'),
      s.indexOf('\$function$;', s.indexOf('CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes')),
    );
    expect(fnBody).not.toContain('ERR_SKU_LOCKED_BY_MOVEMENTS');
    expect(fnBody).not.toContain('ERR_MASTER_SKU_CONFLICT');
  });

  it('propose_master_change rechaza la clave sku al ENCOLAR (no encola propuestas que nunca podrán aplicarse)', () => {
    // Guardra explícita en el cuerpo de propose_master_change.
    expect(s).toMatch(/IF p_changes \? 'sku' THEN\s+RAISE EXCEPTION 'ERR_SKU_IMMUTABLE: el SKU del producto \(%\) es compartido e inmutable; no puede proponerse su modificación'/);
    // 'sku' YA NO es campo proponible (fuera del conjunto permitido de la RPC).
    expect(s).toMatch(/v_allowed text\[\] := ARRAY\['name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'\];\s+v_key text;\s+BEGIN\s+IF v_caller_uid IS NULL OR p_origin_store_id IS NULL/);
  });

  it('conserva la propagación de identidad: nombre (con re-coerción de SKU canónico) e imagen compartida', () => {
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
    expect(s).toMatch(/SET sku = m\.sku,\s*name = m\.name/);
    expect(s).toMatch(/SET image_url = m\.image_path/);
    // La propagación del nombre dispara con el cambio de NOMBRE (el SKU ya no cambia).
    expect(s).toMatch(/IF p_changes->>'name' IS NOT NULL THEN/);
  });

  it('trigger trg_products_sku_immutable_guard: replaces the movements guard — ANY real sku change on unlinked rows is blocked', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_products_sku_immutable_guard\(\)/);
    expect(s).toMatch(/DROP TRIGGER IF EXISTS trg_products_sku_movement_guard ON public\.products;/);
    expect(s).toMatch(/DROP FUNCTION IF EXISTS public\.fn_products_sku_movement_guard\(\);/);
    expect(s).toMatch(/CREATE TRIGGER trg_products_sku_immutable_guard\s+BEFORE UPDATE OF sku ON public\.products\s+FOR EACH ROW EXECUTE FUNCTION public\.fn_products_sku_immutable_guard\(\);/);
    // Filas vinculadas: gobernadas por el maestro (sin bloqueo aquí — coerción del identity guard).
    expect(s).toMatch(/IF NEW\.master_product_id IS NOT NULL THEN\s+RETURN NEW;/);
    // No-cambio (re-envío idéntico / upsert con el mismo valor de la llave) → permitido.
    expect(s).toMatch(/IF NEW\.sku IS NOT DISTINCT FROM OLD\.sku THEN\s+RETURN NEW;/);
    // Cualquier cambio real → ERR_SKU_IMMUTABLE.
    expect(s).toMatch(/RAISE EXCEPTION 'ERR_SKU_IMMUTABLE: el SKU del producto \(%\) es inmutable tras su creación; no puede modificarse', OLD\.sku;/);
  });

  it('políticas de storage product-images: rama master-<id>-… para miembros de tiendas CONECTADAS (imagen compartida)', () => {
    // Las tres políticas de escritura se redefinen con la rama adicional.
    expect(s).toMatch(/CREATE POLICY "product_images_insert_product_owner" ON storage\.objects/);
    expect(s).toMatch(/CREATE POLICY "product_images_update_product_owner" ON storage\.objects/);
    expect(s).toMatch(/CREATE POLICY "product_images_delete_product_owner" ON storage\.objects/);
    // El prefijo se valida por PK de master_products (substring del nombre) —
    // sin barridos — y el acceso por tienda conectada (aislamiento por tenant).
    expect(s).toMatch(/name LIKE 'master-%'/);
    expect(s).toMatch(/mp\.id::text = substring\(name from 8 for 36\)/);
    expect(s).toMatch(/csl\.tenant_id = mp\.tenant_id/);
    expect(s).toMatch(/csl\.status = 'connected'/);
    expect(s).toMatch(/public\.has_store_access\(csl\.store_id\)/);
    // Se CONSERVA la rama vigente de producto local accesible.
    expect(s).toMatch(/p\.id::text = left\(name, 36\)/);
  });

  it('guard fail-closed post-migración (patrón del repo)', () => {
    expect(s).toMatch(/DO \$CP_CATALOGO_IDENTIDAD_GUARD\$/);
    expect(s).toMatch(/CP-CATALOGO-IDENTIDAD-GUARD: falta la inmutabilidad de SKU en fn_master_apply_identity_changes/);
    expect(s).toMatch(/CP-CATALOGO-IDENTIDAD-GUARD: la lógica de cambio de SKU del maestro debe haber desaparecido/);
    expect(s).toMatch(/CP-CATALOGO-IDENTIDAD-GUARD: el trigger trg_products_sku_immutable_guard debe existir/);
    expect(s).toMatch(/CP-CATALOGO-IDENTIDAD-GUARD: el trigger anterior de SKU por movimientos debe haber sido retirado/);
    expect(s).toMatch(/CP-CATALOGO-IDENTIDAD-GUARD: las 3 políticas de product-images deben incluir la rama master-/);
    expect(s).toMatch(/propose_master_change debe rechazar la clave sku al encolar/);
  });

  it('idempotencia y preservación: sin datos comerciales, re-ejecutable, sin toques en unicidades vigentes', () => {
    // DROP ... IF EXISTS en trigger/función/políticas (re-ejecutable).
    expect(s).toMatch(/DROP POLICY IF EXISTS "product_images_insert_product_owner" ON storage\.objects;/);
    expect(s).toMatch(/DROP POLICY IF EXISTS "product_images_update_product_owner" ON storage\.objects;/);
    expect(s).toMatch(/DROP POLICY IF EXISTS "product_images_delete_product_owner" ON storage\.objects;/);
    // La RPC de identidad NO toca datos comerciales de las tiendas.
    expect(s).toMatch(/datos comerciales intactos/i);
  });
});
