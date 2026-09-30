'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useDashboardData } from '@/hooks/api/useDashboard';
import { startOfDay, startOfMonth, startOfYear, addDays, addMonths, addYears } from 'date-fns';

export type DashboardTimeRange = 'day' | 'month' | 'year';

export function useDashboardView() {
  const { user } = useAuthStore();
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { dateFrom, dateTo } = useMemo(() => {
    let from: Date;
    let to: Date;

    switch (timeRange) {
      case 'month':
        from = startOfMonth(selectedDate);
        to = addMonths(from, 1);
        break;
      case 'year':
        from = startOfYear(selectedDate);
        to = addYears(from, 1);
        break;
      case 'day':
      default:
        from = startOfDay(selectedDate);
        to = addDays(from, 1);
        break;
    }

    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString()
    };
  }, [timeRange, selectedDate]);

  // F3-B1: exponer error de KPIs — antes solo se pasaba productsError y los fallos
  // del dashboard quedaban invisibles (KPIs vacíos parecían datos reales).
  //
  // REMEDIACIÓN (fix/dashboard-active-store): el dashboard single-store es
  // SIEMPRE store-scoped — isAdmin va a `false` incluso para admin/manager.
  // Antes `user?.role === 'admin'` habilitaba la consulta con p_store_id=NULL
  // para admins sin tienda activa, y el RPC devuelve TOTALES GLOBALES en ese
  // caso (WHERE p_store_id IS NULL OR store_id = p_store_id): datos de todas
  // las tiendas presentados como "mi tienda activa". Ahora, sin tienda activa,
  // la consulta se deshabilita (enabled: !!storeId) y StateRenderer muestra el
  // estado vacío honesto — nunca datos multi-tienda bajo este encabezado.
  const { data: dashboardData, isLoading: isLoadingData, error: dashboardError, refetch: refetchDashboard } = useDashboardData(
    user?.activeStoreId,
    false,
    dateFrom,
    dateTo
  );

  return {
    isLoading: isLoadingData,
    dashboardError: dashboardError ?? null,
    refetchDashboard,
    summary: dashboardData?.summary,
    kpis: dashboardData?.kpis,
    timeRange,
    setTimeRange,
    selectedDate,
    setSelectedDate
  };
}
