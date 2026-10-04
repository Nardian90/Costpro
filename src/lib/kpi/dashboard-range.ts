'use client';

/**
 * dashboard-range.ts — derivación del rango de fechas del Dashboard a partir
 * del selector Día/Mes/Año + fecha (fuente de verdad compartida).
 *
 * REMEDIACIÓN KPI temporal (fix/dashboard-kpi-periods-semantics):
 * EXTRAÍDO de useDashboardView.ts SIN cambiar comportamiento. El motivo de
 * la extracción es que PerformanceKpi/usePerformanceKpi calculen EXACTAMENTE
 * los mismos ISO strings que la página (dateFrom/dateTo) ⇒ la queryKey de
 * TanStack Query ['dashboard-kpis', store, isAdmin, dateFrom, dateTo]
 * coincide y el anillo REUTILIZA la consulta que la página ya hizo (FASE 21:
 * sin consultas duplicadas, sin datos contradictorios entre bloques).
 */

import {
  addDays,
  addMonths,
  addYears,
  startOfDay,
  startOfMonth,
  startOfYear,
} from 'date-fns';

export type DashboardTimeRange = 'day' | 'month' | 'year';

export function getDashboardDateRange(
  timeRange: DashboardTimeRange,
  selectedDate: Date
): { dateFrom: string; dateTo: string } {
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
    dateTo: to.toISOString(),
  };
}
