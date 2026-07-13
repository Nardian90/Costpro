'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';

export type AgingTab = 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid';

export interface UnifiedPayable {
  id: string;
  ref_type: 'receipt' | 'service';
  ref_id: string;
  supplier: string | null;
  reference: string | null;
  total: number;
  total_cup: number;
  paid_amount: number;
  paid_cup: number;
  balance: number;
  balance_cup: number;
  currency: string;
  exchange_rate: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method: string | null;
  due_date: string | null;
  days_until_due: number | null;
  is_overdue: boolean;
  aging_bucket: 'current' | '30' | '60' | '90' | '120' | '120+' | 'paid';
  created_at: string;
}

export interface AccountsPayableKPIs {
  totalOverdue: number;
  totalUpcoming: number;
  totalPending: number;
  totalPaid: number;
}

export interface AccountsPayableSummary {
  receipts: { count: number; balance_cup: number };
  services: { count: number; balance_cup: number };
}

interface UseAccountsPayableParams {
  tab?: AgingTab;
  method?: 'cash' | 'transfer' | 'zelle';
  currency?: string;
  search?: string;
  mode?: 'list' | 'grouped';
}

export interface GroupedPayable {
  supplier: string;
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  aging: {
    current: number;
    overdue: number;
    '30': number;
    '60': number;
    '90': number;
    '120': number;
    '120+': number;
  };
  count: number;
}

export interface GroupedTotals {
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  aging: GroupedPayable['aging'];
}

interface UseAccountsPayableResult {
  data: UnifiedPayable[] | GroupedPayable[];
  totals: GroupedTotals | null;
  kpis: AccountsPayableKPIs | null;
  summary: AccountsPayableSummary | null;
  count: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * useAccountsPayable — Hook para consumir /api/accounts-payable.
 *
 * FASE 1 (2026-07-13): consulta receipts + received_services consolidados.
 * Soporta tabs de aging, filtros por método/moneda, y búsqueda por proveedor.
 */
export function useAccountsPayable(params: UseAccountsPayableParams = {}): UseAccountsPayableResult {
  const { user } = useAuthStore();
  const [data, setData] = useState<UnifiedPayable[] | GroupedPayable[]>([]);
  const [totals, setTotals] = useState<GroupedTotals | null>(null);
  const [kpis, setKpis] = useState<AccountsPayableKPIs | null>(null);
  const [summary, setSummary] = useState<AccountsPayableSummary | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), []);

  useEffect(() => {
    if (!user?.activeStoreId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // FIX-TDZ (2026-07-13): renombrar a 'queryParams' para evitar
        // colisión con 'params' (argumento del hook) que causaba
        // "Cannot access 'params' before initialization".
        const queryParams = new URLSearchParams({
          store_id: user.activeStoreId!,
          tab: params.tab || 'all',
          mode: params.mode || 'list',
        });
        if (params.method) queryParams.set('method', params.method);
        if (params.currency) queryParams.set('currency', params.currency);
        if (params.search) queryParams.set('search', params.search);

        const response = await fetch(`/api/accounts-payable?${queryParams.toString()}`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${response.status}`);
        }

        const json = await response.json();

        if (!cancelled) {
          setData(json.data || []);
          setTotals(json.totals || null);
          setKpis(json.kpis || null);
          setSummary(json.summary || null);
          setCount(json.count || 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Error al cargar cuentas por pagar');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [user?.activeStoreId, params.tab, params.method, params.currency, params.search, params.mode, refetchTrigger]);

  return { data, totals, kpis, summary, count, loading, error, refetch };
}
