/**
 * CP-MONEY-002 (D4, posmerge #1467) — degradación limpia de
 * fetchSalePaymentsByTx según el contrato documentado del módulo.
 *
 * Defecto: el helper documentaba «si la consulta falla, se devuelve un mapa
 * vacío y el reporte usa la reconstrucción heurística previa» pero el código
 * LANZABA la excepción; /api/cash-report y /api/cash-report/payment-totals
 * no capturaban (items-summary sí) → un fallo transitorio de la consulta del
 * ledger tiraba el Reporte Entrega COMPLETO con un 500, con tres
 * comportamientos distintos para el mismo contrato.
 *
 * Contrato corregido: el fallo de la consulta degrada a mapa vacío + warn —
 * el reporte cae a la heurística previa (filas de pago por ítem, histéricas)
 * y NUNCA inventa importes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSalePaymentsByTx } from '@/lib/cash-report/fetch-sale-payments';
import type { LedgerPayment } from '@/lib/cash-report/collection-currency';

const TX_A = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TX_B = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const rows = (txId: string) => [
  { transaction_id: txId, payment_method: 'cash', currency: 'USD', amount: 5, exchange_rate: 1000 },
  { transaction_id: txId, payment_method: 'cash', currency: 'CUP', amount: 15000, exchange_rate: 1 },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CP-MONEY-002 D4 · fetchSalePaymentsByTx — degradación limpia', () => {
  it('consulta exitosa → mapa poblado con moneda real y tasa persistida', async () => {
    const map = await fetchSalePaymentsByTx(
      async (ids) => {
        expect(ids).toEqual([TX_A]);
        return { data: rows(TX_A), error: null };
      },
      [TX_A],
    );
    const list = map.get(TX_A) as LedgerPayment[];
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ payment_method: 'cash', currency: 'USD', amount: 5, exchange_rate: 1000 });
    expect(list[1]).toMatchObject({ payment_method: 'cash', currency: 'CUP', amount: 15000 });
  });

  it('la consulta RECHAZA (excepción) → mapa VACÍO, sin lanzar (degradación a heurística)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await fetchSalePaymentsByTx(
      async () => {
        throw new Error('connection timeout');
      },
      [TX_A, TX_B],
    );
    expect(map.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('fetch-sale-payments');
  });

  it('la consulta devuelve error de PostgREST → mapa VACÍO, sin lanzar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await fetchSalePaymentsByTx(
      async () => ({ data: null, error: { message: 'permission denied for table payment_transactions' } }),
      [TX_A],
    );
    expect(map.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ids vacíos → mapa vacío sin consultar', async () => {
    const build = vi.fn();
    const map = await fetchSalePaymentsByTx(async (ids) => (build(ids), { data: [], error: null }), []);
    expect(map.size).toBe(0);
    expect(build).not.toHaveBeenCalled();
  });

  it('chunking preservado: >150 ids → consultas en lotes de 150', async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `${i}`.padStart(4, '0'));
    const calls: number[] = [];
    const map = await fetchSalePaymentsByTx(
      async (chunk) => {
        calls.push(chunk.length);
        return {
          data: chunk.map((txId) => ({ transaction_id: txId, payment_method: 'cash', currency: 'CUP', amount: 1, exchange_rate: 1 })),
          error: null,
        };
      },
      ids,
    );
    expect(calls).toEqual([150, 150, 1]);
    expect(map.size).toBe(301);
  });

  it('REGRESIÓN: el helper ya NO propaga la excepción (contrato de degradación documentado)', async () => {
    await expect(
      fetchSalePaymentsByTx(
        async () => {
          throw new Error('boom');
        },
        [TX_A],
      ),
    ).resolves.toEqual(new Map());
  });
});
