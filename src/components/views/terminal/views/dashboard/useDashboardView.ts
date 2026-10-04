'use client'

import { useState } from 'react';
import { useAuthStore } from '@/store';
import { useDashboardData } from '@/hooks/api/useDashboard';
// REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics): la derivación
// del rango se EXTRAJO a lib/kpi/dashboard-range.ts — misma lógica (sin cambio
// de comportamiento), compartida con usePerformanceKpi para que el anillo y
// la página construyan la MISMA queryKey (cache compartida, cero duplicación).
import {
  getDashboardDateRange,
  type DashboardTimeRange,
} from '@/lib/kpi/dashboard-range';

export function useDashboardView() {
  const { user } = useAuthStore();
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { dateFrom, dateTo } = getDashboardDateRange(timeRange, selectedDate);

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
