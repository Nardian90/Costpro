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
}

interface UseAccountsPayableResult {
  data: UnifiedPayable[];
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
  const [data, setData] = useState<UnifiedPayable[]>([]);
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
        const params = new URLSearchParams({
          store_id: user.activeStoreId!,
          tab: params.tab || 'all',
        });
        if (params.method) params.set('method', params.method);
        if (params.currency) params.set('currency', params.currency);
        if (params.search) params.set('search', params.search);

        const response = await fetch(`/api/accounts-payable?${params.toString()}`, {
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
  }, [user?.activeStoreId, params.tab, params.method, params.currency, params.search, refetchTrigger]);

  return { data, kpis, summary, count, loading, error, refetch };
}
