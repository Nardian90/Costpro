/**
 * CP-FIN · Hook del Ritmo de ventas (misión Estados Financieros).
 *
 * Reutiliza el RPC `get_sales_dashboard_analytics` (fuente de verdad de las
 * ventas, endurecida y probada por CI) en DOS llamadas paralelas:
 *  · ventana actual (con kpi.prev ya calculado sobre la ventana comparable
 *    del mes anterior),
 *  · ventana anterior equivalente (para la SERIE diaria del período previo,
 *    que el RPC solo expone para la ventana principal).
 *
 * El período comparable usa previousMonthEquivalentWindow: mismo día de
 * inicio y fin del mes inmediatamente anterior (1–22 nov ↔ 1–22 oct),
 * ajustando días inexistentes al último día del mes (DST-safe Havana).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { dashboardResponseSchema, type SalesDashboardResponse } from '@/lib/sales-dashboard/schema';
import { previousMonthEquivalentWindow, type PeriodWindow } from '@/lib/sales-dashboard/periods';

export interface SalesRhythmData {
  /** Ventana actual: kpi + serie diaria del período consultado. */
  current: SalesDashboardResponse;
  /** Ventana anterior equivalente: serie diaria para la evolución comparada. */
  previous: SalesDashboardResponse;
}

export function useSalesRhythm(window: PeriodWindow, storeId: string | null) {
  return useQuery<SalesRhythmData>({
    queryKey: ['sales-rhythm', storeId ?? 'all', window.from.toISOString(), window.to.toISOString()],
    queryFn: async () => {
      const prev = previousMonthEquivalentWindow(window);
      const call = (from: Date, to: Date, prevFrom: Date, prevTo: Date) =>
        supabase.rpc('get_sales_dashboard_analytics', {
          p_store_id: storeId,
          p_date_from: from.toISOString(),
          p_date_to: to.toISOString(),
          p_prev_from: prevFrom.toISOString(),
          p_prev_to: prevTo.toISOString(),
          p_seller_id: null,
          p_status: null,
          p_payment_method: null,
        }).then(({ data, error }) => {
          if (error) throw error;
          return dashboardResponseSchema.parse(data);
        });

      const [current, previous] = await Promise.all([
        call(window.from, window.to, prev.from, prev.to),
        call(prev.from, prev.to, prev.from, prev.to),
      ]);
      return { current, previous };
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
}
