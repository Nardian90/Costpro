'use client';

/**
 * useStoreRates — CP-FIN-003: tasas de cambio manuales de la tienda activa
 * (fuente /api/store-rates → store_exchange_rates). Devuelve el mapa
 * { USD, EUR, MLC } para defaults del PaymentRowsEditor y equivalencias.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store';

export function useStoreRates() {
  const token = useAuthStore((s) => s.token);
  const storeId = useAuthStore((s) => s.user?.activeStoreId);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/store-rates?store_id=${storeId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setRates(data.rates ?? {});
      }
    } catch {
      /* best-effort: el editor permite editar la tasa a mano */
    } finally {
      setLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => { refetch(); }, [refetch]);

  return { rates, loading, refetch };
}
