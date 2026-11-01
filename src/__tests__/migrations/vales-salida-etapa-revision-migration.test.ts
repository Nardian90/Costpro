/**
 * MISIÓN RESOLUCIÓN 11 (2026-10-31) — Verificación estática de la migración
 * 20261031120100_vales_salida_etapa_revision.sql.
 *
 * Contrato crítico (estándar documental de Ajustes Documentales aplicado a
 * Vales de Salida):
 *
 *   1. Estado 'pending' en issue_slips (CHECK extendido — supersete estricto:
 *      los estados existentes se conservan).
 *   2. Trazabilidad: confirmed_at / confirmed_by.
 *   3. create_vale_salida_pending: crea el vale En Revisión SIN movimientos
 *      de stock; mismo guard anti-spoofing, validación de items/OT/fecha,
 *      numeración VS e idempotencia que el flujo directo.
 *   4. confirm_vale_salida: pending → completed con lock FOR UPDATE (evita
 *      dobles confirmaciones), costo servidor re-leído, movimientos
 *      issue_slip_out / withdraw_production_item_v3 y auditoría.
 *   5. void_vale_salida: pending → voided con motivo obligatorio y
 *      defense-in-depth (rechaza si existieran movimientos ligados).
 *   6. El flujo directo create_vale_salida NO se modifica (compatibilidad).
 *   7. ACL: GRANT authenticated/service_role + REVOKE PUBLIC/anon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261031120100_vales_salida_etapa_revision.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

function fnBody(name: string): string {
  const s = sql();
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\n([\\s\\S]*?)\\n\\$function\\$;`
  );
  const m = s.match(re);
  if (!m) throw new Error(`función ${name} no encontrada en la migración`);
  return m[1];
}

describe('migración 20261031120100 — Vales de Salida: etapa de revisión (pending)', () => {
  it('existe el archivo de migración', () => {
    expect(sql().length).toBeGreaterThan(10000);
  });

  describe('1. Estado pending en issue_slips', () => {
    it('CHECK extendido: supersete estricto con los 4 estados', () => {
      const s = sql();
      expect(s).toMatch(/ALTER TABLE public\.issue_slips DROP CONSTRAINT issue_slips_status_check;/);
      expect(s).toMatch(
        /CHECK \(status = ANY \(ARRAY\['pending'::text, 'completed'::text, 'voided'::text, 'reversed'::text\]\)\)/
      );
    });

    it('columnas de trazabilidad confirmed_at / confirmed_by', () => {
      const s = sql();
      expect(s).toMatch(/ALTER TABLE public\.issue_slips ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;/);
      expect(s).toMatch(/ALTER TABLE public\.issue_slips ADD COLUMN IF NOT EXISTS confirmed_by uuid/);
    });
  });

  describe('2. create_vale_salida_pending — vale En Revisión sin efecto en stock', () => {
    it('firma espejo del flujo directo (7 params) + SECURITY DEFINER + search_path', () => {
      expect(sql()).toMatch(
        /CREATE OR REPLACE FUNCTION public\.create_vale_salida_pending\(\s*p_store_id uuid,\s*p_items jsonb,\s*p_production_order_id uuid DEFAULT NULL,\s*p_notes text DEFAULT NULL,\s*p_idempotency_key text DEFAULT NULL,\s*p_user_id uuid DEFAULT NULL,\s*p_operation_date timestamptz DEFAULT NULL\s*\) RETURNS jsonb\s+LANGUAGE plpgsql SECURITY DEFINER\s+SET search_path = 'public'/
      );
    });

    it('guard anti-spoofing + has_store_access_as + validate_operation_date', () => {
      const body = fnBody('create_vale_salida_pending');
      expect(body).toMatch(
        /v_caller_uid := CASE WHEN auth\.role\(\) = 'service_role'\s+THEN COALESCE\(p_user_id, auth\.uid\(\)\)\s+ELSE auth\.uid\(\) END;/
      );
      expect(body).toMatch(
        /IF v_caller_uid IS NULL OR NOT public\.has_store_access_as\(v_caller_uid, p_store_id\) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;/
      );
      expect(body).toMatch(/PERFORM public\.validate_operation_date\(v_eff, p_store_id\);/);
    });

    it('nace pending y NO registra movimientos de stock ni withdraw de OT', () => {
      const body = fnBody('create_vale_salida_pending');
      expect(body).toMatch(/VALUES \(v_slip_id, p_store_id, v_slip_number, 'pending',/);
      expect(body).not.toMatch(/register_stock_movement/);
      expect(body).not.toMatch(/withdraw_production_item_v3/);
    });

    it('valida items/variantes/OT igual que el flujo directo (misma semántica)', () => {
      const body = fnBody('create_vale_salida_pending');
      expect(body).toMatch(/ERR_EMPTY_ITEMS/);
      expect(body).toMatch(/ERR_INVALID_QUANTITY/);
      expect(body).toMatch(/ERR_DUPLICATE_PRODUCT/);
      expect(body).toMatch(/ERR_PO_ITEM_REQUIRED/);
      expect(body).toMatch(/ERR_DUPLICATE_PO_ITEM/);
      expect(body).toMatch(/ERR_PO_ITEM_NOT_FOUND/);
      expect(body).toMatch(/ERR_PRODUCT_MISMATCH/);
      expect(body).toMatch(/ERR_VARIANT_MISMATCH/);
      expect(body).toMatch(/ERR_VARIANT_NOT_BELONG_TO_PRODUCT/);
      expect(body).toMatch(/ERR_PRODUCT_COST_UNAVAILABLE/);
    });

    it('snapshot de costo informativo + numeración VS + idempotencia por operación propia', () => {
      const body = fnBody('create_vale_salida_pending');
      expect(body).toMatch(/-- Snapshot del costo promedio VIGENTE para la revisión/);
      expect(body).toMatch(/public\.next_document_number\(p_store_id, 'vale_salida', v_caller_uid\)/);
      expect(body).toMatch(/public\.check_idempotency\(p_idempotency_key, 'vale_salida_pending'/);
      expect(body).toMatch(/public\.register_idempotency\(p_idempotency_key, 'vale_salida_pending'/);
      expect(body).toMatch(/'CREATE_VALE_SALIDA_PENDING'/);
    });
  });

  describe('3. confirm_vale_salida — acción explícita pending → completed', () => {
    it('lock FOR UPDATE + guard de estado (evita dobles confirmaciones)', () => {
      const body = fnBody('confirm_vale_salida');
      expect(body).toMatch(/SELECT \* INTO v_slip FROM public\.issue_slips WHERE id = p_slip_id FOR UPDATE/);
      expect(body).toMatch(/ERR_SLIP_NOT_FOUND/);
      expect(body).toMatch(/ERR_NOT_PENDING: solo se pueden confirmar vales en revisión/);
    });

    it('autorización multitienda con anti-spoofing', () => {
      const body = fnBody('confirm_vale_salida');
      expect(body).toMatch(
        /v_caller_uid uuid := CASE\s+WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_user_id, auth\.uid\(\)\)\s+ELSE auth\.uid\(\)\s+END/
      );
      expect(body).toMatch(
        /IF v_caller_uid IS NULL OR NOT public\.has_store_access_as\(v_caller_uid, v_slip\.store_id\) THEN/
      );
    });

    it('aplica los movimientos con costo servidor re-leído al confirmar', () => {
      const body = fnBody('confirm_vale_salida');
      expect(body).toMatch(/SELECT cost_average INTO v_unit_cost\s*\n\s*FROM public\.products WHERE id = v_item\.product_id AND store_id = v_slip\.store_id\s*\n\s*FOR UPDATE/);
      expect(body).toMatch(/withdraw_production_item_v3\(/);
      expect(body).toMatch(/register_stock_movement\(/);
      expect(body).toMatch(/p_movement_type := 'issue_slip_out'/);
      // Las líneas se actualizan con el costo real de la confirmación.
      expect(body).toMatch(/UPDATE public\.issue_slip_items\s*\n\s*SET unit_cost = v_unit_cost, total_cost = v_item\.quantity \* v_unit_cost/);
      expect(body).toMatch(/SET status = 'completed',\s*\n\s*total_cost = v_total_cost,\s*\n\s*confirmed_at = NOW\(\),\s*\n\s*confirmed_by = v_caller_uid/);
      expect(body).toMatch(/'CONFIRM_VALE_SALIDA'/);
    });
  });

  describe('4. void_vale_salida — anulación del vale en revisión', () => {
    it('solo pending, motivo obligatorio, nunca borra', () => {
      const body = fnBody('void_vale_salida');
      expect(body).toMatch(/WHERE id = p_slip_id FOR UPDATE/);
      expect(body).toMatch(/ERR_NOT_PENDING: solo se pueden anular vales en revisión/);
      expect(body).toMatch(/ERR_REASON_REQUIRED/);
      expect(body).toMatch(/SET status = 'voided',\s*\n\s*voided_at = NOW\(\),\s*\n\s*voided_by = v_caller_uid,\s*\n\s*void_reason = btrim\(p_reason\)/);
      expect(body).not.toMatch(/DELETE FROM public\.issue_slips/);
      expect(body).toMatch(/'VOID_VALE_SALIDA'/);
    });

    it('defense-in-depth: rechaza si existieran movimientos ligados', () => {
      expect(fnBody('void_vale_salida')).toMatch(
        /ERR_SLIP_HAS_MOVEMENTS: el vale tiene movimientos de inventario; usa Devolver \(reversión\)/
      );
    });
  });

  describe('5. Compatibilidad y ACL', () => {
    it('el flujo directo create_vale_salida NO se modifica en esta migración', () => {
      expect(sql()).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_vale_salida\b/);
      expect(sql()).not.toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_vale_salida\b/);
    });

    it('GRANT authenticated/service_role + REVOKE PUBLIC/anon en las 3 RPC', () => {
      const s = sql();
      expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_vale_salida_pending\(uuid, jsonb, uuid, text, text, uuid, timestamp with time zone\) TO authenticated, service_role;/);
      expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_vale_salida_pending\(uuid, jsonb, uuid, text, text, uuid, timestamp with time zone\) FROM PUBLIC, anon;/);
      expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.confirm_vale_salida\(uuid, uuid\) TO authenticated, service_role;/);
      expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.confirm_vale_salida\(uuid, uuid\) FROM PUBLIC, anon;/);
      expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.void_vale_salida\(uuid, text, uuid\) TO authenticated, service_role;/);
      expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.void_vale_salida\(uuid, text, uuid\) FROM PUBLIC, anon;/);
    });
  });
});
