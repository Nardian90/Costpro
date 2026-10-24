/**
 * MISIÓN DE CIERRE (2026-10-24) — Verificación estática de la migración
 * 20261024400000_devoluciones_recuperacion_reversa.sql (Fases B-H).
 *
 * Contrato crítico de la reversión financiera y el reembolso mixto:
 *   - reverse_devolution/4: la reversión de una devolución con reembolso
 *     liquidado EXIGE la recuperación atómica (p_recovery jsonb) — una
 *     reversión documental no libera el tope (ERR_DEVOLUTION_REFUND_NOT_
 *     RECOVERED). El overload /3 se RETIRA (firma única — patrón
 *     create_sale_v2/31→32, anti PGRST203). Advisory por tienda + lock de
 *     venta + FOR UPDATE de la devolución; idempotencia 'dev-<id>-recovery-
 *     <MONEDA>'; moneda e importe FIJADOS por el servidor (cero aritmética
 *     manual); recuperación en la moneda real (CUP no compensa USD).
 *   - create_devolution_v2: el tope cuenta DINERO (Σ refunds − Σ recoveries,
 *     SIN filtro de estado — el estado documental ya no libera capacidad).
 *   - AS_PAID (§6): reembolso multi-moneda «según lo pagado» — un componente
 *     por moneda bajo una transacción atómica; validación canónica de
 *     asignación completa (ERR_DEVOLUTION_MIXED_ALLOCATION bloquea el caso
 *     ambiguo); solo efectivo (ERR_DEVOLUTION_AS_PAID_CASH_ONLY).
 *   - Tasa histórica (§7): el importe USD se ancla a la TASA IMPLÍCITA de los
 *     pagos USD de la venta (filas v2.25 → liquidación pura → carve), NUNCA a
 *     la jerarquía vigente (retirada) — ERR_DEVOLUTION_RATE_UNDETERMINED.
 *   - store_credit (§8): compensación trazable del pasivo (fila negativa) y
 *     tope canónico del crédito (ERR_DEVOLUTION_CREDIT_CAP).
 *   - Dependientes simétricas: get_cash_currency_summary §7b (+devolution_
 *     recoveries), validate_payment_transactions_invariants (recovery NO es
 *     pago: PT001/PT006), close_cash_shift / get_cash_shift_expected /
 *     get_cash_flow_summary / get_cash_report / get_cash_ledger / reverse_
 *     cash_flow_document (+ términos de recuperación).
 *   - ACL service_role-only con firmas reales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261024400000_devoluciones_recuperacion_reversa.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261024400000 — reversión financiera, mixto y tasa histórica', () => {
  it('contiene las 10 funciones y NADA de DDL de esquema', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_devolution\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.create_devolution_v2\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_currency_summary\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_payment_transactions_invariants\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.close_cash_shift\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_shift_expected\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_flow_summary\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_report\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.get_cash_ledger\(/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_cash_flow_document\(/);
    // Sin cambios de esquema (anti-regresión: solo lógica)
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
  });

  it('reverse_devolution/4: firma con p_recovery jsonb + retiro del overload /3', () => {
    const s = sql();
    expect(s).toMatch(/public\.reverse_devolution\(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_recovery jsonb DEFAULT NULL::jsonb\)/);
    // El overload de 3 args se RETIRA (firma única — anti PGRST203)
    expect(s).toMatch(/DROP FUNCTION IF EXISTS public\.reverse_devolution\(uuid, text, uuid\);/);
    // ACL service_role-only con la firma real de 4 argumentos
    expect(s).toMatch(/revoke all on function public\.reverse_devolution\(uuid, text, uuid, jsonb\) from public;/);
    expect(s).toMatch(/grant execute on function public\.reverse_devolution\(uuid, text, uuid, jsonb\) to service_role;/);
  });

  it('RC1: la reversión sin recuperación es rechazada (fail-closed)', () => {
    const s = sql();
    expect(s).toMatch(/ERR_DEVOLUTION_REFUND_NOT_RECOVERED/);
    expect(s).toMatch(/La reversión es ATÓMICA con la recuperación/);
    // La recuperación es obligatoria SOLO si hay filas refund
    expect(s).toMatch(/IF v_expected_cup \+ v_expected_usd > 0 THEN/);
    // Y rechazada si llega sin necesidad (devolución documental pura)
    expect(s).toMatch(/ERR_DEVOLUTION_RECOVERY_UNNECESSARY/);
  });

  it('RC3: moneda e importe FIJADOS por el servidor; misma moneda; riel declarado', () => {
    const s = sql();
    // El importe viene de la FILA refund (v_refund.amount), no del payload
    expect(s).toMatch(/v_refund\.amount, v_rec_method::text, v_refund\.currency, v_refund\.exchange_rate/);
    // La tasa de la recuperación ES la del reembolso (espejo canónico exacto)
    expect(s).toMatch(/'dev-' \|\| p_devolution_id::text \|\| '-recovery-' \|\| v_refund\.currency/);
    // direction='recovery' — el nuevo contra-asiento de entrada
    expect(s).toMatch(/'recovery', v_uid,/);
    // Componentes deben cubrir EXACTAMENTE las monedas reembolsadas
    expect(s).toMatch(/ERR_DEVOLUTION_RECOVERY_COMPONENTS/);
    // Método de cobro validado (cash|transfer|zelle) + zelle nunca en CUP (PT005 espejo)
    expect(s).toMatch(/v_rec_method NOT IN \('cash', 'transfer', 'zelle'\)/);
    expect(s).toMatch(/zelle no opera en CUP/);
    // Idempotencia de recuperación: guard limpio por delante del índice único
    expect(s).toMatch(/ERR_DEVOLUTION_ALREADY_RECOVERED/);
  });

  it('RC-atomicidad: advisory por tienda + lock de venta + validaciones antes de escribir', () => {
    const s = sql();
    const i = s.indexOf('CREATE OR REPLACE FUNCTION public.reverse_devolution');
    const body = s.slice(i, s.indexOf('$function$;', i));
    // Advisory ANTES que nada (orden consistente con create_devolution_v2)
    expect(body.indexOf('pg_advisory_xact_lock(hashtext(v_store_id::text))')).toBeGreaterThan(0);
    expect(body.indexOf('pg_advisory_xact_lock(hashtext(v_store_id::text))')).toBeLessThan(body.indexOf('FOR UPDATE'));
    // Lock de la venta original (serializa contra el tope de reembolso)
    expect(body).toMatch(/PERFORM 1 FROM public\.transactions WHERE id = v_dev\.original_transaction_id FOR UPDATE;/);
    // Las validaciones (ERR_*) van ANTES de la primera escritura (INSERT)
    const firstInsert = body.indexOf('INSERT INTO public.payment_transactions');
    const lastValidation = body.lastIndexOf('ERR_DEVOLUTION_ALREADY_RECOVERED');
    expect(lastValidation).toBeGreaterThan(0);
    expect(lastValidation).toBeLessThan(firstInsert);
  });

  it('RC2: el tope cuenta DINERO (refunds − recoveries) sin filtro de estado', () => {
    const s = sql();
    expect(s).toMatch(/WHEN pt\.direction = 'recovery' AND pt\.currency = 'CUP' THEN -pt\.amount/);
    expect(s).toMatch(/WHEN pt\.direction = 'recovery' AND pt\.currency = 'USD' THEN -pt\.amount/);
    expect(s).toMatch(/AND pt\.direction IN \('refund', 'recovery'\)/);
    // El JOIN por estado de devoluciones fue ELIMINADO (el dinero manda)
    expect(s).not.toMatch(/JOIN public\.devolutions d ON d\.id = pt\.ref_id/);
    expect(s).not.toMatch(/d\.status IN \('pending', 'completed'\)/);
  });

  it('RC4 (AS_PAID): multi-moneda según lo pagado, una transacción atómica', () => {
    const s = sql();
    expect(s).toMatch(/IF v_refund_currency = 'AS_PAID' THEN/);
    // Componentes = restante reembolsable por moneda
    expect(s).toMatch(/v_comp_cup := v_paid_cup - v_refunded_cup;/);
    expect(s).toMatch(/v_comp_usd := v_paid_usd - v_refunded_usd;/);
    // Asignación completa o bloqueo (caso ambiguo sin regla por artículo)
    expect(s).toMatch(/ERR_DEVOLUTION_MIXED_ALLOCATION/);
    // Una fila por componente con idempotencia por moneda
    expect(s).toMatch(/'dev-' \|\| v_devolution_id::text \|\| '-refund-CUP'/);
    expect(s).toMatch(/'dev-' \|\| v_devolution_id::text \|\| '-refund-USD'/);
    // Solo efectivo
    expect(s).toMatch(/ERR_DEVOLUTION_AS_PAID_CASH_ONLY/);
    // Físico por componente (cada moneda contra su saldo)
    expect(s).toMatch(/-> 'net' ->> 'CUP'\)::numeric/);
    expect(s).toMatch(/-> 'net' ->> 'USD'\)::numeric/);
  });

  it('RC5 (tasa histórica): jerarquía vigente RETIRADA; anclaje a la venta', () => {
    const s = sql();
    // La jerarquía tienda→BCC→elToque ya NO se usa para el importe del reembolso
    expect(s).not.toMatch(/ERR_EXCHANGE_RATE_UNAVAILABLE/);
    // Tasa implícita: filas de pago USD (v2.25) → media ponderada
    expect(s).toMatch(/SUM\(pt\.amount \* pt\.exchange_rate\)/);
    // → liquidación pura → (canónico − CUP neto)/USD neto
    expect(s).toMatch(/NULLIF\(COALESCE\(t\.cash_received_usd, 0\) - COALESCE\(t\.change_given_usd, 0\), 0\)/);
    // → carve legacy
    expect(s).toMatch(/SUM\(ti\.cash_paid \* ti\.exchange_rate\)/);
    // Fail-closed cuando no es reconstruible
    expect(s).toMatch(/ERR_DEVOLUTION_RATE_UNDETERMINED/);
    // La fila refund registra la tasa HISTÓRICA (v_refund_rate := v_rate_sale)
    expect(s).toMatch(/v_refund_rate := v_rate_sale;/);
    expect(s).toMatch(/v_comp_usd, p_payment_method, 'USD', v_rate_sale,/);
  });

  it('RC6 (store_credit): compensación del pasivo + tope canónico', () => {
    const s = sql();
    // Compensación: fila negativa trazable con vínculo a la devolución
    expect(s).toMatch(/-v_credit_outstanding, p_devolution_id/);
    expect(s).toMatch(/'-credit-comp'/);
    // Tope canónico: pagado − crédito emitido no compensado (SUM neto de filas)
    expect(s).toMatch(/SUM\(scl\.amount\) FROM public\.store_credit_ledger scl/);
    expect(s).toMatch(/ERR_DEVOLUTION_CREDIT_CAP/);
    // La caja NO se toca con créditos (sin INSERT a payment_transactions en esa rama)
  });

  it('§7b: get_cash_currency_summary suma recuperaciones por moneda', () => {
    const s = sql();
    expect(s).toMatch(/7b\) RECUPERACIONES EN EFECTIVO de reembolsos revertidos/);
    expect(s).toMatch(/direction = 'recovery'/);
    expect(s).toMatch(/\+ v_rec_cup \+ v_adj_cup - v_adjout_cup/);
    expect(s).toMatch(/\+ v_rec_usd \+ v_adj_usd - v_adjout_usd/);
    expect(s).toMatch(/'devolution_recoveries',jsonb_build_object\('CUP', round\(v_rec_cup, 2\), 'USD', round\(v_rec_usd, 2\)\)/);
  });

  it('invariantes PT001/PT006: las recuperaciones NO son pagos', () => {
    const s = sql();
    expect(s).toMatch(/direction NOT IN \('refund', 'recovery'\) THEN/);
    expect(s).not.toMatch(/direction <> 'refund'/);
    expect(s).toMatch(/las RECUPERACIONES \(direction='recovery'\) de reembolsos revertidos son contra-asientos simétricos/);
  });

  it('dependientes simétricas: arqueo/reporte/cierre suman recuperaciones', () => {
    const s = sql();
    for (const marker of [
      'v_cash_recoveries numeric := 0;',
      'v_voucher_recoveries numeric := 0;',
      '- v_cash_refunds + v_cash_recoveries;',
      '- v_voucher_refunds + v_voucher_recoveries;',
      "'cash_recoveries_devolution', v_cash_recoveries,",
      "'cash_recoveries', v_cash_recoveries,",
      "'recoveries_cash_total_cup', v_recoveries_cash_total_cup,",
      "+ v_recoveries_cash_total_cup",
      "'recuperacion_devolucion', 'devolutions'",
      "'recuperacion_devolucion','ajuste_caja'",
    ]) {
      expect(s).toContain(marker);
    }
  });

  it('cadena CONSECUTIVA: 2222 y 23000 permanecen intactas (no se editan)', () => {
    // La migración no re-edita las correctivas previas: el cuerpo de
    // reverse_cash_flow_document deriva del STREAM 2222 y el de
    // create_devolution_v2 del STREAM 23000 (verificable por sus marcadores)
    const s = sql();
    // 23000: tope por moneda original presente en el cuerpo base
    expect(s).toMatch(/ERR_DEVOLUTION_REFUND_CAP: reembolso en % excede lo reembolsable/);
    // 2222: la reversión de ingreso conserva su validación de efectivo esperado
    expect(s).toMatch(/anular este ingreso dejaría el efectivo esperado en negativo/);
    // 2222/23000: las validaciones físicas por moneda persisten en la rama de
    // devoluciones (moneda única Y por componente de AS_PAID)
    expect(s).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, reembolso=%/);
    expect(s).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico USD disponible=%, reembolso=%/);
  });
});
