
'use client'

import { useAuthStore } from '@/store';
import { useDashboardData } from '@/hooks/useQueries';

export function useDashboardView() {
  const { user } = useAuthStore();

  const { data: dashboardData, isLoading: isLoadingData } = useDashboardData(
    user?.storeId,
    user?.role === 'admin'
  );

  return {
    isLoading: isLoadingData,
    summary: dashboardData?.summary,
    kpis: dashboardData?.kpis
  };
}
