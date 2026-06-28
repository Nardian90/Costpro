/**
 * Vercel AI SDK — Tool definitions.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getViewDetails } from '@/config/viewRegistry';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  userRole: string;
  storeId: string;
}

const openViewInput = z.object({
  viewId: z.string().describe('ID vista'),
  params: z.record(z.string(), z.any()).optional(),
});

const getProductsInput = z.object({
  query: z.string().optional(),
  limit: z.number().optional().default(5),
});

const executeActionInput = z.object({
  actionName: z.string(),
  parameters: z.record(z.string(), z.any()).optional(),
});

const exportDocumentInput = z.object({
  type: z.enum(['pdf', 'excel']),
  entityType: z.string(),
  entityId: z.string().optional(),
});

const setUiModeInput = z.object({
  mode: z.enum(['standard', 'expert']),
});

const getCostSummaryInput = z.object({
  storeId: z.string().optional(),
});

const getSalesSummaryInput = z.object({
  date: z.string().optional(),
  storeId: z.string().optional(),
});

export function buildTools(ctx: ToolContext) {
  const { supabase, storeId: ctxStoreId, userRole } = ctx;

  return {
    open_view: tool({
      description: 'Navegar a una vista',
      parameters: openViewInput,
      execute: async ({ viewId, params }) => {
        const view = getViewDetails(viewId);
        return { success: true, action: { type: 'navigation', payload: { viewId, params } }, message: `Abriendo ${view?.id || viewId}` };
      },
    }),

    get_products: tool({
      description: 'Buscar productos',
      parameters: getProductsInput,
      execute: async ({ query, limit }) => {
        const { data } = await supabase.from('products').select('*').eq('store_id', ctxStoreId).ilike('name', `%${query || ''}%`).limit(limit || 5);
        return { success: true, results: data };
      },
    }),

    execute_action: tool({
      description: 'Ejecutar acción de sistema',
      parameters: executeActionInput,
      execute: async ({ actionName, parameters }) => {
        return { success: true, action: { type: 'system_action', payload: { actionName, parameters } } };
      },
    }),

    export_document: tool({
      description: 'Exportar documento',
      parameters: exportDocumentInput,
      execute: async ({ type, entityType, entityId }) => {
        return { success: true, action: { type: 'export', payload: { type, entityType, entityId } } };
      },
    }),

    set_ui_mode: tool({
      description: 'Cambiar modo UI',
      parameters: setUiModeInput,
      execute: async ({ mode }) => {
        return { success: true, action: { type: 'ui_mode', payload: { mode } } };
      },
    }),

    get_cost_summary: tool({
      description: 'Resumen de costos',
      parameters: getCostSummaryInput,
      execute: async ({ storeId }) => {
        const targetStoreId = storeId || ctxStoreId;
        const { data: products } = await supabase.from('products').select('cost_price').eq('store_id', targetStoreId).eq('is_active', true);
        const total = (products || []).reduce((sum, p: any) => sum + Number(p.cost_price || 0), 0);
        return { success: true, summary: { total_inventory_cost: total } };
      },
    }),

    get_sales_summary: tool({
      description: 'Resumen de ventas',
      parameters: getSalesSummaryInput,
      execute: async ({ date, storeId }) => {
        const targetStoreId = storeId || ctxStoreId;
        const targetDate = date === 'today' ? new Date().toISOString().slice(0, 10) : date;
        const { data: txns } = await supabase.from('transactions').select('total_amount').eq('store_id', targetStoreId).eq('status', 'completed');
        const total = (txns || []).reduce((sum, t: any) => sum + Number(t.total_amount || 0), 0);
        return { success: true, summary: { total_amount: total } };
      },
    }),
  };
}

export function getAvailableToolNames(userRole: string): string[] {
  return ['open_view', 'get_products', 'execute_action', 'export_document', 'set_ui_mode', 'get_cost_summary', 'get_sales_summary'];
}
