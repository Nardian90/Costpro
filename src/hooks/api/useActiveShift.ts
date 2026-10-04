"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { CashClosure } from "@/types";

/**
 * POS-2 MM-6: Hook para obtener el turno de caja activo (status='pendiente').
 *
 * El concepto de "turno" en CostPro no es una entidad propia — se aproxima
 * con el último `cash_closures` pendiente. Si no hay ninguno pendiente,
 * el cajero está "fuera de turno" y debería abrir uno antes de vender.
 *
 * Refresca cada 30s para mantener el total de ventas del turno al día.
 *
 * REMEDIACIÓN (fix/dashboard-contextual-kpi-actions) FASE 20: parámetro
 * `options.enabled` retrocompatible — el Inicio solo consulta el turno
 * cuando el rol del usuario tiene acciones de caja relevantes.
 */
export function useActiveShift(
  storeId?: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["active-shift", storeId],
    queryFn: async (): Promise<CashClosure | null> => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("cash_closures")
        .select("*")
        .eq("store_id", storeId)
        .eq("status", "pendiente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as CashClosure) || null;
    },
    enabled: (options?.enabled ?? true) && !!storeId,
    refetchInterval: 30_000, // refrescar cada 30s
    staleTime: 15_000,
  });
}
