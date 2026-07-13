'use client';

import { useState, useEffect } from 'react';

export interface PaymentRecord {
  id: string;
  amount: number;
  amount_cup: number;
  payment_method: 'cash' | 'transfer' | 'zelle';
  currency: string;
  exchange_rate: number;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  paid_by: string | null;
}

interface UsePaymentHistoryResult {
  payments: PaymentRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * usePaymentHistory — Hook para obtener el historial de pagos de un documento.
 *
 * FASE 2.3 (2026-07-13): consulta GET /api/payments?ref_type=...&ref_id=...
 * para mostrar el historial colapsable en la vista de Cuentas por Pagar.
 */
export function usePaymentHistory(
  refType: 'receipt' | 'service' | null,
  refId: string | null,
  enabled: boolean = true
): UsePaymentHistoryResult {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    if (!enabled || !refType || !refId) {
      setPayments([]);
      return;
    }

    let cancelled = false;
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ ref_type: refType, ref_id: refId });
        const response = await fetch(`/api/payments?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${response.status}`);
        }

        const json = await response.json();
        if (!cancelled) {
          setPayments(Array.isArray(json) ? json : (json.data || []));
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Error al cargar historial');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchHistory();

    return () => { cancelled = true; };
  }, [refType, refId, enabled, refetchTrigger]);

  return {
    payments,
    loading,
    error,
    refetch: () => setRefetchTrigger(prev => prev + 1),
  };
}
