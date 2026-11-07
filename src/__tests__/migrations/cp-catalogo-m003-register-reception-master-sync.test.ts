/**
 * MISIÓN CP-CAT-MAESTRO-003 (reconciliación Enervida + sincronía desde
 * Recepciones) — migración register_reception con sincronización del maestro.
 *
 * Contrato estático de la migración:
 *   20261107120000 — register_reception (misma firma 11 params, RETURNS uuid)
 *
 * Invariantes verificados (misión §2–§5):
 *  - Firma/contrato intactos: RETURNS uuid, SECURITY DEFINER, search_path.
 *  - Sincronía condicionada al estado REAL de conexión (is_catalog_store_connected).
 *  - CASO A4: maestro activo existente → INSERT local CON master_product_id
 *    (jamás segundo maestro) + audit RECEPTION_PRODUCT_LINKED_MASTER.
 *  - CASO A5: maestro inexistente → INSERT en master_products con SOLO
 *    identidad (sin precio/costo/stock) + master_change_log + estado 'active'
 *    asignado tras RETURNING (regresión: status NULL caía a rama archivado).
 *  - Carrera entre tiendas: unique_violation → reutiliza maestro ganador.
 *  - CASO A6: maestro archivado → local SIN vínculo + RECEPTION_MASTER_CONFLICT.
 *  - CASO A7: vínculo (maestro, tienda) ocupado → local sin vínculo + conflicto.
 *  - CASO B: tienda no conectada → alta local pura (comportamiento histórico).
 *  - El INSERT en master_products porta SOLO identidad compartida.
 *  - Auditoría final REGISTER_RECEPTION con contadores de sincronía.
 *  - ACL explícita: EXECUTE authenticated + service_role; revocado PUBLIC/anon.
 *  - Guard fail-closed al final de la migración.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261107120000_cp_catalogo_maestro_sync_register_reception.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

/** Fragmento del INSERT en master_products (solo identidad compartida). */
function masterInsertFragment(sql: string): string {
  const idx = sql.indexOf('INSERT INTO public.master_products');
  expect(idx).toBeGreaterThan(0);
  return sql.slice(idx, idx + 400);
}

describe('20261107120000 — register_reception sincroniza el Catálogo Maestro (CP-CAT-MAESTRO-003)', () => {
  const s = read(MIGRATION);

  it('conserva el contrato: misma firma 11 params, RETURNS uuid, SECURITY DEFINER, search_path', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.register_reception\(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now\(\), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '\[\]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid/);
    expect(s).toMatch(/RETURNS uuid/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public'/);
  });

  it('condiciona la sincronía al estado REAL de conexión persistido (no al frontend)', () => {
    expect(s).toMatch(/v_store_connected := public\.is_catalog_store_connected\(v_new_tenant_id, p_store_id\)/);
    expect(s).toMatch(/IF v_store_connected THEN/);
  });

  it('CASO A4: maestro activo existente → vínculo, jamás segundo maestro, auditado', () => {
    expect(s).toMatch(/SELECT id, status, name INTO v_master_id, v_master_status, v_master_name\s+FROM public\.master_products\s+WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku\s+FOR UPDATE/);
    expect(s).toMatch(/RECEPTION_PRODUCT_LINKED_MASTER/);
    expect(s).toMatch(/master_product_id, sku, name, cost_price, price/);
  });

  it('CASO A5: alta de maestro con SOLO identidad compartida + master_change_log', () => {
    const frag = masterInsertFragment(s);
    expect(frag).toMatch(/INSERT INTO public\.master_products\s+\(tenant_id, sku, name, image_path, barcode, unit_of_measure, is_service, status, created_by\)/);
    expect(frag).not.toMatch(/price|cost|stock/i);
    expect(s).toMatch(/INSERT INTO public\.master_change_log/);
  });

  it('regresión A5: estado del maestro recién creado se asigna tras RETURNING (status/name)', () => {
    // Sin esto, el chequeo posterior lee status NULL y la fila local cae por
    // error a la rama "archivado" (defecto detectado y corregido en pruebas).
    const a5 = s.slice(s.indexOf('CASO A5'), s.indexOf('EXCEPTION WHEN unique_violation'));
    expect(a5).toMatch(/v_master_status := 'active'/);
    expect(a5).toMatch(/v_master_name :=/);
  });

  it('carrera entre tiendas: unique_violation → reutiliza el maestro ganador (FOR UPDATE)', () => {
    expect(s).toMatch(/EXCEPTION WHEN unique_violation THEN[\s\S]*?SELECT id, status, name INTO v_master_id, v_master_status, v_master_name[\s\S]*?FOR UPDATE/);
  });

  it('CASO A6: maestro archivado → fila local sin vínculo + conflicto documentado', () => {
    expect(s).toMatch(/RECEPTION_MASTER_CONFLICT/);
    expect(s).toMatch(/'reason', 'ERR_MASTER_ARCHIVED'/);
    expect(s).toMatch(/'reason', 'ERR_MASTER_LINK_ALREADY_EXISTS'/);
  });

  it('CASO B: tienda no conectada conserva el comportamiento histórico exacto', () => {
    const elseB = s.slice(s.indexOf('ELSE\n        -- CASO B'), s.indexOf('END IF;\n\n      v_created_skus'));
    expect(elseB).toMatch(/INSERT INTO public\.products/);
    expect(elseB).not.toMatch(/master_product_id/);
  });

  it('la fila local vinculada nace con el trigger de identidad (sku/name = maestro); datos comerciales intactos', () => {
    expect(s).toMatch(/store_id, tenant_id, master_product_id, sku, name, cost_price, price/);
  });

  it('auditoría final REGISTER_RECEPTION con contadores de sincronía', () => {
    expect(s).toMatch(/'new_products_master_created', v_master_created_count/);
    expect(s).toMatch(/'new_products_master_linked', v_master_linked_count/);
  });

  it('ACL explícita: EXECUTE authenticated + service_role, revocado a PUBLIC/anon', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.register_reception\([^)]+\) FROM PUBLIC, anon/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.register_reception\([^)]+\) TO authenticated, service_role/);
  });

  it('guard fail-closed al final (contrato, sincronía, vínculo, auditoría, sin datos comerciales en el maestro)', () => {
    expect(s).toMatch(/CP_CAT_M003_GUARD\$/);
    expect(s).toMatch(/CP-CAT-M003-GUARD: el maestro no debe recibir datos comerciales/);
    expect(s).toMatch(/RAISE NOTICE 'CP-CAT-M003-GUARD OK/);
  });
});
