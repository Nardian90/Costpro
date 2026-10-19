import { describe, it, expect } from 'vitest';
import { computeArqueo, type CashShiftBreakdown } from '@/lib/cash-arqueo';

/**
 * FASE 4.6 de la misión — escenarios numéricos obligatorios del arqueo.
 * Fórmula espejo de close_cash_shift v2.21.0 / get_cash_shift_expected
 * (migraciones 20261010000002 v2.18.0 + 20261021000001 v2.21.0 — MISIÓN
 * INGRESOS/EGRESOS: documentos de caja como términos in/out).
 */

const base: CashShiftBreakdown = {
  opening_balance: 0,
  total_sales: 0,
  cash_sales: 0,
  cash_outflows: 0,
  cash_production: 0,
  cash_commissions: 0,
  cash_flow_in: 0,
  cash_flow_out: 0,
  transfer_sales: 0,
  zelle_sales: 0,
};

describe('Arqueo de caja v2.18.0 — escenarios de la misión (Fase 4.6)', () => {
  it('Fondo 50 000 + servicio pagado en efectivo 10 000 → esperado 40 000', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 50000, cash_outflows: 10000 };
    const r = computeArqueo(b, 40000, 0);
    expect(r.expected_cash).toBe(40000);
    expect(r.expected_total).toBe(40000);
    expect(r.difference).toBe(0);
  });

  it('Fondo 50 000 + servicio PENDIENTE de pago → esperado sigue 50 000', () => {
    // Un servicio pendiente NO genera payment_transactions → no hay salida de efectivo
    const b: CashShiftBreakdown = { ...base, opening_balance: 50000 };
    const r = computeArqueo(b, 50000, 0);
    expect(r.expected_cash).toBe(50000);
    expect(r.difference).toBe(0);
  });

  it('Fondo 50 000 + servicio pagado por TRANSFERENCIA 10 000 → efectivo sigue 50 000', () => {
    // El pago por transferencia no reduce el efectivo físico de la caja
    const b: CashShiftBreakdown = { ...base, opening_balance: 50000 };
    // (transfer_sales en este desglose son VENTAS por transferencia; el pago
    // del servicio por transferencia no aparece como cash_outflows)
    const r = computeArqueo(b, 50000, 0);
    expect(r.expected_cash).toBe(50000);
    expect(r.difference).toBe(0);
  });

  it('Servicio 10 000 pagado mixto (6 000 efectivo + 4 000 transferencia) → efectivo 44 000', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 50000, cash_outflows: 6000 };
    const r = computeArqueo(b, 44000, 0);
    expect(r.expected_cash).toBe(44000);
    expect(r.difference).toBe(0);
  });

  it('Ventas mixtas: solo la parte cash cuenta como efectivo', () => {
    const b: CashShiftBreakdown = {
      ...base,
      opening_balance: 10000,
      total_sales: 10000,
      cash_sales: 6000, // venta mixed 10 000 = 6 000 cash + 4 000 transfer
      transfer_sales: 4000,
    };
    const r = computeArqueo(b, 16000, 4000);
    expect(r.expected_cash).toBe(16000);
    expect(r.expected_vouchers).toBe(4000);
    expect(r.difference).toBe(0);
  });

  it('Los cobros de ventas (ref_type=sale) NO se restan como egresos (anti doble conteo)', () => {
    // En el desglose del RPC, cash_outflows SOLO contiene receipt/service.
    // Si una venta 5 000 cash entró como cobro (ref_type=sale), NO aparece aquí.
    const b: CashShiftBreakdown = { ...base, opening_balance: 0, cash_sales: 5000, cash_outflows: 0 };
    const r = computeArqueo(b, 5000, 0);
    expect(r.expected_cash).toBe(5000); // sin doble conteo: 5 000 + 0 − 0
  });

  it('Anticipos de producción en efectivo son ENTRADAS, no salidas', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 0, cash_production: 3000 };
    const r = computeArqueo(b, 3000, 0);
    expect(r.expected_cash).toBe(3000);
  });

  it('Comisiones en efectivo se descuentan una sola vez', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 10000, cash_sales: 2000, cash_commissions: 500 };
    const r = computeArqueo(b, 11500, 0);
    expect(r.expected_cash).toBe(11500);
    expect(r.difference).toBe(0);
  });

  it('Faltante y sobrante con convención explícita (contado − esperado)', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 1000 };
    expect(computeArqueo(b, 900, 0).difference).toBe(-100); // faltante
    expect(computeArqueo(b, 1100, 0).difference).toBe(100); // sobrante
  });

  it('Tolerante a entradas faltantes/NaN (defensivo)', () => {
    const r = computeArqueo({ ...base, opening_balance: NaN }, undefined as any, null as any);
    expect(r.expected_cash).toBe(0);
    expect(r.difference).toBe(0);
  });
});

describe('Arqueo de caja v2.21.0 — documentos Ingresos/Egresos (MISIÓN 2026-10-20)', () => {
  it('Constitución del fondo 5.000 → el efectivo esperado sube 5.000 (una sola vez)', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 0, cash_flow_in: 5000 };
    expect(computeArqueo(b, 5000, 0).expected_cash).toBe(5000);
    expect(computeArqueo(b, 5000, 0).difference).toBe(0);
  });

  it('Fondo 5.000 + constitución 5.000 − devolución parcial 2.000 → esperado 8.000 (ejemplo del brief)', () => {
    const b: CashShiftBreakdown = { ...base, opening_balance: 5000, cash_flow_in: 5000, cash_flow_out: 2000 };
    expect(computeArqueo(b, 8000, 0).expected_cash).toBe(8000);
    expect(computeArqueo(b, 8000, 0).difference).toBe(0); // cuadrado
  });

  it('Documento anulado = neto cero (fila original + fila contra se cancelan)', () => {
    // El RPC suma filas del ledger: anulado aporta in X y out X → neto 0.
    const b: CashShiftBreakdown = { ...base, opening_balance: 3000, cash_flow_in: 5000, cash_flow_out: 5000 };
    expect(computeArqueo(b, 3000, 0).expected_cash).toBe(3000);
  });

  it('Con ventas y egresos documentados juntos: sin doble conteo', () => {
    const b: CashShiftBreakdown = {
      ...base,
      opening_balance: 5000,
      cash_sales: 169000,
      cash_flow_in: 5000,
      cash_flow_out: 2000,
    };
    expect(computeArqueo(b, 177000, 0).expected_cash).toBe(177000);
    expect(computeArqueo(b, 177000, 0).difference).toBe(0);
  });

  it('vouchers (transfer/zelle) intactos: los documentos de caja NO los tocan', () => {
    const b: CashShiftBreakdown = { ...base, cash_flow_in: 9000, transfer_sales: 4000, zelle_sales: 150 };
    const r = computeArqueo(b, 9000, 4150);
    expect(r.expected_vouchers).toBe(4150);
    expect(r.expected_total).toBe(13150);
    expect(r.difference).toBe(0);
  });
});
