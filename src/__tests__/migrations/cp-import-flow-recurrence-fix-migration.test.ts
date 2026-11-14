/**
 * CP-POST-MERGE-EXECUTION-002 §2/§3 (2026-11-14) — migración correctiva
 * 20261114190200_cp_import_flow_recurrence_fix: el importador masivo deja de
 * producir reincidencias de los dos defectos corregidos por decisión del
 * propietario:
 *   · cost_average cero silencioso en ALTAS (60 de los 97 productos en cero
 *     nacieron así en la importación del catálogo del 2026-11-13).
 *   · operational_class NULL explícito cuando la celda viene vacía.
 *
 * Contrato estático verificado (sobre el cuerpo de la RPC en la migración):
 *  · Firma, SECURITY DEFINER, anti-spoofing y autorización IDÉNTICOS a
 *    20261113140100 (el resto del contrato no cambia).
 *  · Altas: cost_average en el INSERT con origen explícito
 *    (imported_cost_cup | nominal_1cup_owner_rule |
 *    non_cup_cost_not_seeded_pending_wac — moneda extranjera NO se convierte:
 *    sin tasa documental no se inventa; se REPORTA por fila).
 *  · Re-import (DO UPDATE): NUNCA toca cost_average, stock_current,
 *    image_url ni has_movements (conservación de datos locales).
 *  · Clasificación: celda vacía → 'venta' (v_oc := COALESCE(v_oc, 'venta'));
 *    el DO UPDATE con la bandera v_oc_was_default NO degrada la clasificación
 *    existente de la fila en re-imports con celda vacía.
 *  · Informe: nominal_cost_assigned y venta_default_applied agregados +
 *    cost_average_origin por fila + auditoría IMPORT_PRODUCT con origen.
 *  · ACL: authenticated + service_role; anon/PUBLIC sin EXECUTE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261114190200_cp_import_flow_recurrence_fix.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261114190200 — el importador no reincide (costo promedio cero + clasificación NULL)', () => {
  const s = read(MIGRATION);
  const body = s.slice(
    s.indexOf('CREATE OR REPLACE FUNCTION public.managed_bulk_import_products'),
    s.indexOf('$function$', s.indexOf('AS $function$', s.indexOf('CREATE OR REPLACE FUNCTION public.managed_bulk_import_products')) + 13),
  );

  it('identidad idéntica: firma, atributos y anti-spoofing de 20261113140100', () => {
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.managed_bulk_import_products\(\s*p_store_id uuid,\s*p_rows jsonb,\s*p_user_id uuid DEFAULT NULL\s*\)/);
    expect(body).toMatch(/RETURNS jsonb/);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(body).toMatch(/CASE WHEN auth\.role\(\) = 'service_role'\s+THEN COALESCE\(p_user_id, auth\.uid\(\)\) ELSE auth\.uid\(\) END/);
  });

  it('clasificación operativa: celda vacía → venta; nunca NULL explícito', () => {
    expect(body).toMatch(/v_oc_was_default := \(v_oc IS NULL\)/);
    expect(body).toContain("v_oc := COALESCE(v_oc, 'venta');");
    // El INSERT ya no puede enviar NULL (v_oc coalesceado)
    expect(body).toMatch(/\n\s+v_oc::product_operational_class\)/);
  });

  it('cost_average en ALTAS con origen explícito (regla nominal 1 CUP del propietario)', () => {
    expect(body).toMatch(/IF v_currency = 'CUP' AND v_cost > 0 THEN\s+v_ca_seed := v_cost;\s+v_ca_origin := 'imported_cost_cup';/);
    expect(body).toMatch(/ELSIF v_cost = 0 THEN\s+v_ca_seed := 1;\s+v_ca_origin := 'nominal_1cup_owner_rule';/);
    expect(body).toMatch(/ELSE\s+v_ca_seed := NULL;\s+v_ca_origin := 'non_cup_cost_not_seeded_pending_wac';/);
    // El INSERT incluye cost_average
    expect(body).toMatch(/cost_price, cost_average, min_stock/);
    expect(body).toMatch(/v_cost, COALESCE\(v_ca_seed, 0\), v_min_stock/);
    // No se inventa conversión de moneda extranjera
    expect(body).toContain("non_cup_cost_not_seeded_pending_wac");
  });

  it('re-import conservador: DO UPDATE sin cost_average/stock/image_url/has_movements', () => {
    const upsert = body.slice(
      body.indexOf('ON CONFLICT (sku, store_id) DO UPDATE SET'),
      body.indexOf('RETURNING id, (xmax = 0)'),
    );
    expect(upsert).not.toContain('cost_average');
    expect(upsert).not.toContain('stock_current');
    expect(upsert).not.toContain('image_url');
    expect(upsert).not.toContain('has_movements');
    // La celda vacía NO degrada la clasificación existente (bandera, no NULL)
    expect(upsert).toMatch(/operational_class = CASE WHEN v_oc_was_default\s+THEN public\.products\.operational_class\s+ELSE EXCLUDED\.operational_class END/);
  });

  it('informe al usuario: agregados y origen por fila + auditoría', () => {
    expect(body).toMatch(/'nominal_cost_assigned', v_nominal_cost/);
    expect(body).toMatch(/'venta_default_applied', v_venta_default/);
    expect(body).toMatch(/'cost_average_origin', v_ca_origin/);
    expect(body).toMatch(/'operational_class_default_applied', v_oc_was_default/);
    // contadores solo en ALTAS (re-procesar no duplica la asignación)
    expect(body).toMatch(/IF v_was_inserted THEN[\s\S]{0,200}IF v_ca_origin = 'nominal_1cup_owner_rule' THEN\s+v_nominal_cost := v_nominal_cost \+ 1;/);
    // auditoría IMPORT_PRODUCT incluye el origen del costo
    expect(body).toMatch(/'IMPORT_PRODUCT', 'products'[\s\S]{0,400}'cost_average_origin', v_ca_origin/);
  });

  it('ACL: authenticated + service_role; anon/PUBLIC sin EXECUTE', () => {
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.managed_bulk_import_products\(uuid, jsonb, uuid\) FROM PUBLIC, anon;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.managed_bulk_import_products\(uuid, jsonb, uuid\) TO authenticated, service_role;/);
  });
});
