
'use client'

import { useState, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { useDashboardData } from '@/hooks/api/useDashboard';
import { startOfDay, startOfMonth, startOfYear, addDays, addMonths, addYears, format } from 'date-fns';

export type DashboardTimeRange = 'day' | 'month' | 'year';

export function useDashboardView() {
  const { user } = useAuthStore();
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('day');

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    let from: Date;
    let to: Date;

    switch (timeRange) {
      case 'month':
        from = startOfMonth(now);
        to = addMonths(from, 1);
        break;
      case 'year':
        from = startOfYear(now);
        to = addYears(from, 1);
        break;
      case 'day':
      default:
        from = startOfDay(now);
        to = addDays(from, 1);
        break;
    }

    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString()
    };
  }, [timeRange]);

  const { data: dashboardData, isLoading: isLoadingData } = useDashboardData(
    user?.storeId,
    user?.role === 'admin',
    dateFrom,
    dateTo
  );

  return {
    isLoading: isLoadingData,
    summary: dashboardData?.summary,
    kpis: dashboardData?.kpis,
    timeRange,
    setTimeRange
  };
}
