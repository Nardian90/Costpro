
import { supabase } from '@/lib/supabaseClient';
import { ReportDefinition, ReportRun, ReportType } from '@/types';

export const reportService = {
  /**
   * Fetch all report definitions for a store.
   */
  async getDefinitions(storeId: string) {
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
  async saveDefinition(definition: Partial<ReportDefinition>) {
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
  async getRuns(definitionId: string) {
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
  async generateReport(params: any, token: string) {
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
  async fetchReportData(type: ReportType, filters: any, date_range: any, store_id: string) {
    let data: any[] = [];
    const { from, to } = date_range || {};

    switch (type) {
      case 'sales':
        const { data: salesData, error: salesError } = await supabase.rpc('get_transactions', {
          p_store_id: store_id,
          p_limit: 10000
        });
        if (salesError) throw salesError;
        data = salesData || [];
        if (from && to) {
            data = data.filter((item: any) => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
        break;

      case 'inventory':
        const { data: invData, error: invError } = await supabase.rpc('get_paginated_products', {
          p_store_id: store_id,
          p_limit: 10000,
          p_offset: 0
        });
        if (invError) throw invError;
        data = invData || [];
        if (filters?.category) {
            data = data.filter((p: any) => p.category === filters.category);
        }
        break;

      case 'kardex':
        if (!filters?.product_id) throw new Error('Se requiere product_id para el reporte de Kardex');
        const { data: kardexData, error: kardexError } = await supabase.rpc('get_product_stock_ledger_paginated', {
          p_product_id: filters.product_id,
          p_store_id: store_id,
          p_limit: 1000,
          p_offset: 0
        });
        if (kardexError) throw kardexError;
        data = kardexData || [];
        break;

      case 'purchases':
        let query = supabase.from('receipts').select('*');
        if (store_id) query = query.eq('store_id', store_id);
        if (from) query = query.gte('created_at', from);
        if (to) query = query.lte('created_at', to);
        const { data: purchaseData, error: purchaseError } = await query.order('created_at', { ascending: false }).limit(1000);
        if (purchaseError) throw purchaseError;
        data = purchaseData || [];
        break;

      case 'audit':
        const { data: auditData, error: auditError } = await supabase.rpc('get_audit_logs', {
          p_store_id: store_id,
          p_limit: 10000
        });
        if (auditError) throw auditError;
        data = auditData || [];
        if (from && to) {
            data = data.filter((item: any) => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
        break;

      case 'profit':
        const { data: profitData, error: profitError } = await supabase.rpc('get_transactions', {
          p_store_id: store_id,
          p_limit: 10000
        });
        if (profitError) throw profitError;
        data = profitData || [];
        if (from && to) {
            data = data.filter((item: any) => {
                const date = new Date(item.created_at);
                return date >= new Date(from) && date <= new Date(to);
            });
        }
        break;

      default:
        throw new Error(`Tipo de reporte no soportado: ${type}`);
    }

    return data;
  }
};
