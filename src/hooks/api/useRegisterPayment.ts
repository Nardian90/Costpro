'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export interface PaymentRowInput {
  payment_method: 'cash' | 'transfer' | 'zelle';
  amount: number;
  currency: string;
  exchange_rate: number;
  reference?: string | null;
  notes?: string | null;
}

interface UseRegisterPaymentResult {
  registerPayment: (
    refType: 'receipt' | 'service' | 'commission',
    refId: string,
    payments: PaymentRowInput[]
  ) => Promise<{ success: boolean; error?: string; paymentIds?: string[] }>;
  loading: boolean;
  error: string | null;
}

/**
 * useRegisterPayment — Hook para registrar pagos contra documentos.
 *
 * FASE 2 (2026-07-13):
 * - Llama a POST /api/payments con payments[] (pago mixto multi-moneda)
 * - Genera idempotency_key automático (UUID) para prevenir doble-click
 * - Maneja loading y error states
 * - Retorna paymentIds para confirmación
 */
export function useRegisterPayment(): UseRegisterPaymentResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPayment = useCallback(
    async (
      refType: 'receipt' | 'service' | 'commission',
      refId: string,
      payments: PaymentRowInput[]
    ): Promise<{ success: boolean; error?: string; paymentIds?: string[] }> => {
      if (payments.length === 0) {
        return { success: false, error: 'Debe incluir al menos un pago' };
      }

      setLoading(true);
      setError(null);

      try {
        // FIX-C4 (2026-07-13): idempotency key determinista para prevenir
        // doble-click real. Antes usaba randomUUID() que generaba keys
        // distintas en cada intento → no protegía contra duplicados.
        // Ahora: hash de (refType + refId + payments) → mismo input = misma key.
        const idempotencyKey = `${refType}:${refId}:${JSON.stringify(payments)}`;

        const json = await apiFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            ref_type: refType,
            ref_id: refId,
            payments,
            idempotency_key: idempotencyKey,
          }),
        });

        return {
          success: true,
          paymentIds: json.payments?.map((p: any) => p.id) || [],
        };
      } catch (e: any) {
        const msg = e.message || 'Error al registrar pago';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { registerPayment, loading, error };
}
