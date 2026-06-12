import { supabase } from '@/lib/supabaseClient';
import { ReportDefinition, ReportRun, ReportType } from '@/types';
import { fetchReportData as fetchRawData, fetchReportDataPaginated as fetchRawDataPaginated } from '@/lib/reports/data-fetcher';

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

/** Interface for report scheduling */
export interface ReportScheduleConfig {
  enabled: boolean;
  active: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:mm
  recipients?: string[];
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
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as ReportDefinition[];
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
   * Delete a report definition.
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
   * Fetch recent runs for a store.
   */
  async getStoreRuns(storeId: string, limit: number = 50): Promise<ReportRun[]> {
    const { data, error } = await supabase
      .from('report_runs')
      .select('*, report_definitions(name, type)')
      .eq('store_id', storeId)
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as ReportRun[];
  },

  /**
   * Log a report execution run.
   */
  async logRun(run: Partial<ReportRun>): Promise<void> {
    const { error } = await supabase
      .from('report_runs')
      .insert(run);

    if (error) {
      console.error('Failed to log report run:', error);
      throw error;
    }
  },

  /**
   * Update schedule configuration for a report definition.
   */
  async saveScheduleConfig(definitionId: string, schedule: ReportScheduleConfig): Promise<void> {
    const { error } = await supabase
      .from('report_definitions')
      .update({
        layout: {
          schedule: schedule
        }
      })
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
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al generar el reporte');
    }

    return await response.json();
  },

  /**
   * Proxy to shared data fetcher.
   */
  async fetchReportData(
    type: ReportType,
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    limit?: number
  ): Promise<ReportRow[]> {
    return await fetchRawData(supabase, {
      type,
      storeId: store_id,
      from: date_range?.from,
      to: date_range?.to,
      filters,
      limit
    }) as ReportRow[];
  },

  /**
   * Proxy to shared paginated data fetcher.
   */
  async fetchReportDataPaginated(
    type: ReportType,
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    options?: {
      chunkSize?: number;
      onProgress?: (fetched: number, total: number) => void;
    }
  ): Promise<ReportRow[]> {
    return await fetchRawDataPaginated(supabase, {
      type,
      storeId: store_id,
      from: date_range?.from,
      to: date_range?.to,
      filters
    }, options) as ReportRow[];
  }
};
