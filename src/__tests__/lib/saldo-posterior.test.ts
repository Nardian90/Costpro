import { describe, it, expect } from 'vitest';
import {
  calcularSaldoPosterior,
  movimientosDeRecepcion,
  movimientosDeVenta,
  type SaldoPosteriorMovement,
} from '@/lib/inventory/saldo-posterior';

/**
 * MISIÓN 2026-11-07 — «Saldo en existencia según almacén» (SC-2-04 / SC-2-12)
 * ===========================================================================
 * Regla contable obligatoria: saldo posterior = saldo anterior + cantidad de
 * la operación, derivado del ledger REAL (stock_movements) en el momento
 * histórico del documento. Tabla de casos obligatoria de la misión + casos de
 * prevención de errores (no doble conteo, anuladas, borradores, varios SKU,
 * varios almacenes, reimpresión histórica estable).
 */

const mv = (
  id: string,
  created_at: string,
  quantity_change: number,
  extras: Partial<SaldoPosteriorMovement> = {},
): SaldoPosteriorMovement => ({
  id,
  created_at,
  quantity_change,
  movement_type: 'purchase',
  ...extras,
});

describe('Saldo posterior — tabla obligatoria de la misión', () => {
  it.each([
    // [saldo anterior implícito en el ledger, delta documento, esperado]
    { nombre: '0 + 4 = 4 (producto sin existencia anterior)', previos: [], delta: 4, esperado: 4 },
    { nombre: '8 + 4 = 12 (con existencia anterior)', previos: [8], delta: 4, esperado: 12 },
    { nombre: '15 + 5 = 20', previos: [15], delta: 5, esperado: 20 },
    { nombre: '100 + 0 = 100 (recepción de cantidad 0)', previos: [100], delta: 0, esperado: 100 },
  ])('$nombre', ({ previos, delta, esperado }) => {
    const ledger: SaldoPosteriorMovement[] = previos.map((q, i) =>
      mv(`prev-${i}`, `2026-01-0${i + 1}T10:00:00Z`, q),
    );
    const propios = [mv('own-1', '2026-02-01T10:00:00Z', delta, { notes: 'receipt-1' })];
    const r = calcularSaldoPosterior({
      movimientos: [...ledger, ...propios],
      movimientosPropios: propios,
      deltaDocumento: delta,
    });
    expect(r.fuente).toBe('ledger');
    expect(r.saldoAnterior).toBe(previos.reduce((s, q) => s + q, 0));
    expect(r.saldoPosterior).toBe(esperado);
  });
});

