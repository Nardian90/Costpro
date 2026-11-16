/**
 * CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 — motor del importador.
 *
 * Contrato estático de la migración 20261116140100:
 *   · fn_classify_reception_import_row: helper interno SIN EXECUTE para
 *     clientes; consulta maestros y filas locales SIN excluir por estado.
 *   · classify_reception_import_rows: STABLE (solo lectura), autorización
 *     has_store_access_as, resumen calculado por el backend.
 *   · resolve_reception_import_rows: escritor canónico por fila (subtransacción
 *     + aislamiento), idempotente, carreras resueltas, confirmación explícita
 *     de reactivación, autorizaciones por operación.
 *   · Estados de la misión §5: identified / activate_local / reactivate_master
 *     / new_master / new_local / review / error.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261116140100_cp_reception_import_classification.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261116140100 — motor de clasificación del importador (misión §4-§6)', () => {
  const s = read(MIGRATION);

  it('helper interno: clasifica UNA fila consultando maestro y local SIN filtrar estado', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_classify_reception_import_row\(/);
    expect(s).toMatch(/WHERE store_id = p_store_id AND lower\(btrim\(sku\)\) = lower\(v_sku\)/);
    expect(s).toMatch(/WHERE tenant_id = p_tenant_id AND lower\(btrim\(sku\)\) = lower\(v_sku\)/);
    // Sin excluir por is_active ni por status (misión §3):
    const localSel = s.match(/SELECT id, is_active, master_product_id, name\s+INTO v_local[\s\S]{0,200}?LIMIT 1;/);
    expect(localSel).toBeTruthy();
  });

  it('helper: SKU con espacios NO se reformatea (fidelidad literal)', () => {
    expect(s).toMatch(/ERR_SKU_WITH_SPACES/);
  });

  it('helper: las validaciones de la fila fallan antes de identificar', () => {
    expect(s).toMatch(/ERR_PRODUCT_WITHOUT_NAME/);
    expect(s).toMatch(/ERR_INVALID_QUANTITY/);
    expect(s).toMatch(/ERR_INVALID_UNIT_COST/);
  });

  it('helper: huérfano local ACTIVO se usa sin duplicar (bandera orphan_local)', () => {
    expect(s).toMatch(/INFO_ORPHAN_LOCAL/);
    expect(s).toMatch(/'orphan_local', \(v_local IS NOT NULL AND v_local\.master_product_id IS NULL\)/);
  });

  it('helper: huérfano local + maestro con mismo SKU → revisión (sin auto-vínculo, §7)', () => {
    expect(s).toMatch(/ERR_ORPHAN_LOCAL_WITH_MASTER/);
  });

  it('helper: barcode contradictorio y barcode ajeno → revisión (§4)', () => {
    expect(s).toMatch(/ERR_BARCODE_CONTRADICTS/);
    expect(s).toMatch(/ERR_BARCODE_EXISTS/);
  });

  it('helper: nombre exacto SOLO auxiliar — nunca resuelve automáticamente', () => {
    expect(s).toMatch(/ERR_NAME_MATCH_REQUIRES_REVIEW/);
    expect(s).toMatch(/lower\(btrim\(m\.name\)\) = lower\(v_name\)/);
  });

  it('helper: tienda NO conectada conserva el comportamiento histórico', () => {
    expect(s).toMatch(/AND \(lower\(btrim\(sku\)\) = lower\(v_sku\) OR lower\(btrim\(name\)\) = lower\(v_name\)\)/);
    expect(s).toMatch(/v_status := 'new_local';/);
  });

  it('helper interno NO ejecutable por clientes', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_classify_reception_import_row\(uuid, uuid, boolean, jsonb, uuid\) FROM PUBLIC, anon, authenticated/);
  });

  it('classify: STABLE + autorización + límites + resumen del BACKEND', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.classify_reception_import_rows\(/);
    expect(s).toMatch(/LANGUAGE plpgsql\s+STABLE/);
    expect(s).toMatch(/has_store_access_as\(v_caller_uid, p_store_id\)/);
    expect(s).toMatch(/'computed_by', 'backend'/);
    expect(s).toMatch(/'valid_lines', v_identified \+ v_activate_local \+ v_new_master \+ v_new_local/);
  });

  it('classify: duplicados de SKU dentro del archivo → error', () => {
    expect(s).toMatch(/ERR_SKU_DUPLICATE_FILE/);
    expect(s).toMatch(/v_seen_skus \? lower\(v_sku\)/);
  });

  it('resolve: SECURITY DEFINER + aislamiento por fila (subtransacción)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_reception_import_rows\(/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/WHEN OTHERS THEN/);
    expect(s).toMatch(/ERR_ROW_PROCESSING/);
  });

  it('resolve: reactivación global SOLO con confirmación explícita + gobernador', () => {
    expect(s).toMatch(/ERR_REACTIVATION_NOT_CONFIRMED/);
    expect(s).toMatch(/ERR_UNAUTHORIZED_REACTIVATE/);
    expect(s).toMatch(/PERFORM public\.reactivate_master_product\(v_master_id, p_store_id, v_caller_uid\)/);
  });

  it('resolve: creación de maestro con trazabilidad de origen de importación', () => {
    expect(s).toMatch(/RECEPTION_IMPORT_MASTER_CREATED/);
    expect(s).toMatch(/'origin', 'reception_import'/);
    expect(s).toMatch(/INSERT INTO public\.master_change_log[\s\S]{0,220}?\(v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id\)/);
  });

  it('resolve: fila local vinculada con costo nominal 1 CUP y datos comerciales propios', () => {
    expect(s).toMatch(/v_price, v_price_currency, v_cost, 1,/);
    expect(s).toMatch(/'cost_average_origin', 'nominal_1cup_owner_policy'/);
  });

  it('resolve: carreras de unicidad del maestro reutilizan el ganador (misión §10)', () => {
    expect(s).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(s).toMatch(/ERR_MASTER_SKU_RACE/);
  });

  it('resolve: estado no manejado → fail-closed, nunca en silencio', () => {
    expect(s).toMatch(/ERR_UNEXPECTED_STATUS/);
  });

  it('resolve: contadores reales del backend en el resumen', () => {
    expect(s).toMatch(/'masters_created', v_masters_created/);
    expect(s).toMatch(/'locals_activated', v_local_activated/);
    expect(s).toMatch(/'blocked', v_blocked/);
  });

  it('ACLs explícitas: EXECUTE solo authenticated + service_role', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.classify_reception_import_rows\(uuid, jsonb, uuid\) FROM PUBLIC, anon/);
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.resolve_reception_import_rows\(uuid, jsonb, jsonb, uuid\) FROM PUBLIC, anon/);
  });

  it('guard fail-closed al final de la migración', () => {
    expect(s).toMatch(/CP_LOG_RECEPTION_IMPORT_GUARD/);
    expect(s).toMatch(/CP-LOG-RECEPTION-IMPORT-GUARD OK/);
  });
});
