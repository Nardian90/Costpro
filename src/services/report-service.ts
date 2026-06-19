import { supabase } from '@/lib/supabaseClient';
import { ReportDefinition, ReportRun } from '@/types';
import { fetchReportData, fetchReportDataPaginated } from '@/lib/reports/data-fetcher';

/** Interface for date range filter */
export interface ReportDateRange {
  from?: string;
  to?: string;
}

/** Interface for report filters */
export interface ReportFilters {
  category?: string;
  product_id?: string;
  [key: string]: unknown;
}

/** Interface for a generic report row */
export interface ReportRow {
  [key: string]: unknown;
}

/** Interface for daily aggregated row */
export interface DailyAggregatedRow {
  date: string;
  total_income?: number;
  total_expenses?: number;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  active: boolean;
}

export const reportService = {
  /**
   * Fetch all report definitions for a store.
   */
  async getDefinitions(storeId: string): Promise<ReportDefinition[]> {
    const { data, error } = await supabase
      .from('report_definitions')
      .select('*')
      .eq('store_id', storeId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []) as ReportDefinition[];
  },

  /**
   * Save a new report definition or update an existing one.
   */
  async saveDefinition(definition: Partial<ReportDefinition>): Promise<ReportDefinition> {
    const { data, error } = await supabase
      .from('report_definitions')
      .upsert(definition)
      .select()
      .single();

    if (error) throw error;
    return data as ReportDefinition;
  },

  /**
   * Delete a report definition by ID.
   */
  async deleteDefinition(id: string): Promise<void> {
    const { error } = await supabase
      .from('report_definitions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Fetch all runs for a specific definition.
   */
  async getRuns(definitionId: string): Promise<ReportRun[]> {
    const { data, error } = await supabase
      .from('report_runs')
      .select('*')
      .eq('report_definition_id', definitionId)
      .order('executed_at', { ascending: false });

    if (error) throw error;
    return data as ReportRun[];
  },

  /**
   * Fetch all runs for a store (used by history dashboard).
   */
  async getStoreRuns(storeId: string, limit = 50): Promise<ReportRun[]> {
    const { data, error } = await supabase
      .from('report_runs')
      .select('*')
      .eq('store_id', storeId)
      .order('executed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []) as ReportRun[];
  },

  /**
   * Log a report execution run.
   */
  async logRun(params: {
    store_id: string;
    executed_by: string;
    parameters_snapshot: any;
    status: 'completed' | 'failed';
    file_url?: string | null;
    error_message?: string | null;
  }): Promise<void> {
    const { error } = await supabase.from('report_runs').insert(params);
    if (error) throw error;
  },

  /**
   * Save schedule config embedded in a definition's layout field.
   */
  async saveScheduleConfig(definitionId: string, scheduleConfig: ReportScheduleConfig): Promise<void> {
    const { error } = await supabase
      .from('report_definitions')
      .update({ layout: { schedule: scheduleConfig } })
      .eq('id', definitionId);
    if (error) throw error;
  },

  /**
   * Trigger PDF generation via the backend API.
   */
  async generateReport(params: Partial<ReportDefinition>, token: string) {
    const response = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(errorData.error || 'Error al generar el reporte');
    }

    return await response.json();
  },

  /**
   * Fetch raw data for a report (client-side).
   * Delegates to the shared `fetchReportData` from `lib/reports/data-fetcher`.
   */
  async fetchReportData(
    type: ReportDefinition['type'],
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    limit?: number,
  ): Promise<ReportRow[]> {
    const data = await fetchReportData(supabase, {
      type,
      storeId: store_id,
      from: date_range?.from,
      to: date_range?.to,
      filters,
      limit,
    });

    return limit ? data.slice(0, limit) : data;
  },

  /**
   * Fetch aggregated daily data for chart previews (sales by day).
   */
  async fetchChartData(
    type: ReportDefinition['type'],
    store_id: string,
    date_range: ReportDateRange | undefined,
  ): Promise<{ label: string; value: number }[]> {
    try {
      const chartData = await this.fetchReportData(
        type,
        undefined,
        date_range,
        store_id,
        30,
      );

      // Aggregate by date for chart display
      const grouped: Record<string, number> = {};
      const keys = type === 'sales' ? ['total_amount', 'amount']
        : type === 'profit' ? ['profit', 'total_profit']
        : type === 'daily_income' ? ['total_income']
        : type === 'daily_expenses' ? ['total_expenses']
        : ['total_amount'];

      chartData.forEach((row: Record<string, unknown>) => {
        const dateStr = String(row['date'] || row['created_at'] || 'Sin fecha').slice(0, 10);
        const val = keys.reduce((acc: number, k) => acc + Number(row[k] || 0), 0);
        grouped[dateStr] = (grouped[dateStr] || 0) + val;
      });

      return Object.entries(grouped)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch {
      return [];
    }
  },

  /**
   * Fetch all report data using paginated chunks (memory-efficient).
   * Ideal for Excel exports with large datasets.
   */
  async fetchReportDataPaginated(
    type: ReportDefinition['type'],
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    options?: {
      chunkSize?: number;
      onProgress?: (fetched: number, totalEstimated: number) => void;
    },
  ): Promise<ReportRow[]> {
    return fetchReportDataPaginated(supabase, {
      type,
      storeId: store_id,
      from: date_range?.from,
      to: date_range?.to,
      filters,
    }, options);
  },
};
