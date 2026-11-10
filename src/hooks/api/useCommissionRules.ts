/**
 * useCommissionRules — CP-PRODUCT-COMMISSION-001 TAREA 2.
 *
 * Carga las reglas de comisión VIGENTES registrables de una tienda con la
 * MISMA API que usa el módulo Trabajadores y Comisiones
 * (`/api/commissions/rules`, con `products` y `product_configs` populados
 * para `product_specific`). La columna «Comisión» del Listado de precios
 * reutiliza esta fuente y el motor `commission-engine` — jamás una fórmula
 * propia (misión §2.2). `enabled` permite carga diferida (la columna está
 * oculta por defecto y no consume red).
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { supabase } from '@/lib/supabaseClient';

export interface CommissionRuleWithProducts {
  id: string;
  store_id: string;
  worker_id: string | null;
  type: string;
  value_percent: number | null;
  fixed_value: number | null;
  salary_amount: number | null;
  base_calculation: string;
  priority: number;
  valid_from: string;
  valid_to: string | null;
  min_price?: number | null;
  max_price?: number | null;
  product_commission_amount?: number | null;
  product_commission_mode?: 'per_sale' | 'per_unit' | null;
  products?: { id: string }[];
  product_configs?: Record<string, { amount: number | null; mode: 'per_sale' | 'per_unit' }>;
}

export function useCommissionRules(storeId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['commission-rules', storeId],
    queryFn: async (): Promise<CommissionRuleWithProducts[]> => {
      if (!storeId) return [];
      const data = await apiFetch<{ rules?: CommissionRuleWithProducts[] } | CommissionRuleWithProducts[]>(
        `/api/commissions/rules?store_id=${storeId}`,
      );
      const rules = Array.isArray(data) ? data : (data.rules || []);
      // Aislamiento defensivo: solo reglas de la tienda pedida (la API ya
      // filtra por store; el guard evita mezclas si el backend cambia).
      return rules.filter((r) => r.store_id === storeId);
    },
    enabled: enabled && !!storeId,
    staleTime: 60_000,
  });
}
