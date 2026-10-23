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
 */

import type { LedgerPayment } from './collection-currency';

const CHUNK = 150;

/** Cliente Supabase mínimo para esta consulta (session o admin). */
interface SupabaseLike {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * Devuelve Map<transaction_id, LedgerPayment[]> para las ventas dadas.
 * Solo filas ref_type='sale' (las creadas por create_sale_v2 junto a la
 * venta — direction 'in' histórico).
 */
export async function fetchSalePaymentsByTx(
  supabase: SupabaseLike,
  txIds: string[],
): Promise<Map<string, LedgerPayment[]>> {
  const map = new Map<string, LedgerPayment[]>();
  if (txIds.length === 0) return map;
  for (let i = 0; i < txIds.length; i += CHUNK) {
    const chunk = txIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('transaction_id, payment_method, currency, amount, exchange_rate')
      .eq('ref_type', 'sale')
      .in('transaction_id', chunk);
    if (error) throw new Error(error.message);
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
