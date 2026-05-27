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
   * Uses typed interfaces instead of `any` for better type safety.
   */
  async fetchReportData(
    type: ReportType,
    filters: ReportFilters | undefined,
    date_range: ReportDateRange | undefined,
    store_id: string,
    limit?: number
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
          p_limit: 10000
        });
        if (salesError) throw salesError;
        data = (salesData || []) as ReportRow[];
        break;
      }

      case 'inventory': {
        const { data: invData, error: invError } = await supabase.rpc('get_paginated_products', {
          p_store_id: store_id,
          p_limit: 10000,
          p_offset: 0,
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
          p_limit: 1000,
          p_offset: 0
        });
        if (kardexError) throw kardexError;
        data = (kardexData || []) as ReportRow[];
        break;
      }

      case 'purchases': {
        const { data: purchaseData, error: purchaseError } = await supabase.from('receipts')
          .select('*')
          .eq('store_id', store_id)
          .gte('created_at', from || '1970-01-01')
          .lte('created_at', to || '2100-01-01')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (purchaseError) throw purchaseError;
        data = (purchaseData || []) as ReportRow[];
        break;
      }

      case 'audit': {
        const { data: auditData, error: auditError } = await supabase.rpc('get_audit_logs', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
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
          p_limit: 10000
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
          p_limit: 1000
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
          p_limit: 1000
        });
        if (cashError) throw cashError;
        data = (cashData || []) as ReportRow[];
        break;
      }

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    if (limit) {
        return data.slice(0, limit);
    }

    return data;
  }
};
