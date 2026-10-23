/**
 * MISIÓN CAJA v2.24.0 (§7/§9) — hooks del libro mayor de caja y del libro
 * físico por moneda (get_cash_currency_summary).
 *
 * · useCashCurrencySummary: saldo físico CUP/USD acumulado (el "libro") con
 *   desglose de términos — fuente de los KPIs por moneda y de la validación
 *   de entregas sin turno.
 * · useCashLedger: movimientos que explican el saldo + saldo corrido +
 *   saldo histórico a fecha de corte (reconstrucción desde movimientos
 *   persistidos — nunca desde el saldo actual).
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { getCleanStoreId } from './base';
import type {
  CashLedgerRow,
  CashLedgerOpening,
  CashLedgerMovementType,
} from '@/lib/cash-ledger/build-ledger';

export interface CashCurrencySummary {
  window: { from: string; to: string };
  terms: Record<string, { CUP: number; USD: number }>;
  net: { CUP: number; USD: number };
}

/** Libro físico por moneda (RPC get_cash_currency_summary — STABLE, service_role+). */
export function useCashCurrencySummary(storeId: string | null | undefined) {
  const cleanStoreId = getCleanStoreId(storeId);
  return useQuery({
    queryKey: ['cash-currency-summary', cleanStoreId],
    queryFn: async (): Promise<CashCurrencySummary | null> => {
      if (!cleanStoreId) return null;
      // El libro viaja dentro de la respuesta del ledger (misma fuente de
      // clasificación — el espejo es verificable fila a fila).
      const res = await apiFetch<CashLedgerResponse & { currency_summary_now?: CashCurrencySummary | null }>(
        `/api/cash-flow/ledger?store_id=${encodeURIComponent(cleanStoreId)}&limit=50`,
      );
      return res?.currency_summary_now ?? null;
    },
    enabled: !!cleanStoreId,
    refetchInterval: 60_000,
  });
}

export interface CashLedgerResponse {
  opening: CashLedgerOpening;
  rows: CashLedgerRow[];
  totals: { entry_cup: number; exit_cup: number; entry_usd: number; exit_usd: number };
  balance_now: { cup: number; usd: number; reconciled?: boolean };
  balance_at_cutoff: { cup: number; usd: number; as_of: string | null } | null;
  count: number;
  truncated: boolean;
}

export interface CashLedgerFilters {
  from?: string | null;
  to?: string | null;
  asOf?: string | null;
  type?: CashLedgerMovementType | 'all';
  currency?: 'CUP' | 'USD' | 'all';
  user?: string | null;
  q?: string | null;
  limit?: number;
}

/**
 * Libro mayor de caja (API /api/cash-flow/ledger — clasificación espejo del
 * libro físico; saldo corrido real por fila, filtros solo de visualización).
 */
export function useCashLedger(
  storeId: string | null | undefined,
  filters: CashLedgerFilters,
  enabled = true,
) {
  const cleanStoreId = getCleanStoreId(storeId);
  const params = new URLSearchParams();
  if (cleanStoreId) params.set('store_id', cleanStoreId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.asOf) params.set('as_of', filters.asOf);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.currency && filters.currency !== 'all') params.set('currency', filters.currency);
  if (filters.user) params.set('user', filters.user);
  if (filters.q) params.set('q', filters.q);
  params.set('limit', String(filters.limit ?? 2000));

  return useQuery({
    queryKey: ['cash-ledger', cleanStoreId, filters],
    queryFn: (): Promise<CashLedgerResponse> => apiFetch<CashLedgerResponse>(`/api/cash-flow/ledger?${params}`),
    enabled: !!cleanStoreId && enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
