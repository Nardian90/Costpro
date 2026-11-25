/**
 * CP-BRA-REMEDIATION-001 — PR fix/cpbra-r01-r14 (motor de pagos).
 *
 * Test de contrato de la migración 20261126140000 (patrón
 * cp-apai-payment-lifecycle-guards-migration.test.ts: asserts estáticos
 * sobre el SQL, sin BD). Valida lo no negociable de las dos reglas:
 *
 *   R-01 (FIN-002/REP-001): update_payment_status DEBE cubrir las TRES
 *   familias de documento (receipt|service|production_order|work) con neteo
 *   de contra-filas — la rama OT se perdió al reemitir el trigger en
 *   20261124120000 y CxC lee production_orders.paid_amount.
 *
 *   R-14 (FIN-008): reverse_supplier_payment DEBE bloquear la reversión de
 *   pagos cuyo período fiscal esté cerrado/locked, salvo excepción
 *   administrativa auditada (p_allow_closed_period + admin + motivo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/20261126140000_cpbra_r01_r14_payment_engine.sql');
const sql = readFileSync(MIGRATION, 'utf8');

describe('migración 20261126140000 — R-01: trigger con rama OT restaurada', () => {
  it('existe, transaccional y reemite el trigger completo', () => {
    expect(sql).toContain('20261126140000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_payment_status');
    expect(sql).toContain('CREATE TRIGGER trg_update_payment_status');
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON payment_transactions');
  });

  it('las TRES ramas de documento están presentes (la OT no vuelve a perderse)', () => {
    expect(sql).toContain("IF v_ref_type = 'receipt' THEN");
    expect(sql).toContain("ELSIF v_ref_type = 'service' THEN");
    expect(sql).toContain("ELSIF v_ref_type IN ('production_order', 'work') THEN");
    // La rama OT actualiza exactamente las columnas que CxC lee (el corte va
    // hasta el final del cuerpo del trigger: la rama contiene un RETURN
    // COALESCE(NEW, OLD) anidado por el guard de OT voided).
    const fnEnd = sql.indexOf('$$ LANGUAGE plpgsql;', sql.indexOf('CREATE OR REPLACE FUNCTION public.update_payment_status'));
    const otBranch = sql.slice(
      sql.indexOf("ELSIF v_ref_type IN ('production_order', 'work') THEN"),
      fnEnd,
    );
    expect(otBranch).toContain('UPDATE production_orders SET');
    expect(otBranch).toContain('paid_amount = v_paid');
    expect(otBranch).toContain('payment_status = v_status');
    expect(otBranch).toContain('payment_method = v_method');
    expect(otBranch).toContain('paid_at = CASE WHEN v_status = \'paid\' THEN now() ELSE NULL END');
  });

  it('el neteo de contra-filas cubre las TRES ramas (semántica CP-OPS-ENERVIDA §2)', () => {
    const netting = (sql.match(
      /CASE WHEN COALESCE\(direction, 'in'\) = 'reversal' THEN -amount_cup/g,
    ) || []).length;
    expect(netting).toBe(3);
    // La OT anulada no toca saldos (semántica histórica 20261113120800).
    expect(sql).toContain('IF v_doc_status = \'voided\' THEN');
    expect(sql).toContain('RETURN COALESCE(NEW, OLD)');
  });

  it('DELETE también recompute (lectura COALESCE(NEW, OLD) de ref)', () => {
    expect(sql).toContain('v_ref_type TEXT := COALESCE(NEW.ref_type, OLD.ref_type)');
    expect(sql).toContain('v_ref_id UUID := COALESCE(NEW.ref_id, OLD.ref_id)');
  });

  it('no debilita el contrato previo del trigger (ramas receipt|service verbatim)', () => {
    // Guards y fórmulas de 20261124120000 intactas para receipt|service.
    expect((sql.match(/WHERE ref_type = 'receipt' AND ref_id = v_ref_id/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((sql.match(/WHERE ref_type = 'service' AND ref_id = v_ref_id/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain('COALESCE(direction, \'in\') <> \'reversal\'');
  });
});

describe('migración 20261126140000 — R-01 colateral: gate de estado y lock en el RPC de pago', () => {
  it('register_supplier_payment reemitido con firma y ACL intactos', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.register_supplier_payment');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.register_supplier_payment');
  });

  it('la rama OT gana FOR UPDATE y el gate ERR_ORDER_NOT_PAYABLE (voided)', () => {
    const otFetch = sql.slice(
      sql.indexOf("ELSIF p_ref_type IN ('production_order', 'work') THEN"),
      sql.indexOf('ELSE', sql.indexOf("ELSIF p_ref_type IN ('production_order', 'work') THEN")),
    );
    expect(otFetch).toContain('FROM public.production_orders WHERE id = p_ref_id FOR UPDATE');
    expect(otFetch).toContain('status');
    expect(sql).toContain('ERR_ORDER_NOT_PAYABLE: la orden de trabajo está voided y no admite pagos nuevos');
    // Fail-closed por defecto: draft sigue ADMITIDO (realidad operativa:
    // anticipos sobre órdenes en elaboración — decisión documentada).
    expect(sql).toContain("COALESCE(v_doc_status, 'draft') = 'voided'");
  });

  it('los gates preexistentes de receipt|service se conservan', () => {
    expect(sql).toContain('ERR_RECEIPT_NOT_PAYABLE');
    expect(sql).toContain('ERR_SERVICE_NOT_ACTIVE');
    expect(sql).toContain('ERR_COMBINACION_NO_SOPORTADA');
    expect(sql).toContain('ERR_TASA_NO_DISPONIBLE');
    expect(sql).toContain('PERFORM public.validate_operation_date');
    expect(sql).toContain('Overpay no permitido');
  });
});

describe('migración 20261126140000 — R-14: guard de período fiscal en la reversión', () => {
  it('elimina el overload de 4 args y crea la firma de 5 con excepción administrativa', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.reverse_supplier_payment(uuid, text, uuid, timestamptz);');
    expect(sql).toContain('p_allow_closed_period boolean DEFAULT false');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz, boolean)');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz, boolean) TO service_role');
  });

  it('el guard replica el patrón fiscal de 20260810000003 (v2_19_3)', () => {
    expect(sql).toContain('FROM public.fiscal_closings fc');
    expect(sql).toContain("fc.status IN ('closed', 'locked')");
    expect(sql).toContain('make_date(fc.period_year, fc.period_month, 1)');
    expect(sql).toContain("+ interval '1 month'");
    // El período evaluado es el del pago ORIGINAL (no el de la reversión).
    expect(sql).toContain('AND v_orig.payment_date >= make_date');
    expect(sql).toContain('AND v_orig.payment_date < make_date');
  });

  it('fail-closed: solo admin + flag + motivo explícito abren la excepción', () => {
    expect(sql).toContain('ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD');
    const guard = sql.slice(
      sql.indexOf('IF v_fc.period_year IS NOT NULL THEN'),
      sql.indexOf('-- Documento padre: SOLO informativo'),
    );
    expect(guard).toContain('p_allow_closed_period');
    expect(guard).toContain('public.is_admin_check(v_caller_uid)');
    expect(guard).toContain("v_reason <> ''");
    // La excepción se audita ANTES de cualquier efecto contable.
    expect(guard).toContain("'PAYMENT_REVERSED_CLOSED_PERIOD'");
    expect(guard).toContain("'authorized_by', 'admin_exception'");
  });

  it('el resto del contrato de la reversión se conserva verbatim', () => {
    expect(sql).toContain('ERR_PAYMENT_NOT_FOUND');
    expect(sql).toContain('ERR_REVERSAL_NOT_SUPPORTED');
    expect(sql).toContain('ERR_PAYMENT_NOT_REVERSIBLE');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("'reversal:' || p_payment_id::text");
    expect(sql).toContain('PERFORM public.fin_post_payment_annulment');
    expect(sql).toContain("'PAYMENT_REVERSED'");
    expect(sql).toContain('public.has_store_access_as(v_caller_uid, v_orig.store_id)');
  });

  it('la ruta de reversión maneja el nuevo código de error (409 accionable)', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/payments/[id]/route.ts'), 'utf8');
    expect(route).toContain("msg.includes('ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD')");
    expect(route).toContain("code: 'ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD'");
    expect(route).toContain('409');
  });
});
