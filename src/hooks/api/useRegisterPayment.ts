'use client';

import { useState, useCallback } from 'react';
import { randomUUID } from 'crypto';

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
    refType: 'receipt' | 'service',
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
      refType: 'receipt' | 'service',
      refId: string,
      payments: PaymentRowInput[]
    ): Promise<{ success: boolean; error?: string; paymentIds?: string[] }> => {
      if (payments.length === 0) {
        return { success: false, error: 'Debe incluir al menos un pago' };
      }

      setLoading(true);
      setError(null);

      try {
        const idempotencyKey = randomUUID();

        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref_type: refType,
            ref_id: refId,
            payments,
            idempotency_key: idempotencyKey,
          }),
        });

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || `HTTP ${response.status}`);
        }

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
