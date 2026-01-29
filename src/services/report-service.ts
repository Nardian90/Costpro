
import { supabase } from '@/lib/supabaseClient';
import { ReportDefinition, ReportRun } from '@/types';

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
  }
};
