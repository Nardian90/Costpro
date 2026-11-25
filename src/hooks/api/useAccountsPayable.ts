'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store';
import { apiFetch } from '@/lib/api-fetch';

export type AgingTab = 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid';
export type PayableCategory = 'all' | 'receipts' | 'services' | 'commissions';

// CP-AP-FORENSIC-RECONCILIATION-001: la forma de cada documento proviene del
// calculador (fuente única de verdad). Campos heredados preservados para los
// consumidores existentes (PaymentModal, LiquidationModal, ListView).
export interface UnifiedPayable {
  id: string;
  ref_type: 'receipt' | 'service' | 'commission';
  ref_id: string;
  supplier: string;
  supplier_key: string;
  reference: string | null;
  doc_date: string | null;
  due_date: string | null;
  total: number;
  total_cup: number;
  paid_amount: number;
  paid_cup: number;
  balance: number;
  balance_cup: number;
  currency: string;
  exchange_rate: number;
  payment_method: string | null;
  days_until_due: number | null;
  days_overdue: number | null;
  is_overdue: boolean;
  is_settled: boolean;
  aging_bucket: 'current' | 'upcoming7' | '30' | '60' | '90' | '120' | '120+' | 'paid';
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_at: string | null;
}

export interface AccountsPayableKPIs {
  totalOverdue: number;
  totalUpcoming: number;
  totalPending: number;
  /** Σ pagos aplicados a las obligaciones incluidas en el filtro (conciliado
   * con la columna «Pagado» de Por proveedor: Total − Pagado = Saldo). */
  totalPaid: number;
}

export interface AccountsPayableSummary {
  receipts: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
  services: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
  commissions: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
}

export interface AccountsPayableMeta {
  cutoff: string;
  date_from: string | null;
  date_to: string | null;
}

interface UseAccountsPayableParams {
  tab?: AgingTab;
  category?: PayableCategory;
  method?: 'cash' | 'transfer' | 'zelle' | 'external_transfer';
  currency?: string;
  search?: string;
  supplier?: string;
  dateFrom?: string;
  dateTo?: string;
  mode?: 'list' | 'grouped';
}

export interface GroupedPayable {
  supplier: string;
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  aging: {
    current: number;
    upcoming7: number;
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
  meta: AccountsPayableMeta | null;
  count: number;
  loading: boolean;
  /** Cierto mientras los parámetros cambiaron pero los datos aún no llegaron
   * (ventana de carrera). La vista DEBE tratarlo como carga — renderizar la
   * tabla con datos del modo anterior provocaba el TypeError al volver de
   * Detalle a Por proveedor (CP-AP-FORENSIC-RECONCILIATION-001 §3). */
  stale: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * useAccountsPayable — Hook para consumir /api/accounts-payable.
 *
 * CP-AP-FORENSIC-RECONCILIATION-001:
 *  - Filtros de período (dateFrom/dateTo → fecha contable de DOCUMENTOS;
 *    dateTo es además la FECHA DE CORTE de saldos/antigüedad).
 *  - Categoría (Todos/Recepciones/Servicios/Comisiones) y proveedor exacto
 *    (drill-down Por proveedor → Detalles).
 *  - Guarda anti-carrera: `stale` marca los renders intermedios donde los
 *    params (p. ej. mode) ya cambiaron pero `data` todavía pertenece al modo
 *    anterior. La vista muestra carga en esa ventana en vez de renderizar
 *    filas con forma incompatible (crash D3).
 */
export function useAccountsPayable(params: UseAccountsPayableParams = {}): UseAccountsPayableResult {
  const { user } = useAuthStore();
  const [data, setData] = useState<UnifiedPayable[] | GroupedPayable[]>([]);
  const [totals, setTotals] = useState<GroupedTotals | null>(null);
  const [kpis, setKpis] = useState<AccountsPayableKPIs | null>(null);
  const [summary, setSummary] = useState<AccountsPayableSummary | null>(null);
  const [meta, setMeta] = useState<AccountsPayableMeta | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  /** Firma de los parámetros con los que se obtuvieron los datos actuales. */
  const [fetchedSig, setFetchedSig] = useState<string>('');
  const reqIdRef = useRef(0);

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), []);

  // Firma canónica de la consulta actual (todo lo que cambia la respuesta).
  const signature = JSON.stringify([
    user?.activeStoreId ?? null,
    params.tab ?? 'all',
    params.category ?? 'all',
    params.method ?? null,
    params.currency ?? null,
    params.search ?? null,
    params.supplier ?? null,
    params.dateFrom ?? null,
    params.dateTo ?? null,
    params.mode ?? 'list',
  ]);
  const stale = fetchedSig !== signature;

  useEffect(() => {
    if (!user?.activeStoreId) {
      setLoading(false);
      setError('No hay tienda activa configurada. Selecciona una tienda para ver las cuentas por pagar.');
      return;
    }

    const reqId = ++reqIdRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && reqId === reqIdRef.current;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          store_id: user.activeStoreId!,
          tab: params.tab || 'all',
          category: params.category || 'all',
          mode: params.mode || 'list',
        });
        if (params.method) queryParams.set('method', params.method);
        if (params.currency) queryParams.set('currency', params.currency);
        if (params.search) queryParams.set('search', params.search);
        if (params.supplier) queryParams.set('supplier', params.supplier);
        if (params.dateFrom) queryParams.set('date_from', params.dateFrom);
        if (params.dateTo) queryParams.set('date_to', params.dateTo);

        const json = await apiFetch(`/api/accounts-payable?${queryParams.toString()}`);

        if (isCurrent()) {
          setData(json.data || []);
          setTotals(json.totals || null);
          setKpis(json.kpis || null);
          setSummary(json.summary || null);
          setMeta(json.meta || null);
          setCount(json.count || 0);
          setFetchedSig(signature);
        }
      } catch (e: any) {
        if (isCurrent()) {
          setError(e.message || 'Error al cargar cuentas por pagar');
        }
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [signature, refetchTrigger]);

  return { data, totals, kpis, summary, meta, count, loading: loading || stale, stale, error, refetch };
}
