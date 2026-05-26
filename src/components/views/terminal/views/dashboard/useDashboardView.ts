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

  const { data: dashboardData, isLoading: isLoadingData } = useDashboardData(
    user?.activeStoreId,
    user?.role === 'admin',
    dateFrom,
    dateTo
  );

  return {
    isLoading: isLoadingData,
    summary: dashboardData?.summary,
    kpis: dashboardData?.kpis,
    timeRange,
    setTimeRange,
    selectedDate,
    setSelectedDate
  };
}
