/**
 * MISIÓN CP-CAT-MAESTRO-002 (inicialización) — migración de incorporación.
 *
 * Contrato estático de la migración:
 *   20261031140000 — RPC incorporate_store_products_to_master(store, dry_run, user)
 *
 * Invariantes verificados (misión §3–§8):
 *  - Autorización: SOLO gobernador del catálogo (is_catalog_governor) — org-level.
 *  - Fidelidad literal: copia sku/name/description/barcode/barcode_type/
 *    unit_of_measure/is_service/image por REFERENCIA (image_url → image_path);
 *    sin reformateos (valida espacios/vacíos como excepción, no recorta).
 *  - Correspondencia 1:1: UPDATE de products.master_product_id sobre la fila
 *    ORIGINAL; JAMÁS un segundo INSERT en products (no duplica fila local).
 *  - Conciliación: identidad contradictoria → ERR_IDENTITY_CONFLICT sin fusión;
 *    barcode colisionado → ERR_BARCODE_CONFLICT; reutilización de maestro
 *    coincidente (linked_existing).
 *  - Idempotencia: solo procesa master_product_id IS NULL.
 *  - Dry-run: p_dry_run no escribe (solo proyección).
 *  - Auditoría: master_change_log + audit_logs por producto.
 *  - Separación compartido/local: NO toca price/cost_price/stock_current.
 *  - ACL: EXECUTE solo authenticated + service_role; revocado a PUBLIC/anon.
 *  - Guard fail-closed al final de la migración.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261031140000_cp_catalogo_master_incorporacion_backfill.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261031140000 — incorporación fiel 1:1 del catálogo local al maestro (CP-CAT-MAESTRO-002)', () => {
  const s = read(MIGRATION);

  it('define la RPC con firma (store, dry_run, user) SECURITY DEFINER y search_path fijado', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.incorporate_store_products_to_master\(\s*p_store_id uuid,\s*p_dry_run boolean DEFAULT false,\s*p_user_id uuid DEFAULT NULL\s*\)/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it('autoriza SOLO al gobernador del catálogo (org-level, como connect_store_catalog)', () => {
    expect(s).toMatch(/is_catalog_governor\(v_tenant, v_caller_uid\)/);
    expect(s).toMatch(/ERR_UNAUTHORIZED: solo el gobernador del catálogo incorpora productos al maestro/);
  });

  it('correspondencia 1:1: vínculo sobre la fila original, SIN segundo INSERT local', () => {
    expect(s).toMatch(/UPDATE public\.products SET master_product_id = v_master_id/);
    expect(s).toMatch(/UPDATE public\.products SET master_product_id = v_existing\.id/);
    // El único INSERT en products está PROHIBIDO en esta RPC (no duplica fila local)
    expect(s).not.toMatch(/INSERT INTO public\.products/);
  });

  it('fidelidad literal de la identidad (sin reformateos): campos copiados tal cual', () => {
    expect(s).toMatch(/\(v_tenant, r\.sku, r\.name, r\.description, r\.image_url,/);
    expect(s).toMatch(/r\.barcode_type/);
    expect(s).toMatch(/r\.unit_of_measure, r\.is_service/);
    // imagen por REFERENCIA: image_url → image_path, sin duplicar objetos
    expect(s).toMatch(/r\.image_url/);
    expect(s).not.toMatch(/storage\.|create_signed_url|upload/i);
    // SKU con espacios → excepción documentada, NO recorte silencioso
    expect(s).toMatch(/ERR_SKU_WITH_SPACES/);
    expect(s).toMatch(/no se reformatea \(fidelidad literal\)/);
  });

  it('conciliación: conflicto identificable sin fusión silenciosa ni duplicado', () => {
    expect(s).toMatch(/ERR_IDENTITY_CONFLICT/);
    expect(s).toMatch(/ERR_BARCODE_CONFLICT/);
    expect(s).toMatch(/linked_existing/);
    expect(s).toMatch(/would_link_existing/);
  });

  it('regla de identidad documentada: barcode INTERNAL = artefacto de tienda (no identidad global)', () => {
    // products_barcode_unique es global → dos tiendas nunca comparten barcode
    // local; los INTERNAL son generados por tienda (trg_ensure_product_barcode)
    // y NO cuentan como contradicción de identidad para reutilizar el maestro.
    expect(s).toMatch(/COALESCE\(r\.barcode_type, ''\) = 'INTERNAL'/);
    expect(s).toMatch(/COALESCE\(v_existing\.barcode_type, ''\) = 'INTERNAL'/);
    expect(s).toMatch(/REGLA DE IDENTIDAD \(documentada\)/);
    // El conflicto registra los tipos para diagnóstico
    expect(s).toMatch(/'master_barcode_type', v_existing\.barcode_type/);
  });

  it('idempotencia: solo candidatos sin vínculo (master_product_id IS NULL)', () => {
    expect(s).toMatch(/WHERE p\.store_id = p_store_id AND p\.master_product_id IS NULL/);
    expect(s).toMatch(/WHERE store_id = p_store_id AND master_product_id IS NULL/);
  });

  it('dry-run sin escrituras (manifiesto previo §3.4)', () => {
    expect(s).toMatch(/p_dry_run/);
    expect(s).toMatch(/would_create_master/);
    // dry-run se evalúa ANTES de cualquier INSERT/UPDATE del camino real
    const dryRunIdx = s.indexOf('IF p_dry_run THEN');
    const insertIdx = s.indexOf('INSERT INTO public.master_products');
    expect(dryRunIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(dryRunIdx);
  });

  it('auditoría por producto: master_change_log (sku+name) y audit_logs', () => {
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
    expect(s).toMatch(/\(v_master_id, v_tenant, 'sku', NULL, r\.sku, v_caller_uid, p_store_id\)/);
    expect(s).toMatch(/\(v_master_id, v_tenant, 'name', NULL, r\.name, v_caller_uid, p_store_id\)/);
    expect(s).toMatch(/'INCORPORATE_PRODUCT_TO_MASTER'/);
  });

  it('separación compartido/local: NO toca datos comerciales', () => {
    // La RPC no menciona columnas comerciales en ningún UPDATE/INSERT de products
    expect(s).not.toMatch(/SET [^=]*price/);
    expect(s).not.toMatch(/cost_price\s*=/);
    expect(s).not.toMatch(/stock_current\s*=/);
    expect(s).not.toMatch(/min_stock\s*=/);
  });

  it('aislamiento por fila: excepción controlada no aborta la carga completa', () => {
    expect(s).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(s).toMatch(/ERR_ROW_PROCESSING/);
    expect(s).toMatch(/completed_with_exceptions/);
  });

  it('ACL: EXECUTE revocado a PUBLIC/anon y concedido a authenticated+service_role', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.incorporate_store_products_to_master\(uuid, boolean, uuid\) FROM PUBLIC, anon/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.incorporate_store_products_to_master\(uuid, boolean, uuid\) TO authenticated, service_role/);
  });

  it('guard fail-closed post-migración (CP-CAT-M002-BF-GUARD)', () => {
    expect(s).toMatch(/CP-CAT-M002-BF-GUARD/);
    expect(s).toMatch(/la RPC debe ser SECURITY DEFINER/);
    expect(s).toMatch(/autorización de gobernador ausente/);
    expect(s).toMatch(/la RPC no debe tocar datos comerciales/);
    expect(s).toMatch(/grants incompletos/);
  });

  it('no altera el modelo existente (sin DDL de tablas, sin políticas RLS)', () => {
    expect(s).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/);
    expect(s).not.toMatch(/CREATE POLICY|DROP POLICY/);
    expect(s).not.toMatch(/CREATE UNIQUE INDEX|DROP INDEX/);
  });
});
