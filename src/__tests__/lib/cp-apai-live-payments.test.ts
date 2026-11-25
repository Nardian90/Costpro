/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 8 (A/E).
 *
 * Pruebas unitarias del guard de pagos vivos (cliente):
 *  · computeLivePayments — clasificación viva/revertida + neteo (misión §4.2:
 *    los estados de pago NO son equivalentes; una contra-fila no es un pago).
 *  · parseUnresolvedPaymentsError — parseo del error estructurado del RPC.
 *
 * Escenarios de la misión §8.A cubiertos aquí (lógica cliente):
 *  sin pagos · pago parcial · pago totalmente aplicado · pago revertido ·
 *  un documento con varios pagos · pago con reversión parcial del neteo.
 */
import { describe, it, expect } from 'vitest';
import {
  computeLivePayments,
  parseUnresolvedPaymentsError,
  type DocumentPaymentRow,
} from '@/lib/payments/live-payments';

const row = (over: Partial<DocumentPaymentRow> & Pick<DocumentPaymentRow, 'id' | 'payment_date'>): DocumentPaymentRow => ({
  amount: 100,
  amount_cup: 100,
  payment_date: '2026-11-23T21:34:51Z',
  ...over,
});

describe('computeLivePayments — clasificación de pagos vivos (misión §8.A)', () => {
  it('documento sin pagos: cero vivos, neto cero', () => {
    const s = computeLivePayments([]);
    expect(s.liveCount).toBe(0);
    expect(s.liveTotalCup).toBe(0);
    expect(s.netPaidCup).toBe(0);
  });

  it('pago confirmado sin contra-fila: 1 vivo (escenario C de la misión)', () => {
    const s = computeLivePayments([row({ id: 'p1', amount: 1800, amount_cup: 1800 })]);
    expect(s.liveCount).toBe(1);
    expect(s.liveTotalCup).toBe(1800);
    expect(s.netPaidCup).toBe(1800);
    expect(s.liveRows.map(r => r.id)).toEqual(['p1']);
  });

  it('pago revertido (contra-fila): 0 vivos y neto 0 — la obligación quedó restablecida', () => {
    const s = computeLivePayments([
      row({ id: 'p1', amount: 1800, amount_cup: 1800, direction: 'in' }),
      row({ id: 'c1', amount: 1800, amount_cup: 1800, direction: 'reversal', reverses_payment_id: 'p1', payment_date: '2026-11-24T10:00:00Z' }),
    ]);
    expect(s.liveCount).toBe(0);
    expect(s.liveTotalCup).toBe(0);
    expect(s.netPaidCup).toBe(0);
  });

  it('contra-fila por importe distinto (dato incoherente): el pago original queda NO-vivo — el modelo es binario (uq_payment_reversal_origin)', () => {
    // Invariante del modelo: UNA reversión por pago (índice único parcial) y
    // reverse_supplier_payment espeja el importe COMPLETO del original. Una
    // contra-fila con importe distinto solo puede venir de caminos manuales:
    // el guard la trata como resolución del pago (defensa del modelo).
    const s = computeLivePayments([
      row({ id: 'p1', amount: 1000, amount_cup: 1000 }),
      row({ id: 'c1', amount: 400, amount_cup: 400, direction: 'reversal', reverses_payment_id: 'p1' }),
      row({ id: 'p2', amount: 500, amount_cup: 500, payment_date: '2026-11-25T09:00:00Z' }),
    ]);
    expect(s.liveCount).toBe(1); // solo p2: p1 tiene contra-fila → resuelto
    expect(s.liveTotalCup).toBe(500);
    expect(s.netPaidCup).toBe(1100); // 1000 − 400 + 500 (neto contable)
  });

  it('varios pagos (escenario F): cada uno se evalúa individualmente', () => {
    const s = computeLivePayments([
      row({ id: 'p1', amount: 300, amount_cup: 300, direction: 'in' }),
      row({ id: 'c1', amount: 300, amount_cup: 300, direction: 'reversal', reverses_payment_id: 'p1' }),
      row({ id: 'p2', amount: 700, amount_cup: 700, payment_date: '2026-11-25T09:00:00Z' }),
    ]);
    expect(s.liveCount).toBe(1);
    expect(s.liveRows[0].id).toBe('p2');
    expect(s.netPaidCup).toBe(700);
  });

  it('filas legado sin direction se tratan como pago original (in)', () => {
    const s = computeLivePayments([row({ id: 'p1', amount: 250, amount_cup: 250, direction: null as unknown as undefined })]);
    expect(s.liveCount).toBe(1);
    expect(s.netPaidCup).toBe(250);
  });

  it('importe como string (PostgREST) se parsea sin NaN', () => {
    const s = computeLivePayments([row({ id: 'p1', amount: '1800.00', amount_cup: '1800.00' })]);
    expect(s.liveTotalCup).toBe(1800);
    expect(s.netPaidCup).toBe(1800);
  });
});

describe('parseUnresolvedPaymentsError — backstop del guard server-side', () => {
  it('parsea el error de recepción con los cuatro importes', () => {
    const d = parseUnresolvedPaymentsError(
      "ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=2 importe_vivo=1800.00 total_documento=2500.00 saldo_actual=700.00 — anule primero los pagos",
    );
    expect(d).not.toBeNull();
    expect(d!.code).toBe('ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS');
    expect(d!.docKind).toBe('receipt');
    expect(d!.liveCount).toBe(2);
    expect(d!.liveTotalCup).toBe(1800);
    expect(d!.totalDocumento).toBe(2500);
    expect(d!.saldoActual).toBe(700);
  });

  it('parsea el error de servicio (PostgrestError plano)', () => {
    const d = parseUnresolvedPaymentsError({ message: 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=1 importe_vivo=1800 total_documento=1800 saldo_actual=0 — anule primero' } as unknown as Error);
    expect(d).not.toBeNull();
    expect(d!.docKind).toBe('service');
    expect(d!.liveCount).toBe(1);
  });

  it('errores ajenos al guard devuelven null (los demás flujos siguen su curso)', () => {
    expect(parseUnresolvedPaymentsError('ERR_RECEIPT_NOT_ACTIVE: status=reversed')).toBeNull();
    expect(parseUnresolvedPaymentsError('ERR_BACKDATED_DOCUMENT')).toBeNull();
    expect(parseUnresolvedPaymentsError(new Error('network down'))).toBeNull();
    expect(parseUnresolvedPaymentsError(undefined)).toBeNull();
  });
});