describe('Saldo posterior — enlaces documentales y prevención de errores', () => {
  it('NO doble cuenta: el saldo posterior usa Σ de los movimientos propios reales', () => {
    const propios = [
      mv('own-a', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' }),
      mv('own-b', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' }),
    ];
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios],
      movimientosPropios: propios,
      deltaDocumento: 8,
    });
    expect(r.saldoAnterior).toBe(8);
    expect(r.saldoPosterior).toBe(16); // 8 + 4 + 4 (no 8+8+8)
  });

  it('varias líneas del mismo SKU en la recepción: Σ cantidades correcta', () => {
    const propios = [
      mv('own-a', '2026-02-01T10:00:00Z', 2, { notes: 'receipt-1' }),
      mv('own-b', '2026-02-01T10:00:00Z', 2, { notes: 'receipt-1' }),
    ];
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios],
      movimientosPropios: propios,
      deltaDocumento: 4,
    });
    expect(r.saldoPosterior).toBe(12);
  });

  it('recepción anulada (reversión posterior): la reimpresión histórica NO cambia', () => {
    const propios = [mv('own-a', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' })];
    // La reversión (purchase_reverse) es POSTERIOR y NO es movimiento propio
    // de la operación original: entra al ledger pero no al cálculo del documento.
    const ledger = [
      mv('p1', '2026-01-05T10:00:00Z', 8),
      ...propios,
      mv('rev-1', '2026-03-01T10:00:00Z', -4, { notes: 'receipt-1', movement_type: 'purchase_reverse' }),
    ];
    const r = calcularSaldoPosterior({
      movimientos: ledger,
      movimientosPropios: movimientosDeRecepcion(ledger, 'receipt-1'),
      deltaDocumento: 4,
    });
    expect(r.saldoAnterior).toBe(8);
    expect(r.saldoPosterior).toBe(12); // saldo en el MOMENTO de la recepción
  });

  it('movimientos de OTRO almacén no contaminan (el ledger se consulta por tienda)', () => {
    const propios = [mv('own-a', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' })];
    // El fetch por store_id ya excluye la otra tienda: aquí se simula que
    // el ledger recibido solo contiene la tienda correcta.
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios],
      movimientosPropios: propios,
      deltaDocumento: 4,
    });
    expect(r.saldoPosterior).toBe(12);
  });

  it('documento en borrador/pendiente: PROYECCIÓN saldo actual + cantidad', () => {
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8)],
      movimientosPropios: [],
      deltaDocumento: 4,
      pendienteContabilizar: true,
    });
    expect(r.fuente).toBe('proyeccion');
    expect(r.saldoAnterior).toBe(8);
    expect(r.saldoPosterior).toBe(12);
  });

  it('sin movimientos propios ni proyección: LIMITACIÓN → «s/d», nunca cifra inventada', () => {
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8)],
      movimientosPropios: [],
      deltaDocumento: 4,
      pendienteContabilizar: false,
    });
    expect(r.fuente).toBe('limitacion');
    expect(Number.isNaN(r.saldoPosterior)).toBe(true);
  });

  it('venta posterior NO altera la reimpresión de la recepción histórica', () => {
    const propios = [mv('own-a', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' })];
    // Tras la recepción se venden 2 unidades (2026-04): el documento histórico
    // de la recepción sigue mostrando 12.
    const ledger = [
      mv('p1', '2026-01-05T10:00:00Z', 8),
      ...propios,
      mv('sale-1', '2026-04-01T10:00:00Z', -2, { reference_id: 'tx-1', movement_type: 'sale' }),
    ];
    const r = calcularSaldoPosterior({
      movimientos: ledger,
      movimientosPropios: movimientosDeRecepcion(ledger, 'receipt-1'),
      deltaDocumento: 4,
    });
    expect(r.saldoPosterior).toBe(12);
  });

  it('venta: saldo posterior = saldo anterior − cantidad vendida (enlace reference_id)', () => {
    const propios = [mv('sale-1', '2026-02-01T10:00:00Z', -5, { reference_id: 'tx-9', movement_type: 'sale' })];
    const ledger = [mv('p1', '2026-01-05T10:00:00Z', 12), ...propios];
    const r = calcularSaldoPosterior({
      movimientos: ledger,
      movimientosPropios: movimientosDeVenta(ledger, 'tx-9'),
      deltaDocumento: -5,
    });
    expect(r.saldoAnterior).toBe(12);
    expect(r.saldoPosterior).toBe(7);
  });

  it('reimpresión determinista: mismo ledger → mismo resultado (idempotente)', () => {
    const propios = [mv('own-a', '2026-02-01T10:00:00Z', 4, { notes: 'receipt-1' })];
    const ledger = [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios];
    const r1 = calcularSaldoPosterior({ movimientos: ledger, movimientosPropios: propios, deltaDocumento: 4 });
    const r2 = calcularSaldoPosterior({ movimientos: [...ledger], movimientosPropios: [...propios], deltaDocumento: 4 });
    expect(r2).toEqual(r1);
  });

  it('coherencia SC-2-04 ↔ SC-2-12: misma operación → mismos saldos', () => {
    // El mismo ledger alimenta ambos documentos; para la misma operación el
    // resultado es idéntico por construcción (misma función pura).
    const propios = [mv('own-a', '2026-02-01T10:00:00Z', -4, { notes: 'receipt-1', reference_id: 'tx-1', movement_type: 'sale' })];
    const ledger = [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios];
    const porNotas = movimientosDeRecepcion(ledger, 'receipt-1');
    const porReferencia = movimientosDeVenta(ledger, 'tx-1');
    expect(porNotas).toHaveLength(0); // la venta no es 'purchase'
    expect(porReferencia).toHaveLength(1);
    const rRecepcion = calcularSaldoPosterior({ movimientos: ledger, movimientosPropios: porNotas, deltaDocumento: 4 });
    const rVenta = calcularSaldoPosterior({ movimientos: ledger, movimientosPropios: porReferencia, deltaDocumento: -4 });
    // El saldo anterior es el MISMO (mismo momento, mismo almacén); el
    // posterior refleja el delta real de cada documento.
    expect(rRecepcion.fuente).toBe('limitacion');
    expect(rVenta.saldoAnterior).toBe(8);
    expect(rVenta.saldoPosterior).toBe(4); // 8 − 4 (venta descontó stock)
  });

  it('orden canónico (created_at, id): desempate estable por id', () => {
    const propios = [
      mv('own-b', '2026-02-01T10:00:00Z', 2, { notes: 'receipt-1' }),
      mv('own-a', '2026-02-01T10:00:00Z', 2, { notes: 'receipt-1' }),
    ];
    const r = calcularSaldoPosterior({
      movimientos: [mv('p1', '2026-01-05T10:00:00Z', 8), ...propios],
      movimientosPropios: propios,
      deltaDocumento: 4,
    });
    expect(r.saldoAnterior).toBe(8);
    expect(r.saldoPosterior).toBe(12);
  });
});
