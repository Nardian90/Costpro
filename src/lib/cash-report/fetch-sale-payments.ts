/**
 * fetch-sale-payments.ts — MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24).
 *
 * Trae las filas de payment_transactions (ref_type='sale') de un conjunto de
 * ventas y las agrupa por transaction_id. Es la fuente que alimenta la
 * reconstrucción LEDGER-directa del Reporte Entrega
 * (reconstructTxCollections con `payments`): moneda real de cada componente
 * y TASA DE LA OPERACIÓN persistida por fila (create_sale_v2 §13.7).
 *
 * Consulta en chunks de 150 ids (mismo contrato que los ítems del reporte —
 * el filtro IN de PostgREST tiene límite práctico). Degradación limpia: si
 * la consulta falla, se devuelve un mapa vacío y el reporte usa la
 * reconstrucción heurística previa (ventas históricas).
 *
 * NOTA DE TIPIFICACIÓN: el helper recibe una FÁBRICA de consulta (no el
 * cliente Supabase completo) para mantener el tipado estructural superficial
 * — pasar el SupabaseClient genérico completo dispara TS2589 (Type
 * instantiation is excessively deep) en la CI.
 */

import type { LedgerPayment } from './collection-currency';

const CHUNK = 150;

/** Resultado mínimo de una consulta PostgREST (data/error). */
export interface PaymentsQueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

/**
 * Devuelve Map<transaction_id, LedgerPayment[]> para las ventas dadas.
 * `buildQuery` construye la consulta para un chunk de ids:
 *   `.from('payment_transactions').select('…').eq('ref_type','sale').in('transaction_id', ids)`
 * Solo filas ref_type='sale' (las creadas por create_sale_v2 junto a la
 * venta — direction 'in' histórico).
 */
export async function fetchSalePaymentsByTx(
  buildQuery: (txIds: string[]) => PromiseLike<PaymentsQueryResult>,
  txIds: string[],
): Promise<Map<string, LedgerPayment[]>> {
  const map = new Map<string, LedgerPayment[]>();
  if (txIds.length === 0) return map;
  for (let i = 0; i < txIds.length; i += CHUNK) {
    const chunk = txIds.slice(i, i + CHUNK);
    // CP-MONEY-002 (D4, posmerge #1467): DEGRADACIÓN LIMPIA según el contrato
    // documentado de este módulo («si la consulta falla, se devuelve un mapa
    // vacío y el reporte usa la reconstrucción heurística previa»). Antes el
    // helper LANZABA (comentario y código contradichos) y, como
    // /api/cash-report y /api/cash-report/payment-totals no capturan, un fallo
    // transitorio de la consulta del ledger tiraba el Reporte Entrega COMPLETO
    // con un 500 — mientras items-summary sí degradaba (tres comportamientos
    // distintos para el mismo contrato). El reporte degradado sigue siendo
    // correcto para ventas con filas de pago por ítem (la heurística usa
    // cash_paid/cash_currency… de transaction_items) y para históricas; solo
    // pierde el camino ledger-directo — nunca inventa importes.
    let data: unknown[] | null = null;
    try {
      const res = await buildQuery(chunk);
      if (res.error) throw new Error(res.error.message);
      data = res.data;
    } catch (err: unknown) {
      console.warn(
        '[fetch-sale-payments] ledger de pagos no disponible — degradando a la reconstrucción heurística:',
        err instanceof Error ? err.message : String(err),
      );
      return new Map<string, LedgerPayment[]>();
    }
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const txId = String(row.transaction_id || '');
      if (!txId) continue;
      const payment: LedgerPayment = {
        payment_method: String(row.payment_method || ''),
        currency: String(row.currency || 'CUP'),
        amount: Number(row.amount ?? 0),
        exchange_rate: Number(row.exchange_rate ?? 0),
      };
      const list = map.get(txId);
      if (list) list.push(payment);
      else map.set(txId, [payment]);
    }
  }
  return map;
}
