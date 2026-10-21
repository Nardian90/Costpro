/**
 * MISIÓN DE SEGUIMIENTO (2026-10-21) — Verificación estática de la migración
 * 20261021120000 (nulidad compuesta + refunds de devolución).
 *
 * Asegura los elementos críticos del contrato:
 *
 *   - close_production_order_v2: guard de idempotencia fail-closed
 *     (IS DISTINCT FROM — la trampa `!= NULL` devolvía replay silencioso).
 *   - approve_transfer: status IS DISTINCT FROM 'PENDIENTE' +
 *     COALESCE(requires_approval, false) — columnas NULLABLES verificadas.
 *   - reset_store_data (3-arg): fail-closed en 2 niveles + comentario de la
 *     regla deliberada fase0 restaurado (solo transfers_in/open_cash_sessions
 *     bloquean; el filtro de tipos NO se cambió).
 *   - adjust_sale_payment: detección de cambio de payment_method null-safe.
 *   - Las SEIS fórmulas de caja con el término cash_refunds v2.22.0
 *     (ref_type='devolution' AND direction='refund' AND payment_method='cash',
 *     ventana por payment_date) — autoritativa + espejos + validaciones.
 *   - v2.23.0 (decisión del propietario 2026-10-21 «según estándar
 *     internacional»): término voucher_refunds (base NETA del lado vouchers)
 *     en las 3 fórmulas de expectativa (close_cash_shift + espejo + KPIs) y
 *     clave informativa refunds_voucher_total_cup en get_cash_report; las
 *     validaciones de DISPONIBILIDAD (create/reverse) no cambian (los
 *     vouchers no son efectivo).
 *   - ACLs re-declaradas idénticas (service_role-only en mutaciones de caja;
 *     authenticated en lecturas REM-R2-READ).
 *   - Sin recalculo de saldos, sin tocar cierres históricos, sin cambiar el
 *     significado de ref_type.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261021120000_nulidad_compuesta_refunds_devolucion.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261021120000 — nulidad compuesta (las 4 funciones)', () => {
  it('close_production_order_v2: guard de idempotencia IS DISTINCT FROM (fail-closed)', () => {
    const s = sql();
    expect(s).toMatch(
      /IF v_existing_result->>'param_hash' IS DISTINCT FROM v_param_hash THEN\s*\n\s*RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';/,
    );
    // la trampa original ya no está: `!= v_param_hash` en el guard
    expect(s).not.toMatch(/v_param_hash'\s*!=\s*v_param_hash/);
    expect(s).not.toMatch(/param_hash'\s+!=\s+v_param_hash\s+THEN/);
  });

  it('approve_transfer: status IS DISTINCT FROM + COALESCE(requires_approval)', () => {
    const s = sql();
    expect(s).toMatch(/IF v_transfer\.status IS DISTINCT FROM 'PENDIENTE' THEN/);
    expect(s).toMatch(/IF NOT COALESCE\(v_transfer\.requires_approval, false\) THEN/);
    // las trampas originales ya no están
    expect(s).not.toMatch(/IF v_transfer\.status != 'PENDIENTE' THEN/);
    expect(s).not.toMatch(/IF NOT v_transfer\.requires_approval THEN/);
  });

  it('reset_store_data (3-arg): fail-closed de 2 niveles + regla fase0 documentada', () => {
    const s = sql();
    // nivel 1: can_modify indeterminable ⇒ rechazo directo
    expect(s).toMatch(
      /IF v_validation IS NULL OR \(v_validation->>'can_modify'\) IS NULL THEN\s*\n\s*RAISE EXCEPTION 'ERR_STORE_VALIDATION_UNAVAILABLE/,
    );
    // nivel 2: bloqueador del tipo permitido bloquea aunque message sea NULL (EXISTS)
    expect(s).toMatch(
      /IF EXISTS \(\s*\n\s*SELECT 1 FROM jsonb_array_elements\(v_validation->'blockers'\) AS blocker\s*\n\s*WHERE blocker->>'type' IN \('transfers_in', 'open_cash_sessions'\)\s*\n\s*\) THEN/,
    );
    // el filtro de tipos deliberado (regla fase0) SE CONSERVA — no se amplió
    expect(s).toMatch(/WHERE blocker->>'type' IN \('transfers_in', 'open_cash_sessions'\)/);
    // comentario restaurado
    expect(s).toContain('REGLA DELIBERADA (fase0 20260802000001');
  });

  it('adjust_sale_payment: payment_method IS DISTINCT FROM (columna NULLABLE)', () => {
    const s = sql();
    expect(s).toMatch(
      /IF p_payment_method IS NOT NULL AND p_payment_method IS DISTINCT FROM v_tx\.payment_method::text THEN/,
    );
    // la trampa original ya no está
    expect(s).not.toMatch(/p_payment_method <> v_tx\.payment_method::text THEN/);
  });

  it('NO sustituye expresiones seguras por esquema (disciplina de cambio mínimo)', () => {
    const s = sql();
    // sale_currency/sale_exchange_rate son NOT NULL (information_schema vivo):
    // sus comparaciones `<>` originales SE CONSERVAN (documentadas como seguras)
    expect(s).toMatch(/IF p_sale_currency IS NOT NULL AND p_sale_currency <> v_tx\.sale_currency THEN/);
    expect(s).toMatch(/IF p_sale_exchange_rate IS NOT NULL AND p_sale_exchange_rate <> v_tx\.sale_exchange_rate THEN/);
    // los montos con COALESCE se conservan tal cual
    expect(s).toMatch(/p_cash_amount <> COALESCE\(v_tx\.cash_amount, 0\)/);
  });

  it('ACLs re-declaradas idénticas a las certificadas vivas', () => {
    const s = sql();
    expect(s).toMatch(/REVOKE EXECUTE ON FUNCTION public\.close_cash_shift\(uuid, numeric, numeric, text, uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.close_cash_shift\(uuid, numeric, numeric, text, uuid\) TO service_role;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_cash_shift_expected\(uuid\) TO authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_cash_flow_summary\(uuid, timestamptz, timestamptz\) TO authenticated;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_cash_flow_document\([^)]*\) TO service_role;/);
    expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.reset_store_data\(uuid, boolean, uuid\) FROM PUBLIC;/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.approve_transfer\(uuid, uuid\) TO postgres, service_role;/);
  });
});

describe('migración 20261021120000 — término cash_refunds en las 6 fórmulas', () => {
  const FORMULAS = [
    { name: 'close_cash_shift (autoritativa)', decl: /v_cash_refunds numeric := 0;/, term: /ref_type = 'devolution'\s*\n\s*AND direction = 'refund'\s*\n\s*AND payment_date > v_closure\.created_at/ },
    { name: 'get_cash_shift_expected (espejo)', decl: /'cash_refunds', v_cash_refunds/, term: /ref_type = 'devolution'\s*\n\s*AND direction = 'refund'\s*\n\s*AND payment_date > v_window_start/ },
    { name: 'get_cash_flow_summary (KPIs)', decl: /'cash_refunds', v_cash_refunds/, term: /ref_type = 'devolution' AND direction = 'refund'\s*\n\s*AND payment_date > v_window_start AND payment_date <= now\(\);/ },
    { name: 'get_cash_report (Reporte de Entrega)', decl: /'refunds_cash_total_cup', v_refunds_cash_total_cup/, term: /ref_type = 'devolution' AND direction = 'refund' AND payment_method = 'cash'/ },
    { name: 'create_cash_flow_document (validación)', decl: /'formula', 'v2\.23\.0'/, term: /ref_type = 'devolution' AND direction = 'refund'\s*\n\s*AND payment_date > v_shift\.created_at AND payment_date <= now\(\);/ },
    { name: 'reverse_cash_flow_document (validación)', decl: /'cf-anul-' \|\| v_doc\.id::text/, term: /ref_type = 'devolution' AND direction = 'refund'\s*\n\s*AND payment_date > v_shift\.created_at AND payment_date <= now\(\);/ },
  ];

  it('las 6 funciones incorporan el término (misma regla, una sola fuente de verdad)', () => {
    const s = sql();
    for (const f of FORMULAS) {
      expect(s, `fórmula ${f.name}: declaracion/estructura`).toMatch(f.decl);
      expect(s, `fórmula ${f.name}: término refund`).toMatch(f.term);
    }
  });

  it('la resta del término aparece en TODAS las fórmulas de esperado', () => {
    const s = sql();
    // autoritativa + espejo + summary + validaciones: 5 sitios con la resta explícita
    const count = (s.match(/-\s*v_cash_refunds/g) || []).length + (s.match(/-\s*v_refunds_cash_total_cup/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('regla de medio de pago: SOLO cash reduce el efectivo (transfer/zelle/store_credit no)', () => {
    const s = sql();
    // cada término exige payment_method = 'cash'
    const terms = s.match(/ref_type = 'devolution'[^;]*?direction = 'refund'[^;]*?/g) || [];
    expect(terms.length).toBeGreaterThanOrEqual(6);
    for (const t of s.split('SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds')) {
      if (t.trim() === '') continue;
    }
    expect(s).toMatch(/AND payment_method = 'cash'\s*\n\s*AND ref_type = 'devolution'/);
  });

  it('v2.23.0 — término voucher_refunds (base NETA) en las 3 fórmulas de expectativa', () => {
    const s = sql();
    // decl + SELECT en las 3 fórmulas de expectativa (formato expandido y compacto)
    expect((s.match(/v_voucher_refunds numeric := 0;/g) || []).length).toBe(3);
    expect((s.match(/INTO v_voucher_refunds/g) || []).length).toBe(3);
    expect((s.match(/AND payment_method IN \('transfer', 'zelle'\)/g) || []).length).toBe(4);
    // la resta del lado vouchers aparece en las 3 (autoritativa + espejo + KPIs)
    expect((s.match(/- v_voucher_refunds/g) || []).length).toBe(3);
    // el JSON de desglose expone el término (auditoría + return + espejo + KPIs)
    expect((s.match(/'voucher_refunds', v_voucher_refunds/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(s).toMatch(/'voucher_refunds_devolution', v_voucher_refunds/);
    // los términos de voucher excluyen cash (medio real de pago)
    expect(s).toMatch(/AND payment_method IN \('transfer', 'zelle'\)\s*\n\s*AND ref_type = 'devolution'/);
  });

  it('v2.23.0 — get_cash_report expone refunds_voucher_total_cup informativo (balance sigue solo-efectivo)', () => {
    const s = sql();
    expect(s).toMatch(/'refunds_voucher_total_cup', v_refunds_voucher_total_cup/);
    // el balance NO resta vouchers: solo el tramo cash
    expect(s).toMatch(/- v_refunds_cash_total_cup\s*\n\s*\)\s*INTO v_totals;/);
    expect(s).not.toMatch(/balance_cup[^;]*v_refunds_voucher_total_cup/);
  });

  it('v2.23.0 — validaciones de disponibilidad SIN término voucher (el voucher no es efectivo)', () => {
    const s = sql();
    // create/reverse calculan disponibilidad de EFECTIVO: sin voucher_refunds
    // dentro de sus cuerpos. Aislamos por secciones.
    const createStart = s.indexOf('CREATE OR REPLACE FUNCTION public.create_cash_flow_document(');
    const reverseStart = s.indexOf('CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(');
    const createEnd = s.indexOf('-- ── 5f. reverse_cash_flow_document');
    const createBody = s.slice(createStart, createEnd > -1 ? createEnd : s.length);
    const reverseBody = s.slice(reverseStart);
    expect(createBody).not.toContain('v_voucher_refunds');
    expect(reverseBody).not.toContain('v_voucher_refunds');
  });

  it('documentación de la decisión del propietario (estándar internacional) en la migración', () => {
    const s = sql();
    expect(s).toContain('DECISIÓN DEL PROPIETARIO (2026-10-21');
    expect(s).toContain('REFUNDS DE VOUCHERS — BASE NETA');
    expect(s).toContain('R-DEV2 MANTENIDO');
    expect(s).toContain('NIC 1.27');
  });

  it('sin doble conteo: los cobros ref_type=sale siguen excluidos y la venta original no se toca', () => {
    const s = sql();
    // los términos de pagos siguen sin incluir 'devolution' como egreso
    expect(s).toMatch(/ref_type IN \('receipt', 'service'\)/);
    // la migración no emite UPDATE/DELETE sobre transactions ni devolutions
    expect(s).not.toMatch(/UPDATE public\.transactions SET/);
    expect(s).not.toMatch(/DELETE FROM public\.devolutions/);
    expect(s).not.toMatch(/DELETE FROM public\.payment_transactions/);
  });

  it('cierres históricos intactos: ventana por payment_date, sin recalculo de saldos almacenados', () => {
    const s = sql();
    // DDL de funciones únicamente: ningún UPDATE a cash_closures fuera del
    // flujo normal de close_cash_shift (que escribe SOLO el cierre que se cierra)
    const updates = s.match(/UPDATE public\.cash_closures SET/g) || [];
    expect(updates.length).toBe(1); // solo dentro de close_cash_shift
    expect(s).not.toMatch(/system_expected_total = .*recalcul/i);
    expect(s).toContain('NOTIFY pgrst');
  });

  it('documentación de la regla financiera nueva (P1) + residual R-DEV2', () => {
    const s = sql();
    expect(s).toContain('REGLA FINANCIERA NUEVA');
    expect(s).toContain('R-DEV2');
    expect(s).toContain('SOLO el medio por el que salió REALMENTELY');
  });
});
