/**
 * CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 — migración estructural.
 *
 * Contrato estático de la migración 20261116140000:
 *   · Trigger trg_products_master_link_guard en products (BEFORE INSERT/UPDATE
 *     dirigido): prohíbe filas operativas sin maestro en tienda conectada,
 *     valida coherencia de tenant del vínculo y respeta huérfanos históricos.
 *   · reactivate_master_product: gobernador-only, master_change_log, idempotente.
 *   · activate_master_product: re-activación local (is_active) sin tocar
 *     costos/precios + ERR_LOCAL_CONFLICT + política nominal 1 CUP intacta.
 *   · create_transfer: espejo con master_product_id + tenant_id;
 *     ERR_TRANSFER_MIRROR_NEEDS_MASTER en destino conectado sin maestro.
 *   · register_reception: fail-closed A5 (rol) / A6 (archivado) / A7 (vínculo
 *     ocupado); contrato RETURNS uuid + SECURITY DEFINER + search_path intactos;
 *     sin rama de conflicto con fila huérfana (RECEPTION_MASTER_CONFLICT fuera).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261116140000_cp_reception_master_catalog_integrity.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261116140000 — regla estructural anti-huérfanos (misión §7)', () => {
  const s = read(MIGRATION);

  it('guard de BD: trigger BEFORE INSERT/UPDATE dirigido sobre products', () => {
    expect(s).toMatch(/CREATE TRIGGER trg_products_master_link_guard\s+BEFORE INSERT OR UPDATE OF is_active, master_product_id, store_id, tenant_id ON public\.products/);
  });

  it('el guard prohíbe la fila operativa sin maestro en tienda conectada (INSERT)', () => {
    expect(s).toMatch(/IF NEW\.is_active AND NEW\.master_product_id IS NULL\s+AND public\.is_catalog_store_connected\(v_store_tenant, NEW\.store_id\) THEN/);
    expect(s).toMatch(/ERR_ORPHAN_PRODUCT_IN_CONNECTED_STORE/);
  });

  it('el guard respeta huérfanos históricos (solo bloquea violaciones NUEVAS)', () => {
    expect(s).toMatch(/IF NOT \(OLD\.is_active AND OLD\.master_product_id IS NULL\) THEN/);
  });

  it('el guard valida coherencia de tenant del vínculo maestro', () => {
    expect(s).toMatch(/ERR_MASTER_TENANT_MISMATCH/);
    expect(s).toMatch(/v_master_tenant IS DISTINCT FROM v_store_tenant/);
  });

  it('reactivate_master_product: gobernador-only + master_change_log + idempotente', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.reactivate_master_product\(/);
    expect(s).toMatch(/IF NOT public\.is_catalog_governor\(v_tenant, v_caller_uid\) THEN/);
    expect(s).toMatch(/'status', 'archived', 'active'/);
    expect(s).toMatch(/'already_active', true/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.reactivate_master_product\(uuid, uuid, uuid\) FROM PUBLIC, anon/);
  });

  it('activate_master_product: re-activa la fila local inactiva SIN tocar costos/precios', () => {
    expect(s).toMatch(/SELECT id, cost_average, is_active INTO v_existing, v_existing_ca, v_existing_is_active/);
    expect(s).toMatch(/UPDATE public\.products SET is_active = true WHERE id = v_existing/);
    expect(s).toMatch(/'local_reactivated', true/);
    // La actualización de is_active NO arrastra price/cost_price/cost_average:
    const upd = s.match(/UPDATE public\.products SET is_active = true WHERE id = v_existing;/g);
    expect(upd).toBeTruthy();
  });

  it('activate_master_product: conflicto de SKU huérfano accionable (sin auto-vínculo)', () => {
    expect(s).toMatch(/ERR_LOCAL_CONFLICT: la tienda ya tiene un producto local con SKU/);
  });

  it('activate_master_product: política nominal 1 CUP intacta (VERBATIM 20261115120100)', () => {
    expect(s).toMatch(/nominal_1cup_owner_policy/);
    expect(s).toMatch(/preexistente_intacto/);
    expect(s).toMatch(/0, 'CUP', 0, 1, 1, 0, true, true, p_operational_class/);
  });

  it('create_transfer: el espejo porta identidad maestra y tenant del destino', () => {
    expect(s).toMatch(/p\.master_product_id,/);
    expect(s).toMatch(/v_dest_store\.tenant_id,/);
    expect(s).toMatch(/v_origin_product\.master_product_id,/);
  });

  it('create_transfer: rechaza espejo huérfano hacia tienda conectada', () => {
    expect(s).toMatch(/ERR_TRANSFER_MIRROR_NEEDS_MASTER/);
    expect(s).toMatch(/IF v_dest_connected AND v_origin_product\.master_product_id IS NULL THEN/);
  });

  it('register_reception: contrato intacto (firma 11 params, RETURNS uuid, SECURITY DEFINER, search_path)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.register_reception\(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now\(\), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '\[\]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid, p_supplier_code text DEFAULT NULL::text, p_supplier_address text DEFAULT NULL::text, p_supplier_phone text DEFAULT NULL::text, p_supplier_tax_id text DEFAULT NULL::text\)/);
    expect(s).toMatch(/RETURNS uuid/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path TO 'public'/);
  });

  it('register_reception A5: rol exigido para crear maestro (paridad create_master_product)', () => {
    expect(s).toMatch(/ERR_UNAUTHORIZED_MASTER_CREATE/);
    expect(s).toMatch(/has_store_role_as\(v_caller_uid, p_store_id, ARRAY\['admin','manager','encargado'\]::text\[\]\)/);
  });

  it('register_reception A6/A7: fail-closed — jamás fila huérfana ni procesado silencioso', () => {
    expect(s).toMatch(/ERR_MASTER_LINK_CONFLICT/);
    expect(s).toMatch(/ERR_MASTER_ARCHIVED: el producto maestro del SKU/);
    // La rama que creaba filas locales sin vínculo desaparece (el INSERT de
    // auditoría de conflicto con fila huérfana ya no existe; solo queda la
    // mención del string dentro del guard que verifica su ausencia):
    expect(s).not.toMatch(/VALUES \('RECEPTION_MASTER_CONFLICT'/);
  });

  it('register_reception: escritor canónico de la recepción intacto (WAC + movimiento + auditoría)', () => {
    expect(s).toMatch(/p_event\s+:= 'reception_in'/);
    expect(s).toMatch(/register_stock_movement/);
    expect(s).toMatch(/'REGISTER_RECEPTION', 'receipts'/);
    expect(s).toMatch(/'new_products_master_created', v_master_created_count/);
  });

  it('guard fail-closed al final de la migración', () => {
    expect(s).toMatch(/CP_LOG_RECEPTION_GUARD/);
    expect(s).toMatch(/CP-LOG-RECEPTION-001-GUARD OK/);
  });
});
