/**
 * MISIÓN INGRESOS/EGRESOS DE CAJA (2026-10-20) — hooks de datos.
 *
 * - Lecturas: cliente Supabase del navegador bajo RLS (política
 *   cash_flow_documents_select_own_store = has_store_access) + RPC
 *   get_cash_flow_summary (authenticated, barrera REM-R2-READ).
 * - Mutaciones: rutas API /api/cash-flow y /api/cash-flow/reverse con
 *   Bearer de la sesión (los RPC de mutación son service_role-only y el
 *   actor viaja SIEMPRE como p_user_id de la sesión verificada).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api-fetch';
import type { CashFlowDocument, CashFlowSummary } from '@/types';
import { getCleanStoreId } from './base';
import { toast } from 'sonner';

export interface CashFlowFilters {
  search?: string;
  docType?: 'ingreso' | 'egreso' | 'all';
  concept?: string | 'all';
  status?: 'confirmado' | 'anulado' | 'all';
  currency?: 'CUP' | 'USD' | 'all';
  dateFrom?: string | null;
  dateTo?: string | null;
  responsible?: string | 'all';
  page?: number;
  pageSize?: number;
  sortKey?: 'operation_date' | 'amount' | 'document_number';
  sortDir?: 'asc' | 'desc';
}

const CF_SELECT = `
  id, store_id, document_number, doc_type, concept,
  amount, currency, exchange_rate, amount_cup, payment_method,
  operation_date, status, closure_id, responsible_user_id,
  counterparty, justification, notes, related_document_id,
  payment_transaction_id, annulment_payment_transaction_id,
  created_at, created_by, confirmed_at, confirmed_by,
  annulled_at, annulled_by, annulment_reason,
  responsible:profiles!cash_flow_documents_responsible_user_id_fkey(full_name),
  annulled_by_profile:profiles!cash_flow_documents_annulled_by_fkey(full_name),
  related_document:cash_flow_documents!cash_flow_documents_related_document_id_fkey(document_number, concept, doc_type, amount, currency)
`;

export interface CashFlowListResult {
  docs: CashFlowDocument[];
  hasMore: boolean;
}

export function useCashFlowDocuments(storeId: string | null | undefined, filters: CashFlowFilters) {
  const cleanStoreId = getCleanStoreId(storeId);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 25;

  return useQuery({
    queryKey: ['cash-flow-documents', cleanStoreId, filters],
    queryFn: async (): Promise<CashFlowListResult> => {
      if (!cleanStoreId) return { docs: [], hasMore: false };
      const from = (page - 1) * pageSize;
      let q = supabase
        .from('cash_flow_documents')
        .select(CF_SELECT)
        .eq('store_id', cleanStoreId);

      if (filters.docType && filters.docType !== 'all') q = q.eq('doc_type', filters.docType);
      if (filters.concept && filters.concept !== 'all') q = q.eq('concept', filters.concept);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.currency && filters.currency !== 'all') q = q.eq('currency', filters.currency);
      if (filters.responsible && filters.responsible !== 'all') q = q.eq('responsible_user_id', filters.responsible);
      if (filters.dateFrom) q = q.gte('operation_date', filters.dateFrom);
      if (filters.dateTo) q = q.lte('operation_date', filters.dateTo);

      const sortKey = filters.sortKey ?? 'operation_date';
      const sortDir = filters.sortDir ?? 'desc';
      q = q.order(sortKey, { ascending: sortDir === 'asc' }).order('id', { ascending: sortDir === 'asc' });

      // range es inclusivo: pageSize+1 filas detectan la página siguiente; la
      // página muestra exactamente pageSize (la extra nunca se renderiza).
      const { data, error } = await q.range(from, from + pageSize);
      if (error) throw error;
      const all = (data || []) as unknown as CashFlowDocument[];
      return { docs: all.slice(0, pageSize), hasMore: all.length > pageSize };
    },
    enabled: !!cleanStoreId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCashFlowSummary(
  storeId: string | null | undefined,
  dateFrom?: string | null,
  dateTo?: string | null,
) {
  const cleanStoreId = getCleanStoreId(storeId);
  return useQuery({
    queryKey: ['cash-flow-summary', cleanStoreId, dateFrom ?? null, dateTo ?? null],
    queryFn: async (): Promise<CashFlowSummary | null> => {
      if (!cleanStoreId) return null;
      const { data, error } = await supabase.rpc('get_cash_flow_summary', {
        p_store_id: cleanStoreId,
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      return (data as CashFlowSummary) || null;
    },
    enabled: !!cleanStoreId,
    refetchInterval: 60_000,
  });
}

export interface CreateCashFlowPayload {
  doc_type: 'ingreso' | 'egreso';
  concept: string;
  amount: number;
  currency: 'CUP' | 'USD';
  operation_date?: string | null;
  counterparty?: string | null;
  justification: string;
  notes?: string | null;
  related_document_id?: string | null;
  idempotency_key?: string;
}

export interface CreateCashFlowResult {
  success: boolean;
  document_id: string;
  document_number: string;
  doc_type: 'ingreso' | 'egreso';
  concept: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_cup: number;
  operation_date: string;
  status_doc: string;
  payment_transaction_id: string;
  cash_before: number;
  cash_after: number;
  fondo_before: number;
  fondo_after: number;
}

export function useCreateCashFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateCashFlowPayload): Promise<CreateCashFlowResult> => {
      return apiFetch<CreateCashFlowResult>('/api/cash-flow', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          idempotency_key: payload.idempotency_key ?? `cf-${crypto.randomUUID()}`,
        }),
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-documents'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-shift-expected'] });
      queryClient.invalidateQueries({ queryKey: ['active-shift'] });
      toast.success(`Documento ${res.document_number} registrado`, {
        description:
          res.doc_type === 'ingreso'
            ? `Ingreso de ${res.currency === 'USD' ? `$${res.amount.toFixed(2)} USD` : `${res.amount.toFixed(2)} CUP`} — efectivo en caja: ${res.cash_after.toFixed(2)} CUP`
            : `Egreso de ${res.currency === 'USD' ? `$${res.amount.toFixed(2)} USD` : `${res.amount.toFixed(2)} CUP`} — efectivo en caja: ${res.cash_after.toFixed(2)} CUP`,
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('No se pudo registrar el documento', { description: message });
    },
  });
}

export function useReverseCashFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { document_id: string; reason: string }) => {
      return apiFetch<{ success: boolean; document_number: string }>('/api/cash-flow/reverse', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-documents'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-shift-expected'] });
      toast.success(`Documento ${res.document_number} anulado`, {
        description: 'El efecto en caja se revirtió con una fila contraria; la historia queda intacta.',
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('No se pudo anular el documento', { description: message });
    },
  });
}

/** Documentos de fondo (constitución/reposición confirmadas) para vincular devoluciones. */
export function useFondoSourceDocuments(storeId: string | null | undefined, enabled: boolean) {
  const cleanStoreId = getCleanStoreId(storeId);
  return useQuery({
    queryKey: ['cash-flow-fondo-sources', cleanStoreId],
    queryFn: async (): Promise<CashFlowDocument[]> => {
      if (!cleanStoreId) return [];
      const { data, error } = await supabase
        .from('cash_flow_documents')
        .select('id, document_number, concept, doc_type, amount, currency, amount_cup, operation_date, status')
        .eq('store_id', cleanStoreId)
        .eq('status', 'confirmado')
        .eq('doc_type', 'ingreso')
        .in('concept', ['constitucion_fondo', 'reposicion_fondo'])
        .order('operation_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CashFlowDocument[];
    },
    enabled: !!cleanStoreId && enabled,
    staleTime: 30_000,
  });
}
