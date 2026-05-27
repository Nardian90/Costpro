
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
          p_offset: 0
        });
        if (invError) throw invError;
        data = (invData || []) as ReportRow[];
        if (filters?.category) {
            data = data.filter((p) => p.category === filters.category);
        }
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
        let query = supabase.from('receipts').select('*');
        if (store_id) query = query.eq('store_id', store_id);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);
        const { data: purchaseData, error: purchaseError } = await query.order('created_at', { ascending: false }).limit(1000);
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
        const { data: profitData, error: profitError } = await supabase.rpc('get_transactions', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (profitError) throw profitError;
        // NOTE: Profit calculation requires a join with cost data (pending Supabase RPC).
        // Currently returns raw transaction data. Columns `profit` and `margin_percentage`
        // will be empty until a dedicated RPC is created.
        data = (profitData || []) as ReportRow[];
        break;
      }

      case 'daily_income': {
        const { data: incomeData, error: incomeError } = await supabase.rpc('get_transactions', {
          p_store_id: store_id,
          p_date_from: fromDate,
          p_date_to: toDate,
          p_limit: 10000
        });
        if (incomeError) throw incomeError;
        // NOTE: This grouping should be done in a Supabase RPC for performance.
        // Pending: create `get_daily_income_aggregated` RPC.
        const transactions = (incomeData || []) as ReportRow[];
        const groupedIncome = transactions.reduce<Record<string, number>>((acc, curr) => {
            const dateStr = String(curr.created_at).split('T')[0];
            if (!acc[dateStr]) acc[dateStr] = 0;
            acc[dateStr] += Number(curr.total_amount || 0);
            return acc;
        }, {});
        data = Object.keys(groupedIncome).map(date => ({
            date,
            total_income: groupedIncome[date]
        } as ReportRow)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        break;
      }

      case 'daily_expenses': {
        let expQuery = supabase.from('receipts').select('*');
        if (store_id) expQuery = expQuery.eq('store_id', store_id);
        if (from) expQuery = expQuery.gte('created_at', from);
        if (to) expQuery = expQuery.lte('created_at', to);
        const { data: expData, error: expError } = await expQuery.order('created_at', { ascending: false }).limit(1000);
        if (expError) throw expError;
        // NOTE: This grouping should be done in a Supabase RPC for performance.
        // Pending: create `get_daily_expenses_aggregated` RPC.
        const receipts = (expData || []) as ReportRow[];
        const groupedExp = receipts.reduce<Record<string, number>>((acc, curr) => {
            const dateStr = String(curr.created_at).split('T')[0];
            if (!acc[dateStr]) acc[dateStr] = 0;
            acc[dateStr] += Number(curr.total_cost || 0);
            return acc;
        }, {});
        data = Object.keys(groupedExp).map(date => ({
            date,
            total_expenses: groupedExp[date]
        } as ReportRow)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
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
