/**
 * MISIÓN POST-MERGE FINAL (2026-10-24) — Verificación estática de la migración
 * 20261024230000_devoluciones_reembolso_fisico_moneda.sql (Fase C/D).
 *
 * Contrato crítico de la regla contable del reembolso (riesgo residual §16.7):
 *   - create_devolution_v2 valida el TOPE POR MONEDA: nunca más de lo NETO
 *     pagado por esa venta en esa moneda menos lo ya reembolsado (no
 *     convertido) en ella (ERR_DEVOLUTION_REFUND_CAP) — la conversión
 *     implícita USD↔CUP queda estructuralmente imposible.
 *   - Los reembolsos en EFECTIVO validan contra el SALDO FÍSICO POR MONEDA
 *     (misma fuente autoritativa que el libro: get_cash_currency_summary →
 *     net → v_refund_currency) — nunca dejan el cajón en negativo.
 *   - La determinación del neto pagado usa las MISMAS fuentes de verdad que
 *     el ledger (liquidación §1 / legacy+carve §2) + filas reales por
 *     componente: la fila canónica CUP de v2.24 NO se toma como CUP físico
 *     pagado cuando la liquidación declara USD (no asumir amount_cup=billetes).
 *   - Se CONSERVAN: tope de cantidad DF-07 (lock de venta + relección),
 *     precio anclado al servidor v2.24.1, advisory lock por tienda, hash de
 *     idempotencia determinista, contra-asiento DF-03, store_credit intacto.
 *   - ACL service_role-only con la firma REAL de 12 argumentos.
 *   - Sin cambios de esquema: solo CREATE OR REPLACE (mecanismo estándar).
 *   - Migración CONSECUTIVA de 20261024220000 (no la edita: cadena 1818→2222→23000).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261024230000_devoluciones_reembolso_fisico_moneda.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

describe('migración 20261024230000 — regla contable del reembolso de devoluciones', () => {
  it('contiene SOLO create_devolution_v2 y NADA de DDL de esquema', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.create_devolution_v2\(/);
    // Sin cambios de esquema (anti-regresión: la corrección es solo lógica)
    expect(s).not.toMatch(/\bCREATE TABLE\b/i);
    expect(s).not.toMatch(/\bALTER TABLE\b/i);
    expect(s).not.toMatch(/\bDROP TABLE\b/i);
    expect(s).not.toMatch(/\bCREATE INDEX\b/i);
    const fnCount = (s.match(/CREATE OR REPLACE FUNCTION/g) || []).length;
    expect(fnCount).toBe(1);
  });

  it('tope por moneda: ERR_DEVOLUTION_REFUND_CAP con paid/refunded/solicitado', () => {
    const s = sql();
    // El rechazo informa moneda, pagado neto, ya reembolsado y solicitado
    expect(s).toMatch(/ERR_DEVOLUTION_REFUND_CAP: reembolso en % excede lo reembolsable de esa moneda para esta venta \(pagado neto=%, ya reembolsado=%, solicitado=%\)/);
    // El tope compara en la MONEDA DEL REEMBOLSO (nativo, no canónico)
    expect(s).toMatch(/v_refundable := CASE v_refund_currency\s*\n\s*WHEN 'USD' THEN v_paid_usd - v_refunded_usd\s*\n\s*ELSE v_paid_cup - v_refunded_cup\s*\n\s*END;/);
    expect(s).toMatch(/IF v_refund_amount > v_refundable \+ 0\.005 THEN/);
  });

  it('físico por moneda: misma fuente autoritativa que el libro (solo efectivo)', () => {
    const s = sql();
    expect(s).toMatch(/IF p_payment_method = 'cash' THEN/);
    expect(s).toMatch(/get_cash_currency_summary\(p_store_id, NULL, NULL\)/);
    expect(s).toMatch(/-> 'net' ->> v_refund_currency/);
    expect(s).toMatch(/ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, reembolso=%/);
    // Importe NATIVO de la moneda entregada (v_refund_amount, no v_total canónico)
    expect(s).toMatch(/IF v_refund_amount > v_balance_currency \+ 0\.005 THEN/);
  });

  it('determinación del neto pagado: liquidación primero, filas canónicas NUNCA como CUP físico', () => {
    const s = sql();
    // (1) liquidación explícita v2.24+ (billetes ± vuelto) + rieles bancarios
    expect(s).toMatch(/IF v_settle_present THEN/);
    expect(s).toMatch(/COALESCE\(t\.cash_received_cup, 0\) - COALESCE\(t\.change_given_cup, 0\)/);
    // (2) filas reales no-CUP (v2.25 sin liquidación)
    expect(s).toMatch(/ELSIF v_row_cash_usd > 0 THEN/);
    // (3) legacy: split por carve USD de los ítems (fila canónica ≠ CUP físico)
    expect(s).toMatch(/ELSIF v_paid_rows > 0 THEN/);
    expect(s).toMatch(/v_paid_cup := v_row_cash_cup - v_carve_cup \+ v_row_bank_cup;/);
    expect(s).toMatch(/v_paid_usd := v_carve_usd \+ v_row_bank_usd;/);
    // (3b) muy legacy: pools de la venta
    expect(s).toMatch(/COALESCE\(t\.cash_amount, 0\) - v_carve_cup \+ COALESCE\(t\.transfer_amount, 0\)/);
    // carve: espejo EXACTO del ledger §2 (cash_paid × exchange_rate)
    expect(s).toMatch(/COALESCE\(SUM\(ti\.cash_paid \* ti\.exchange_rate\), 0\)/);
  });

  it('ya reembolsado: solo devoluciones NO revertidas (la reversión libera el tope)', () => {
    const s = sql();
    expect(s).toMatch(/JOIN public\.devolutions d ON d\.id = pt\.ref_id/);
    expect(s).toMatch(/AND pt\.direction = 'refund'/);
    expect(s).toMatch(/AND d\.status IN \('pending', 'completed'\)/);
  });

  it('pagos indeterminables: flujo ambiguo BLOQUEADO (fail-closed, sin inventar conversión)', () => {
    const s = sql();
    expect(s).toMatch(/ERR_DEVOLUTION_PAYMENTS_UNDETERMINED/);
    expect(s).toMatch(/IF v_paid_cup = 0 AND v_paid_usd = 0\s*\n\s*AND v_refunded_cup = 0 AND v_refunded_usd = 0 THEN/);
  });

  it('las protecciones legítimas se CONSERVAN (DF-07, precio servidor, lock, idempotencia)', () => {
    const s = sql();
    // Tope de cantidad DF-07 con lock de venta
    expect(s).toMatch(/FOR UPDATE/);
    expect(s).toMatch(/ERR_DEVOLUTION_CAP_EXCEEDED/);
    // Precio anclado al servidor v2.24.1
    expect(s).toMatch(/price_at_sale_cup/);
    expect(s).toMatch(/pricing_source', 'server_price_at_sale_cup_v2_24_1'/);
    // Advisory lock por tienda (misma llave que caja)
    expect(s).toMatch(/pg_advisory_xact_lock\(hashtext\(p_store_id::text\)\)/);
    // Hash de idempotencia determinista (patrón 20261024180000)
    expect(s).toContain("COALESCE(p_operation_date::text, '')");
    expect(s).not.toContain("COALESCE(p_operation_date, 'now')");
    // Contra-asiento DF-03 intacto
    expect(s).toMatch(/'dev-' \|\| v_devolution_id::text \|\| '-refund'/);
    // store_credit NO toca la caja (política intacta)
    expect(s).toMatch(/ERR_STORE_CREDIT_REQUIRES_CUSTOMER/);
  });

  it('ACL service_role-only con la firma REAL de 12 argumentos', () => {
    const s = sql();
    const sig = 'create_devolution_v2(uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamptz, text)';
    expect(s).toContain(`revoke all on function public.${sig} from public;`);
    expect(s).toContain(`grant execute on function public.${sig} to service_role;`);
    // Nunca grant a authenticated (convención de mutaciones)
    expect(s).not.toMatch(/grant execute on function public\.create_devolution_v2.*to authenticated/);
  });

  it('migración CONSECUTIVA y documentada (no edita 2222; cadena 1818→2222→23000)', () => {
    const s = sql();
    expect(s).toContain('MIGRACIÓN CONSECUTIVA de 20261024220000');
    // El estado de aplicación pendiente está documentado (partido entre líneas
    // del encabezado commentado — verificar por fragmentos estables)
    expect(s).toMatch(/APLICACIÓN A\s*\n?--\s*PRODUCCIÓN PENDIENTE DE AUTORIZACIÓN DEL PROPIETARIO/);
    expect(s).toContain('no se convierte implícitamente');
  });
});
