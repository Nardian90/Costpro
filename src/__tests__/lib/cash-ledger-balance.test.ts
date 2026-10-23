/**
 * MISIÓN CAJA v2.24.0 (§7) — pruebas del libro mayor de caja: saldo corrido
 * por moneda, saldo histórico a fecha de corte y filtros que no destruyen la
 * corrida contable.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCashLedger,
  applyLedgerDisplayFilters,
  balanceAtCutoff,
  type CashLedgerRowInput,
} from '@/lib/cash-ledger/build-ledger';

const base = (over: Partial<CashLedgerRowInput>): CashLedgerRowInput => ({
  id: over.id ?? 'row',
  effective_at: over.effective_at ?? '2026-10-22T10:00:00Z',
  operational_date: over.operational_date ?? '2026-10-22',
  movement_type: over.movement_type ?? 'venta_efectivo',
  movement_label: over.movement_label ?? 'Venta en efectivo',
  currency: over.currency ?? 'CUP',
  amount_native: over.amount_native ?? 1000,
  amount_cup_signed: over.amount_cup_signed ?? 1000,
  reference: over.reference ?? null,
  description: over.description ?? '',
  user_name: over.user_name ?? null,
  status: over.status ?? 'completed',
  origin_view: over.origin_view ?? 'sales',
  origin_id: over.origin_id ?? 'x',
});

describe('buildCashLedger — corrida contable por moneda (misión §4/§9)', () => {
  it('suma entradas y resta salidas por moneda con saldos separados CUP/USD', () => {
    const { rows } = buildCashLedger([
      base({ id: '1', movement_type: 'venta_efectivo', currency: 'CUP', amount_native: 60000, amount_cup_signed: 60000 }),
      base({ id: '2', movement_type: 'vuelto_venta', currency: 'USD', amount_native: 80, amount_cup_signed: -32000 }),
      base({ id: '3', movement_type: 'pago_proveedor', currency: 'CUP', amount_native: 2400, amount_cup_signed: -2400 }),
      base({ id: '4', movement_type: 'entrega_efectivo', currency: 'USD', amount_native: 20, amount_cup_signed: -8000 }),
    ], { cup: 1000, usd: 5 });

    expect(rows[0].balance_cup).toBe(61000);
    expect(rows[0].balance_usd).toBe(5);
    expect(rows[1].balance_usd).toBe(5 - 80); // el vuelto USD sale del cajón USD
    expect(rows[2].balance_cup).toBe(58600);
    expect(rows[3].balance_usd).toBe(5 - 80 - 20);
    expect(rows[3].direction).toBe('out');
    expect(rows[0].direction).toBe('in');
  });

  it('ordena por fecha efectiva (no por orden de inserción)', () => {
    const { rows } = buildCashLedger([
      base({ id: 'b', effective_at: '2026-10-22T12:00:00Z', amount_native: 500 }),
      base({ id: 'a', effective_at: '2026-10-22T09:00:00Z', amount_native: 200 }),
    ], { cup: 0, usd: 0 });
    expect(rows[0].id).toBe('a');
    expect(rows[0].balance_cup).toBe(200);
    expect(rows[1].balance_cup).toBe(700);
  });

  it('los movimientos informativos (apertura/cierre) NO alteran el saldo', () => {
    const { rows, totals } = buildCashLedger([
      base({ id: 'open', effective_at: '2026-10-22T09:00:00Z', movement_type: 'apertura_turno', movement_label: 'Apertura de turno', amount_native: 0, amount_cup_signed: 0 }),
      base({ id: 'sale', effective_at: '2026-10-22T12:00:00Z', movement_type: 'venta_efectivo', amount_native: 1000 }),
      base({ id: 'close', effective_at: '2026-10-22T18:00:00Z', movement_type: 'cierre_turno', movement_label: 'Cierre de turno', amount_native: 0, amount_cup_signed: 0 }),
    ], { cup: 500, usd: 0 });
    const open = rows.find(r => r.id === 'open')!;
    const sale = rows.find(r => r.id === 'sale')!;
    const close = rows.find(r => r.id === 'close')!;
    expect(open.direction).toBe('info');
    expect(open.balance_cup).toBe(500);
    expect(sale.balance_cup).toBe(1500);
    expect(close.balance_cup).toBe(1500);
    expect(totals.entry_cup).toBe(1000);
    expect(totals.exit_cup).toBe(0);
  });

  it('los anulados (fila + contra) aportan neto cero — el ledger manda', () => {
    const { rows } = buildCashLedger([
      base({ id: 'ie-in', movement_type: 'ingreso_caja', amount_native: 5000, amount_cup_signed: 5000 }),
      base({ id: 'ie-out', movement_type: 'egreso_caja', amount_native: 5000, amount_cup_signed: -5000 }),
    ], { cup: 0, usd: 0 });
    expect(rows[1].balance_cup).toBe(0);
  });
});

describe('applyLedgerDisplayFilters — filtra la vista SIN destruir el saldo real', () => {
  const ledger = buildCashLedger([
    base({ id: '1', movement_type: 'venta_efectivo', currency: 'CUP', amount_native: 1000 }),
    base({ id: '2', movement_type: 'pago_proveedor', movement_label: 'Pago a proveedor (efectivo)', currency: 'CUP', amount_native: 300, amount_cup_signed: -300 }),
    base({ id: '3', movement_type: 'venta_efectivo', currency: 'USD', amount_native: 50, amount_cup_signed: 20000 }),
  ], { cup: 0, usd: 0 });

  it('filtro por moneda conserva el saldo corrido real de cada fila', () => {
    const visible = applyLedgerDisplayFilters(ledger.rows, { currency: 'USD' });
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('3');
    // El saldo de la fila 3 fue calculado con TODAS las filas (corrida completa)
    expect(visible[0].balance_cup).toBe(700);
    expect(visible[0].balance_usd).toBe(50);
  });

  it('filtro por tipo + búsqueda por referencia/descripción', () => {
    const vis1 = applyLedgerDisplayFilters(ledger.rows, { movementType: 'venta_efectivo' });
    expect(vis1.map(r => r.id)).toEqual(['1', '3']);
    // La búsqueda cubre reference + description + movement_label
    const vis2 = applyLedgerDisplayFilters(ledger.rows, { referenceQuery: 'venta en efectivo' });
    expect(vis2.map(r => r.id)).toEqual(['1', '3']);
  });
});

describe('balanceAtCutoff — saldo histórico a fecha de corte (misión §7)', () => {
  const ledger = buildCashLedger([
    base({ id: '1', effective_at: '2026-10-20T10:00:00Z', amount_native: 1000 }),
    base({ id: '2', effective_at: '2026-10-21T10:00:00Z', movement_type: 'entrega_efectivo', amount_native: 400, amount_cup_signed: -400 }),
    base({ id: '3', effective_at: '2026-10-23T10:00:00Z', amount_native: 900 }),
  ], { cup: 100, usd: 0 });

  it('corte 21/10: incluye la entrega del 21, excluye la venta del 23', () => {
    const c = balanceAtCutoff(ledger.rows, '2026-10-21T23:59:59Z');
    expect(c.cup).toBe(100 + 1000 - 400);
    expect(c.lastRow?.id).toBe('2');
  });

  it('corte 19/10 (anterior a todo): saldo de apertura', () => {
    const c = balanceAtCutoff(ledger.rows, '2026-10-19T23:59:59Z', { cup: 100, usd: 0 });
    expect(c.cup).toBe(100);
    expect(c.lastRow).toBeNull();
  });

  it('la entrega completa deja el saldo en cero SOLO si se entrega todo (prueba 3/4 de la misión)', () => {
    const { rows } = buildCashLedger([
      base({ id: 'in', movement_type: 'venta_efectivo', amount_native: 8726499.98 }),
      base({ id: 'out', movement_type: 'entrega_efectivo', currency: 'CUP', amount_native: 8726499.98, amount_cup_signed: -8726499.98 }),
    ], { cup: 0, usd: 0 });
    expect(rows[1].balance_cup).toBe(0);
    const usd = buildCashLedger([
      base({ id: 'in-usd', movement_type: 'venta_efectivo', currency: 'USD', amount_native: 500 }),
      base({ id: 'out-usd', movement_type: 'entrega_efectivo', currency: 'USD', amount_native: 500, amount_cup_signed: 0 }),
    ], { cup: 0, usd: 0 });
    expect(usd.rows[1].balance_usd).toBe(0);
  });
});
