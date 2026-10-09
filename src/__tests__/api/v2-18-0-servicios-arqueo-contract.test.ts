import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * FIX-SERVICIOS-ARQUEO-REPORTES — contrato estático de la migración v2.18.0.
 * Verifica que el SQL aplicado a LIVE contiene las reglas financieras
 * obligatorias de la misión (los cuerpos de los RPCs no se pueden ejecutar
 * en unit tests sin Postgres; el contrato estático + validación SQL live
 * en el despliegue son las dos barreras).
 */
const MIGRATION = resolve(__dirname, '../../../supabase/migrations/20261010000002_v2_18_0_servicios_actor_y_caja.sql');
let sql = '';
try {
  sql = readFileSync(MIGRATION, 'utf8');
} catch {
  sql = ''; // la migración no existe en este checkout (p.ej. empaquetado)
}

describe.skipIf(!sql)('Migración v2.18.0 — contrato SQL', () => {
  it('D1: los 5 RPCs de servicios usan actor-explícito + has_store_access_as', () => {
    // Patrón doctrinal create_sale_v2 (actor bajo service_role, no auth.uid() crudo)
    const actorPattern = /CASE\s+WHEN auth\.role\(\) = 'service_role' THEN COALESCE\((p_created_by|p_user_id), auth\.uid\(\)\)\s+ELSE auth\.uid\(\)\s+END/g;
    const matches = sql.match(actorPattern) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5); // create + set_status + void + distribute + link
    expect(sql).toContain('public.has_store_access_as(v_caller_uid, p_store_id)');
    expect(sql).toContain('public.has_store_access_as(v_caller_uid, v_store_id)');
    // actor NULL sigue bloqueado (fail-closed)
    expect(sql).toContain('IF v_caller_uid IS NULL THEN');
  });

  it('D1: ACL service_role-only re-certificada para los RPCs de servicios', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb) TO service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) TO service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid, uuid, text, timestamptz) TO service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid, uuid) TO service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(uuid, jsonb, uuid) TO service_role');
  });

  it('D2: tabla service_production_order_links con UNIQUE y RLS', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.service_production_order_links');
    expect(sql).toContain('CONSTRAINT uq_spol_service_order UNIQUE (service_id, production_order_id)');
    expect(sql).toContain('ALTER TABLE public.service_production_order_links ENABLE ROW LEVEL SECURITY');
    // el create valida OT: misma tienda + no anulada/cerrada
    expect(sql).toContain("status NOT IN ('voided', 'closed')");
    expect(sql).toContain('ERR_PRODUCTION_ORDER_INVALID');
    // el void limpia los vínculos
    expect(sql).toContain('DELETE FROM service_production_order_links WHERE service_id = p_service_id');
  });

  it('D3: close_cash_shift sin doble conteo (egresos solo receipt/service en cash)', () => {
    expect(sql).toContain("AND ref_type IN ('receipt', 'service')");
    // la ventana de pagos usa payment_date (fecha efectiva) y método cash
    expect(sql).toContain("AND payment_method = 'cash'");
    // anticipos de producción en efectivo como INGRESOS
    expect(sql).toContain("AND ref_type IN ('production_order', 'work')");
    // comisiones solo cash
    expect(sql).toContain("AND payment_method = 'cash'\n      AND paid_at > v_closure.created_at");
    // ventas por columnas split (soporta mixed)
    expect(sql).toContain('SUM(cash_amount)');
    expect(sql).toContain('SUM(transfer_amount)');
    expect(sql).toContain('SUM(zelle_amount)');
  });

  it('D3: get_sales_since_last_closure suma la parte cash de ventas mixed', () => {
    expect(sql).toContain("WHEN payment_method = 'mixed' THEN COALESCE(cash_amount, 0)");
    expect(sql).toContain("WHEN payment_method = 'mixed' THEN COALESCE(transfer_amount, 0)");
  });

  it('D3: RPC get_cash_shift_expected con fórmula del arqueo', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)');
    expect(sql).toContain("'expected_cash'");
    // la ventana del turno pendiente parte de su created_at (igual que el cierre)
    expect(sql).toContain("status = 'pendiente'");
  });

  it('D4: get_daily_expenses_aggregated incluye received_services activos', () => {
    expect(sql).toContain('FROM received_services rs');
    expect(sql).toContain('rs.status = ' + "'active'");
    expect(sql).toContain('rs.service_date');
    // recepciones: se excluyen las anuladas (antes se contaban)
    expect(sql).toContain("r.status = 'active'");
    // conversión CUP coherente con payment_transactions.amount_cup
    expect(sql).toContain("CASE WHEN rs.currency = 'CUP' THEN 1 ELSE COALESCE(rs.exchange_rate, 1) END");
    // desglose sin duplicar
    expect(sql).toContain('AS services_amount');
    expect(sql).toContain('AS receipts_cost');
  });

  it('Down documentado (reversión)', () => {
    expect(sql).toContain('-- DOWN (reversión documentada');
  });
});
