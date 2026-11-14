/**
 * CP-CAT-IMPORT-001 (2026-11-13) — migración 20261113140100: el importador
 * masivo de Excel integra el Catálogo Maestro vía la RPC SECURITY DEFINER
 * managed_bulk_import_products (mismo servicio de dominio que la alta manual
 * create_master_product y las recepciones register_reception).
 *
 * Contrato estático verificado:
 *  · Garantía de maestro por (tenant, sku) SOLO en tiendas conectadas
 *    (is_catalog_store_connected): reutiliza el existente o lo crea.
 *  · El maestro porta SOLO identidad compartida (sku, name, description,
 *    image_path, barcode, unit_of_measure, is_service) — NUNCA price,
 *    cost, min_stock, category, supplier ni operational_class.
 *  · Tienda NO conectada: alta local histórica sin maestro.
 *  · Aislamiento por fila + compensación transaccional (maestro creado y
 *    upsert local fallido → maestro eliminado: cero huérfanos).
 *  · Anti-spoofing v2.12.9 (guard auth.role() = 'service_role') y
 *    autorización idéntica a create_master_product (has_store_access_as +
 *    permiso de alta por tienda).
 *  · Idempotente (upsert por products_sku_store_unique; maestro por tenant+sku)
 *    y conservador en re-import: NO toca stock_current ni image_url.
 *  · Límite 500 filas; errores POR FILA con causa clara.
 *  · ACL: authenticated + service_role; anon/PUBLIC sin EXECUTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261113140100_cp_catalogo_importador_maestro.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261113140100 — managed_bulk_import_products integra el Catálogo Maestro', () => {
  const s = read(MIGRATION);
  const body = s.slice(
    s.indexOf('CREATE OR REPLACE FUNCTION public.managed_bulk_import_products'),
    s.indexOf('$function$;', s.indexOf('CREATE OR REPLACE FUNCTION public.managed_bulk_import_products')),
  );

  it('firma, atributos y anti-spoofing (mismo patrón que create_master_product)', () => {
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.managed_bulk_import_products\(\s*p_store_id uuid,\s*p_rows jsonb,\s*p_user_id uuid DEFAULT NULL\s*\)/);
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(body).toMatch(/CASE WHEN auth\.role\(\) = 'service_role'\s+THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/);
  });

  it('autorización: acceso a la tienda + permiso de alta (admin global o rol admin/manager/encargado)', () => {
    expect(body).toMatch(/public\.has_store_access_as\(v_caller_uid, p_store_id\)/);
    expect(body).toMatch(/public\.is_admin_check\(v_caller_uid\)/);
    expect(body).toMatch(/public\.has_store_role_as\(v_caller_uid, p_store_id, ARRAY\['admin','manager','encargado'\]::text\[\]\)/);
    expect(body).toMatch(/ERR_UNAUTHORIZED/);
    expect(body).toMatch(/ERR_UNAUTHENTICATED/);
  });

  it('maestro garantizado SOLO en tiendas conectadas (reutiliza o crea; nunca en desconectadas)', () => {
    expect(body).toMatch(/v_connected := public\.is_catalog_store_connected\(v_tenant, p_store_id\)/);
    expect(body).toMatch(/IF v_connected THEN\s+SELECT id INTO v_master_id FROM public\.master_products\s+WHERE tenant_id = v_tenant AND sku = v_sku/);
    expect(body).toMatch(/INSERT INTO public\.master_products/);
    // La inserción del maestro está dentro del bloque condicionado por v_connected
    const insertMasterAt = body.indexOf('INSERT INTO public.master_products');
    const connectedIf = body.indexOf('IF v_connected AND v_master_id IS NULL THEN');
    expect(connectedIf).toBeGreaterThan(-1);
    expect(insertMasterAt).toBeGreaterThan(connectedIf);
  });

  it('el maestro porta SOLO identidad compartida — sin datos comerciales por tienda', () => {
    const insertMaster = body.slice(
      body.indexOf('INSERT INTO public.master_products'),
      body.indexOf('RETURNING id INTO v_master_id'),
    );
    for (const col of ['tenant_id', 'sku', 'name', 'description', 'image_path', 'barcode', 'barcode_type', 'unit_of_measure', 'is_service', 'status', 'created_by']) {
      expect(insertMaster).toContain(col);
    }
    for (const forbidden of ['price', 'cost_price', 'min_stock', 'category', 'supplier', 'operational_class']) {
      expect(insertMaster).not.toContain(forbidden);
    }
    // La fila local SÍ lleva los datos comerciales (propio por tienda)
    expect(body).toMatch(/INSERT INTO public\.products\s+\(store_id, tenant_id, master_product_id, sku, name, description, image_url,\s+unit_of_measure, is_service, price, price_currency, cost_price, min_stock,/);
  });

  it('upsert idempotente y conservador: no toca stock_current ni image_url en el UPDATE', () => {
    expect(body).toMatch(/ON CONFLICT \(sku, store_id\) DO UPDATE SET/);
    const upsert = body.slice(
      body.indexOf('ON CONFLICT (sku, store_id) DO UPDATE SET'),
      body.indexOf('RETURNING id, (xmax = 0)'),
    );
    expect(upsert).not.toContain('stock_current');
    expect(upsert).not.toContain('image_url');
    expect(upsert).not.toContain('has_movements');
    expect(upsert).not.toContain('cost_average');
    // master_product_id y operational_class: COALESCE preserva el valor local si la fila no lo aporta
    expect(upsert).toMatch(/master_product_id = COALESCE\(EXCLUDED\.master_product_id, public\.products\.master_product_id\)/);
    expect(upsert).toMatch(/operational_class = COALESCE\(EXCLUDED\.operational_class, public\.products\.operational_class\)/);
  });

  it('aislamiento por fila + compensación transaccional del maestro (cero huérfanos)', () => {
    expect(body).toMatch(/EXCEPTION\s+WHEN unique_violation THEN/);
    expect(body).toMatch(/WHEN OTHERS THEN/);
    expect(body).toMatch(/DELETE FROM public\.master_change_log WHERE master_product_id = v_master_id/);
    expect(body).toMatch(/DELETE FROM public\.master_products WHERE id = v_master_id/);
    expect(body).toMatch(/v_master_created_this_row/);
    // Reporte por fila con causa clara
    for (const reason of ['ERR_PRODUCT_WITHOUT_SKU', 'ERR_SKU_WITH_SPACES', 'ERR_PRODUCT_WITHOUT_NAME', 'ERR_BARCODE_EXISTS', 'ERR_INVALID_PAYLOAD', 'ERR_INVALID_CURRENCY', 'ERR_INVALID_OPERATIONAL_CLASS', 'ERR_ROW_PROCESSING']) {
      expect(body).toContain(reason);
    }
    expect(body).toMatch(/jsonb_array_length\(p_rows\) > 500 THEN/);
  });

  it('validación de identidad literal y de negocio (igual que create_master_product / incorporate)', () => {
    expect(body).toMatch(/IF v_price < 0 OR v_cost < 0 OR v_min_stock < 1 THEN/);
    expect(body).toMatch(/v_currency NOT IN \('CUP','USD','EUR','MLC'\)/);
    // Conflicto global de barcode del maestro → fila rechazada SIN importarla
    expect(body).toMatch(/IF v_barcode IS NOT NULL AND EXISTS \(\s*SELECT 1 FROM public\.master_products WHERE barcode = v_barcode\s*\)/);
  });

  it('auditoría por fila con store_id (satisface audit_logs_store_id_check) y master_change_log en altas de maestro', () => {
    expect(body).toMatch(/INSERT INTO public\.master_change_log/);
    expect(body).toMatch(/INSERT INTO public\.audit_logs \(action, table_name, record_id, store_id, user_id, metadata\)/);
    expect(body).toMatch(/\('IMPORT_PRODUCT', 'products', v_product_id, p_store_id, v_caller_uid,/);
  });

  it('ACL: authenticated + service_role con EXECUTE; PUBLIC/anon sin', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.managed_bulk_import_products\(uuid, jsonb, uuid\) FROM PUBLIC, anon/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.managed_bulk_import_products\(uuid, jsonb, uuid\) TO authenticated, service_role/);
  });

  it('respuesta con resumen y errores por fila (contrato consumido por la ruta y la UI)', () => {
    expect(body).toMatch(/'created_products', v_created,/);
    expect(body).toMatch(/'updated_products', v_updated,/);
    expect(body).toMatch(/'masters_created', v_masters_created,/);
    expect(body).toMatch(/'masters_reused', v_masters_reused,/);
    expect(body).toMatch(/'catalog_connected', v_connected,/);
    expect(body).toMatch(/'errors', v_errors,/);
    expect(body).toMatch(/'results', v_results,/);
  });
});
