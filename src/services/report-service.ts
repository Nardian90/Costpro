import { supabase } from '@/lib/supabaseClient';
import { ReportDefinition, ReportRun, ReportType } from '@/types';

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

/** Interface for report schedule configuration */
export interface ReportScheduleConfig {
  active: boolean;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  last_run?: string;
  next_run?: string;
  time?: string;
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
      .select('*, report_definitions!inner(store_id)')
      .eq('report_definitions.store_id', storeId)
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as ReportRun[];
  },

  /**
   * Log a report execution.
   */
  async logRun(run: Partial<ReportRun>): Promise<ReportRun> {
    const { data, error } = await supabase
      .from('report_runs')
      .insert(run)
      .select()
      .single();

    if (error) throw error;
    return data as ReportRun;
  },

  /**
   * Save schedule configuration for a report definition.
   */
  async saveScheduleConfig(definitionId: string, schedule: ReportScheduleConfig): Promise<void> {
    const { error } = await supabase
      .from('report_definitions')
      .update({ layout: { schedule } })
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
   * Fetch raw data for a report.
   */
  async fetchReportData(
    type: ReportType,
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    limit?: number
  ): Promise<ReportRow[]> {
    const data = await this.fetchReportDataPaginated(type, filters, date_range, store_id, limit || 10000, 0);
    if (limit && data.length > limit) {
        return data.slice(0, limit);
    }
    return data;
  },

  /**
   * Fetch raw data for a report with pagination.
   */
  async fetchReportDataPaginated(
    type: ReportType,
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    limit: number,
    offset: number
  ): Promise<ReportRow[]> {
    let data: ReportRow[] = [];
    const { from, to } = date_range || {};

    const fromDate = from ? from + 'T00:00:00' : null;
    const toDate = to ? to + 'T23:59:59' : null;

    switch (type) {
      case 'sales': {
        const { data: salesData, error: salesError } = await supabase.rpc('get_transactions', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: limit,
          p_offset: offset
        });
        if (salesError) throw salesError;
        data = (salesData || []) as ReportRow[];
        break;
      }

      case 'inventory': {
        const { data: invData, error: invError } = await supabase.rpc('get_paginated_products', {
          p_store_id: store_id,
          p_limit: limit,
          p_offset: offset,
          p_category: filters?.category || null
        });
        if (invError) throw invError;
        data = (invData || []) as ReportRow[];
        break;
      }

      case 'kardex': {
        if (!filters?.product_id) throw new Error('Se requiere product_id para el reporte de Kardex');
        const { data: kardexData, error: kardexError } = await supabase.rpc('get_product_stock_ledger_paginated', {
          p_product_id: filters.product_id,
          p_store_id: store_id,
          p_limit: limit,
          p_offset: offset
        });
        if (kardexError) throw kardexError;
        data = (kardexData || []) as ReportRow[];
        break;
      }

      case 'purchases': {
        const query = supabase.from('receipts')
          .select('*')
          .eq('store_id', store_id)
          .gte('created_at', from || '1970-01-01')
          .lte('created_at', to || '2100-01-01')
          .order('created_at', { ascending: false });

        if (typeof query.range === 'function') {
            const { data: purchaseData, error: purchaseError } = await query.range(offset, offset + limit - 1);
            if (purchaseError) throw purchaseError;
            data = (purchaseData || []) as ReportRow[];
        } else {
            const { data: purchaseData, error: purchaseError } = await query;
            if (purchaseError) throw purchaseError;
            data = (purchaseData || []) as ReportRow[];
        }
        break;
      }

      case 'audit': {
        const { data: auditData, error: auditError } = await supabase.rpc('get_audit_logs', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: limit,
          p_offset: offset
        });
        if (auditError) throw auditError;
        data = (auditData || []) as ReportRow[];
        break;
      }

      case 'profit': {
        const { data: profitData, error: profitError } = await supabase.rpc('get_profit_report', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: limit,
          p_offset: offset
        });
        if (profitError) throw profitError;
        data = (profitData || []) as ReportRow[];
        break;
      }

      case 'daily_income': {
        const { data: incomeData, error: incomeError } = await supabase.rpc('get_daily_income_aggregated', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate
        });
        if (incomeError) throw incomeError;
        data = (incomeData || []) as ReportRow[];
        break;
      }

      case 'daily_expenses': {
        const { data: expData, error: expError } = await supabase.rpc('get_daily_expenses_aggregated', {
          p_store_id: store_id,
          p_date_from: from || null,
          p_date_to: to || null
        });
        if (expError) throw expError;
        data = (expData || []) as ReportRow[];
        break;
      }

      case 'transfer': {
        const { data: transferData, error: transferError } = await supabase.rpc('get_transfers', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_status: null,
          p_limit: limit,
          p_offset: offset
        });
        if (transferError) throw transferError;
        data = (transferData || []) as ReportRow[];
        break;
      }

      case 'cash': {
        const { data: cashData, error: cashError } = await supabase.rpc('get_cash_closures', {
          p_store_id: store_id,
          p_date_from: from || null,
          p_date_to: to || null,
          p_limit: limit,
          p_offset: offset
        });
        if (cashError) throw cashError;
        data = (cashData || []) as ReportRow[];
        break;
      }

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    return data;
  }
};
